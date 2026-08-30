import type { Detector } from './types';
import type { K8sResource, DependencyCandidate } from '@/lib/types';

const SVC_DNS_REGEX = /([a-z0-9-]+)\.([a-z0-9-]+)\.svc(?:\.cluster\.local)?/i;
const HOST_PORT_REGEX = /([a-z0-9._-]+):(\d{2,5})/i;
const URL_REGEX = /(?:https?|redis|mongodb|postgresql|postgres|amqp|kafka|nats|grpc):\/\/([^\s,;"']+)/gi;

/** Extracts communication deps from container environment variables */
export const environmentVariableDetector: Detector = {
  name: 'EnvironmentVariableDetector',
  detect(resource: K8sResource): DependencyCandidate[] {
    const candidates: DependencyCandidate[] = [];
    const containers = resource.containers ?? [];

    for (const container of containers) {
      for (const envVar of container.envVars) {
        // valueFrom refs (configMap/secret)
        if (envVar.valueFrom?.configMapKeyRef) {
          candidates.push({
            sourceUid: resource.uid,
            sourceKind: resource.kind,
            sourceName: resource.name,
            sourceNamespace: resource.namespace,
            destinationHint: envVar.valueFrom.configMapKeyRef.name,
            environmentVariable: envVar.name,
            detector: 'EnvironmentVariableDetector',
            edgeKind: 'communication',
            rawEvidence: `${envVar.name} → configMapKeyRef: ${envVar.valueFrom.configMapKeyRef.name}/${envVar.valueFrom.configMapKeyRef.key}`,
          });
        }
        if (envVar.valueFrom?.secretKeyRef) {
          candidates.push({
            sourceUid: resource.uid,
            sourceKind: resource.kind,
            sourceName: resource.name,
            sourceNamespace: resource.namespace,
            destinationHint: envVar.valueFrom.secretKeyRef.name,
            environmentVariable: envVar.name,
            detector: 'EnvironmentVariableDetector',
            edgeKind: 'communication',
            fromSecret: true,
            rawEvidence: `${envVar.name} → secretKeyRef: ${envVar.valueFrom.secretKeyRef.name}/${envVar.valueFrom.secretKeyRef.key}`,
          });
        }

        // Literal value parsing
        if (!envVar.value) continue;
        const value = envVar.value;

        // URL patterns
        let urlMatch;
        const urlRegex = new RegExp(URL_REGEX.source, URL_REGEX.flags);
        while ((urlMatch = urlRegex.exec(value)) !== null) {
          const fullUrl = urlMatch[0];
          const protocol = fullUrl.split('://')[0];
          const hostPart = urlMatch[1].split('/')[0].split('@').pop() ?? '';
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
            environmentVariable: envVar.name,
            detector: 'EnvironmentVariableDetector',
            edgeKind: 'communication',
            fromSecret: envVar.fromSecret,
            rawEvidence: `${envVar.name}=${fullUrl}`,
          });
        }

        // K8s service DNS pattern (if not already caught by URL)
        const svcMatch = value.match(SVC_DNS_REGEX);
        if (svcMatch && !value.match(URL_REGEX)) {
          candidates.push({
            sourceUid: resource.uid,
            sourceKind: resource.kind,
            sourceName: resource.name,
            sourceNamespace: resource.namespace,
            destinationHint: `${svcMatch[1]}.${svcMatch[2]}.svc.cluster.local`,
            environmentVariable: envVar.name,
            detector: 'EnvironmentVariableDetector',
            edgeKind: 'communication',
            rawEvidence: `${envVar.name}=${value}`,
          });
        }

        // Plain hostname:port (if not already caught)
        if (!value.match(URL_REGEX) && !value.match(SVC_DNS_REGEX)) {
          const hpMatch = value.match(HOST_PORT_REGEX);
          if (hpMatch && !hpMatch[1].match(/^\d+\.\d+\.\d+\.\d+$/)) {
            candidates.push({
              sourceUid: resource.uid,
              sourceKind: resource.kind,
              sourceName: resource.name,
              sourceNamespace: resource.namespace,
              destinationHint: hpMatch[1],
              port: parseInt(hpMatch[2], 10),
              environmentVariable: envVar.name,
              detector: 'EnvironmentVariableDetector',
              edgeKind: 'communication',
              rawEvidence: `${envVar.name}=${value}`,
            });
          }
        }
      }
    }

    return candidates;
  },
};
