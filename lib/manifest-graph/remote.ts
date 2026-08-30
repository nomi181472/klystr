import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { UploadedManifestFile } from './types';

const MAX_REMOTE_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase().replace(/^::ffff:/, '');
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19));
  }
  return normalized === '::' || normalized === '::1' || normalized.startsWith('fc')
    || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized);
}

async function validateRemoteUrl(value: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Enter a valid HTTPS manifest URL.'); }
  if (url.protocol !== 'https:') throw new Error('Manifest URLs must use HTTPS.');
  if (url.username || url.password) throw new Error('Manifest URLs cannot contain credentials.');
  if (!/\.ya?ml$/i.test(decodeURIComponent(url.pathname))) throw new Error('The URL must point to a .yaml or .yml file.');
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(result => isPrivateAddress(result.address))) throw new Error('Private, local, and link-local manifest URLs are not allowed.');
  return url;
}

async function readLimitedBody(response: Response) {
  if (Number(response.headers.get('content-length') ?? 0) > MAX_REMOTE_BYTES) throw new Error('Remote manifest exceeds the 10 MB limit.');
  if (!response.body) throw new Error('The remote server returned an empty response.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REMOTE_BYTES) { await reader.cancel(); throw new Error('Remote manifest exceeds the 10 MB limit.'); }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(body);
}

export async function fetchRemoteManifest(value: string): Promise<UploadedManifestFile> {
  let url = await validateRemoteUrl(value.trim());
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const response = await fetch(url, { redirect: 'manual', cache: 'no-store', signal: controller.signal });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirects === MAX_REDIRECTS) throw new Error('The manifest URL redirected too many times.');
        url = await validateRemoteUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) throw new Error(`The remote server returned HTTP ${response.status}.`);
      const name = decodeURIComponent(url.pathname.split('/').pop() || 'remote-manifest.yaml');
      return { relativePath: `remote/${name}`, content: await readLimitedBody(response) };
    }
    throw new Error('The manifest URL could not be loaded.');
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The manifest URL timed out after 15 seconds.');
    if (error instanceof TypeError) throw new Error('The manifest URL could not be downloaded. Check that the server is publicly reachable.');
    throw error;
  } finally { clearTimeout(timeout); }
}
