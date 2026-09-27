import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ContextLedger, RunEvent } from '../../../packages/core/src/types.ts';
import { buildContextSnapshot } from '../../../packages/core/src/context.ts';
import { JsonlContextSnapshotStore, JsonlEventLog, openContextSnapshotStore, openEventLog } from './persistence.ts';

test('persistence exposes SQLite boundary with a clean-checkout fallback', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-'));
  const opened = await openEventLog(path.join(dir, 'events.db'));
  assert.ok(opened.backend === 'sqlite' || opened.backend === 'jsonl');
  await opened.log.append({ id: 'e1', runId: 'r1', sequence: 1, type: 'run.created', occurredAt: new Date().toISOString(), actor: { type: 'system' }, data: {} });
  assert.equal((await opened.log.readAll()).length, 1);
  await rm(dir, { recursive: true, force: true });
});

function snapshotFixture(projectId: string, runId: string, sequence: number, id: string) {
  const second = String(sequence).padStart(2, '0');
  const event = {
    id: `event-${sequence}` as RunEvent['id'],
    runId: runId as RunEvent['runId'],
    sequence,
    type: 'run.started',
    occurredAt: `2026-09-27T00:00:${second}.000Z`,
    actor: { type: 'system' },
    data: {},
  } as RunEvent;
  const ledger: ContextLedger = {
    projectId: projectId as ContextLedger['projectId'],
    runId: runId as ContextLedger['runId'],
    objective: '验证上下文持久化',
    constraints: ['保留原始事件'],
    durableFacts: [],
    decisions: [],
    unknowns: [],
    pendingApprovalRefs: [],
    activeHandoffRefs: [],
    artifactRefs: [],
    sourceRefs: [],
    nextAction: '继续执行',
    items: [],
    events: [event],
  };
  return buildContextSnapshot(ledger, {
    softThresholdTokens: 100,
    hardThresholdTokens: 200,
    reserveOutputTokens: 20,
    maxSummaryTokens: 200,
    maxTailEvents: 4,
  }, {
    id: id as ContextLedger['runId'] as never,
    createdAt: `2026-09-27T00:00:${second}.500Z`,
    trigger: 'interrupt',
  });
}

test('JSONL context snapshot store survives reload and isolates latest by project and run', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-context-'));
  const filePath = path.join(dir, 'context-snapshots.jsonl');
  const store = new JsonlContextSnapshotStore(filePath);
  const first = snapshotFixture('project-a', 'run-a', 1, 'snapshot-a-1');
  const second = snapshotFixture('project-a', 'run-a', 1, 'snapshot-a-2');
  const otherProject = snapshotFixture('project-b', 'run-a', 1, 'snapshot-b-1');
  await store.append(first);
  await store.append(second);
  await store.append(otherProject);

  const reloaded = new JsonlContextSnapshotStore(filePath);
  assert.equal((await reloaded.readAll()).length, 3);
  assert.equal((await reloaded.latest('project-a', 'run-a'))?.id, 'snapshot-a-2');
  assert.equal((await reloaded.latest('project-b', 'run-a'))?.id, 'snapshot-b-1');
  assert.equal(await reloaded.latest('project-a', 'run-missing'), undefined);
  await rm(dir, { recursive: true, force: true });
});

test('JSONL context snapshot store rejects duplicate immutable ids', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-context-duplicate-'));
  const store = new JsonlContextSnapshotStore(path.join(dir, 'context-snapshots.jsonl'));
  const snapshot = snapshotFixture('project-a', 'run-a', 1, 'snapshot-duplicate');
  await store.append(snapshot);
  await assert.rejects(() => store.append(snapshot), /already exists/);
  assert.equal((await store.readAll()).length, 1);
  await rm(dir, { recursive: true, force: true });
});

test('JSONL event log fails closed on a malformed trailing line', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-event-corruption-'));
  const filePath = path.join(dir, 'events.jsonl');
  await writeFile(filePath, `${JSON.stringify({ id: 'e1', runId: 'r1', sequence: 1 })}\n{not-json}\n`, 'utf8');
  const log = new JsonlEventLog(filePath);
  await assert.rejects(() => log.readAll(), SyntaxError);
  await rm(dir, { recursive: true, force: true });
});

test('JSONL snapshot appends remain complete under same-process concurrency and rebuild latest index', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-context-concurrency-'));
  const filePath = path.join(dir, 'context-snapshots.jsonl');
  const store = new JsonlContextSnapshotStore(filePath);
  const snapshots = Array.from({ length: 20 }, (_, index) => snapshotFixture('project-a', 'run-a', index + 1, `snapshot-concurrent-${index + 1}`));
  await Promise.all(snapshots.map((snapshot) => store.append(snapshot)));

  const reloaded = new JsonlContextSnapshotStore(filePath);
  const all = await reloaded.readAll();
  assert.equal(all.length, snapshots.length);
  const rebuiltIndex = new Map<string, typeof all[number]>();
  for (const snapshot of all) rebuiltIndex.set(`${snapshot.projectId}/${snapshot.runId}`, snapshot);
  assert.equal(rebuiltIndex.get('project-a/run-a')?.id, 'snapshot-concurrent-20');
  assert.equal((await reloaded.latest('project-a', 'run-a'))?.id, 'snapshot-concurrent-20');
  await rm(dir, { recursive: true, force: true });
});

test('SQLite is the operational snapshot backend when a usable driver exists', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-context-sqlite-'));
  const handle = openContextSnapshotStore(path.join(dir, 'workspace.db'));
  if (handle.backend === 'jsonl') {
    assert.equal(handle.mode, 'portable');
    assert.ok(handle.reason);
    await rm(dir, { recursive: true, force: true });
    return;
  }
  const snapshot = snapshotFixture('project-sqlite', 'run-sqlite', 1, 'snapshot-sqlite-1');
  await handle.store.append(snapshot);
  handle.close?.();
  const reloaded = openContextSnapshotStore(path.join(dir, 'workspace.db'));
  assert.equal(reloaded.backend, 'sqlite');
  assert.equal((await reloaded.store.latest('project-sqlite', 'run-sqlite'))?.id, snapshot.id);
  reloaded.close?.();
  await rm(dir, { recursive: true, force: true });
});
