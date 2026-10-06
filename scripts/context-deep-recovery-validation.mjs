import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildContextPacket,
  buildContextSnapshot,
  verifyContextSnapshot,
} from '../packages/core/src/context.ts';
import { createRunEvent } from '../packages/core/src/run-store.ts';
import { normalizeProviderResponse } from '../packages/adapters/src/provider-envelope.ts';
import { LocalToolRuntime } from '../packages/adapters/src/tool-runtime.ts';
import { runToolLoop } from '../apps/server/src/tool-loop.ts';
import { openContextSnapshotStore, openSqliteRunStore } from '../apps/server/src/persistence.ts';

const validationPath = 'validation/context-deep-recovery-v1-2026-10-03.json';
const projectId = 'project-context-deep-recovery';
const botId = 'bot-context-deep-recovery';
const runId = 'run-context-deep-recovery';
const identity = { harness: 'fixture-recovery-validation', provider: 'fixture-recovery', model: 'fixture-v1', authMode: 'local', billingSource: 'local', isMock: true };
const contextPolicy = { softThresholdTokens: 120, hardThresholdTokens: 240, reserveOutputTokens: 40, maxSummaryTokens: 1_000, maxTailEvents: 4 };

class InterruptingProvider {
  identity = identity;
  calls = 0;

  async respond(request) {
    this.calls += 1;
    if (this.calls > 1) throw new Error('simulated provider interruption after tool completion');
    return normalizeProviderResponse({
      requestId: request.requestId,
      provider: identity,
      raw: { phase: 'before-interruption' },
      toolCalls: [{ callId: 'deep-recovery-call-1', name: 'filesystem.read', arguments: { path: 'fixtures/demo-project.json' } }],
    });
  }
}

class RecoveryProvider {
  identity = identity;

  async respond(request) {
    if (request.messages.some((message) => message.role === 'tool')) {
      return normalizeProviderResponse({
        requestId: request.requestId,
        provider: identity,
        raw: { phase: 'after-recovery' },
        structuredOutput: { recovered: true, objectivePreserved: true, toolResultReplayed: true },
      });
    }
    return normalizeProviderResponse({
      requestId: request.requestId,
      provider: identity,
      raw: { phase: 'replay-completed-call' },
      toolCalls: [{ callId: 'deep-recovery-call-1', name: 'filesystem.read', arguments: { path: 'fixtures/demo-project.json' } }],
    });
  }
}

function recoveryLedger(events) {
  return {
    projectId,
    runId,
    objective: '验证长任务中断后继续推进产品方案',
    constraints: ['不外发', '保留人工审批', '只读项目文件'],
    durableFacts: [{ id: 'fact-user', text: '目标用户是独立开发者', eventRefs: ['event-user'], sourceRefs: ['source-demo'], priority: 'critical' }],
    decisions: [{ id: 'decision-local-first', text: '先保持本地优先，不启用全局监听', status: 'accepted', actor: 'user', eventRefs: ['event-decision'] }],
    unknowns: ['真实用户提效尚未验证'],
    pendingApprovalRefs: [],
    activeHandoffRefs: ['handoff-product-to-architecture'],
    artifactRefs: ['artifact-recovery-result'],
    sourceRefs: ['source-demo'],
    nextAction: '继续同一个 Run 并检查恢复后的工具结果',
    items: [{ id: 'item-context', kind: 'conversation', content: '用户决定暂不启用全局监听', eventRefs: ['event-decision'], sourceRefs: [], priority: 'important', createdAt: '2026-10-03T00:00:00.000Z' }],
    events,
  };
}

function appendContextEvent(store, runIdValue, type, sequence, data) {
  return store.appendEvent(createRunEvent(runIdValue, type, data, sequence, { type: 'system' }, `context-deep:${sequence}`));
}

const dir = await mkdtemp(path.join(tmpdir(), 'agent-workspace-context-deep-'));
const databasePath = path.join(dir, 'workspace.db');
const workspacePath = path.join(dir, 'workspace');
await mkdir(workspacePath, { recursive: true });
await writeFile(path.join(workspacePath, 'fixtures-marker.txt'), 'fixture-only\n', 'utf8');

