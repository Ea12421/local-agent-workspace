import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ApprovalRequest } from '../../../packages/core/src/types.ts';
import { runProductBuilder } from '../../../packages/workflow/src/index.ts';
import { JsonlContextSnapshotStore, JsonlEventLog, openSqliteConnection, openSqliteProductBuilderContinuity } from './persistence.ts';
import { checkpointProductBuilderResult, defaultProductBuilderContinuityStores, reconcileProductBuilderRelease, resolveProductBuilderClarification } from './product-builder-continuity.ts';

test('Product Builder checkpoints each boundary and skips completed work on replay', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-product-builder-continuity-'));
  const stores = {
    eventLog: new JsonlEventLog(path.join(dir, 'events.jsonl')),
    snapshotStore: new JsonlContextSnapshotStore(path.join(dir, 'snapshots.jsonl')),
  };
  const input = { projectId: 'project-a' as any, runId: 'run-a' as any, idea: '在团队项目中验证一个 AI 产品', user: '独立开发者' };
  const first = await checkpointProductBuilderResult(input, runProductBuilder(input), stores);
  assert.equal(first.createdCheckpoints, 10);
  assert.equal(first.skippedCheckpoints, 0);
  assert.equal(first.createdSnapshots, 10);
  assert.equal((await stores.snapshotStore.readAll()).length, 10);
  assert.equal((await stores.eventLog.readAll()).length, 20);
  assert.ok(first.latestSnapshot?.contentSha256);
  assert.equal(first.persistedState?.artifactRelease, 'blocked');
  assert.deepEqual(first.persistedState?.releaseBlockers, ['approval_pending']);
  assert.deepEqual(first.persistedState?.finalArtifactIds, []);

  const replay = await checkpointProductBuilderResult(input, runProductBuilder(input), stores);
  assert.equal(replay.createdCheckpoints, 0);
  assert.equal(replay.skippedCheckpoints, 10);
  assert.equal(replay.createdSnapshots, 0);
  assert.equal((await stores.eventLog.readAll()).length, 20);
  assert.equal((await stores.snapshotStore.latest('project-a', 'run-a'))?.runId, 'run-a');
  assert.equal(replay.persistedState?.checkpointEventId, first.persistedState?.checkpointEventId);
  await rm(dir, { recursive: true, force: true });
});

test('Product Builder uses one SQLite continuity source and replays after reopening', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-product-builder-sqlite-'));
  const input = { projectId: 'project-sqlite-builder' as any, runId: 'run-sqlite-builder' as any, idea: '在本地项目中验证 SQLite Product Builder 交接', user: '独立开发者' };
  const firstStores = await defaultProductBuilderContinuityStores(dir);
  firstStores.entityStore?.saveProject({ id: input.projectId, name: 'SQLite Builder', workspacePath: dir, createdAt: '2026-09-27T00:00:00.000Z', updatedAt: '2026-09-27T00:00:00.000Z' });
  firstStores.entityStore?.saveSkill({ id: 'skill-structured' as any, name: '结构化交接', description: '测试 skill', version: '1.0.0', instructions: '输出结构化 JSON', enabled: true });
  firstStores.entityStore?.saveBotProfile({
    id: 'bot-sqlite-builder' as any,
    projectId: input.projectId,
    name: 'Product Builder',
    description: '测试 Bot',
    responsibility: '把产品想法转成执行计划',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    skillIds: ['skill-structured' as any],
    toolPolicy: { permissionTier: 'read_only', allowedTools: [], approvalRequiredActions: [] },
    providerPolicy: { fallbackEnabled: false },
    memoryPolicy: { readScopes: [], writeScopes: [], requireUserApprovalForWrites: true },
    approvalPolicy: { approvalRequiredActions: [], autoApproveReadOnly: true },
    enabled: true,
    createdAt: '2026-09-27T00:00:00.000Z',
    updatedAt: '2026-09-27T00:00:00.000Z',
  });
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
  assert.equal(first.persistedState?.artifactRelease, 'blocked');
  const firstArtifactIds = firstStores.entityStore?.listArtifactsByRun(input.runId).map((item) => item.id) ?? [];
  assert.equal(firstStores.entityStore?.listProjects()[0]?.name, 'SQLite Builder');
  assert.equal(firstStores.entityStore?.listSkills()[0]?.name, '结构化交接');
  assert.equal(firstStores.entityStore?.listBotProfiles(input.projectId)[0]?.name, 'Product Builder');
  firstStores.close?.();

  const reopenedStores = await defaultProductBuilderContinuityStores(dir);
  const replay = await checkpointProductBuilderResult(input, runProductBuilder(input), reopenedStores);
  assert.equal(replay.createdCheckpoints, 0);
  assert.equal(replay.skippedCheckpoints, 10);
  assert.equal((await reopenedStores.eventLog.readAll()).filter((event) => event.runId === input.runId).length, 20);
  assert.equal((await reopenedStores.snapshotStore.readAll()).filter((snapshot) => snapshot.runId === input.runId).length, 10);
  assert.equal(reopenedStores.entityStore?.listArtifacts(input.projectId).length, 5);
  assert.equal(reopenedStores.entityStore?.listReceipts(input.runId).length, 1);
  assert.deepEqual(reopenedStores.entityStore?.listArtifactsByRun(input.runId).map((item) => item.id), firstArtifactIds);
  assert.deepEqual(replay.persistedState?.finalArtifactIds, first.persistedState?.finalArtifactIds);
  assert.equal(reopenedStores.entityStore?.listBotProfiles(input.projectId).length, 1);
  reopenedStores.close?.();
  await rm(dir, { recursive: true, force: true });
});

