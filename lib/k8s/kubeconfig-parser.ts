import * as k8s from '@kubernetes/client-node';
import yaml from 'js-yaml';

export interface ParsedClusterInfo {
  name: string;
  server: string;
  skipTLSVerify: boolean;
  hasCertificateAuthority: boolean;
}

export interface ParsedUserInfo {
  name: string;
  authType: 'token' | 'client-cert' | 'exec' | 'basic-auth' | 'none';
  username?: string;
  hasToken: boolean;
  hasClientCertificate: boolean;
  hasClientKey: boolean;
  execCommand?: string;
}

export interface ParsedContextInfo {
  name: string;
  cluster: string;
  user: string;
  namespace?: string;
  isCurrent: boolean;
  server?: string;
  authType?: ParsedUserInfo['authType'];
}

export interface ParsedKubeconfigMetadata {
  valid: boolean;
  currentContext: string;
  contexts: ParsedContextInfo[];
  clusters: ParsedClusterInfo[];
  users: ParsedUserInfo[];
  totalContexts: number;
  totalClusters: number;
  totalUsers: number;
  warnings: string[];
  error?: string;
}

/**
 * Parses raw Kubeconfig YAML or JSON string into structured metadata
 * without executing external processes or reading disk.
 */
export function parseKubeconfigMetadata(content: string): ParsedKubeconfigMetadata {
  const warnings: string[] = [];

  if (!content || !content.trim()) {
    return {
      valid: false,
      currentContext: '',
      contexts: [],
      clusters: [],
      users: [],
      totalContexts: 0,
      totalClusters: 0,
      totalUsers: 0,
      warnings: ['Kubeconfig content is empty.'],
      error: 'Empty kubeconfig content',
    };
  }

  let doc: any;
  try {
    doc = yaml.load(content);
  } catch (err: any) {
    return {
      valid: false,
      currentContext: '',
      contexts: [],
      clusters: [],
      users: [],
      totalContexts: 0,
      totalClusters: 0,
      totalUsers: 0,
      warnings: [],
      error: `YAML syntax error: ${err?.message || 'Invalid YAML format'}`,
    };
  }

  if (!doc || typeof doc !== 'object') {
    return {
      valid: false,
      currentContext: '',
      contexts: [],
      clusters: [],
      users: [],
      totalContexts: 0,
      totalClusters: 0,
      totalUsers: 0,
      warnings: ['Parsed document is not a valid YAML mapping.'],
      error: 'Invalid kubeconfig structure',
    };
  }

  // Parse Clusters
  const clusters: ParsedClusterInfo[] = [];
  const clusterMap = new Map<string, ParsedClusterInfo>();
  if (Array.isArray(doc.clusters)) {
    for (const c of doc.clusters) {
      const name = String(c?.name || '').trim();
      const clusterObj = c?.cluster || {};
      const server = String(clusterObj?.server || '').trim();
      const skipTLSVerify = clusterObj?.['insecure-skip-tls-verify'] === true;
      const hasCertificateAuthority = Boolean(
        clusterObj?.['certificate-authority'] || clusterObj?.['certificate-authority-data']
      );

      if (name) {
        const info: ParsedClusterInfo = {
          name,
          server,
          skipTLSVerify,
          hasCertificateAuthority,
        };
        clusters.push(info);
        clusterMap.set(name, info);
      }
    }
  }

  // Parse Users
  const users: ParsedUserInfo[] = [];
  const userMap = new Map<string, ParsedUserInfo>();
  if (Array.isArray(doc.users)) {
    for (const u of doc.users) {
      const name = String(u?.name || '').trim();
      const userObj = u?.user || {};

      const hasToken = Boolean(userObj?.token || userObj?.tokenFile || userObj?.['token-file']);
      const hasClientCertificate = Boolean(
        userObj?.['client-certificate'] || userObj?.['client-certificate-data']
      );
      const hasClientKey = Boolean(
        userObj?.['client-key'] || userObj?.['client-key-data']
      );
      const hasBasicAuth = Boolean(userObj?.username && userObj?.password);
      const execCommand = userObj?.exec?.command ? String(userObj.exec.command) : undefined;

      let authType: ParsedUserInfo['authType'] = 'none';
      if (hasToken) authType = 'token';
      else if (hasClientCertificate || hasClientKey) authType = 'client-cert';
      else if (execCommand) authType = 'exec';
      else if (hasBasicAuth) authType = 'basic-auth';

      if (name) {
        const info: ParsedUserInfo = {
          name,
          authType,
          username: userObj?.username ? String(userObj.username) : undefined,
          hasToken,
          hasClientCertificate,
          hasClientKey,
          execCommand,
        };
        users.push(info);
        userMap.set(name, info);
      }
    }
  }

  // Parse Contexts
  const currentContext = String(doc?.['current-context'] || doc?.currentContext || '').trim();
  const contexts: ParsedContextInfo[] = [];

  if (Array.isArray(doc.contexts)) {
    for (const ctx of doc.contexts) {
      const name = String(ctx?.name || '').trim();
      const contextObj = ctx?.context || {};
      const cluster = String(contextObj?.cluster || '').trim();
      const user = String(contextObj?.user || '').trim();
      const namespace = contextObj?.namespace ? String(contextObj.namespace).trim() : undefined;

      if (name) {
        const matchedCluster = clusterMap.get(cluster);
        const matchedUser = userMap.get(user);

        contexts.push({
          name,
          cluster,
          user,
          namespace,
          isCurrent: name === currentContext,
          server: matchedCluster?.server,
          authType: matchedUser?.authType,
        });
      }
    }
  }

  // Validation warnings
  if (contexts.length === 0) {
    warnings.push('No contexts found in kubeconfig.');
  }
  if (!currentContext && contexts.length > 0) {
    warnings.push('No current-context specified; defaults to first available context.');
  }
  for (const ctx of contexts) {
    if (ctx.cluster && !clusterMap.has(ctx.cluster)) {
      warnings.push(`Context "${ctx.name}" references cluster "${ctx.cluster}" which is not defined in clusters list.`);
    }
    if (ctx.user && !userMap.has(ctx.user)) {
      warnings.push(`Context "${ctx.name}" references user "${ctx.user}" which is not defined in users list.`);
    }
  }

  return {
    valid: contexts.length > 0 || clusters.length > 0,
    currentContext: currentContext || contexts[0]?.name || '',
    contexts,
    clusters,
    users,
    totalContexts: contexts.length,
    totalClusters: clusters.length,
    totalUsers: users.length,
    warnings,
  };
}
