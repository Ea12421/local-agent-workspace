import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runScale } from './m10-06-scale.mjs';

test('SQLite scale boundary preserves 10k event sequence after reopen', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-m10-06-scale-'));
  const result = await runScale(path.join(dir, 'scale.db'), 10_000);
  assert.equal(result.eventCount, 10_000);
  assert.equal(result.firstSequence, 1);
  assert.equal(result.lastSequence, 10_000);
  await rm(dir, { recursive: true, force: true });
});