test('Product Builder repairs entity rows when a checkpoint survived an entity write interruption', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-product-builder-repair-'));
  const input = { projectId: 'project-repair' as any, runId: 'run-repair' as any, idea: '验证断点后的实体修复', user: '独立开发者' };
  const firstStores = await defaultProductBuilderContinuityStores(dir);
  firstStores.entityStore?.saveProject({ id: input.projectId, name: 'Repair Builder', workspacePath: dir, createdAt: '2026-09-27T00:00:00.000Z', updatedAt: '2026-09-27T00:00:00.000Z' });
  const result = runProductBuilder(input);
  await checkpointProductBuilderResult(input, result, firstStores);
  firstStores.close?.();
  const connection = openSqliteConnection(path.join(dir, 'workspace.db'));
  connection.db.prepare('DELETE FROM artifacts WHERE run_id = @run_id').run({ run_id: input.runId });
  connection.close();
  const reopened = await defaultProductBuilderContinuityStores(dir);
  const replay = await checkpointProductBuilderResult(input, result, reopened);
  assert.equal(replay.createdCheckpoints, 0);
  assert.equal(reopened.entityStore?.listArtifactsByRun(input.runId).length, 5);
  assert.equal(reopened.entityStore?.listApprovals(input.projectId).length, 1);
  reopened.close?.();
  await rm(dir, { recursive: true, force: true });
});

test('Product Builder backfills release state once for legacy checkpoint events', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-product-builder-legacy-'));
  const stores = {
    eventLog: new JsonlEventLog(path.join(dir, 'events.jsonl')),
    snapshotStore: new JsonlContextSnapshotStore(path.join(dir, 'snapshots.jsonl')),
  };
  const input = { projectId: 'project-legacy' as any, runId: 'run-legacy' as any, idea: '在旧项目中验证记录恢复', user: '独立开发者' };
  const result = runProductBuilder(input);
  for (const [index, checkpoint] of result.checkpoints.entries()) {
    await stores.eventLog.append({
      id: `legacy-event-${index + 1}`,
      runId: input.runId,
      sequence: index + 1,
      type: checkpoint.boundary === 'handoff' ? 'handoff.created' : checkpoint.boundary === 'artifact' ? 'artifact.created' : 'approval.requested',
      occurredAt: new Date().toISOString(),
      actor: { type: 'system' },
      data: { idempotencyKey: checkpoint.idempotencyKey },
    });
  }
  const recovered = await checkpointProductBuilderResult(input, result, stores);
  assert.equal(recovered.createdCheckpoints, 0);
  assert.equal(recovered.skippedCheckpoints, 10);
  assert.equal(recovered.persistedState?.source, 'legacy_backfill');
  assert.equal((await stores.eventLog.readAll()).length, 11);
  const replay = await checkpointProductBuilderResult(input, result, stores);
  assert.equal(replay.createdCheckpoints, 0);
  assert.equal((await stores.eventLog.readAll()).length, 11);
  await rm(dir, { recursive: true, force: true });
});

