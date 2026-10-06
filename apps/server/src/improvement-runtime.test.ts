import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openSqliteProductBuilderContinuity, openSqliteRunStore } from './persistence.ts';
import { readImprovementProjection, rollbackImprovement, startImprovementRun } from './improvement-runtime.ts';
import { SqliteMemoryAdapter } from './memory-adapter.ts';
import type { ProjectId } from '../../../packages/core/src/types.ts';

test('RSI prompt run persists, deduplicates, replays and rolls back without a migration', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-rsi-'));
  const filePath = path.join(dir, 'workspace.db');
  const runHandle = openSqliteRunStore(filePath);
  const stores = openSqliteProductBuilderContinuity(filePath);
  assert.ok(stores, 'SQLite continuity store is required for this acceptance test');
  const projectId = 'project-rsi-test' as ProjectId;
  let storesClosed = false;
  let runClosed = false;
  try {
    const first = await startImprovementRun({ projectId, target: 'prompt', reason: '固定测试保留来源和未知项', idempotencyKey: 'rsi-once' }, { runStore: runHandle.store, stores, memoryAdapter: new SqliteMemoryAdapter(stores.entityStore, () => '2026-10-03T08:00:00.000Z'), now: () => '2026-10-03T08:00:00.000Z' });
    assert.equal(first.idempotent, false);
    assert.equal(first.run.status, 'succeeded');
    assert.equal(first.projection.status, 'published');
    assert.equal(first.projection.evaluation?.status, 'passed');
    assert.equal(first.projection.release?.automatic, true);
    assert.ok(stores.entityStore.listArtifactsByRun(String(first.run.id)).length >= 2);
    assert.equal(stores.entityStore.listMemories(String(projectId)).length, 1);
    const evaluationArtifact = stores.entityStore.listArtifactsByRun(String(first.run.id)).find((item) => item.kind === 'improvement-evaluation');
    assert.match(evaluationArtifact?.content ?? '', /"score"/);

    const replay = await startImprovementRun({ projectId, target: 'prompt', reason: '不同文字也不能重复执行', idempotencyKey: 'rsi-once' }, { runStore: runHandle.store, stores, now: () => '2026-10-03T08:01:00.000Z' });
    assert.equal(replay.idempotent, true);
    assert.equal(replay.run.id, first.run.id);
    const eventsBeforeRollback = await runHandle.store.listEvents(first.run.id);
    assert.equal(eventsBeforeRollback.filter((event) => event.type === 'improvement.published').length, 1);

    const rollback = await rollbackImprovement(first.run.id, projectId, '固定测试回归后恢复基线', { runStore: runHandle.store, stores, now: () => '2026-10-03T08:02:00.000Z' });
    assert.equal(rollback.idempotent, false);
    assert.equal(rollback.projection.status, 'rolled_back');
    assert.equal(rollback.projection.rollback?.restoredVersion, 'prompt:v1');
    const rollbackReplay = await rollbackImprovement(first.run.id, projectId, '重复回滚', { runStore: runHandle.store, stores, now: () => '2026-10-03T08:03:00.000Z' });
    assert.equal(rollbackReplay.idempotent, true);

    stores.close?.();
    storesClosed = true;
    runHandle.close?.();
    runClosed = true;
    const reopenedRun = openSqliteRunStore(filePath);
    const reopenedStores = openSqliteProductBuilderContinuity(filePath);
    assert.ok(reopenedStores);
    const replayedProjection = await readImprovementProjection(first.run.id, { runStore: reopenedRun.store, stores: reopenedStores! });
    assert.equal(replayedProjection.status, 'rolled_back');
    assert.equal(replayedProjection.eventIds.length, 8);
    reopenedStores?.close?.();
    reopenedRun.close?.();
  } finally {
    if (!storesClosed) stores.close?.();
    if (!runClosed) runHandle.close?.();
    await rm(dir, { recursive: true, force: true });
  }
});

test('RSI high-risk target stops at approval and does not publish', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-rsi-approval-'));
  const filePath = path.join(dir, 'workspace.db');
  const runHandle = openSqliteRunStore(filePath);
  const stores = openSqliteProductBuilderContinuity(filePath);
  assert.ok(stores);
  try {
    const result = await startImprovementRun({ projectId: 'project-rsi-approval' as ProjectId, target: 'provider', reason: '测试高风险候选', idempotencyKey: 'rsi-provider-once' }, { runStore: runHandle.store, stores: stores!, now: () => '2026-10-03T08:10:00.000Z' });
    assert.equal(result.run.status, 'waiting_user');
    assert.equal(result.projection.status, 'waiting_user');
    assert.equal(result.projection.approval?.status, 'pending');
    assert.equal(result.projection.release, undefined);
    assert.equal((await runHandle.store.listEvents(result.run.id)).filter((event) => event.type === 'improvement.published').length, 0);
    assert.equal(stores!.entityStore!.listApprovals('project-rsi-approval').length, 1);
  } finally {
    stores?.close?.();
    runHandle.close?.();
    await rm(dir, { recursive: true, force: true });
  }
});
