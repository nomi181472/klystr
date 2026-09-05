import type { FederatedPluginModule, PluginManifest } from '@/lib/plugins/contracts';
import { SHELL_SDK_VERSION } from '@/lib/shell-sdk/contracts';

interface FederationContainer {
  init(shareScope: unknown): Promise<void> | void;
  get(module: string): Promise<() => FederatedPluginModule>;
}

declare const __webpack_init_sharing__: (scope: string) => Promise<void>;
declare const __webpack_share_scopes__: { default?: unknown };

declare global {
  interface Window {
    [scope: string]: unknown;
  }
}

const scripts = new Map<string, Promise<void>>();
const initializedScopes = new Set<string>();

function loadScript(url: string, integrity?: string): Promise<void> {
  const existing = scripts.get(url);
  if (existing) return existing;

  const pending = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => {
      scripts.delete(url);
      script.remove();
      reject(new Error(`Remote entry timed out: ${url}`));
    }, 10_000);
    script.src = url;
    script.type = 'text/javascript';
    script.async = true;
    if (integrity) {
      script.integrity = integrity;
      script.crossOrigin = 'anonymous';
    }
    script.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      scripts.delete(url);
      script.remove();
      reject(new Error(`Unable to load remote entry: ${url}`));
    };
    document.head.appendChild(script);
  });

  scripts.set(url, pending);
  return pending;
}

export async function loadFederatedPlugin(plugin: PluginManifest): Promise<FederatedPluginModule> {
  if (!plugin.remoteEntry || !plugin.scope || !plugin.exposedModule) {
    throw new Error('The feature deployment has not published a remote entry.');
  }

  const requiredMajor = plugin.shellApiRange?.match(/\d+/)?.[0];
  const shellMajor = SHELL_SDK_VERSION.split('.')[0];
  if (requiredMajor && requiredMajor !== shellMajor) {
    throw new Error(`Feature requires shell API ${plugin.shellApiRange}; shell provides ${SHELL_SDK_VERSION}.`);
  }

  window.dispatchEvent(new CustomEvent('klystr:plugin-load', { detail: { pluginId: plugin.id, status: 'loading' } }));
  await loadScript(plugin.remoteEntry, plugin.integrity);

  const container = window[plugin.scope] as FederationContainer | undefined;
  if (!container?.get || !container.init) {
    throw new Error(`Remote scope "${plugin.scope}" is unavailable.`);
  }

  if (!initializedScopes.has(plugin.scope)) {
    await __webpack_init_sharing__('default');
    await container.init(__webpack_share_scopes__.default ?? {});
    initializedScopes.add(plugin.scope);
  }

  const factory = await container.get(plugin.exposedModule);
  const pluginModule = factory();
  window.dispatchEvent(new CustomEvent('klystr:plugin-load', { detail: { pluginId: plugin.id, status: 'ready' } }));
  return pluginModule;
}
