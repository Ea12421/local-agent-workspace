import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { snapshot, cancelCodexRun, createRuntimeRun, executeCodexRun, runtimeStore } from './runtime.ts';

test('core runtime keeps an inspectable fixture and starts new runs', async () => {
  const fixture = await snapshot();
  assert.equal(fixture.run.status, 'succeeded');
  assert.ok(fixture.events.length >= 5);
  const created = await createRuntimeRun('验证一个新的产品想法');
  assert.equal(created.run.status, 'running');
  assert.equal(created.event.type, 'run.started');
});

test('control plane cancels an active Codex run before it can be marked succeeded', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agent-workspace-runtime-cancel-'));
  const binary = path.join(dir, 'fake-codex.mjs');
  await writeFile(binary, [
    '#!/usr/bin/env node',
    "if (process.argv[2] === '--version') { console.log('codex-cli test'); process.exit(0); }",
    "if (process.argv[2] === 'login') { console.log('Logged in using ChatGPT'); process.exit(0); }",
    "console.log(JSON.stringify({ type: 'item.started', item: { type: 'command_execution' } }));",
    'setTimeout(() => {}, 10_000);',
  ].join('\n'));
  await chmod(binary, 0o755);
  const previous = process.env.CODEX_BIN;
  process.env.CODEX_BIN = binary;
  try {
    const pending = executeCodexRun('cancel this run', { source: 'test' });
    let run;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      run = (await runtimeStore.listRuns()).at(-1);
      if (run?.status === 'running') break;
    }
    assert.equal(run?.status, 'running');
    const cancelled = await cancelCodexRun(run!.id);
    assert.equal(cancelled?.status, 'cancelled');
    const result = await pending;
    assert.equal(result.run.status, 'cancelled');
    assert.equal(result.finalEvent?.type, 'run.cancelled');
    const events = await runtimeStore.listEvents(result.run.id);
    assert.ok(events.some((item) => item.type === 'run.cancelled'));
    assert.ok(!events.some((item) => item.type === 'run.succeeded'));
  } finally {
    if (previous === undefined) delete process.env.CODEX_BIN;
    else process.env.CODEX_BIN = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
