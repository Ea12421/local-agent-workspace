import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import type { ApprovalRequest, ContextLedger, RunEvent } from '../../../packages/core/src/types.ts';
import { buildContextSnapshot } from '../../../packages/core/src/context.ts';
import { JsonlContextSnapshotStore, JsonlEventLog, inspectSqliteSchema, openContextSnapshotStore, openEventLog, openSqliteProductBuilderContinuity, openSqliteRunStore, SQLITE_SCHEMA_VERSION, SqliteRunStore } from './persistence.ts';

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

test('SQLite schema migrations are versioned and idempotent', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-schema-migrations-'));
  const filePath = path.join(dir, 'workspace.db');
  const first = inspectSqliteSchema(filePath);
  if (first.backend === 'jsonl') {
    assert.equal(first.mode, 'portable');
    assert.ok(first.reason);
    await rm(dir, { recursive: true, force: true });
    return;
  }
  assert.equal(first.version, SQLITE_SCHEMA_VERSION);
  assert.ok(first.tables.includes('context_snapshots'));
  assert.ok(first.tables.includes('idempotency_keys'));
  assert.ok(first.tables.includes('run_events'));
  assert.ok(first.tables.includes('run_segments'));
  assert.ok(first.tables.includes('runs'));
  const second = inspectSqliteSchema(filePath);
  assert.deepEqual(second, first);
  await rm(dir, { recursive: true, force: true });
});

