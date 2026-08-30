import type { ManifestGraphSession } from './types';

const SESSION_TTL_MS = 30 * 60 * 1000;
const sessions = new Map<string, ManifestGraphSession>();

function pruneExpired() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(id);
  }
}

export function createSession(): ManifestGraphSession {
  pruneExpired();
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const session: ManifestGraphSession = {
    id,
    nodeStore: new Map(),
    adjacencyOut: new Map(),
    adjacencyIn: new Map(),
    conflicts: new Map(),
    createdAt,
    expiresAt: createdAt + SESSION_TTL_MS,
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string) {
  pruneExpired();
  const session = sessions.get(id);
  if (session) session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

export function deleteSession(id: string) {
  return sessions.delete(id);
}
