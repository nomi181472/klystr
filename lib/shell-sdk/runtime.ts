'use client';

import { useSyncExternalStore } from 'react';
import type { ConnectionSettings } from '@/lib/types';
import { SHELL_SDK_VERSION, type ShellCommand, type ShellSdk, type ShellSnapshot } from '@/lib/shell-sdk/contracts';

const SDK_KEY = '__KLYSTR_SHELL_SDK__';
const DEFAULT_CONNECTION: ConnectionSettings = { mode: 'mock', clusterUrl: '', skipTlsVerify: false };
const DEFAULT_SNAPSHOT: ShellSnapshot = { version: SHELL_SDK_VERSION, connection: DEFAULT_CONNECTION, activeContext: null, discoveredNamespaces: [] };

interface ShellSdkHost extends ShellSdk {
  publish(snapshot: Omit<ShellSnapshot, 'version'>): void;
}

declare global {
  interface Window {
    __KLYSTR_SHELL_SDK__?: ShellSdkHost;
  }
}

function createSdk(): ShellSdkHost {
  let snapshot = DEFAULT_SNAPSHOT;
  const listeners = new Set<() => void>();

  return {
    version: SHELL_SDK_VERSION,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(next) {
      snapshot = { version: SHELL_SDK_VERSION, ...next };
      listeners.forEach((listener) => listener());
    },
    dispatch(command: ShellCommand) {
      window.dispatchEvent(new CustomEvent('klystr:shell-command', { detail: command }));
    },
    fetch(input, init) {
      return window.fetch(input, { ...init, credentials: init?.credentials ?? 'same-origin' });
    },
  };
}

export function getShellSdk(): ShellSdkHost {
  if (typeof window === 'undefined') {
    throw new Error('The Klystr shell SDK is only available in the browser.');
  }
  window[SDK_KEY] ??= createSdk();
  return window[SDK_KEY];
}

function subscribeToShell(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  return getShellSdk().subscribe(listener);
}

function getClientSnapshot(): ShellSnapshot {
  if (typeof window === 'undefined') return DEFAULT_SNAPSHOT;
  return getShellSdk().getSnapshot();
}

function getServerSnapshot(): ShellSnapshot {
  return DEFAULT_SNAPSHOT;
}

export function useShellSnapshot(): ShellSnapshot {
  return useSyncExternalStore(subscribeToShell, getClientSnapshot, getServerSnapshot);
}
