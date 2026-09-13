import * as vscode from 'vscode';
import * as http from 'node:http';
import * as net from 'node:net';
import * as path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';

export const KLYSTR_INTERNAL_PORT = 38421;

export class ServerManager {
  private serverProcess?: ChildProcess;
  private currentPort: number = KLYSTR_INTERNAL_PORT;
  private isManagedProcess: boolean = false;

  constructor(private extensionUri: vscode.Uri) {}

  public async getAvailablePort(preferredPort = KLYSTR_INTERNAL_PORT): Promise<number> {
    const isPortAvailable = (port: number): Promise<boolean> => {
      return new Promise((resolve) => {
        const tester = net
          .createServer()
          .once('error', () => resolve(false))
          .once('listening', () => {
            tester.close(() => resolve(true));
          })
          .listen(port, '127.0.0.1');
      });
    };

    if (await isPortAvailable(preferredPort)) {
      return preferredPort;
    }

    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address !== 'string') {
          const port = address.port;
          server.close(() => resolve(port));
        } else {
          server.close(() => reject(new Error('Could not find open port')));
        }
      });
    });
  }

  public async isServerHealthy(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(
        `http://127.0.0.1:${port}/api/health/healthz`,
        { timeout: 1200 },
        (res) => {
          if (res.statusCode === 200) {
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
            });
            res.on('end', () => {
              try {
                const json = JSON.parse(data);
                resolve(json.status === 'ok');
              } catch {
                resolve(false);
              }
            });
          } else {
            resolve(false);
          }
        }
      );
      req.on('error', () => resolve(false));
    });
  }

  private findServerTarget(): { cwd: string; cmd: string; args: string[] } | null {
    // 1. Check user configured project path
    const config = vscode.workspace.getConfiguration('klystr');
    const configuredPath = config.get<string>('projectPath');
    if (configuredPath && existsSync(configuredPath)) {
      const standalone = path.join(configuredPath, '.next', 'standalone', 'server.js');
      if (existsSync(standalone)) {
        return { cwd: path.dirname(standalone), cmd: 'node', args: ['server.js'] };
      }
      return { cwd: configuredPath, cmd: 'npm', args: ['run', 'dev'] };
    }

    // 2. Check if running alongside repo in development
    const devStandalone = path.resolve(this.extensionUri.fsPath, '..', '.next', 'standalone', 'server.js');
    if (existsSync(devStandalone)) {
      return { cwd: path.dirname(devStandalone), cmd: 'node', args: ['server.js'] };
    }

    // 3. Check known default project directory
    const knownRepoStandalone = '/home/noman/projects/klystr/.next/standalone/server.js';
    if (existsSync(knownRepoStandalone)) {
      return { cwd: path.dirname(knownRepoStandalone), cmd: 'node', args: ['server.js'] };
    }

    // 4. Check open workspace folders
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const wsStandalone = path.join(folder.uri.fsPath, '.next', 'standalone', 'server.js');
      if (existsSync(wsStandalone)) {
        return { cwd: path.dirname(wsStandalone), cmd: 'node', args: ['server.js'] };
      }
    }

    return null;
  }

  public async ensureServerRunning(): Promise<string> {
    // 1. Check if Klystr is already running on the internal port
    if (await this.isServerHealthy(this.currentPort)) {
      console.log(`[Klystr] Found existing healthy Klystr server on internal port ${this.currentPort}`);
      return `http://127.0.0.1:${this.currentPort}`;
    }

    // 2. Find free port starting at 38421
    const port = await this.getAvailablePort(KLYSTR_INTERNAL_PORT);
    this.currentPort = port;

    const target = this.findServerTarget();
    if (!target) {
      throw new Error('Klystr server build was not found. Please build the project with "npm run build".');
    }

    console.log(`[Klystr] Starting server in ${target.cwd} via ${target.cmd} on port ${port}...`);

    this.serverProcess = spawn(target.cmd, target.args, {
      cwd: target.cwd,
      env: {
        ...process.env,
        PORT: String(port),
        HOSTNAME: '127.0.0.1',
      },
      stdio: 'pipe',
    });

    this.isManagedProcess = true;

    this.serverProcess.stdout?.on('data', (data) => {
      console.log(`[Klystr Server] ${data}`);
    });

    this.serverProcess.stderr?.on('data', (data) => {
      console.error(`[Klystr Server Error] ${data}`);
    });

    this.serverProcess.on('exit', (code) => {
      console.log(`[Klystr Server] Exited with code ${code}`);
      this.serverProcess = undefined;
      this.isManagedProcess = false;
    });

    // Wait for server to become healthy (up to 15 seconds)
    const startTime = Date.now();
    while (Date.now() - startTime < 15000) {
      if (await this.isServerHealthy(port)) {
        console.log(`[Klystr] Server ready at http://127.0.0.1:${port}`);
        return `http://127.0.0.1:${port}`;
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    return `http://127.0.0.1:${port}`;
  }

  public getServerUrl(): string {
    return `http://127.0.0.1:${this.currentPort}`;
  }

  public stop(): void {
    if (this.isManagedProcess && this.serverProcess) {
      console.log('[Klystr] Stopping background server process...');
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = undefined;
      this.isManagedProcess = false;
    }
  }
}
