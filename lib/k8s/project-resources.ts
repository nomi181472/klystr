import * as k8s from '@kubernetes/client-node';
import { kubernetesErrorStatus } from '@/lib/k8s/discovery';

export function projectName() {
  const value = (process.env.KLYSTR_PROJECT_NAME || 'klystr').toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
  if (!value || value.startsWith('kube-')) throw new Error('KLYSTR_PROJECT_NAME must produce a non-reserved RFC 1123 namespace name.');
  return value;
}

export async function ensureProjectNamespace(core: k8s.CoreV1Api) {
  const name = projectName();
  try {
    await core.readNamespace({ name });
  } catch (error) {
    if (kubernetesErrorStatus(error) !== 404) throw error;
    await core.createNamespace({ body: { apiVersion: 'v1', kind: 'Namespace', metadata: { name, labels: { 'app.kubernetes.io/name': name, 'app.kubernetes.io/managed-by': 'klystr' } } } });
  }
  return name;
}
