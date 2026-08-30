import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { IngestEvent, UploadedManifestFile } from './types';

const execFileAsync = promisify(execFile);

function safeRelativePath(value: string) {
  const normalized = value.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some(part => part === '..')) throw new Error('Unsafe relative upload path');
  return normalized;
}

function chartRoot(relativePath: string) {
  return relativePath.replace(/(^|\/)Chart\.ya?ml$/i, '');
}

export async function resolveHelmCharts(files: UploadedManifestFile[], emit: (event: IngestEvent) => void) {
  const safeFiles = files.map(file => ({ ...file, relativePath: safeRelativePath(file.relativePath) }));
  const detectedRoots = safeFiles.filter(file => /(^|\/)Chart\.ya?ml$/i.test(file.relativePath)).map(file => chartRoot(file.relativePath)).sort((a, b) => a.length - b.length);
  const roots = detectedRoots.filter((root, index) => !detectedRoots.slice(0, index).some(parent => parent === '' || root.startsWith(`${parent}/`)));
  if (!roots.length) return safeFiles.filter(file => /\.ya?ml$|\.json$/i.test(file.relativePath));

  const workingRoot = await mkdtemp(path.join(tmpdir(), 'klystr-manifest-'));
  try {
    for (const file of safeFiles) {
      const destination = path.join(workingRoot, ...file.relativePath.split('/'));
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, file.content, 'utf8');
    }
    const insideChart = (filePath: string, root: string) => root === '' || filePath === root || filePath.startsWith(`${root}/`);
    const resolved: UploadedManifestFile[] = safeFiles.filter(file => !roots.some(root => insideChart(file.relativePath, root)) && /\.ya?ml$|\.json$/i.test(file.relativePath));
    for (const root of roots) {
      const chartDirectory = path.join(workingRoot, ...root.split('/').filter(Boolean));
      const chartName = root.split('/').filter(Boolean).at(-1) ?? 'chart';
      const args = ['template', chartName, chartDirectory, '--include-crds'];
      try {
        const { stdout } = await execFileAsync('helm', args, { timeout: 60_000, maxBuffer: 20 * 1024 * 1024, windowsHide: true });
        resolved.push({ relativePath: `${root || chartName}/.rendered.yaml`, content: stdout, chartName });
      } catch (error) {
        const helmUnavailable = error instanceof Error && 'code' in error && error.code === 'ENOENT';
        if (helmUnavailable) {
          const rootPrefix = root ? `${root}/` : '';
          const staticTemplates = safeFiles.filter(file =>
            file.relativePath.startsWith(rootPrefix)
            && /(^|\/)(templates|crds)\/.*\.ya?ml$/i.test(file.relativePath)
            && !file.content.includes('{{'),
          );
          resolved.push(...staticTemplates.map(file => ({ ...file, chartName })));
          emit({
            type: 'chart-warning', chartPath: root || chartName,
            message: staticTemplates.length
              ? `Helm is unavailable; ingested ${staticTemplates.length} static template(s). Install Helm to render the remaining templated resources.`
              : 'Helm is unavailable and this chart has no statically parseable templates. Install Helm and ensure it is on PATH.',
          });
        } else {
          emit({ type: 'chart-error', chartPath: root || chartName, message: error instanceof Error ? error.message : 'Helm rendering failed.' });
        }
      }
    }
    return resolved;
  } finally {
    await rm(workingRoot, { recursive: true, force: true });
  }
}
