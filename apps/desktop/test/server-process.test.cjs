const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { mkdtemp } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { startOwnedServer } = require('../dist/server-process.cjs');

const root = path.resolve(__dirname, '../../..');
async function options() {
  return { root, nodeBinary: process.execPath, dataDir: await mkdtemp(path.join(tmpdir(), 'workspace-server-ownership-')), startupTimeoutMs: 5000 };
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}

test('desktop only connects to its own child, including after restart', async (t) => {
  const config = await options();
  const first = await startOwnedServer(config);
  t.after(() => stop(first.child));
  const second = await startOwnedServer(await options());
  t.after(() => stop(second.child));
  assert.notEqual(first.url, second.url);
  assert.equal((await fetch(`${second.url}/api/health`)).status, 200);
  await stop(first.child);
  assert.equal((await fetch(`${second.url}/api/health`)).status, 200);
  const restarted = await startOwnedServer(config);
  t.after(() => stop(restarted.child));
  assert.notEqual(restarted.child.pid, first.child.pid);
  assert.equal((await fetch(`${restarted.url}/api/health`)).status, 200);
});

test('an occupied fixed port cannot pass startup using another server health response', async (t) => {
  const old = createServer((_req, res) => res.end('{"ok":true}'));
  old.listen(0, '127.0.0.1');
  await once(old, 'listening');
  t.after(() => new Promise((resolve) => old.close(resolve)));
  const address = old.address();
  await assert.rejects(startOwnedServer({ ...await options(), port: String(address.port) }), /启动完成前退出/);
  assert.equal((await fetch(`http://127.0.0.1:${address.port}/api/health`)).status, 200);
});