test('SQLite schema v3 persists provider bindings, sessions, messages and policy audit across reopen', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-schema-v3-'));
  const filePath = path.join(dir, 'workspace.db');
  const firstSchema = inspectSqliteSchema(filePath);
  if (firstSchema.backend === 'jsonl') {
    assert.equal(firstSchema.mode, 'portable');
    await rm(dir, { recursive: true, force: true });
    return;
  }
  assert.equal(firstSchema.version, 3);
  for (const table of ['provider_connections', 'project_provider_bindings', 'sessions', 'session_messages', 'policy_audit']) {
    assert.ok(firstSchema.tables.includes(table), `missing schema v3 table: ${table}`);
  }

  const first = openSqliteProductBuilderContinuity(filePath)!;
  first.entityStore.saveProviderConnection({
    id: 'connection-v3' as any,
    label: '测试 DeepSeek',
    provider: 'deepseek',
    harness: 'deepseek-api',
    authMode: 'api_key',
    billingSource: 'api',
    secretRef: { kind: 'env', name: 'DEEPSEEK_API_KEY' },
    status: 'available',
    capabilities: { streaming: true, toolCalling: true },
    createdAt: '2026-10-06T00:00:00.000Z',
    updatedAt: '2026-10-06T00:00:00.000Z',
  });
  first.entityStore.saveProject({ id: 'project-v3' as any, name: 'v3 project', workspacePath: dir, createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000Z' });
  first.entityStore.saveProjectProviderBinding({
    id: 'binding-v3' as any,
    projectId: 'project-v3' as any,
    connectionId: 'connection-v3' as any,
    model: 'deepseek-chat',
    role: 'primary',
    priority: 0,
    enabled: true,
    fallbackPolicy: 'never',
    revision: 1,
    createdAt: '2026-10-06T00:00:00.000Z',
    updatedAt: '2026-10-06T00:00:00.000Z',
  });
  first.entityStore.saveSession({
    id: 'session-v3' as any,
    projectId: 'project-v3' as any,
    botId: 'bot-v3' as any,
    title: '持久会话',
    status: 'active',
    createdAt: '2026-10-06T00:00:00.000Z',
    updatedAt: '2026-10-06T00:00:00.000Z',
  });
  first.entityStore.appendSessionMessage({ id: 'message-v3-1' as any, sessionId: 'session-v3' as any, sequence: 1, role: 'user', content: '保留这条消息', createdAt: '2026-10-06T00:00:01.000Z' });
  assert.throws(() => first.entityStore.appendSessionMessage({ id: 'message-v3-2' as any, sessionId: 'session-v3' as any, sequence: 1, role: 'assistant', content: '重复序号', createdAt: '2026-10-06T00:00:02.000Z' }), /sequence already exists/);
  first.entityStore.appendPolicyAudit({
    id: 'policy-audit-v3', projectId: 'project-v3', botId: 'bot-v3', approvalId: 'approval-v3',
    changedFields: ['toolPolicy'], beforePolicy: { tier: 'read_only' }, afterPolicy: { tier: 'workspace_write' },
    decision: 'approved', actor: 'test', createdAt: '2026-10-06T00:00:03.000Z',
  });
  assert.equal(first.entityStore.listProviderConnections()[0]?.secretRef?.kind, 'env');
  assert.equal((first.entityStore.listProviderConnections()[0]?.secretRef as any)?.name, 'DEEPSEEK_API_KEY');
  first.close();

  const reopened = openSqliteProductBuilderContinuity(filePath)!;
  assert.equal(reopened.entityStore.getProviderConnection('connection-v3')?.provider, 'deepseek');
  assert.equal(reopened.entityStore.listProjectProviderBindings('project-v3')[0]?.priority, 0);
  assert.equal(reopened.entityStore.getSession('session-v3', 'project-v3')?.title, '持久会话');
  assert.deepEqual(reopened.entityStore.listSessionMessages('session-v3', 'project-v3').map((item) => item.content), ['保留这条消息']);
  assert.equal(reopened.entityStore.listPolicyAudit('project-v3')[0]?.decision, 'approved');
  reopened.close();
  const secondSchema = inspectSqliteSchema(filePath);
  assert.deepEqual(secondSchema, firstSchema);
  await rm(dir, { recursive: true, force: true });
});

test('SQLite RunStore atomically persists state, events, segments and idempotent transitions across reopen', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-run-store-'));
  const filePath = path.join(dir, 'workspace.db');
  const first = openSqliteRunStore(filePath);
  const created = await first.store.createRun({
    id: 'run-persisted-1' as any,
    projectId: 'project-persisted-1' as any,
    botId: 'bot-persisted-1' as any,
    now: '2026-09-27T09:00:00.000Z',
    request: { objective: '持久化运行', input: { idea: 'SQLite' } },
  });
  const started = await first.store.transition(created.id, 'start', { now: '2026-09-27T09:00:01.000Z', idempotencyKey: 'start-1' });
  const [replay, concurrentReplay] = await Promise.all([
    first.store.transition(created.id, 'start', { idempotencyKey: 'start-1' }),
    first.store.transition(created.id, 'start', { idempotencyKey: 'start-1' }),
  ]);
  assert.equal(replay.event.id, started.event.id);
  assert.equal(concurrentReplay.event.id, started.event.id);
  await assert.rejects(() => first.store.transition(created.id, 'cancel', { idempotencyKey: 'start-1' }), /Idempotency key already used/);
  await assert.rejects(() => first.store.appendEvent({
    id: 'bad-sequence' as any,
    runId: created.id,
    sequence: 99,
    type: 'provider.event',
    occurredAt: '2026-09-27T09:00:02.000Z',
    actor: { type: 'system' },
    data: {},
  }), /Event sequence must be/);
  assert.equal((await first.store.listEvents(created.id)).length, 2);
  first.store.appendSegment({
    id: 'segment-persisted-1',
    runId: created.id,
    sequence: 1,
    status: 'running',
    provider: { harness: 'test', provider: 'fixture', model: 'fixture', authMode: 'local', billingSource: 'local', isMock: true },
    startedAt: '2026-09-27T09:00:01.000Z',
  });
  assert.equal(first.store.listSegments(created.id).length, 1);
  first.close();

  const reopened = openSqliteRunStore(filePath);
  assert.equal((await reopened.store.getRun(created.id))?.status, 'running');
  assert.equal((await reopened.store.listEvents(created.id)).length, 2);
  assert.equal(reopened.store.listSegments(created.id)[0]?.id, 'segment-persisted-1');
  assert.equal((await reopened.store.listRuns('project-persisted-1')).length, 1);
  assert.equal((await reopened.store.listRuns('other-project' as any)).length, 0);
  await assert.rejects(() => reopened.store.createRun({
    id: created.id,
    projectId: 'project-persisted-1' as any,
    botId: 'bot-persisted-1' as any,
    request: { objective: 'duplicate', input: {} },
  }), /Run already exists/);
  assert.equal((await reopened.store.listEvents(created.id)).length, 2);
  reopened.close();
  await rm(dir, { recursive: true, force: true });
});

