import { NextResponse } from 'next/server';
import { getImageScan, startImageScan } from '@/lib/image-analysis/service';
import type { ImageScanResources, ImageScanStep } from '@/lib/image-analysis/types';
import type { ConnectionSettings } from '@/lib/types';

const CPU_QUANTITY = /^(?:\d+(?:\.\d+)?|\.\d+)(?:n|u|m)?$/;
const MEMORY_QUANTITY = /^(?:\d+(?:\.\d+)?|\.\d+)(?:Ki|Mi|Gi|Ti|Pi|Ei|K|M|G|T|P|E)?$/;

function cpuValue(value: string) {
  const unit = value.match(/(n|u|m)$/)?.[1] ?? '';
  return Number(value.replace(/(n|u|m)$/, '')) * ({ n: 1e-9, u: 1e-6, m: 1e-3, '': 1 }[unit] ?? 1);
}

function memoryValue(value: string) {
  const unit = value.match(/(Ki|Mi|Gi|Ti|Pi|Ei|K|M|G|T|P|E)$/)?.[1] ?? '';
  const amount = Number(value.replace(/(Ki|Mi|Gi|Ti|Pi|Ei|K|M|G|T|P|E)$/, ''));
  const binary = ['Ki', 'Mi', 'Gi', 'Ti', 'Pi', 'Ei'].indexOf(unit);
  const decimal = ['K', 'M', 'G', 'T', 'P', 'E'].indexOf(unit);
  return amount * (binary >= 0 ? 1024 ** (binary + 1) : decimal >= 0 ? 1000 ** (decimal + 1) : 1);
}

function scanResources(value: unknown): ImageScanResources {
  const input = value as Partial<ImageScanResources> | undefined;
  if (input?.constrained === false) return { constrained: false };
  const resources: ImageScanResources = {
    constrained: true,
    requests: {
      cpu: input?.requests?.cpu?.trim() || process.env.TRIVY_CPU_REQUEST || '25m',
      memory: input?.requests?.memory?.trim() || process.env.TRIVY_MEMORY_REQUEST || '128Mi',
    },
    limits: {
      cpu: input?.limits?.cpu?.trim() || process.env.TRIVY_CPU_LIMIT || '1',
      memory: input?.limits?.memory?.trim() || process.env.TRIVY_MEMORY_LIMIT || '1Gi',
    },
  };
  const { requests, limits } = resources;
  if (!requests || !limits || !CPU_QUANTITY.test(requests.cpu) || !CPU_QUANTITY.test(limits.cpu)) throw new Error('Invalid CPU quantity. Use values such as 25m, 500m, or 1.');
  if (!MEMORY_QUANTITY.test(requests.memory) || !MEMORY_QUANTITY.test(limits.memory)) throw new Error('Invalid memory quantity. Use values such as 128Mi, 1Gi, or 2G.');
  if (cpuValue(requests.cpu) <= 0 || cpuValue(limits.cpu) <= 0 || memoryValue(requests.memory) <= 0 || memoryValue(limits.memory) <= 0) throw new Error('Resource quantities must be greater than zero, or choose unconstrained execution.');
  if (cpuValue(requests.cpu) > cpuValue(limits.cpu)) throw new Error('CPU request cannot be greater than the CPU limit.');
  if (memoryValue(requests.memory) > memoryValue(limits.memory)) throw new Error('Memory request cannot be greater than the memory limit.');
  return resources;
}

export async function POST(request: Request) {
  try {
    const context = new URL(request.url).searchParams.get('ctx') ?? undefined;
    const body = await request.json() as Partial<ConnectionSettings> & { imageId: string; image: string; resourceConfiguration?: ImageScanResources };
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@+-]{0,2047}$/.test(body.image)) throw new Error('Invalid image reference');
    const resourceConfiguration = scanResources(body.resourceConfiguration);

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
        send({ type: 'ready' });
        try {
          const scan = await startImageScan(context, body.imageId, body.image, body, resourceConfiguration, (step: ImageScanStep) => send({ type: 'progress', step }));
          send({ type: 'scan', scan });
        } catch (error) {
          send({ type: 'error', error: error instanceof Error ? error.message : 'Unable to start scan' });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Content-Type-Options': 'nosniff', 'X-Accel-Buffering': 'no' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to start scan' }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('imageId') ?? '';
  const scan = await getImageScan(id);
  // An image without a previous scan is a normal inventory state, not a failed
  // request. Returning null keeps browser monitoring clean while preserving a
  // distinct response from an existing scan.
  return NextResponse.json(scan);
}
