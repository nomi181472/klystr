# Release & Versioning Guide: VS Code Extension

This document outlines the versioning, tagging, and release workflows for the Klystr VS Code extension within the monorepo.

---

## 1. Dual-Architecture & Release Isolation

Klystr operates as a monorepo housing two distinct application interfaces:
1. **Web Dashboard**: Next.js web application located at repository root (`package.json`).
2. **VS Code Extension**: VS Code interface located in [`vscode-extension/`](package.json).

### Versioning Independence
The extension maintains its own version lifecycle in [`vscode-extension/package.json`](package.json) independent of the root `package.json`:

* **VS Code Extension Version**: Defined in `vscode-extension/package.json` (e.g. `0.1.1`).
* **Web Dashboard Version**: Defined in root `package.json` (e.g. `0.1.0`).

---

## 2. Git Tagging Convention: `vscode-v*`

To prevent version collision with the web dashboard, all extension releases MUST use the scoped tag format:

```text
vscode-v<MAJOR>.<MINOR>.<PATCH>
```

**Examples:**
* `vscode-v0.1.1` (Patch release / bugfix)
* `vscode-v0.2.0` (Minor release / new features)
* `vscode-v1.0.0` (Major milestone release)

### Why Scoped Tags?
* **Commit Traceability**: Pins the exact codebase snapshot deployed to the VS Code Marketplace.
* **Monorepo Separation**: Prevents collisions with web releases (which follow `web-v*` or `v*`).
* **Hotfix Branching**: Allows immediate hotfix branches directly off any deployed extension version (`git checkout -b hotfix-ext vscode-v0.1.1`).
* **GitHub Releases**: Categorizes extension binaries (`.vsix`) cleanly under GitHub Releases.

---

## 3. End-to-End Release Workflow

### Step 1: Bump Extension Version
Update `"version"` in [`vscode-extension/package.json`](package.json):

```json
{
  "name": "klystr",
  "version": "0.1.2"
}
```

### Step 2: Build & Bundle the Self-Contained Package
From the project root:

```bash
npm run extension:package:bundle
```

This automates:
1. Building Next.js standalone server runtime.
2. Compiling extension TypeScript via esbuild.
3. Staging standalone server files inside `vscode-extension/server/`.
4. Packaging `vscode-extension/klystr-<version>.vsix`.

### Step 3: Commit and Tag the Release
Commit the version bump and create the scoped tag:

```bash
git commit -am "chore(vscode): bump extension to v0.1.2"
git tag vscode-v0.1.2
git push origin <branch-name>
git push origin vscode-v0.1.2
```

### Step 4: Publish to VS Code Marketplace
Publish to the marketplace using your Azure DevOps Personal Access Token (PAT):

```bash
cd vscode-extension
npx @vscode/vsce publish --no-git-tag-version -p <YOUR_AZURE_DEVOPS_PAT>
```

> [!NOTE]
> `--no-git-tag-version` is required to ensure `vsce` respects our custom `vscode-v*` tag convention rather than generating an un-scoped `v*` tag.

---

## 4. Hotfixing a Previous Version

If a critical issue occurs in production:

```bash
# 1. Check out the release tag
git checkout -b hotfix/vscode-0.1.1-fix vscode-v0.1.1

# 2. Make the fix, bump version in vscode-extension/package.json to 0.1.2
npm run extension:package:bundle

# 3. Commit, tag, and publish
git commit -am "fix(vscode): resolve connection timeout in v0.1.2"
git tag vscode-v0.1.2
git push origin vscode-v0.1.2
cd vscode-extension && npx @vscode/vsce publish --no-git-tag-version -p <PAT>
```
