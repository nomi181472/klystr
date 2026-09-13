<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Hubble Enable Rules
- You will never run commands to enable Hubble.
- You will always use REST APIs for Hubble enable.
- If there is no REST API, then guide the user how they can enable it manually.

# Dual-Interface Architecture & Core Business Logic Rules
> **CRITICAL RULE FOR ALL AI MODELS (Codex, Antigravity, Claude, Copilot, etc.):**
> Klystr supports two distinct capabilities/interfaces:
> 1. **Web Application**: Next.js 16 + React 19 web dashboard (`app/`, `apps/`, `components/`).
> 2. **VS Code Extension**: VS Code Extension (`vscode-extension/`) providing native Activity Bar trees, status bar indicators, workspace manifest scanning, and embedded webviews.
>
> ### Rules:
> - **100% SHARED BUSINESS LOGIC**: All core Kubernetes logic, cluster discovery, relationship detectors, manifest graph engines, RBAC auditing, container image scanning, and security rules live exclusively in `lib/` (e.g., `lib/k8s/`, `lib/detectors/`, `lib/manifest-graph/`, `lib/rbac/`, `lib/security/`, `lib/image-analysis/`, `lib/graph/`).
> - **NO DUPLICATE BUSINESS LOGIC**: Never re-implement or duplicate Kubernetes discovery, graph layout, or parsing logic inside `vscode-extension/` or `apps/`. Both interfaces must consume the unified `lib/` modules.
> - **SEPARATE PRESENTATION LAYERS**: Each interface maintains its own UI presentation layer tailored to its environment (Next.js components for web, VS Code TreeDataProviders & Webviews for the extension), but they communicate with the same core business models.

