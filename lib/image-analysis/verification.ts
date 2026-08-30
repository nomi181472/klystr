import { createHmac, timingSafeEqual } from 'node:crypto';
import * as k8s from '@kubernetes/client-node';
import { createKubeConfig, kubernetesErrorStatus } from '@/lib/k8s/discovery';
import { ensureProjectNamespace, projectName } from '@/lib/k8s/project-resources';
import type { ConnectionSettings } from '@/lib/types';
import type { ImageVerification } from './types';
import { imageIdentityKey } from './service';

const CONFIG_MAP = 'verified-images';
const DATA_KEY = 'verified_images.json';
const FALLBACK_VERIFICATION_SECRET = 'klystr-local-fallback-verification-key-32chars';
const mockRegistry: Record<string, string> = {};
const registryCache = new Map<string, { expires: number; registry: Record<string, string> }>();

function secret(required: boolean) {
  const value = process.env.IMAGE_VERIFICATION_SECRET?.trim() || FALLBACK_VERIFICATION_SECRET;
  if (required && value.length < 32) throw new Error('IMAGE_VERIFICATION_SECRET must contain at least 32 characters.');
  return value;
}

function signature(imageId: string, value = secret(true)) {
  return createHmac('sha256', value).update(imageId).digest('hex');
}

function validSignature(imageId: string, candidate: string, value: string) {
  if (!/^[a-f0-9]{64}$/.test(candidate) || value.length < 32) return false;
  const expected = Buffer.from(signature(imageId, value), 'hex');
  return timingSafeEqual(expected, Buffer.from(candidate, 'hex'));
}

function parseRegistry(value?: string) {
  if (!value) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('verified_images.json is not a JSON object.');
  return Object.fromEntries(Object.entries(parsed).filter(([key, signatureValue]) => /^[a-f0-9]{64}$/.test(key) && typeof signatureValue === 'string'));
}

async function readRegistry(core: k8s.CoreV1Api) {
  try {
    const configMap = await core.readNamespacedConfigMap({ name: CONFIG_MAP, namespace: projectName() });
    return { configMap, registry: parseRegistry(configMap.data?.[DATA_KEY]) };
  } catch (error) {
    if (kubernetesErrorStatus(error) === 404) return { configMap: null, registry: {} as Record<string, string> };
    throw error;
  }
}

export async function verificationStatus(identities: string[], context: string | undefined, settings: Partial<ConnectionSettings>): Promise<ImageVerification[]> {
  const keys = identities.map(imageIdentityKey);
  try {
    const cacheKey = `${settings.mode ?? 'live'}:${settings.clusterUrl ?? ''}:${context ?? 'current'}`;
    const cached = registryCache.get(cacheKey);
    const registry = settings.mode === 'mock' ? mockRegistry : cached && cached.expires > Date.now() ? cached.registry : (await readRegistry(client(context, settings))).registry;
    if (settings.mode !== 'mock' && (!cached || cached.expires <= Date.now())) registryCache.set(cacheKey, { registry, expires: Date.now() + 2_000 });
    const signingSecret = secret(false);
    return keys.map(imageId => {
      const stored = registry[imageId];
      if (!stored) return { imageId, state: 'unverified' };
      if (!validSignature(imageId, stored, signingSecret)) return { imageId, state: 'critical', reason: 'Stored verification signature does not match this project secret.' };
      return { imageId, state: 'verified' };
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unable to read verification registry.';
    const corruptRegistry = error instanceof SyntaxError || /verified_images\.json/i.test(reason);
    return keys.map(imageId => ({ imageId, state: corruptRegistry ? 'critical' : 'error', reason }));
  }
}

function client(context: string | undefined, settings: Partial<ConnectionSettings>) {
  const kubeConfig = createKubeConfig(settings); if (context) kubeConfig.setCurrentContext(context);
  return kubeConfig.makeApiClient(k8s.CoreV1Api);
}

export async function saveVerifiedImage(imageId: string, context: string | undefined, settings: Partial<ConnectionSettings>) {
  if (!/^[a-f0-9]{64}$/.test(imageId)) throw new Error('Invalid image identity.');
  const signed = signature(imageId);
  if (settings.mode === 'mock') { mockRegistry[imageId] = signed; return; }
  const core = client(context, settings);
  const namespace = await ensureProjectNamespace(core);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { configMap, registry } = await readRegistry(core);
    registry[imageId] = signed;
    const data = { [DATA_KEY]: `${JSON.stringify(registry, null, 2)}\n` };
    if (Buffer.byteLength(data[DATA_KEY], 'utf8') > 900_000) throw new Error('The verified image registry is approaching the Kubernetes ConfigMap size limit. Archive old entries before adding more.');
    try {
      if (!configMap) await core.createNamespacedConfigMap({ namespace, body: { apiVersion: 'v1', kind: 'ConfigMap', metadata: { name: CONFIG_MAP, namespace, labels: { 'app.kubernetes.io/name': projectName(), 'app.kubernetes.io/managed-by': 'klystr' } }, data } });
      else await core.replaceNamespacedConfigMap({ name: CONFIG_MAP, namespace, body: { ...configMap, data } });
      registryCache.clear();
      return;
    } catch (error) {
      if (kubernetesErrorStatus(error) !== 409 || attempt === 2) throw error;
    }
  }
}
