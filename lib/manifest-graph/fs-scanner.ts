import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { UploadedManifestFile } from './types';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.vscode',
  '.gemini',
  'test-results',
  'coverage',
  'artifacts',
  '.turbo',
  'vendor',
]);

const MAX_FILES = 1000;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_DEPTH = 10;

export interface DirectoryScanResult {
  directory: string;
  files: UploadedManifestFile[];
  totalScannedFiles: number;
}

export function getCurrentWorkspaceDirectory(): string {
  return (
    process.env.KLYSTR_WORKSPACE_DIR ||
    process.env.WORKSPACE_FOLDER ||
    process.cwd()
  );
}

export async function scanDirectoryForManifests(
  baseDir: string = getCurrentWorkspaceDirectory()
): Promise<DirectoryScanResult> {
  const rootDir = path.resolve(baseDir);
  const manifestFiles: UploadedManifestFile[] = [];
  let totalScanned = 0;
  const visitedPaths = new Set<string>();

  async function walk(currentDir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || manifestFiles.length >= MAX_FILES) return;

    let realCurrent: string;
    try {
      realCurrent = await fs.realpath(currentDir);
    } catch {
      return;
    }

    if (visitedPaths.has(realCurrent)) return;
    visitedPaths.add(realCurrent);

    let entries;
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (manifestFiles.length >= MAX_FILES) break;

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) {
          continue;
        }
        await walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext !== '.yaml' && ext !== '.yml' && ext !== '.json') {
          continue;
        }

        totalScanned++;

        try {
          const stats = await fs.stat(fullPath);
          if (stats.size > MAX_FILE_SIZE || stats.size === 0) continue;

          const content = await fs.readFile(fullPath, 'utf-8');

          // Check if it looks like a Kubernetes manifest or Helm chart
          const isK8s =
            (/apiVersion:\s*\S+/i.test(content) && /kind:\s*\S+/i.test(content)) ||
            (ext === '.json' && content.includes('"apiVersion"') && content.includes('"kind"')) ||
            entry.name.toLowerCase() === 'chart.yaml' ||
            entry.name.toLowerCase() === 'values.yaml';

          if (isK8s) {
            manifestFiles.push({
              relativePath: path.relative(rootDir, fullPath) || entry.name,
              content,
              lastModified: stats.mtimeMs,
              size: stats.size,
            });
          }
        } catch {
          // Ignore unreadable files
        }
      }
    }
  }

  await walk(rootDir, 0);

  // Sort files predictably by relativePath
  manifestFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return {
    directory: rootDir,
    files: manifestFiles,
    totalScannedFiles: totalScanned,
  };
}
