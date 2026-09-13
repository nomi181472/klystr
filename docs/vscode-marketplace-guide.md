# VS Code Marketplace Publishing Guide for Klystr

This document walks through publishing the **Klystr VS Code Extension** to the official Visual Studio Code Marketplace and Open VSX Registry.

---

## 1. Prerequisites

Make sure you have `@vscode/vsce` (Visual Studio Code Extension Manager CLI) installed:

```bash
npm install -g @vscode/vsce
```

---

## 2. Setting Up Your Publisher Account

To publish an extension, Microsoft requires:
1. An **Azure DevOps Personal Access Token (PAT)**.
2. A **Visual Studio Marketplace Publisher profile**.

### Step 2.1: Generate Azure DevOps PAT
1. Go to [dev.azure.com](https://dev.azure.com) and sign in with your Microsoft account.
2. In the top-right corner, click **User settings** (gear/profile icon) > **Personal access tokens**.
3. Click **+ New Token**.
4. Configure token parameters:
   - **Name**: `klystr-marketplace-publisher`
   - **Organization**: Select **All accessible organizations** (⚠️ *Critical: Do NOT select a single organization*).
   - **Expiration**: Set desired expiration (e.g. 90 days or 1 year).
   - **Scopes**: Click **Show all scopes**, scroll down to **Marketplace**, and select **Manage**.
5. Click **Create** and **save the PAT** securely.

### Step 2.2: Register Publisher
1. Go to the [VS Code Marketplace Management Portal](https://marketplace.visualstudio.com/manage).
2. Sign in with the same Microsoft account.
3. Click **Create publisher**.
4. Fill in:
   - **ID**: A unique lowercase slug (e.g., `noman` or `klystr`).
   - **Display Name**: The public name shown on the marketplace (e.g., `Klystr Team`).
   - **Contact email**: Your support email.
5. In `vscode-extension/package.json`, ensure the `"publisher"` field matches this ID:
   ```json
   "publisher": "YOUR_PUBLISHER_ID"
   ```

---

## 3. Testing Locally Before Publishing

You can build and package the extension into a `.vsix` archive locally:

```bash
# 1. Build the extension bundle
npm run extension:build

# 2. Package into a .vsix file
npm run extension:package
```

This generates `vscode-extension/klystr-0.1.0.vsix`.

### Install and Test Locally in VS Code:
- Open VS Code.
- Press `Ctrl+Shift+X` (Extensions view).
- Click the `...` menu (top right of Extensions view) > **Install from VSIX...**
- Select the `klystr-0.1.0.vsix` file.
- Verify that the Klystr icon appears in the Activity Bar and commands work as expected.

---

## 4. Publishing to the Marketplace

### Method A: Publishing via CLI (`vsce`)

1. Log in to your publisher using the PAT:
   ```bash
   cd vscode-extension
   vsce login <YOUR_PUBLISHER_ID>
   # When prompted, paste your Personal Access Token
   ```

2. Publish the extension:
   ```bash
   vsce publish
   ```

3. For future releases, you can automatically bump the version and publish:
   ```bash
   vsce publish patch   # 0.1.0 -> 0.1.1
   vsce publish minor   # 0.1.0 -> 0.2.0
   vsce publish major   # 0.1.0 -> 1.0.0
   ```

### Method B: Manual Upload via Web Portal
If you prefer not to use CLI tokens:
1. Run `npm run extension:package`.
2. Go to [marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage).
3. Click **+ New extension** > **Visual Studio Code**.
4. Drag and drop the `klystr-0.1.0.vsix` file.
5. Click **Upload**.

---

## 5. Verification & Search Indexing

Once published:
- Microsoft runs automated security and compatibility scans (takes ~5 minutes).
- Your extension will be accessible at:
  `https://marketplace.visualstudio.com/items?itemName=<YOUR_PUBLISHER_ID>.klystr`
- It will automatically appear in VS Code's in-editor search under "Klystr" or "Kubernetes".
