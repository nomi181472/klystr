'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertOctagon, BadgeCheck, BadgeQuestionMark, LoaderCircle } from 'lucide-react';
import type { ConnectionSettings } from '@/lib/types';
import type { ImageVerification, ImageVerificationState } from '@/lib/image-analysis/types';

interface VerificationLookupOptions {
  identities: string[];
  activeContext: string | null;
  connectionSettings: ConnectionSettings;
  refreshKey?: number;
  mockVerified?: boolean;
}

/** Fetch all identities in one request and preserve input identities for per-container rendering. */
export function useImageVerifications({ identities, activeContext, connectionSettings, refreshKey = 0, mockVerified = false }: VerificationLookupOptions): ImageVerification[] {
  const identityToken = [...new Set(identities)].sort().join('\u0000');
  const requestedIdentities = useMemo(() => identityToken ? identityToken.split('\u0000') : [], [identityToken]);
  const [result, setResult] = useState<{ token: string; values: ImageVerification[] }>({ token: '', values: [] });

  useEffect(() => {
    // Mock verification is client-only. Never contact the verification API or a cluster.
    if (connectionSettings.mode === 'mock' || !identityToken) return;
    const controller = new AbortController();
    async function load() {
      try {
        const params = activeContext ? `?ctx=${encodeURIComponent(activeContext)}` : '';
        const response = await fetch(`/api/image-analysis/verification${params}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ ...connectionSettings, action: 'status', identities: requestedIdentities }),
        });
        if (!response.ok) throw new Error(`Verification request failed (${response.status})`);
        const payload = await response.json() as { verifications?: ImageVerification[] };
        const values = requestedIdentities.map((identity, index) => ({
          imageId: identity,
          state: payload.verifications?.[index]?.state ?? 'unverified',
          reason: payload.verifications?.[index]?.reason,
        } satisfies ImageVerification));
        if (!controller.signal.aborted) setResult({ token: identityToken, values });
      } catch (error) {
        if (!controller.signal.aborted) {
          const reason = error instanceof Error ? error.message : 'Verification unavailable';
          setResult({ token: identityToken, values: requestedIdentities.map(imageId => ({ imageId, state: 'error', reason })) });
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [activeContext, connectionSettings, identityToken, refreshKey, requestedIdentities]);

  if (connectionSettings.mode === 'mock') {
    return requestedIdentities.map(imageId => ({ imageId, state: mockVerified ? 'verified' : 'unverified' } satisfies ImageVerification));
  }
  if (result.token !== identityToken) {
    return requestedIdentities.map(imageId => ({ imageId, state: 'loading' } satisfies ImageVerification));
  }
  return result.values;
}

export function ImageVerificationStateBadge({ state, reason, compact = false }: { state: ImageVerificationState; reason?: string; compact?: boolean }) {
  const base = compact ? 'h-5 px-1.5 text-[9px]' : 'h-6 px-2 text-[10px]';
  if (state === 'loading') return <span className={`inline-flex items-center gap-1 rounded-full border border-border bg-muted text-muted-foreground ${base}`}><LoaderCircle size={10} className="animate-spin" />Checking</span>;
  if (state === 'verified') return <span className={`inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 font-medium text-success-foreground ${base}`}><BadgeCheck size={11} />Verified</span>;
  if (state === 'critical') return <span title={reason} className={`verification-critical inline-flex items-center gap-1 rounded-full border border-destructive/50 bg-destructive/15 font-semibold text-destructive-foreground ${base}`}><AlertOctagon size={11} />Critical</span>;
  return <span title={reason} className={`inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 font-medium text-warning-foreground ${base}`}><BadgeQuestionMark size={11} />{state === 'error' ? 'Unavailable' : 'Unverified'}</span>;
}

export function ImageVerificationBadge(props: VerificationLookupOptions & { compact?: boolean }) {
  const values = useImageVerifications(props);
  const state: ImageVerificationState = values.some(value => value.state === 'critical')
    ? 'critical'
    : values.length > 0 && values.every(value => value.state === 'verified')
      ? 'verified'
      : values.some(value => value.state === 'error')
        ? 'error'
        : values.some(value => value.state === 'loading')
          ? 'loading'
          : 'unverified';
  return <ImageVerificationStateBadge state={state} reason={values.find(value => value.reason)?.reason} compact={props.compact} />;
}
