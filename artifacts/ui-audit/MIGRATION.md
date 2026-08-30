# UI migration log

## Baseline

- Major workspaces discovered: 5
- Required viewports captured: 4
- Baseline screenshots: 22
- Existing shared UI primitives: 27
- UI framework: Tailwind CSS 4 with shadcn/Base UI primitives
- Fonts: Geist Sans and Geist Mono through `next/font`

## Completed shared-system pass

- Workspace navigation: all five workspaces now expose the same active semantics.
- Page header: `PageHeader` created and Image Analysis migrated as the representative screen.
- Empty state: `EmptyState` created and Manifest upload migrated with direct actions.
- Status: `StatusBadge` created and Security severities migrated.
- Data table: `ui-data-table` contract introduced; Image Analysis and Security exposure inventory migrated.
- Typography: semantic caption and overline roles added; monospace retained for Kubernetes identifiers.

## Verification

- Representative component migration tests: passed.
- Full interaction and theme suites: passed.
- Before/after screenshots: 22 per phase.
- Visual regression coverage: Manifest empty state and tablet Security posture.

## Microfrontend migration started

- Shell navigation is now driven by a typed plugin registry.
- A client-side Module Federation remote host and failure boundary were introduced.
- The Ideas tab demonstrates register-before-deploy behavior and renders the standard unavailable page until its remote entry exists.
- The existing five workspaces remain local while Topology is prepared as the first extraction pilot.
- Architecture decisions and the Next.js Multi-Zones fallback are recorded in `docs/microfrontend-architecture.md`.
- Shell SDK v1 now bridges connection/context snapshots, navigation, refresh commands, and same-origin API access across federation boundaries.
- Topology has a separately buildable remote application and `/topology` prefers it when configured, with the current local bundle retained as a rollout fallback.
- RBAC, Image Analysis, Manifests, and Security now have matching remote applications, SDK-backed shell state, independent Docker services, health checks, and local rollback fallbacks.
- Topology image verification is now an optional federated extension supplied by Image Analysis rather than a direct feature import.
- Remote loading supports SRI, compatibility checks, lifecycle telemetry, timeouts, retries, and isolated unavailable states.
