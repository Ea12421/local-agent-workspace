import { app, BrowserWindow } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';

let server: ReturnType<typeof spawn> | undefined;

function createWindow() {
  const window = new BrowserWindow({ width: 1440, height: 960, minWidth: 1024, minHeight: 720 });
  window.loadURL('http://127.0.0.1:4310');
}

async function waitForServer(url: string, attempts = 20): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The child process may still be starting. Retry with a bounded timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Local Agent Workspace server did not become ready: ${url}`);
}

app.whenReady().then(async () => {
  server = spawn(process.execPath, ['--experimental-strip-types', path.join(__dirname, '../../server/src/index.ts')], {
    cwd: path.join(__dirname, '../..'),
    stdio: 'inherit',
    env: { ...process.env, AGENT_WORKSPACE_DESKTOP: '1' }
  });
  await waitForServer('http://127.0.0.1:4310/api/health');
  createWindow();
});

app.on('window-all-closed', () => {
  server?.kill('SIGTERM');
  if (process.platform !== 'darwin') app.quit();
});
