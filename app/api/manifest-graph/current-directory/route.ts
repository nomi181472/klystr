import { ingestFiles } from '@/lib/manifest-graph/engine';
import { resolveHelmCharts } from '@/lib/manifest-graph/helm';
import { createSession } from '@/lib/manifest-graph/store';
import {
  scanDirectoryForManifests,
  getCurrentWorkspaceDirectory,
} from '@/lib/manifest-graph/fs-scanner';
import type { IngestEvent } from '@/lib/manifest-graph/types';

export const runtime = 'nodejs';

/**
 * GET /api/manifest-graph/current-directory
 * Returns summary of Kubernetes manifests discovered in the current directory.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const customDir = url.searchParams.get('dir') || undefined;
    const includeContent = url.searchParams.get('includeContent') === 'true';

    const scanResult = await scanDirectoryForManifests(customDir);

    if (includeContent) {
      return Response.json(scanResult);
    }

    return Response.json({
      directory: scanResult.directory,
      count: scanResult.files.length,
      totalScannedFiles: scanResult.totalScannedFiles,
      files: scanResult.files.map((file) => ({
        relativePath: file.relativePath,
        size: file.size,
        lastModified: file.lastModified,
      })),
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to scan current directory for manifests.',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/manifest-graph/current-directory
 * Scans the current directory for Kubernetes manifests and streams ingestion events via SSE.
 */
export async function POST(request: Request) {
  let customDir: string | undefined;

  try {
    if (request.headers.get('content-type')?.includes('application/json')) {
      const body = (await request.json().catch(() => ({}))) as { directory?: string };
      if (typeof body.directory === 'string' && body.directory.trim()) {
        customDir = body.directory.trim();
      }
    }
  } catch {
    // Optional JSON body parsing
  }

  let scanResult;
  try {
    scanResult = await scanDirectoryForManifests(customDir);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to scan current directory.',
      },
      { status: 500 }
    );
  }

  if (scanResult.files.length === 0) {
    return Response.json(
      {
        error: `No Kubernetes manifests found in directory: ${scanResult.directory}`,
        directory: scanResult.directory,
      },
      { status: 404 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: IngestEvent) =>
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );

      try {
        const session = createSession();
        const resolvedFiles = await resolveHelmCharts(scanResult.files, emit);
        ingestFiles(session, resolvedFiles, emit);
      } catch (error) {
        emit({
          type: 'file-error',
          filePath: scanResult.directory,
          message:
            error instanceof Error
              ? error.message
              : 'Failed to ingest manifests from current directory.',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
