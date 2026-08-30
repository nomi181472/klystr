# Microfrontend and plugin architecture

## Decision

klystr keeps Next.js as the central shell and uses webpack's Module Federation runtime plus a client-side container boundary for independently deployed feature UIs. The shell owns layout, navigation, global connection/authentication state, theme, error handling, and plugin discovery.

Next.js 16 documents Multi-Zones as its supported microfrontend mechanism and warns that custom webpack configuration is not covered by semver. Therefore the native federation-container loader is isolated behind `RemotePluginHost`. If a compatible Module Federation producer cannot be maintained, a remote can move to a path-based Next.js zone without changing the registry or navigation contract.

## Plugin lifecycle

1. Add a core manifest to `config/plugins.ts`, or publish a future manifest through `KLYSTR_PLUGIN_REGISTRY_URL`/`KLYSTR_PLUGIN_REGISTRY_JSON`, with a stable id and `/plugins/{id}` route.
2. The tab is immediately visible.
3. Until `remoteEntry` resolves, the shell renders “This page is not available”.
4. Deploy a remote exposing `./Plugin` under its declared scope.
5. Configure the remote-entry URL before or during registry rollout. Navigation and feature hosts refresh `/api/plugins` every 30 seconds, and the loader retries unavailable entries, so compatible features appear after independent deployment without rebuilding the shell.

Remote plugins must default-export a React component and must treat React and React DOM as shared singletons. They must not import shell Zustand stores. Cross-boundary access will be provided through a versioned shell SDK.

Remote manifests may provide a SHA-256/384/512 `integrity` value. The loader applies Subresource Integrity and anonymous CORS before executing the remote entry. Load lifecycle events are emitted as `klystr:plugin-load` with `loading`, `ready`, or `failed` status for telemetry adapters.

## Shell SDK v1

The SDK is published through a stable browser singleton so independently compiled remotes do not depend on a shared JavaScript module instance. It currently exposes connection/context snapshots, subscriptions, authenticated same-origin fetch, navigation commands, and topology refresh commands. The shell validates the manifest's required SDK major version before evaluating the exposed feature.

Topology now consumes the SDK connection snapshot. Its graph, filter, UI, and discovery stores remain private to the feature bundle. The shell and remote share React, React DOM, React Query, and Zustand as federation singletons; the Query Client context therefore continues across the deployment boundary. Remote entry loading has a 10-second timeout, retries every 30 seconds, and isolates render failures with an error boundary.

## Feature deployments

Each directory under `apps/*-remote` builds a separate Next.js deployment exposing `./Plugin` from its feature scope. The shell routes prefer their configured remote and retain local implementations as immediate rollout fallbacks. Docker Compose builds each remote into its own image and does not make shell health depend on remote health.

Image Analysis additionally exposes `./TopologyVerification`. Topology consumes it through `FederatedExtensionSlot`; when Image Analysis is absent, the slot stays empty and Topology continues operating without importing Image Analysis source or state.

## Extraction order

Topology, RBAC, Image Analysis, Security, and Manifests now have remote deployment boundaries. Local route fallbacks should be removed individually only after contract, failure-recovery, interaction, and visual-regression tests pass in the target environment.