test('SQLite RunStore rolls back injected failures and restores from an online backup', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-run-store-backup-'));
  const filePath = path.join(dir, 'workspace.db');
  const backupPath = path.join(dir, 'workspace-backup.db');
  const first = openSqliteRunStore(filePath);
  const created = await first.store.createRun({
    id: 'run-rollback-1' as any,
    projectId: 'project-rollback-1' as any,
    botId: 'bot-rollback-1' as any,
    request: { objective: '事务回滚', input: {} },
  });
  first.close();
  let shouldFail = true;
  const failureStore = new SqliteRunStore(filePath, undefined, {
    failureInjector: (phase) => { if (shouldFail && phase === 'after_event_insert') { shouldFail = false; throw new Error('injected failure'); } },
  });
  await assert.rejects(() => failureStore.transition(created.id, 'start', { idempotencyKey: 'rollback-start' }), /injected failure/);
  assert.equal((await failureStore.getRun(created.id))?.status, 'queued');
  assert.equal((await failureStore.listEvents(created.id)).length, 1);
  const succeeded = await failureStore.transition(created.id, 'start', { idempotencyKey: 'rollback-start' });
  assert.equal(succeeded.run.status, 'running');
  failureStore.backupTo(backupPath);
  failureStore.close();

  const restored = openSqliteRunStore(backupPath);
  assert.equal((await restored.store.getRun(created.id))?.status, 'running');
  assert.equal((await restored.store.listEvents(created.id)).length, 2);
  restored.close();
  await rm(dir, { recursive: true, force: true });
});

test('SQLite RunStore tolerates concurrent writers from separate processes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-run-store-processes-'));
  const filePath = path.join(dir, 'workspace.db');
  const worker = `
    import { openSqliteRunStore } from './apps/server/src/persistence.ts';
    const handle = openSqliteRunStore(process.argv[1]);
    await handle.store.createRun({ id: process.argv[2], projectId: process.argv[3], botId: 'bot-process', request: { objective: 'process writer', input: {} } });
    handle.close();
  `;
  const children = Array.from({ length: 3 }, (_, index) => new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', worker, filePath, `run-process-${index}`, `project-process-${index}`], { cwd: path.resolve(process.cwd()), stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`worker exited ${code}: ${stderr}`)));
  }));
  await Promise.all(children);
  const store = openSqliteRunStore(filePath);
  assert.equal((await store.store.listRuns()).length, 3);
  store.close();
  await rm(dir, { recursive: true, force: true });
});

test('SQLite RunStore recovers committed state after a killed worker is reopened', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-run-store-kill-restart-'));
  const filePath = path.join(dir, 'workspace.db');
  const worker = `
    import { openSqliteRunStore } from './apps/server/src/persistence.ts';
    const handle = openSqliteRunStore(process.argv[1]);
    const run = await handle.store.createRun({ id: 'run-kill-restart', projectId: 'project-kill-restart', botId: 'bot-kill-restart', request: { objective: 'kill restart', input: {} } });
    await handle.store.transition(run.id, 'start', { idempotencyKey: 'kill-start' });
    console.log('READY');
    setInterval(() => {}, 1000);
  `;
  const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', worker, filePath], { cwd: path.resolve(process.cwd()), stdio: ['ignore', 'pipe', 'pipe'] });
  const ready = new Promise<void>((resolve, reject) => {
    let stdout = '';
    const timer = setTimeout(() => reject(new Error(`worker did not become ready: ${stdout}`)), 5_000);
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
      if (stdout.includes('READY')) { clearTimeout(timer); resolve(); }
    });
    child.on('error', reject);
  });
  await ready;
  child.kill('SIGKILL');
  await new Promise<void>((resolve) => child.on('close', () => resolve()));
  const reopened = openSqliteRunStore(filePath);
  assert.equal((await reopened.store.getRun('run-kill-restart' as any))?.status, 'running');
  assert.equal((await reopened.store.listEvents('run-kill-restart' as any)).length, 2);
  reopened.close();
  await rm(dir, { recursive: true, force: true });
});

