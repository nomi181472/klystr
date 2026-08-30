import type { Detector } from './types';
import type { K8sResource, DependencyCandidate } from '@/lib/types';

const URL_REGEX = /(?:https?|redis|mongodb|postgresql|postgres|amqp|kafka|nats|grpc):\/\/([^\s,;"']+)/gi;

/** Parses URLs from container command and args */
export const urlDetector: Detector = {
  name: 'URLDetector',
  detect(resource: K8sResource): DependencyCandidate[] {
    const candidates: DependencyCandidate[] = [];
    const containers = resource.containers ?? [];

    for (const container of containers) {
      const strings = [...(container.command ?? []), ...(container.args ?? [])];
      for (const str of strings) {
        let match;
        const regex = new RegExp(URL_REGEX.source, URL_REGEX.flags);
        while ((match = regex.exec(str)) !== null) {
          const fullUrl = match[0];
          const protocol = fullUrl.split('://')[0];
          const hostPart = match[1].split('/')[0].split('@').pop() ?? '';
          const [host, portStr] = hostPart.split(':');
          const port = portStr ? parseInt(portStr, 10) : undefined;

          candidates.push({
            sourceUid: resource.uid,
            sourceKind: resource.kind,
            sourceName: resource.name,
            sourceNamespace: resource.namespace,
            destinationHint: host,
            protocol,
            port,
            detector: 'URLDetector',
            edgeKind: 'communication',
            rawEvidence: `command/args: ${fullUrl}`,
          });
        }
      }
    }

    return candidates;
  },
};
