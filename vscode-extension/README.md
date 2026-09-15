# Klystr — Visual Kubernetes Operations Workspace for VS Code

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/klystr.klystr?style=flat&color=blue&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=klystr.klystr)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**Klystr** brings deep Kubernetes resource topology, dependency discovery, RBAC inspection, manifest analysis, container-image security, and cluster security checks directly inside Visual Studio Code.

Instead of running dozens of terminal commands or wrestling with disjointed kubectl outputs, Klystr renders an interactive, real-time graph of how your workloads, services, ingresses, and configs connect.

---

## Key Features

### 1. Automatic Workspace Manifest Scanner (Zero-Upload)
- Automatically detects and parses all Kubernetes YAML manifests (`**/*.yaml`, `**/*.yml`) in your open VS Code project.
- Visualizes service selectors, ingress backends, volume mounts, ConfigMap references, and secret bindings.
- **Live Auto-Reload on Save**: Whenever you edit and save a manifest file in VS Code (`Ctrl+S`), Klystr re-calculates the dependency graph in real time.

### 2. Clusters & Contexts Sidebar
- Integrated into the VS Code Activity Bar (`Klystr` icon).
- Lists all available Kubernetes clusters and contexts from your local `~/.kube/config`.
- Single-click context switching directly from the tree view or Command Palette.
- Persistent status bar indicator (`⎈ Klystr: [context]`) showing your active cluster.

### 3. Deep Topology & Dependency Graph
- Interactive visual graph powered by ELK layout algorithms and React Flow.
- Groups resources by Node and namespace with zoom, pan, and filter controls.
- Detects relationship evidence across Ingresses, Services, Pods, ConfigMaps, Secrets, and Persistent Volumes.

### 4. RBAC & Identity Analysis
- Live inspection of ServiceAccounts, Roles, ClusterRoles, and RoleBindings.
- Identifies privilege escalations, wildcard permissions, and diagnostic access denials using `SelfSubjectAccessReview`.

### 5. Cluster Security & Image Scans
- Identifies vulnerabilities, unpinned image tags, root execution risks, and missing resource limits.

---

## Quick Start

1. Open any repository or Kubernetes project in VS Code.
2. Click the **Klystr** icon in the Activity Bar (left sidebar), or open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type:
   ```text
   Klystr: Open Kubernetes Workspace
   ```
3. To scan manifests in your current project folder:
   ```text
   Klystr: Scan Workspace Manifests
   ```
4. To switch Kubernetes contexts:
   ```text
   Klystr: Switch Active Context
   ```

---

## Commands

| Command | Description |
| :--- | :--- |
| `klystr.openDashboard` | Opens the full interactive Klystr workspace in an editor tab |
| `klystr.scanWorkspaceManifests` | Scans open repository YAMLs and generates a local manifest dependency graph |
| `klystr.switchContext` | Quickly switch active Kubernetes context (`~/.kube/config`) |
| `klystr.refreshClusters` | Reloads cluster and context definitions |
| `klystr.startServer` | Starts the local Klystr backend service |
| `klystr.stopServer` | Stops the background service |

---

## Extension Settings

You can customize Klystr via VS Code Settings (`Ctrl+,` > Search for `Klystr`):

* `klystr.serverPort`: Port for the local Klystr server (default: `3000`). Set to `0` to pick a dynamic free port.
* `klystr.autoStartServer`: Automatically start the Klystr backend when opening the workspace (default: `true`).
* `klystr.autoScanManifests`: Automatically scan open workspace for Kubernetes YAML manifests and watch for file changes (default: `true`).

---

## Requirements

* Visual Studio Code `1.90.0` or higher.
* A valid `~/.kube/config` file (optional, required only for live cluster queries; local manifest graph works without a cluster).

---

## Releases & Versioning

The VS Code extension follows an independent versioning lifecycle from the root web application:
* **Version Definition**: Managed in [`package.json`](package.json).
* **Git Tagging Format**: Uses scoped tags (`vscode-v<version>`, e.g., `vscode-v0.1.1`) to isolate extension releases from web releases.
* **Packaging & Publishing**: See [RELEASING.md](RELEASING.md) for the complete release, hotfix, and Marketplace publishing guide.

---

## License

Apache-2.0. See [LICENSE](LICENSE) for details.