test('Product Builder syncs a changed release projection on replay without duplicating checkpoints', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-product-builder-state-sync-'));
  const stores = {
    eventLog: new JsonlEventLog(path.join(dir, 'events.jsonl')),
    snapshotStore: new JsonlContextSnapshotStore(path.join(dir, 'snapshots.jsonl')),
  };
  const clearInput = { projectId: 'project-sync' as any, runId: 'run-sync' as any, idea: '在团队项目中验证一个 AI 产品', user: '独立开发者' };
  const first = await checkpointProductBuilderResult(clearInput, runProductBuilder(clearInput), stores);
  assert.deepEqual(first.persistedState?.releaseBlockers, ['approval_pending']);
  const changedInput = { ...clearInput, user: undefined };
  const replay = await checkpointProductBuilderResult(changedInput, runProductBuilder(changedInput), stores);
  assert.equal(replay.createdCheckpoints, 0);
  assert.equal(replay.skippedCheckpoints, 10);
  assert.deepEqual(replay.persistedState?.releaseBlockers, ['clarification_pending', 'approval_pending']);
  const eventCount = (await stores.eventLog.readAll()).filter((event) => event.runId === changedInput.runId).length;
  assert.equal(eventCount, 21);
  const stableReplay = await checkpointProductBuilderResult(changedInput, runProductBuilder(changedInput), stores);
  assert.deepEqual(stableReplay.persistedState?.releaseBlockers, ['clarification_pending', 'approval_pending']);
  assert.equal((await stores.eventLog.readAll()).filter((event) => event.runId === changedInput.runId).length, 21);
  await rm(dir, { recursive: true, force: true });
});

test('Product Builder resolves a blocking clarification through one append-only idempotent event', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-product-builder-clarification-resolution-'));
  const stores = {
    eventLog: new JsonlEventLog(path.join(dir, 'events.jsonl')),
    snapshotStore: new JsonlContextSnapshotStore(path.join(dir, 'snapshots.jsonl')),
  };
  const input = { projectId: 'project-resolution' as any, runId: 'run-resolution' as any, idea: '在团队项目中验证一个 AI 产品' };
  const result = runProductBuilder(input);
  await checkpointProductBuilderResult(input, result, stores);
  const resolved = await resolveProductBuilderClarification({ projectId: input.projectId, runId: input.runId, clarificationId: 'target_user', value: '独立开发者' }, stores);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.changed, true);
  assert.deepEqual(resolved.state?.clarifications?.find((item) => item.id === 'target_user')?.value, '独立开发者');
  assert.deepEqual(resolved.state?.releaseBlockers, ['approval_pending']);
  assert.equal(resolved.state?.plan?.steps.find((item) => item.id === 'research')?.status, 'ready');
  const replay = await resolveProductBuilderClarification({ projectId: input.projectId, runId: input.runId, clarificationId: 'target_user', value: '独立开发者' }, stores);
  assert.equal(replay.ok, true);
  assert.equal(replay.changed, false);
  assert.equal(replay.idempotent, true);
  assert.equal((await stores.eventLog.readAll()).filter((event) => event.runId === input.runId && event.type === 'product_builder.state_checkpoint').length, 1);
  const externalEvidence = await resolveProductBuilderClarification({ projectId: input.projectId, runId: input.runId, clarificationId: 'external_evidence', value: 'https://example.com' }, stores);
  assert.equal(externalEvidence.error, 'external_evidence_requires_source');
  await rm(dir, { recursive: true, force: true });
});