test('SQLite bounded retry attempts survive close and reopen', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-retry-reopen-'));
  const filePath = path.join(dir, 'workspace.db');
  const first = openSqliteRunStore(filePath);
  const run = await first.store.createRun({
    id: 'run-retry-reopen' as any,
    projectId: 'project-retry-reopen' as any,
    botId: 'bot-retry-reopen' as any,
    request: { objective: 'bounded retry restart', input: {}, retryPolicy: { maxRetries: 2 } },
  });
  await first.store.transition(run.id, 'start');
  await first.store.transition(run.id, 'fail', { error: { code: 'TEMP', message: 'temporary', retryable: true } });
  const retry = await first.store.transition(run.id, 'retry', { retry: { attempt: 1, maxRetries: 2, mode: 'manual', reasonClass: 'manual' } });
  assert.equal((retry.event.data.retry as any)?.attempt, 1);
  first.close();

  const reopened = openSqliteRunStore(filePath);
  const recovered = await reopened.store.getRun(run.id);
  assert.equal(recovered?.status, 'queued');
  const events = await reopened.store.listEvents(run.id);
  const retryEvents = events.filter((event) => event.type === 'run.retry_requested');
  assert.equal(retryEvents.length, 1);
  assert.equal((retryEvents[0].data.retry as any)?.attempt, 1);
  assert.equal((retryEvents[0].data.retry as any)?.maxRetries, 2);
  reopened.close();
  await rm(dir, { recursive: true, force: true });
});

test('SQLite approval resolution is precise, idempotent, and survives reopen', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-approval-resolution-'));
  const filePath = path.join(dir, 'workspace.db');
  const first = openSqliteProductBuilderContinuity(filePath);
  if (!first) {
    await rm(dir, { recursive: true, force: true });
    return;
  }
  const approval = {
    id: 'run-approval-1:approval:call-1' as any,
    projectId: 'project-approval-1' as any,
    runId: 'run-approval-1' as any,
    action: 'filesystem.write',
    description: '允许写入',
    permissionTier: 'workspace_write',
    status: 'pending',
    requestedAt: '2026-09-30T00:00:00.000Z',
    metadata: { callId: 'call-1' },
  } satisfies ApprovalRequest;
  const other = { ...approval, id: 'run-approval-1:approval:call-2' as any, metadata: { callId: 'call-2' } } satisfies ApprovalRequest;
  first.entityStore.saveApprovalRequest(approval);
  first.entityStore.saveApprovalRequest(other);
  const resolved = first.entityStore.resolveApprovalById(approval.id, 'approved', 'test', 'approved once');
  assert.equal(resolved.changed, true);
  assert.equal(resolved.approval?.status, 'approved');
  assert.equal(first.entityStore.getApproval(other.id)?.status, 'pending');
  const replay = first.entityStore.resolveApprovalById(approval.id, 'approved', 'test', 'replay');
  assert.equal(replay.changed, false);
  assert.equal(replay.approval?.status, 'approved');
  assert.equal(first.entityStore.resolveApprovalById(approval.id, 'rejected').conflict, 'already_resolved');
  first.close();
  const reopened = openSqliteProductBuilderContinuity(filePath)!;
  assert.equal(reopened.entityStore.getApproval(approval.id)?.metadata?.callId, 'call-1');
  assert.equal(reopened.entityStore.getApproval(approval.id)?.status, 'approved');
  assert.equal(reopened.entityStore.getApproval(other.id)?.status, 'pending');
  reopened.close();
  await rm(dir, { recursive: true, force: true });
});
