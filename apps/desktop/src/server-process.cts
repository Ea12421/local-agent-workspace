import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

type ServerOptions = {
  root: string;
  nodeBinary: string;
  dataDir: string;
  port?: string;
  startupTimeoutMs?: number;
  onExit?: (child: ChildProcess, code: number | null, signal: NodeJS.Signals | null) => void;
};

export function startOwnedServer(options: ServerOptions): Promise<{ child: ChildProcess; url: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(options.nodeBinary, ['--experimental-strip-types', path.join(options.root, 'apps/server/src/index.ts')], {
      cwd: options.root,
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      env: {
        ...process.env,
        PORT: options.port ?? '0',
        AGENT_WORKSPACE_DESKTOP: '1',
        AGENT_WORKSPACE_DATA_DIR: options.dataDir,
      },
    });
    let settled = false;
    const timer = setTimeout(() => fail(new Error('本地服务启动超时，请检查 Node.js 和本地数据目录。')), options.startupTimeoutMs ?? 10_000);
    function fail(error: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      reject(error);
    }
    child.on('error', (error) => fail(error));
    child.once('exit', (code, signal) => {
      if (!settled) fail(new Error(`本地服务在启动完成前退出（code=${code}, signal=${signal}）。`));
      else options.onExit?.(child, code, signal);
    });
    child.on('message', (message: unknown) => {
      if (settled || !message || typeof message !== 'object') return;
      const ready = message as { type?: string; port?: number; pid?: number };
      // Only the child we spawned can announce its listening port over this IPC channel.
      if (ready.type !== 'workspace-server-ready' || ready.pid !== child.pid || !Number.isInteger(ready.port) || ready.port! < 1 || ready.port! > 65535) return;
      settled = true;
      clearTimeout(timer);
      resolve({ child, url: `http://127.0.0.1:${ready.port}` });
    });
  });
}
