import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const standaloneRoot = resolve(projectRoot, '.next', 'standalone');

if (!existsSync(standaloneRoot)) {
  console.log('Standalone output was not generated; skipping asset copy.');
  process.exit(0);
}

const copies = [
  {
    source: resolve(projectRoot, '.next', 'static'),
    destination: resolve(standaloneRoot, '.next', 'static'),
  },
  {
    source: resolve(projectRoot, 'public'),
    destination: resolve(standaloneRoot, 'public'),
  },
];

for (const { source, destination } of copies) {
  if (!existsSync(source)) continue;
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true, force: true });
}

console.log('Copied static and public assets into the standalone build.');
