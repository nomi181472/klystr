import 'server-only';

import { randomUUID } from 'node:crypto';
import type { ConnectionSettings } from '@/lib/types';

const CONNECTION_TTL_MS = 8 * 60 * 60 * 1000;

interface StoredConnection {
  id: string;
  mode: 'live';
  clusterUrl: string;
  token: string;
  skipTlsVerify: boolean;
  expiresAt: number;
}

function publicConnection(connection: StoredConnection): ConnectionSettings {
  return {
    mode: connection.mode,
    clusterUrl: connection.clusterUrl,
    connectionId: connection.id,
    skipTlsVerify: connection.skipTlsVerify,
  };
}

interface ConnectionRegistry {
  connections: Map<string, StoredConnection>;
}

const globalRegistry = globalThis as typeof globalThis & {
  __klystrConnectionRegistry?: ConnectionRegistry;
};

const registry = globalRegistry.__klystrConnectionRegistry ??= { connections: new Map() };

function pruneExpired() {
  const now = Date.now();
  for (const [id, connection] of registry.connections) {
    if (connection.expiresAt <= now) registry.connections.delete(id);
  }
}

function normalizeClusterUrl(value: string) {
  const parsed = new URL(value.trim());
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Cluster URL must use HTTP or HTTPS.');
  if (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Cluster URL must contain only protocol, host, and port.');
  }
  return `${parsed.protocol}//${parsed.host}`;
}

export function registerConnection(settings: Partial<ConnectionSettings>): ConnectionSettings {
  if (settings.mode !== 'live') throw new Error('Only live connections can be registered.');
  const clusterUrl = normalizeClusterUrl(settings.clusterUrl ?? '');
  const token = settings.token?.trim();
  if (!token) throw new Error('A Kubernetes bearer token is required.');

  pruneExpired();
  const id = randomUUID();
  registry.connections.set(id, {
    id,
    mode: 'live',
    clusterUrl,
    token,
    skipTlsVerify: settings.skipTlsVerify === true,
    expiresAt: Date.now() + CONNECTION_TTL_MS,
  });
  return publicConnection(registry.connections.get(id)!);
}

export function resolveConnection(settings?: Partial<ConnectionSettings>): StoredConnection {
  pruneExpired();
  const id = settings?.connectionId?.trim();
  if (!id) throw new Error('A server connection is required. Connect to the cluster first.');
  const connection = registry.connections.get(id);
  if (!connection) throw new Error('The server connection expired or was lost. Reconnect to the cluster.');
  connection.expiresAt = Date.now() + CONNECTION_TTL_MS;
  return connection;
}

export function reuseConnection(settings: Partial<ConnectionSettings>): ConnectionSettings {
  const connection = resolveConnection(settings);
  const requestedUrl = normalizeClusterUrl(settings.clusterUrl ?? '');
  if (requestedUrl !== connection.clusterUrl || (settings.skipTlsVerify === true) !== connection.skipTlsVerify) {
    throw new Error('Connection settings changed. Enter the Kubernetes bearer token again.');
  }
  return publicConnection(connection);
}

export function removeConnection(id: string) {
  return registry.connections.delete(id);
}
