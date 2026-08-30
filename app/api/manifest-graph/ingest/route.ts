import { ingestFiles } from '@/lib/manifest-graph/engine';
import { resolveHelmCharts } from '@/lib/manifest-graph/helm';
import { fetchRemoteManifest } from '@/lib/manifest-graph/remote';
import { createSession } from '@/lib/manifest-graph/store';
import type { IngestEvent, UploadedManifestFile } from '@/lib/manifest-graph/types';

export const runtime = 'nodejs';

interface FileMetadata { relativePath: string; lastModified?: number; size?: number }

export async function POST(request: Request) {
  let uploaded: UploadedManifestFile[];
  if (request.headers.get('content-type')?.includes('application/json')) {
    try {
      const payload = await request.json() as { url?: unknown };
      if (typeof payload.url !== 'string' || !payload.url.trim()) throw new Error('Enter a manifest URL.');
      uploaded = [await fetchRemoteManifest(payload.url)];
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'The manifest URL could not be loaded.' }, { status: 400 });
    }
  } else {
    const form = await request.formData();
    const blobs = form.getAll('files').filter((part): part is File => part instanceof File);
    if (!blobs.length) return Response.json({ error: 'Select at least one manifest file or folder.' }, { status: 400 });
    if (blobs.length > 1000) return Response.json({ error: 'A maximum of 1,000 files is supported per upload.' }, { status: 413 });
    let metadata: FileMetadata[] = [];
    try { metadata = JSON.parse(String(form.get('manifest') ?? '[]')) as FileMetadata[]; }
    catch { return Response.json({ error: 'Invalid upload manifest metadata.' }, { status: 400 }); }
    if (blobs.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024)
      return Response.json({ error: 'Upload exceeds the 100 MB limit.' }, { status: 413 });
    uploaded = await Promise.all(blobs.map(async (file, index) => ({
      relativePath: metadata[index]?.relativePath || file.name,
      lastModified: metadata[index]?.lastModified || file.lastModified || undefined,
      content: await file.text(),
    })));
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: IngestEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        const session = createSession();
        ingestFiles(session, await resolveHelmCharts(uploaded, emit), emit);
      } catch (error) {
        emit({ type: 'file-error', filePath: '<upload>', message: error instanceof Error ? error.message : 'Ingestion failed.' });
      } finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' } });
}
