import * as k8s from '@kubernetes/client-node';
import { NextResponse } from 'next/server';
import { registerConnection, removeConnection, reuseConnection } from '@/lib/k8s/connection-registry';
import { createKubeConfig, kubernetesErrorStatus } from '@/lib/k8s/discovery';
import type { ConnectionSettings } from '@/lib/types';

type FailureCategory = 'invalid-request' | 'network' | 'timeout' | 'tls' | 'unauthorized' | 'forbidden' | 'unknown';

function failure(error: unknown): { category: FailureCategory; message: string; status: number } {
  const message = error instanceof Error ? error.message : 'Connection validation failed.';
  const cause = error instanceof Error ? (error as Error & { cause?: { code?: string; message?: string } }).cause : undefined;
  const detail = `${message} ${cause?.code ?? ''} ${cause?.message ?? ''}`;
  const kubeStatus = kubernetesErrorStatus(error);
  if (kubeStatus === 401) return { category: 'unauthorized', message: 'The Kubernetes bearer token was rejected.', status: 401 };
  if (kubeStatus === 403) return { category: 'forbidden', message: 'Kubernetes accepted the token but denied the validation request.', status: 403 };
  if (/timeout|timed out|abort/i.test(detail)) return { category: 'timeout', message: 'The Kubernetes API connection timed out.', status: 504 };
  if (/certificate|self[- ]signed|unable to verify|CERT_/i.test(detail)) return { category: 'tls', message: 'Kubernetes TLS certificate verification failed.', status: 502 };
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|fetch failed|network/i.test(detail)) return { category: 'network', message: 'The Kubernetes API could not be reached.', status: 502 };
  if (/required|must|changed|URL/i.test(message)) return { category: 'invalid-request', message, status: 400 };
  return { category: 'unknown', message, status: 502 };
}

export async function POST(request: Request) {
  let provisionalId: string | undefined;
  try {
    const settings = await request.json() as Partial<ConnectionSettings>;
    let connection: ConnectionSettings;

    if (settings.clusterUrl && settings.token?.trim()) {
      connection = registerConnection(settings);
      provisionalId = connection.connectionId;
    } else if (settings.connectionId && settings.connectionId !== 'local-kubeconfig') {
      connection = reuseConnection(settings);
    } else {
      connection = {
        mode: 'live',
        connectionId: 'local-kubeconfig',
        environment: settings.environment || 'default',
        kubeconfigPath: settings.kubeconfigPath,
        contextName: settings.contextName,
      };
    }
    const config = createKubeConfig(connection);
    const versionApi = config.makeApiClient(k8s.VersionApi);
    const authorization = config.makeApiClient(k8s.AuthorizationV1Api);
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Connection validation timed out.')), 10_000));
    const version = await Promise.race([versionApi.getCode(), timeout]);
    const review = await Promise.race([
      authorization.createSelfSubjectAccessReview({ body: {
        apiVersion: 'authorization.k8s.io/v1',
        kind: 'SelfSubjectAccessReview',
        spec: { resourceAttributes: { verb: 'list', resource: 'namespaces' } },
      } }),
      timeout,
    ]);
    return NextResponse.json({
      ok: true,
      connection,
      version: version.gitVersion ?? `${version.major ?? ''}.${version.minor ?? ''}`,
      namespaceListAllowed: review.status?.allowed === true,
      namespaceListReason: review.status?.reason,
    });
  } catch (error) {
    if (provisionalId) removeConnection(provisionalId);
    const result = failure(error);
    return NextResponse.json({ ok: false, category: result.category, error: result.message }, { status: result.status });
  }
}
