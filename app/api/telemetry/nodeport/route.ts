import { NextResponse } from 'next/server';
import * as k8s from '@kubernetes/client-node';
import { createKubeConfig } from '@/lib/k8s/discovery';
import { isHubbleGrpcStreaming, startHubbleGrpcStream, stopHubbleGrpcStream } from '@/lib/telemetry/hubble-grpc';
import type { ConnectionSettings } from '@/lib/types';

const SERVICE_NAME = 'hubble-relay-nodeport';
const NAMESPACE = 'kube-system';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const connectionId = url.searchParams.get('connectionId') ?? undefined;
    const clusterUrl = url.searchParams.get('clusterUrl') ?? undefined;
    const settings: Partial<ConnectionSettings> = { connectionId, clusterUrl, mode: 'live' };
    const kc = createKubeConfig(settings);
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

    const existingService = await k8sApi.readNamespacedService({ name: SERVICE_NAME, namespace: NAMESPACE });
    const nodePort = existingService.spec?.ports?.find(p => p.name === 'grpc' || p.port === 4245)?.nodePort;

    if (nodePort) {
      if (!isHubbleGrpcStreaming()) {
        startHubbleGrpcStream(nodePort, settings).catch(err => {
          console.error('[Hubble gRPC] Failed to auto-start stream from GET:', err);
        });
      }
      return NextResponse.json({ nodePort, status: 'active' });
    }
    return NextResponse.json({ nodePort: null, error: 'NodePort not configured' }, { status: 404 });
  } catch (err: unknown) {
    if ((err as { statusCode?: number }).statusCode === 404) {
      return NextResponse.json({ nodePort: null }, { status: 404 });
    }
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const settings = await request.json().catch(() => undefined) as Partial<ConnectionSettings> | undefined;
    const kc = createKubeConfig(settings);
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    let finalNodePort: number | undefined;

    // 1. Try to fetch existing NodePort service
    try {
      const existingService = await k8sApi.readNamespacedService({ name: SERVICE_NAME, namespace: NAMESPACE });
      finalNodePort = existingService.spec?.ports?.find(p => p.name === 'grpc' || p.port === 4245)?.nodePort;
    } catch (e: unknown) {
      if ((e as { statusCode?: number }).statusCode !== 404) {
        console.error('Error fetching service', e);
      }
    }

    if (!finalNodePort) {
      // 2. Fetch original hubble-relay service to copy its selector
      const originalService = await k8sApi.readNamespacedService({ name: 'hubble-relay', namespace: NAMESPACE });
      const selector = originalService.spec?.selector;

      if (!selector) {
        return NextResponse.json({ error: 'Hubble Relay service selector not found' }, { status: 404 });
      }

      // 3. Create new NodePort service
      const newService: k8s.V1Service = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: SERVICE_NAME,
          namespace: NAMESPACE,
        },
        spec: {
          type: 'NodePort',
          selector,
          ports: [
            {
              name: 'grpc',
              port: 4245,
              targetPort: 4245,
            }
          ],
        }
      };

      const created = await k8sApi.createNamespacedService({ namespace: NAMESPACE, body: newService });
      finalNodePort = created.spec?.ports?.[0]?.nodePort;
    }

    if (!finalNodePort) {
      throw new Error('NodePort was not allocated');
    }

    // Start streaming in the background
    startHubbleGrpcStream(finalNodePort, settings).catch(err => {
      console.error('Failed to start Hubble gRPC stream:', err);
    });

    return NextResponse.json({ nodePort: finalNodePort, status: 'success' });

  } catch (error: unknown) {
    console.error('Failed to create Hubble Relay NodePort', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const settings = await request.json().catch(() => undefined) as Partial<ConnectionSettings> | undefined;
    const kc = createKubeConfig(settings);
    const k8sApi = kc.makeApiClient(k8s.CoreV1Api);

    await k8sApi.deleteNamespacedService({ name: SERVICE_NAME, namespace: NAMESPACE });
    
    stopHubbleGrpcStream();
    
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if ((error as { statusCode?: number }).statusCode === 404) {
      stopHubbleGrpcStream();
      return NextResponse.json({ success: true, message: 'Already deleted' });
    }
    console.error('Failed to delete Hubble Relay NodePort', error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
