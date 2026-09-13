import * as vscode from 'vscode';
import { ServerManager } from './serverManager';
import { WorkspaceManifestScanner } from './workspaceManifestScanner';
import { ClusterTreeProvider } from './clusterTreeProvider';

export class WebviewManager {
  private panel?: vscode.WebviewPanel;

  constructor(
    private extensionUri: vscode.Uri,
    private serverManager: ServerManager,
    private manifestScanner: WorkspaceManifestScanner,
    private clusterProvider: ClusterTreeProvider
  ) {
    // Listen for live workspace manifest updates and forward to webview
    this.manifestScanner.onDidUpdateGraph((scanResult) => {
      this.sendMessage({
        command: 'workspaceManifestsUpdated',
        data: scanResult,
      });
    });
  }

  public async openOrRevealDashboard(targetPath = '/topology'): Promise<void> {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'klystrDashboard',
      'Klystr — Kubernetes Workspace',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        enableFindWidget: true,
        localResourceRoots: [this.extensionUri],
      }
    );

    // Set panel icon
    this.panel.iconPath = {
      light: vscode.Uri.joinPath(this.extensionUri, 'assets', 'klystr.svg'),
      dark: vscode.Uri.joinPath(this.extensionUri, 'assets', 'klystr.svg'),
    };

    // Show initial loading view
    this.panel.webview.html = this.getLoadingHtml();

    try {
      // Ensure silent local server is up
      const serverUrl = await this.serverManager.ensureServerRunning();
      const pathPart = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
      const fullUrl = `${serverUrl}${pathPart}`;

      // Update with embedded view
      if (this.panel) {
        this.panel.webview.html = this.getDashboardHtml(fullUrl);
        this.setupMessageListener();
      }
    } catch (err) {
      if (this.panel) {
        this.panel.webview.html = this.getErrorHtml(String(err));
        this.setupMessageListener();
      }
    }

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private setupMessageListener(): void {
    if (!this.panel) return;

    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'retryConnection': {
          await this.openOrRevealDashboard();
          break;
        }

        case 'requestWorkspaceManifests': {
          const scan = await this.manifestScanner.scanWorkspace();
          this.sendMessage({
            command: 'workspaceManifestsResponse',
            data: scan,
          });
          break;
        }

        case 'requestKubeContexts': {
          this.sendMessage({
            command: 'kubeContextsResponse',
            contexts: this.clusterProvider.getContexts(),
            currentContext: this.clusterProvider.getCurrentContext(),
          });
          break;
        }

        case 'openExternal': {
          if (message.url) {
            vscode.env.openExternal(vscode.Uri.parse(message.url));
          }
          break;
        }

        case 'showInfo': {
          if (message.text) {
            vscode.window.showInformationMessage(message.text);
          }
          break;
        }
      }
    });
  }

  public sendMessage(message: Record<string, unknown>): void {
    this.panel?.webview.postMessage(message);
  }

  private getThemeClass(): string {
    const kind = vscode.window.activeColorTheme.kind;
    if (kind === vscode.ColorThemeKind.Light) return 'light';
    return 'dark';
  }

  private getLoadingHtml(): string {
    return `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
        <style>
          body {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
          }
          .spinner {
            width: 36px;
            height: 36px;
            border: 3px solid rgba(255, 255, 255, 0.15);
            border-radius: 50%;
            border-top-color: var(--vscode-progressBar-background, #3b82f6);
            animation: spin 0.9s linear infinite;
            margin-bottom: 16px;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          h3 { margin: 0 0 8px; font-weight: 500; }
          p { margin: 0; opacity: 0.7; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="spinner"></div>
        <h3>Loading Klystr Workspace...</h3>
        <p>Connecting to Kubernetes cluster</p>
      </body>
    </html>`;
  }

  private getErrorHtml(errorMessage: string): string {
    return `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
        <style>
          body {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            padding: 24px;
            box-sizing: border-box;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            text-align: center;
          }
          .icon { font-size: 40px; margin-bottom: 16px; }
          h3 { margin: 0 0 8px; color: var(--vscode-errorForeground, #ef4444); }
          p { margin: 0 0 20px; opacity: 0.8; max-width: 480px; font-size: 13px; line-height: 1.5; }
          .btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
          }
          .btn:hover { background-color: var(--vscode-button-hoverBackground); }
        </style>
      </head>
      <body>
        <div class="icon">⚠️</div>
        <h3>Unable to start Klystr workspace</h3>
        <p>${errorMessage}</p>
        <button class="btn" onclick="retry()">Retry</button>
        <script>
          const vscode = acquireVsCodeApi();
          function retry() {
            vscode.postMessage({ command: 'retryConnection' });
          }
        </script>
      </body>
    </html>`;
  }

  private getDashboardHtml(url: string): string {
    const theme = this.getThemeClass();

    return `<!DOCTYPE html>
    <html lang="en" class="${theme}">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src http://127.0.0.1:* http://localhost:* https:; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
        <style>
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: var(--vscode-editor-background);
          }
          iframe {
            width: 100%;
            height: 100%;
            border: none;
            display: block;
          }
        </style>
      </head>
      <body>
        <iframe
          id="klystr-frame"
          src="${url}"
          allow="clipboard-read; clipboard-write;"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-modals"
        ></iframe>
        <script>
          const vscode = acquireVsCodeApi();
          const frame = document.getElementById('klystr-frame');

          window.addEventListener('message', (event) => {
            if (frame && frame.contentWindow) {
              frame.contentWindow.postMessage(event.data, '*');
            }
          });

          window.addEventListener('message', (event) => {
            if (event.source === frame.contentWindow) {
              vscode.postMessage(event.data);
            }
          });
        </script>
      </body>
    </html>`;
  }
}
