import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ClusterTreeProvider, QuickActionsProvider } from './clusterTreeProvider';
import { WorkspaceManifestScanner } from './workspaceManifestScanner';
import { ServerManager } from './serverManager';
import { WebviewManager } from './webviewManager';

let statusBarItem: vscode.StatusBarItem;
let serverManager: ServerManager;

export async function activate(context: vscode.ExtensionContext) {
  console.log('[Klystr] Activating VS Code Extension...');

  // 1. Initialize services
  serverManager = new ServerManager(context.extensionUri);
  const clusterProvider = new ClusterTreeProvider();
  const quickActionsProvider = new QuickActionsProvider();
  const manifestScanner = new WorkspaceManifestScanner();
  const webviewManager = new WebviewManager(
    context.extensionUri,
    serverManager,
    manifestScanner,
    clusterProvider
  );

  // 2. Register Sidebar Views
  vscode.window.registerTreeDataProvider('klystr.clustersView', clusterProvider);
  vscode.window.registerTreeDataProvider('klystr.quickActionsView', quickActionsProvider);

  // 3. Setup Status Bar Item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  statusBarItem.command = 'klystr.openDashboard';
  context.subscriptions.push(statusBarItem);
  updateStatusBar(clusterProvider);

  // 4. Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('klystr.openDashboard', async (targetPath = '/topology') => {
      await webviewManager.openOrRevealDashboard(typeof targetPath === 'string' ? targetPath : '/topology');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('klystr.openManifests', async () => {
      await webviewManager.openOrRevealDashboard('/manifests');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('klystr.refreshClusters', () => {
      clusterProvider.refresh();
      updateStatusBar(clusterProvider);
      vscode.window.showInformationMessage('Klystr: Clusters & contexts reloaded.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('klystr.selectKubeconfig', async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: 'Select Kubeconfig File',
        filters: {
          'Kubeconfig / YAML': ['yaml', 'yml', 'config', 'conf'],
          'All Files': ['*'],
        },
      });
      if (uris && uris[0]) {
        const filePath = uris[0].fsPath;
        let fileContent: string | undefined;
        try {
          fileContent = fs.readFileSync(filePath, 'utf-8');
        } catch {
          // optional read
        }
        clusterProvider.setKubeconfig(filePath, fileContent);
        updateStatusBar(clusterProvider);
        webviewManager.sendMessage({
          command: 'kubeconfigFileSelected',
          filePath,
          fileName: path.basename(filePath),
          fileContent,
        });
        vscode.window.showInformationMessage(`Klystr: Loaded kubeconfig "${path.basename(filePath)}"`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('klystr.switchContext', async (targetContextName?: string) => {
      const contexts = clusterProvider.getContexts();
      if (!contexts || contexts.length === 0) {
        vscode.window.showWarningMessage('No Kubernetes contexts available.');
        return;
      }

      let selectedName = targetContextName;

      if (!selectedName) {
        const current = clusterProvider.getCurrentContext();
        const pickItems = contexts.map((ctx) => ({
          label: ctx.name,
          description: ctx.name === current ? '(Current)' : ctx.cluster,
          detail: `User: ${ctx.user ?? 'default'} | Namespace: ${ctx.namespace ?? 'default'}`,
        }));

        const selected = await vscode.window.showQuickPick(pickItems, {
          placeHolder: 'Select active Kubernetes context for Klystr',
        });

        if (!selected) return;
        selectedName = selected.label;
      }

      // Switch context
      try {
        clusterProvider.refresh();
        updateStatusBar(clusterProvider);
        vscode.window.showInformationMessage(`Switched active context to: ${selectedName}`);
        webviewManager.sendMessage({
          command: 'contextSwitched',
          contextName: selectedName,
        });
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to switch context: ${String(err)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('klystr.scanWorkspaceManifests', async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Klystr: Scanning workspace for Kubernetes manifests...',
          cancellable: false,
        },
        async (progress) => {
          progress.report({ increment: 20, message: 'Finding YAML files...' });
          const result = await manifestScanner.scanWorkspace();
          if (result) {
            progress.report({ increment: 80, message: 'Parsing dependency graph...' });
            vscode.window
              .showInformationMessage(
                `Klystr: Ingested ${result.fileCount} manifests into ${result.nodeCount} resource nodes and ${result.edgeCount} dependency edges.`,
                'Open Graph'
              )
              .then((action) => {
                if (action === 'Open Graph') {
                  vscode.commands.executeCommand('klystr.openDashboard', '/manifests');
                }
              });
          }
        }
      );
    })
  );

  // Auto-scan manifests on startup if enabled
  const config = vscode.workspace.getConfiguration('klystr');
  if (config.get<boolean>('autoScanManifests', true)) {
    manifestScanner.scanWorkspace().catch(() => {});
  }

  console.log('[Klystr] Extension activated successfully.');
}

function updateStatusBar(clusterProvider: ClusterTreeProvider): void {
  const currentContext = clusterProvider.getCurrentContext();
  if (currentContext) {
    statusBarItem.text = `$(compass) Klystr: ${currentContext}`;
    statusBarItem.tooltip = `Klystr: Connected to context '${currentContext}' (Click to open workspace)`;
    statusBarItem.show();
  } else {
    statusBarItem.text = `$(compass) Klystr`;
    statusBarItem.tooltip = 'Klystr: No Kubernetes context active';
    statusBarItem.show();
  }
}

export function deactivate() {
  console.log('[Klystr] Deactivating extension...');
  serverManager?.stop();
}
