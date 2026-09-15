import * as k8s from '@kubernetes/client-node';
import { NextResponse } from 'next/server';
import { registerConnection, removeConnection, reuseConnection } from '@/lib/k8s/connection-registry';
import { createKubeConfig, describeKubeConfig, kubernetesErrorStatus, type DescribedKubeConfig } from '@/lib/k8s/discovery';
import type { ConnectionErrorInfo, ConnectionSettings } from '@/lib/types';

interface FailureContext {
  targetEndpoint?: string;
  environment?: ConnectionSettings['environment'];
  contextName?: string;
  configSource?: string;
}

function failure(error: unknown, ctx?: FailureContext): ConnectionErrorInfo {
  const rawMessage = error instanceof Error ? error.message : 'Connection validation failed.';
  const errorObj = error as { code?: string; errno?: number | string; syscall?: string; cause?: { code?: string; message?: string; syscall?: string } } | undefined;
  const errCode = errorObj?.code ?? errorObj?.cause?.code ?? '';
  const syscall = errorObj?.syscall ?? errorObj?.cause?.syscall ?? '';
  const causeMessage = errorObj?.cause?.message ?? '';
  const detail = [rawMessage, errCode, syscall, causeMessage].filter(Boolean).join(' ').trim();
  const kubeStatus = kubernetesErrorStatus(error);

  const endpoint = ctx?.targetEndpoint;
  let hostname = '';
  try {
    if (endpoint) hostname = new URL(endpoint).hostname;
  } catch { /* ignore */ }

  // 1. HTTP 401 Unauthorized
  if (kubeStatus === 401) {
    return {
      category: 'unauthorized',
      message: 'The Kubernetes API server rejected the credentials (HTTP 401 Unauthorized).',
      detail: detail || 'Unauthorized: The token or certificate is invalid or expired.',
      targetEndpoint: endpoint,
      environment: ctx?.environment,
      contextName: ctx?.contextName,
      configSource: ctx?.configSource,
      suggestions: [
        'If using a Bearer Token: verify that the token has not expired and was copied correctly.',
        'Generate a fresh token for your ServiceAccount: `kubectl create token <service-account-name>`',
        'If using local cluster certificates: refresh your credentials (e.g. `microk8s config > ~/.kube/config`).',
        'Ensure the target user or ServiceAccount has not been deleted.',
      ],
      status: 401,
    };
  }

  // 2. HTTP 403 Forbidden
  if (kubeStatus === 403) {
    return {
      category: 'forbidden',
      message: 'Kubernetes accepted the credentials but denied the validation request (HTTP 403 Forbidden).',
      detail: detail || 'Forbidden: The credentials lack RBAC permissions to inspect cluster resources.',
      targetEndpoint: endpoint,
      environment: ctx?.environment,
      contextName: ctx?.contextName,
      configSource: ctx?.configSource,
      suggestions: [
        'The authenticated identity lacks RBAC permissions to read the Kubernetes API or review subject access.',
        'Grant cluster read permissions to the user or ServiceAccount using a ClusterRoleBinding.',
        'Example binding: `kubectl create clusterrolebinding klystr-viewer --clusterrole=view --serviceaccount=default:<sa-name>`',
        'Check namespace list permission: `kubectl auth can-i list namespaces`',
      ],
      status: 403,
    };
  }

  // 3. Timeout
  if (/timeout|timed out|abort/i.test(detail)) {
    return {
      category: 'timeout',
      message: `The Kubernetes API connection to ${endpoint ?? 'the cluster'} timed out after 10 seconds.`,
      detail,
      targetEndpoint: endpoint,
      environment: ctx?.environment,
      contextName: ctx?.contextName,
      configSource: ctx?.configSource,
      suggestions: [
        'Verify that the Kubernetes API server is running and responsive.',
        'Check cluster nodes status: `kubectl get nodes`',
        'Check whether network latency is high or a firewall/security group is dropping packets.',
        `Test connectivity from your terminal: curl -m 5 -k ${endpoint ?? 'https://<cluster-ip>:6443'}/version`,
      ],
      status: 504,
    };
  }

  // 4. TLS Certificate Verification
  if (/certificate|self[- ]signed|unable to verify|CERT_|DEPTH_ZERO|ALTNAME/i.test(detail)) {
    return {
      category: 'tls',
      message: 'Kubernetes TLS certificate verification failed.',
      detail,
      targetEndpoint: endpoint,
      environment: ctx?.environment,
      contextName: ctx?.contextName,
      configSource: ctx?.configSource,
      suggestions: [
        'If you are using a local, development, or private cluster with a self-signed certificate, toggle "Skip TLS verification" ON in Connection Settings.',
        'If using a custom Certificate Authority, ensure the certificate-authority-data is correctly embedded in your kubeconfig.',
        'Verify that the cluster URL matches the hostname or IP in the certificate Subject Alternative Names (SAN).',
      ],
      status: 502,
    };
  }

  // 5. Configuration / Validation Errors
  if (/required|must|changed|URL|Custom kubeconfig|Failed to load MicroK8s|K3s kubeconfig not found|No local Kubernetes configuration/i.test(rawMessage)) {
    const isMicroK8s = /microk8s/i.test(rawMessage) || ctx?.environment === 'microk8s';
    const isK3s = /k3s/i.test(rawMessage) || ctx?.environment === 'k3s';
    const isCustom = /custom/i.test(rawMessage) || ctx?.environment === 'custom';

    const suggestions: string[] = [];
    if (isMicroK8s) {
      suggestions.push(
        'Verify MicroK8s is installed: `which microk8s` (or `sudo snap install microk8s --classic`)',
        'Check if MicroK8s is running: `microk8s status` (start with `microk8s start`)',
        'Ensure your user belongs to the microk8s group: `sudo usermod -a -G microk8s $USER && newgrp microk8s`',
      );
    } else if (isK3s) {
      suggestions.push(
        'Verify K3s is running: `sudo systemctl status k3s`',
        'Ensure the kubeconfig is readable: `sudo chmod 644 /etc/rancher/k3s/k3s.yaml`',
        'Or copy K3s config: `sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config && sudo chown $USER ~/.kube/config`',
      );
    } else if (isCustom) {
      suggestions.push(
        'Verify the specified file path exists and is readable.',
        'If connecting to a Remote Cluster, provide both a valid HTTPS Cluster URL and Bearer Token.',
      );
    } else {
      suggestions.push('Check that all required connection fields are filled in correctly.');
    }

    return {
      category: 'config-error',
      message: rawMessage,
      detail,
      targetEndpoint: endpoint,
      environment: ctx?.environment,
      contextName: ctx?.contextName,
      configSource: ctx?.configSource,
      suggestions,
      status: 400,
    };
  }

  // 6. Network Errors (Connection Refused, Unreachable Host, DNS Failure)
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|fetch failed|network/i.test(detail)) {
    const isConnRefused = /ECONNREFUSED/i.test(detail);
    const isHostUnreach = /EHOSTUNREACH|ENETUNREACH/i.test(detail);
    const isNotFound = /ENOTFOUND/i.test(detail);

    let message = `The Kubernetes API could not be reached at ${endpoint ?? 'the configured endpoint'}.`;
    const suggestions: string[] = [];

    if (isConnRefused) {
      message = `Connection refused by the Kubernetes API server at ${endpoint ?? 'the target endpoint'}.`;
      suggestions.push(
        'The host is reachable, but nothing is listening on the target port.',
        'Verify that the Kubernetes API service is running.',
        'For MicroK8s: check status with `microk8s status` and start with `microk8s start`.',
        'For Minikube: check status with `minikube status`.',
        'For K3s: check status with `sudo systemctl status k3s`.',
        `Test if the port is open: curl -k ${endpoint ?? 'https://<server>:6443'}/version`,
      );
    } else if (isHostUnreach) {
      message = `The cluster host at ${endpoint ?? 'the target IP'} is unreachable.`;
      suggestions.push(
        'No network route to the cluster host. This often happens when your machine\'s IP address changes and ~/.kube/config retains an outdated IP.',
        'For MicroK8s: update ~/.kube/config to your current host IP by running: `microk8s config > ~/.kube/config`',
        'In the Connection settings modal, select "MicroK8s" directly from the Kubernetes Environment dropdown.',
        `Verify network route to host: ${hostname ? `ping -c 3 ${hostname}` : 'ping -c 3 <cluster-ip>'}`,
        `Test connectivity: curl -k ${endpoint ?? 'https://<cluster-ip>:16443'}/version`,
      );
    } else if (isNotFound) {
      message = `Could not resolve cluster hostname "${hostname || endpoint}".`;
      suggestions.push(
        'The hostname could not be resolved by your DNS server.',
        'Verify that the cluster URL hostname is spelled correctly.',
        'Check your DNS resolver or entries in /etc/hosts.',
      );
    } else {
      suggestions.push(
        `Verify cluster connectivity: curl -k ${endpoint ?? 'https://<cluster-endpoint>'}/version`,
        'Check if a firewall (e.g. ufw, iptables) or VPN is blocking the Kubernetes API port.',
        'For local clusters, ensure the cluster runtime is running.',
      );
    }

    return {
      category: 'network',
      message,
      detail,
      targetEndpoint: endpoint,
      environment: ctx?.environment,
      contextName: ctx?.contextName,
      configSource: ctx?.configSource,
      suggestions,
      status: 502,
    };
  }

  // 7. Unknown / Fallback
  return {
    category: 'unknown',
    message: rawMessage,
    detail,
    targetEndpoint: endpoint,
    environment: ctx?.environment,
    contextName: ctx?.contextName,
    configSource: ctx?.configSource,
    suggestions: [
      'Inspect the technical details below for more information.',
      'Test cluster access directly from your terminal: `kubectl cluster-info`',
    ],
    status: 502,
  };
}

