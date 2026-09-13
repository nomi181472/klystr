# VS Code Extension Agent Guidelines

> **CRITICAL RULE FOR ALL AI MODELS:**
> This directory (`vscode-extension/`) contains ONLY the presentation, command registration, VS Code TreeView, and Webview bridge logic for the Visual Studio Code interface of Klystr.
>
> 1. **DO NOT DUPLICATE BUSINESS LOGIC**:
>    - All Kubernetes discovery, cluster connection handling, relationship detectors, RBAC auditing, manifest graph parsing, security checks, and container image analysis belong in `../lib/` (or imported via `@/lib/...`).
>    - Never write standalone or duplicate Kubernetes discovery/parser algorithms inside this directory.
> 2. **HYBRID ARCHITECTURE**:
>    - Presentation layer: VS Code native sidebar TreeDataProviders, Command Palette commands, status bar items, and Webview panels.
>    - Workspace Scanner: Uses `vscode.workspace.findFiles` to read Kubernetes YAML manifests from the developer's open workspace, then passes them to `../lib/manifest-graph/engine.ts`.
> 3. **BUILD & PACKAGING**:
>    - Bundled with `esbuild.mjs` to produce a lean `dist/extension.js`.
>    - Packaged with `@vscode/vsce package` into a `.vsix` file for distribution on the VS Code Marketplace.
