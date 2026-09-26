import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openEventLog } from './persistence.ts';

test('persistence exposes SQLite boundary with a clean-checkout fallback', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-'));
  const opened = await openEventLog(path.join(dir, 'events.db'));
  assert.ok(opened.backend === 'sqlite' || opened.backend === 'jsonl');
  await opened.log.append({ id: 'e1', runId: 'r1', sequence: 1, type: 'run.created', occurredAt: new Date().toISOString(), actor: { type: 'system' }, data: {} });
  assert.equal((await opened.log.readAll()).length, 1);
  await rm(dir, { recursive: true, force: true });
});