export async function POST(request: Request) {
  let provisionalId: string | undefined;
  let contextInfo: FailureContext = {};

  try {
    const settings = await request.json() as Partial<ConnectionSettings>;
    let connection: ConnectionSettings;

    contextInfo.environment = settings.environment || 'default';
    contextInfo.contextName = settings.contextName;

    if (settings.clusterUrl && settings.token?.trim()) {
      connection = registerConnection(settings);
      provisionalId = connection.connectionId;
      contextInfo.targetEndpoint = connection.clusterUrl;
      contextInfo.configSource = 'remote endpoint';
    } else if (settings.connectionId && settings.connectionId !== 'local-kubeconfig') {
      connection = reuseConnection(settings);
      contextInfo.targetEndpoint = connection.clusterUrl;
      contextInfo.configSource = 'saved connection';
    } else {
      connection = {
        mode: 'live',
        connectionId: 'local-kubeconfig',
        environment: settings.environment || 'default',
        kubeconfigPath: settings.kubeconfigPath,
        kubeconfigContent: settings.kubeconfigContent,
        kubeconfigFileName: settings.kubeconfigFileName,
        contextName: settings.contextName,
        skipTlsVerify: settings.skipTlsVerify,
      };
      if (settings.kubeconfigContent) {
        contextInfo.configSource = settings.kubeconfigFileName ? `uploaded: ${settings.kubeconfigFileName}` : 'uploaded kubeconfig';
      } else if (settings.environment === 'microk8s') {
        contextInfo.configSource = 'microk8s config';
      } else if (settings.environment === 'k3s') {
        contextInfo.configSource = '/etc/rancher/k3s/k3s.yaml';
      } else if (settings.kubeconfigPath) {
        contextInfo.configSource = settings.kubeconfigPath;
      } else {
        contextInfo.configSource = '~/.kube/config';
      }
    }

    const config = createKubeConfig(connection);
    const described: DescribedKubeConfig = describeKubeConfig(config, connection);
    contextInfo = {
      targetEndpoint: described.endpoint ?? contextInfo.targetEndpoint,
      environment: connection.environment,
      contextName: described.context ?? connection.contextName,
      configSource: described.configSource,
    };

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
      targetEndpoint: contextInfo.targetEndpoint,
      configSource: contextInfo.configSource,
    });
  } catch (error) {
    if (provisionalId) removeConnection(provisionalId);
    const result = failure(error, contextInfo);
    return NextResponse.json({
      ok: false,
      category: result.category,
      error: result.message,
      message: result.message,
      detail: result.detail,
      targetEndpoint: result.targetEndpoint,
      environment: result.environment,
      contextName: result.contextName,
      configSource: result.configSource,
      suggestions: result.suggestions,
    }, { status: result.status });
  }
}
