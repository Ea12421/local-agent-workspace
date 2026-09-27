import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runProductBuilder } from '../../../packages/workflow/src/index.ts';
import { JsonlContextSnapshotStore, JsonlEventLog } from './persistence.ts';
import { checkpointProductBuilderResult, defaultProductBuilderContinuityStores } from './product-builder-continuity.ts';

test('Product Builder checkpoints each boundary and skips completed work on replay', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-product-builder-continuity-'));
  const stores = {
    eventLog: new JsonlEventLog(path.join(dir, 'events.jsonl')),
    snapshotStore: new JsonlContextSnapshotStore(path.join(dir, 'snapshots.jsonl')),
  };
  const input = { projectId: 'project-a' as any, runId: 'run-a' as any, idea: '验证一个 AI 产品' };
  const first = await checkpointProductBuilderResult(input, runProductBuilder(input), stores);
  assert.equal(first.createdCheckpoints, 10);
  assert.equal(first.skippedCheckpoints, 0);
  assert.equal(first.createdSnapshots, 10);
  assert.equal((await stores.snapshotStore.readAll()).length, 10);
  assert.equal((await stores.eventLog.readAll()).length, 20);
  assert.ok(first.latestSnapshot?.contentSha256);

  const replay = await checkpointProductBuilderResult(input, runProductBuilder(input), stores);
  assert.equal(replay.createdCheckpoints, 0);
  assert.equal(replay.skippedCheckpoints, 10);
  assert.equal(replay.createdSnapshots, 0);
  assert.equal((await stores.eventLog.readAll()).length, 20);
  assert.equal((await stores.snapshotStore.latest('project-a', 'run-a'))?.runId, 'run-a');
  await rm(dir, { recursive: true, force: true });
});

test('Product Builder uses one SQLite continuity source and replays after reopening', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-product-builder-sqlite-'));
  const input = { projectId: 'project-sqlite-builder' as any, runId: 'run-sqlite-builder' as any, idea: '验证 SQLite Product Builder 交接' };
  const firstStores = await defaultProductBuilderContinuityStores(dir);
  const first = await checkpointProductBuilderResult(input, runProductBuilder(input), firstStores);
  assert.equal(first.createdCheckpoints, 10);
  assert.equal(first.createdSnapshots, 10);
  assert.equal(firstStores.eventLog.backend, 'sqlite');
  assert.equal(typeof firstStores.eventLog.checkpoint, 'function');
  assert.equal(firstStores.entityStore?.listHandoffs().length, 4);
  assert.equal(firstStores.entityStore?.listApprovals(input.projectId).length, 1);
  assert.equal(firstStores.entityStore?.listSources(input.projectId).length, 1);
  assert.equal(firstStores.entityStore?.listArtifacts(input.projectId).length, 5);
  assert.equal(firstStores.entityStore?.listReceipts(input.runId).length, 1);
  firstStores.close?.();

  const reopenedStores = await defaultProductBuilderContinuityStores(dir);
  const replay = await checkpointProductBuilderResult(input, runProductBuilder(input), reopenedStores);
  assert.equal(replay.createdCheckpoints, 0);
  assert.equal(replay.skippedCheckpoints, 10);
  assert.equal((await reopenedStores.eventLog.readAll()).filter((event) => event.runId === input.runId).length, 20);
  assert.equal((await reopenedStores.snapshotStore.readAll()).filter((snapshot) => snapshot.runId === input.runId).length, 10);
  assert.equal(reopenedStores.entityStore?.listArtifacts(input.projectId).length, 5);
  assert.equal(reopenedStores.entityStore?.listReceipts(input.runId).length, 1);
  reopenedStores.close?.();
  await rm(dir, { recursive: true, force: true });
});
