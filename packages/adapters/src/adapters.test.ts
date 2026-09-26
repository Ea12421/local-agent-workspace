import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CodexExternalAdapter, FixtureAdapter, permissionLabels, canUseTool } from './index.ts';

test('fixture and Codex adapters expose distinct provenance', async () => {
  const fixture = await new FixtureAdapter().probeCapabilities();
  const codex = await new CodexExternalAdapter('/definitely/missing/codex').probeCapabilities();
  assert.equal(fixture.identity.isMock, true);
  assert.equal(codex.identity.harness, 'codex-cli');
  assert.equal((codex as any).disabledReason, 'codex CLI unavailable');
});

test('Codex execution bridge streams JSONL-compatible events and completes', async () => {
  // /bin/echo is a deterministic stand-in here; it proves subprocess lifecycle and
  // raw-line fallback without spending a real Codex subscription call in the suite.
  const adapter = new CodexExternalAdapter('/bin/echo', { timeoutMs: 1_000 });
  const handle = await adapter.startRun({ objective: 'bridge test', input: { source: 'fixture' } });
  const events = [];
  for await (const item of adapter.streamEvents(handle)) events.push(item);
  assert.equal(events.at(-1)?.data.status, 'completed');
  assert.equal(events[0]?.data.bridge, 'codex-cli');
  assert.equal(handle.provider.isMock, false);
});

test('Codex execution bridge cancels the child process and emits a failed termination event', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agent-workspace-codex-cancel-'));
  const binary = path.join(dir, 'fake-codex.mjs');
  await writeFile(binary, [
    '#!/usr/bin/env node',
    "if (process.argv[2] === '--version') { console.log('codex-cli test'); process.exit(0); }",
    "if (process.argv[2] === 'login') { console.log('Logged in using ChatGPT'); process.exit(0); }",
    "console.log(JSON.stringify({ type: 'item.started', item: { type: 'command_execution' } }));",
    'setTimeout(() => {}, 10_000);',
  ].join('\n'));
  await chmod(binary, 0o755);
  try {
    const adapter = new CodexExternalAdapter(binary, { timeoutMs: 30_000 });
    const handle = await adapter.startRun({ objective: 'cancel test', input: {} });
    const iterator = adapter.streamEvents(handle)[Symbol.asyncIterator]();
    const first = await iterator.next();
    assert.equal(first.done, false);
    await adapter.cancel(handle);
    const rest = [];
    for await (const item of { [Symbol.asyncIterator]: () => iterator } as AsyncIterable<any>) rest.push(item);
    assert.equal(rest.at(-1)?.data.status, 'failed');
    assert.equal(rest.at(-1)?.data.signal, 'SIGTERM');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('permission labels and always-approval actions are explicit', () => {
  assert.equal(permissionLabels.workspace_write, '工作区写入');
  const policy = { permissionTier: 'workspace_write' as const, allowedTools: ['shell'], approvalRequiredActions: [] };
  assert.deepEqual(canUseTool(policy, 'shell', 'publish'), { allowed: true, approvalRequired: true, reason: 'always_requires_one_off_approval' });
});