try {
  let firstHandle = openSqliteRunStore(databasePath);
  const store = firstHandle.store;
  const queued = await store.createRun({
    id: runId,
    projectId,
    botId,
    request: { objective: '验证长任务中断后继续推进产品方案', input: { idea: '本地优先 Agent Workspace' }, constraints: ['不外发', '保留人工审批', '只读项目文件'] },
    now: '2026-10-03T01:00:00.000Z',
  });
  let run = (await store.transition(queued.id, 'start', { now: '2026-10-03T01:00:01.000Z' })).run;
  const interrupted = await runToolLoop({
    store,
    run,
    provider: new InterruptingProvider(),
    toolRuntime: new LocalToolRuntime(),
    toolRuntimeMode: 'local',
    workspaceRoot: process.cwd(),
    toolPolicy: { permissionTier: 'read_only', allowedTools: ['filesystem'], approvalRequiredActions: [] },
  });
  assert.equal(interrupted.status, 'failed');
  assert.equal(interrupted.run.status, 'failed');
  const interruptedEvents = await store.listEvents(runId);
  assert.equal(interruptedEvents.filter((event) => event.type === 'tool.invoked').length, 1);
  assert.equal(interruptedEvents.filter((event) => event.type === 'tool.completed').length, 1);
  const pass1 = buildContextSnapshot(recoveryLedger(interruptedEvents), contextPolicy, { id: 'snapshot-deep-1', createdAt: '2026-10-03T01:00:02.000Z', trigger: 'provider_limit' });
  const pass1Packet = buildContextPacket(pass1, interruptedEvents);
  assert.deepEqual(verifyContextSnapshot(pass1, interruptedEvents, projectId, runId), []);
  const snapshotStore1 = openContextSnapshotStore(databasePath);
  assert.equal(snapshotStore1.backend, 'sqlite');
  await snapshotStore1.store.append(pass1);
  snapshotStore1.close?.();
  firstHandle.close();

  const reopenedHandle = openSqliteRunStore(databasePath);
  const reopenedStore = reopenedHandle.store;
  const persistedFailed = await reopenedStore.getRun(runId);
  assert.equal(persistedFailed?.status, 'failed');
  run = (await reopenedStore.transition(runId, 'retry', { reason: '恢复同一逻辑 Run', idempotencyKey: 'deep-recovery-retry' })).run;
  run = (await reopenedStore.transition(runId, 'start', { idempotencyKey: 'deep-recovery-start' })).run;
  const resumed = await runToolLoop({
    store: reopenedStore,
    run,
    provider: new RecoveryProvider(),
    toolRuntime: new LocalToolRuntime(),
    toolRuntimeMode: 'local',
    workspaceRoot: process.cwd(),
    toolPolicy: { permissionTier: 'read_only', allowedTools: ['filesystem'], approvalRequiredActions: [] },
  });
  assert.equal(resumed.status, 'succeeded');
  assert.equal(resumed.run.status, 'succeeded');
  const resumedEvents = await reopenedStore.listEvents(runId);
  assert.equal(resumedEvents.filter((event) => event.type === 'tool.invoked').length, 1);
  assert.equal(resumedEvents.filter((event) => event.type === 'tool.completed').length, 1);
  assert.equal(resumedEvents.filter((event) => event.type === 'artifact.created').length, 1);

  const pass2 = buildContextSnapshot(recoveryLedger(resumedEvents), contextPolicy, { id: 'snapshot-deep-2', parentSnapshotId: pass1.id, createdAt: '2026-10-03T01:00:03.000Z', trigger: 'interrupt' });
  const pass2Packet = buildContextPacket(pass2, resumedEvents);
  assert.deepEqual(verifyContextSnapshot(pass2, resumedEvents, projectId, runId), []);
  assert.equal(pass2Packet.snapshot.parentSnapshotId, pass1.id);
  assert.equal(pass2Packet.snapshot.summary.objective, pass1Packet.snapshot.summary.objective);
  assert.deepEqual(pass2Packet.snapshot.summary.constraints, pass1Packet.snapshot.summary.constraints);
  assert.deepEqual(pass2Packet.snapshot.summary.decisions, pass1Packet.snapshot.summary.decisions);

  const nextSequence = resumedEvents.length + 1;
  await appendContextEvent(reopenedStore, runId, 'context.compaction_started', nextSequence, { pass: 3 });
  const pass3Events = await reopenedStore.listEvents(runId);
  const pass3 = buildContextSnapshot(recoveryLedger(pass3Events), contextPolicy, { id: 'snapshot-deep-3', parentSnapshotId: pass2.id, createdAt: '2026-10-03T01:00:04.000Z', trigger: 'manual' });
  const pass3Packet = buildContextPacket(pass3, pass3Events);
  assert.deepEqual(verifyContextSnapshot(pass3, pass3Events, projectId, runId), []);
  assert.equal(pass3Packet.snapshot.summary.objective, pass1Packet.snapshot.summary.objective);
  assert.equal(pass3Packet.snapshot.summary.nextAction, '继续同一个 Run 并检查恢复后的工具结果');
  const snapshotStore3 = openContextSnapshotStore(databasePath);
  await snapshotStore3.store.append(pass2);
  await snapshotStore3.store.append(pass3);
  const latest = await snapshotStore3.store.latest(projectId, runId);
  assert.equal(latest?.id, pass3.id);
  const allSnapshots = await snapshotStore3.store.readAll();
  snapshotStore3.close?.();
  reopenedHandle.close();

  const finalHandle = openSqliteRunStore(databasePath);
  const finalRun = await finalHandle.store.getRun(runId);
  const finalEvents = await finalHandle.store.listEvents(runId);
  assert.equal(finalRun?.status, 'succeeded');
  assert.equal(finalEvents.filter((event) => event.type === 'tool.invoked').length, 1);
  assert.equal(finalEvents.filter((event) => event.type === 'artifact.created').length, 1);
  finalHandle.close();

  const evidence = {
    validation: 'context_deep_recovery_v1',
    observedAt: '2026-10-03T00:00:00+08:00',
    storage: { backend: 'sqlite', processBoundary: 'close_reopen_same_database', runId, finalStatus: finalRun?.status },
    providerInterruption: { initialRunFailed: interrupted.run.status === 'failed', persistedAfterReopen: persistedFailed?.status === 'failed', resumedSameRun: resumed.run.id === runId },
    toolAndArtifactIdempotency: { toolInvokedCount: finalEvents.filter((event) => event.type === 'tool.invoked').length, toolCompletedCount: finalEvents.filter((event) => event.type === 'tool.completed').length, artifactCreatedCount: finalEvents.filter((event) => event.type === 'artifact.created').length },
    snapshots: { count: allSnapshots.length, ids: allSnapshots.map((snapshot) => snapshot.id), parentChain: [pass1.id, pass2.parentSnapshotId, pass3.parentSnapshotId], sameObjectiveAcrossRecovery: pass3.summary.objective === pass1.summary.objective, sameConstraintsAcrossRecovery: JSON.stringify(pass3.summary.constraints) === JSON.stringify(pass1.summary.constraints), sameDecisionAcrossRecovery: JSON.stringify(pass3.summary.decisions) === JSON.stringify(pass1.summary.decisions), sameNextActionAcrossRecovery: pass3.summary.nextAction === '继续同一个 Run 并检查恢复后的工具结果' },
    result: 'passed',
    evidenceBoundary: '证明 SQLite 关闭/重开后，同一逻辑 Run 可在工具已完成的情况下恢复，连续 3 个 Snapshot 保留结构化目标/约束/决定并保持工具与 Artifact 幂等；不证明真实模型生成质量、不证明任意自由聊天全文保留、不证明 Provider 原生 resume 或缓存成本收益。',
  };
  await mkdir('validation', { recursive: true });
  await writeFile(validationPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`context deep recovery validation passed: ${validationPath}`);
} finally {
  await rm(dir, { recursive: true, force: true });
}