test('SQLite entity store persists an execution provider receipt by run and segment', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-provider-receipt-'));
  const handle = openSqliteProductBuilderContinuity(path.join(dir, 'workspace.db'));
  assert.ok(handle);
  handle.entityStore.saveProviderReceipt({
    id: 'run-receipt:codex:segment:1',
    runId: 'run-receipt' as any,
    segment: 1,
    provider: { harness: 'codex-cli', provider: 'openai-codex', model: 'codex-managed-session', authMode: 'subscription', billingSource: 'unknown', isMock: false },
    receipt: { schemaVersion: 'provider.execution-receipt.v1', status: 'succeeded', eventCount: 2, eventDigestSha256: 'abc' },
    createdAt: '2026-09-28T00:00:00.000Z',
  });
  assert.deepEqual(handle.entityStore.listReceipts('run-receipt').map((item) => ({ id: item.id, segment: item.segment, status: item.receipt.status })), [{ id: 'run-receipt:codex:segment:1', segment: 1, status: 'succeeded' }]);
  handle.close();
  await rm(dir, { recursive: true, force: true });
});

test('SQLite entity store revokes an approved tool authorization and preserves the decision', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-approval-revoke-'));
  const filePath = path.join(dir, 'workspace.db');
  const handle = openSqliteProductBuilderContinuity(filePath);
  assert.ok(handle);
  const approval: ApprovalRequest = {
    id: 'run-revoke:approval:call-1' as any,
    projectId: 'project-revoke' as any,
    runId: 'run-revoke' as any,
    action: 'filesystem.write',
    description: '允许写入',
    permissionTier: 'workspace_write',
    status: 'approved',
    requestedAt: '2026-10-03T00:00:00.000Z',
    resolvedAt: '2026-10-03T00:00:01.000Z',
    resolvedBy: 'user',
    metadata: { callId: 'call-1', policyVersion: 1 },
  };
  handle.entityStore.saveApprovalRequest(approval);
  const revoked = handle.entityStore.revokeApprovalById(String(approval.id), 'user', '撤销测试');
  assert.equal(revoked.changed, true);
  assert.equal(revoked.approval?.status, 'cancelled');
  const replay = handle.entityStore.revokeApprovalById(String(approval.id), 'user', '重复撤销');
  assert.equal(replay.changed, false);
  assert.equal(replay.conflict, 'already_revoked');
  handle.close();
  const reopened = openSqliteProductBuilderContinuity(filePath)!;
  assert.equal(reopened.entityStore.getApproval(String(approval.id))?.status, 'cancelled');
  reopened.close();
  await rm(dir, { recursive: true, force: true });
});

test('Product Builder approval reconcile promotes only eligible drafts', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-product-builder-release-'));
  const input = { projectId: 'project-release' as any, runId: 'run-release' as any, idea: '在审批流程中释放产物', user: '独立开发者' };
  const stores = await defaultProductBuilderContinuityStores(dir);
  const result = runProductBuilder(input);
  await checkpointProductBuilderResult(input, result, stores);
  assert.equal(stores.entityStore?.resolveApproval(input.runId, 'approved', 'test', 'release test'), 1);
  const released = await reconcileProductBuilderRelease(input, stores);
  assert.equal(released?.artifactRelease, 'released');
  assert.equal(released?.finalArtifactIds.length, 5);
  assert.deepEqual(released?.releaseBlockers, []);
  assert.equal(released?.plan?.steps.find((step) => step.id === 'approval')?.status, 'ready');
  assert.equal(released?.plan?.steps.find((step) => step.id === 'release')?.status, 'ready');
  const replay = await reconcileProductBuilderRelease(input, stores);
  assert.deepEqual(replay?.finalArtifactIds, released?.finalArtifactIds);
  stores.close?.();
  await rm(dir, { recursive: true, force: true });
});
