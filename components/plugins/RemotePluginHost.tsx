'use client';

import { Component, useEffect, useState, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { LoadingIndicator } from '@/components/ui/loading-indicator';
import { PluginUnavailable } from '@/components/plugins/PluginUnavailable';
import { loadFederatedPlugin } from '@/lib/plugins/federation';
import type { PluginManifest } from '@/lib/plugins/contracts';
import { createLogger } from '@/lib/logger';

const logger = createLogger('plugin-host');

class PluginErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onError: (error: Error, info: ErrorInfo) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError(error, info);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function RemotePluginHost({ plugin, fallback }: { plugin: PluginManifest; fallback?: ReactNode }) {
  const [Remote, setRemote] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    loadFederatedPlugin(plugin)
      .then((module) => {
        if (active) setRemote(() => module.default);
      })
      .catch((cause: unknown) => {
        if (active) {
          window.dispatchEvent(new CustomEvent('klystr:plugin-load', { detail: { pluginId: plugin.id, status: 'failed' } }));
          setError(cause instanceof Error ? cause.message : 'The remote feature could not be loaded.');
        }
      });

    return () => { active = false; };
  }, [plugin, attempt]);

  useEffect(() => {
    if (!error) return;
    const retry = window.setTimeout(() => setAttempt((value) => value + 1), 30_000);
    return () => window.clearTimeout(retry);
  }, [error]);

  if (error) return fallback ?? <PluginUnavailable label={plugin.label} />;
  if (!Remote) return <div className="grid h-full place-items-center"><LoadingIndicator label={`Loading ${plugin.label}`} /></div>;
  return (
    <PluginErrorBoundary
      fallback={fallback ?? <PluginUnavailable label={plugin.label} />}
      onError={(cause) => logger.error(`render failed`, cause)}
    >
      <Remote />
    </PluginErrorBoundary>
  );
}
