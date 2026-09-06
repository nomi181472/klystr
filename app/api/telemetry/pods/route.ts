import { NextResponse } from 'next/server';
import * as k8s from '@kubernetes/client-node';
import { createKubeConfig } from '@/lib/k8s/discovery';
import type { ConnectionSettings } from '@/lib/types';
import type { PodInfo } from '@/lib/telemetry/hubble';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const settings = body.settings as Partial<ConnectionSettings> | undefined;
    const namespaces = body.namespaces as string[] | undefined;

    if (!namespaces || namespaces.length === 0) {
      return NextResponse.json({ pods: [] });
    }

    const kc = createKubeConfig(settings);
    const core = kc.makeApiClient(k8s.CoreV1Api);
    const pods: (PodInfo & { label: string; status: string })[] = [];

    if (namespaces.includes('all')) {
      try {
        const resp = await core.listPodForAllNamespaces();
        for (const pod of resp.items ?? []) {
          if (pod.metadata?.name && pod.metadata?.namespace) {
            pods.push({
              id: `${pod.metadata.namespace}/${pod.metadata.name}`,
              name: pod.metadata.name,
              namespace: pod.metadata.namespace,
              ip: pod.status?.podIP || '',
              label: pod.metadata.labels?.['app.kubernetes.io/name'] || pod.metadata.labels?.app || pod.metadata.name,
              status: pod.status?.phase || 'Unknown',
            });
          }
        }
      } catch (err) {
        console.error('Failed to list pods across all namespaces:', err);
      }
    } else {
      for (const ns of namespaces) {
        try {
          const resp = await core.listNamespacedPod({ namespace: ns });
          for (const pod of resp.items ?? []) {
            if (pod.metadata?.name && pod.metadata?.namespace) {
              pods.push({
                id: `${pod.metadata.namespace}/${pod.metadata.name}`,
                name: pod.metadata.name,
                namespace: pod.metadata.namespace,
                ip: pod.status?.podIP || '',
                label: pod.metadata.labels?.['app.kubernetes.io/name'] || pod.metadata.labels?.app || pod.metadata.name,
                status: pod.status?.phase || 'Unknown',
              });
            }
          }
        } catch (nsErr) {
          console.warn(`Failed to list pods in namespace ${ns}:`, nsErr);
        }
      }
    }

    return NextResponse.json({ pods });
  } catch (error: unknown) {
    console.error('Failed to fetch telemetry pods', error);
    return NextResponse.json({ error: (error as Error).message, pods: [] }, { status: 500 });
  }
}

