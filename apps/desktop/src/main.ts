import { app, BrowserWindow, dialog } from 'electron';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { startOwnedServer } from './server-process.cjs';

let server: ChildProcess | undefined;
let starting: Promise<void> | undefined;

function stopServer() {
  if (!server || server.killed) return;
  server.kill('SIGTERM');
  server = undefined;
}

function createWindow(serverUrl: string) {
  const window = new BrowserWindow({ width: 1440, height: 960, minWidth: 1024, minHeight: 720 });
  window.loadURL(serverUrl);
}

function runtimeRoot() {
  return app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked') : path.join(__dirname, '../../..');
}

function resolveNodeBinary(): string {
  const configured = process.env.AGENT_WORKSPACE_NODE;
  const candidates = [configured, '/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node']
    .filter((value): value is string => Boolean(value));
  return candidates.find((value) => existsSync(value)) ?? 'node';
}

function startServerAndWindow(): Promise<void> {
  if (starting) return starting;
  if (server) return Promise.resolve();
  starting = startOwnedServer({
    root: runtimeRoot(),
    nodeBinary: resolveNodeBinary(),
    dataDir: path.join(app.getPath('userData'), 'data'),
    port: process.env.AGENT_WORKSPACE_PORT,
    onExit: (child, code, signal) => {
      if (server !== child) return;
      server = undefined;
      if (BrowserWindow.getAllWindows().length) {
        console.error('Local server exited unexpectedly', { code, signal });
        dialog.showErrorBox('本地服务已停止', '请退出并重新打开工作台。已经保存的记录仍在本机。');
        for (const window of BrowserWindow.getAllWindows()) window.close();
      }
    },
  }).then(({ child, url }) => {
    server = child;
    createWindow(url);
  }).finally(() => { starting = undefined; });
  return starting;
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) { if (window.isMinimized()) window.restore(); window.focus(); }
    else void startServerAndWindow().catch(reportStartupError);
  });
  app.whenReady().then(() => startServerAndWindow()).catch(reportStartupError);
}

function reportStartupError(error: unknown) {
  console.error('Local Agent Workspace startup failed', error);
  dialog.showErrorBox('工作台启动失败', error instanceof Error ? error.message : String(error));
}

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void startServerAndWindow().catch(reportStartupError);
  }
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', stopServer);
