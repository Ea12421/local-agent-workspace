import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ApprovalRequest } from '../../../packages/core/src/types.ts';

// HTTP smoke must never inherit the developer's persistent demo state. The
// production app still uses data/workspace.db; this test gets a disposable
// SQLite database so replay and clarification assertions describe a fresh run.
const smokeDataDir = await mkdtemp(path.join(os.tmpdir(), 'local-agent-workspace-http-smoke-'));
process.env.AGENT_WORKSPACE_DATA_DIR = smokeDataDir;
const { handleRequest } = await import('./index.ts');
const { runtimeStore } = await import('./runtime.ts');
const { defaultProductBuilderContinuityStores } = await import('./product-builder-continuity.ts');
const { openSqliteRunStore } = await import('./persistence.ts');

test.after(async () => {
  await rm(smokeDataDir, { recursive: true, force: true });
});

type Capture = { status?: number; headers?: Record<string, string>; body?: any };
function request(method: string, url: string, payload?: unknown, correlationId?: string) {
  const encoded = payload === undefined ? undefined : Buffer.from(JSON.stringify(payload));
  return {
    method,
    url,
    headers: { host: '127.0.0.1', ...(correlationId ? { 'x-correlation-id': correlationId } : {}) },
    async *[Symbol.asyncIterator]() { if (encoded) yield encoded; },
  };
}
async function call(method: string, url: string, payload?: unknown, correlationId?: string): Promise<Capture> {
  const capture: Capture = {};
  await handleRequest(request(method, url, payload, correlationId), {
    writeHead(status, headers) { capture.status = status; capture.headers = headers; },
    end(value) { capture.body = value ? JSON.parse(value) : undefined; },
  });
  return capture;
}

test('HTTP handler can be verified without opening a port', async () => {
  const preflight = await call('OPTIONS', '/api/persistence/bots/bot-http-smoke');
  assert.equal(preflight.status, 204);
  assert.match(String(preflight.headers?.['access-control-allow-methods']), /PATCH/);
  assert.match(String(preflight.headers?.['access-control-allow-headers']), /x-correlation-id/);
  const health = await call('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  const codexDiagnostics = await call('GET', '/api/provider/codex-diagnostics');
  assert.equal(codexDiagnostics.status, 200);
  assert.equal(codexDiagnostics.body.harness, 'codex-cli');
  assert.equal(typeof codexDiagnostics.body.capabilities.resume, 'boolean');
  assert.equal(typeof codexDiagnostics.body.stateDb.fileWritable, 'boolean');
  const uiSnapshot = await call('GET', '/api/ui-snapshot');
  assert.equal(uiSnapshot.status, 200);
  assert.equal(typeof uiSnapshot.body.projects[0].workspacePath, 'string');
  assert.equal(uiSnapshot.body.bots.find((bot: any) => bot.id === 'bot-product-builder')?.permission, '只读');
  const unscopedRuns = await call('GET', '/api/core/runs');
  assert.equal(unscopedRuns.status, 400);
  assert.equal(unscopedRuns.body.error, 'project_id_required');
  const unscopedEntities = await call('GET', '/api/persistence/entities');
  assert.equal(unscopedEntities.status, 400);
  const unscopedBots = await call('GET', '/api/persistence/bots');
  assert.equal(unscopedBots.status, 400);
  const savedDeepSeekKey = process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  const providerDraftWithoutKey = await call('POST', '/api/product-builder/provider-draft', { idea: '验证无 Key 时的草稿边界' });
  assert.equal(providerDraftWithoutKey.status, 503);
  assert.equal(providerDraftWithoutKey.body.error, 'deepseek_api_key_missing');
  assert.match(String(providerDraftWithoutKey.body.runId), /^run[_-]/);
  const noKeyRun = await call('GET', `/api/core/runs/${providerDraftWithoutKey.body.runId}?projectId=project-product-builder`);
  assert.equal(noKeyRun.status, 200);
  assert.equal(noKeyRun.body.run.status, 'failed');
  assert.equal(noKeyRun.body.run.error.code, 'deepseek_api_key_missing');
  if (savedDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = savedDeepSeekKey;
  const preview = await call('POST', '/api/product-builder/preview', { idea: '在团队项目中验证一个 AI 产品', user: '独立开发者' });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.status, 'waiting_user');
  assert.equal(preview.body.handoffs.length, 4);
  assert.equal(preview.body.handoffValidation.valid, true);
  assert.equal(preview.body.clarifications.find((item: any) => item.id === 'target_user').status, 'provided');
  assert.deepEqual(preview.body.plan.unresolvedClarificationIds, []);
  assert.equal(preview.body.artifactRelease, 'blocked');
  assert.deepEqual(preview.body.finalArtifactIds, []);
  assert.deepEqual(preview.body.releaseBlockers, ['approval_pending']);
  assert.equal(preview.body.continuity.persistedState.artifactRelease, 'blocked');
  const firstArtifactIds = preview.body.artifacts.map((item: any) => item.id);
  assert.ok(['full', 'portable'].includes(preview.body.continuity.persistence.eventLog.mode));
  assert.ok(['full', 'portable'].includes(preview.body.continuity.persistence.snapshotStore.mode));
  if (preview.body.continuity.persistence.eventLog.mode === 'portable') assert.ok(preview.body.continuity.persistence.eventLog.reason);
  if (preview.body.continuity.persistence.snapshotStore.mode === 'portable') assert.ok(preview.body.continuity.persistence.snapshotStore.reason);
  const replay = await call('POST', '/api/product-builder/preview', { idea: '在团队项目中验证一个 AI 产品', user: '独立开发者' });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.continuity.createdCheckpoints, 0);
  assert.equal(replay.body.continuity.skippedCheckpoints, 10);
  assert.deepEqual(replay.body.artifacts.map((item: any) => item.id), firstArtifactIds);
  assert.deepEqual(replay.body.finalArtifactIds, preview.body.finalArtifactIds);
  const missingUser = await call('POST', '/api/product-builder/preview', { idea: '在团队项目中验证一个 AI 产品' });
  assert.equal(missingUser.status, 200);
  assert.ok(missingUser.body.releaseBlockers.includes('clarification_pending'));
  const resolvedClarification = await call('POST', '/api/runs/run-fixture-001/clarifications/resolve', { clarificationId: 'target_user', value: '独立开发者' });
  assert.equal(resolvedClarification.status, 200);
  assert.equal(resolvedClarification.body.state.releaseBlockers.includes('clarification_pending'), false);
  const resolvedReplay = await call('POST', '/api/runs/run-fixture-001/clarifications/resolve', { clarificationId: 'target_user', value: '独立开发者' });
  assert.equal(resolvedReplay.status, 200);
  assert.equal(resolvedReplay.body.idempotent, true);
  const emptyPreview = await call('POST', '/api/product-builder/preview', { idea: '   ' });
  assert.equal(emptyPreview.status, 422);
  assert.equal(emptyPreview.body.error, 'idea_required');
  const entities = await call('GET', '/api/persistence/entities?projectId=project-product-builder');
  assert.equal(entities.status, 200);
  assert.ok(entities.body.handoffs.length >= 4);
  assert.ok(entities.body.artifacts.length >= 5);
  assert.ok(entities.body.productBuilderStates.some((state: any) => state.runId === 'run-fixture-001'));
  const approvalId = entities.body.approvals.find((item: any) => item.runId === 'run-fixture-001' && item.status === 'pending')?.id;
  assert.ok(approvalId);
  const latestBuilderState = entities.body.productBuilderStates.find((state: any) => state.runId === 'run-fixture-001');
  assert.ok(Array.isArray(latestBuilderState?.clarifications));
  assert.equal(latestBuilderState?.plan?.id, 'product-builder-plan-v1');
  const runEvents = await call('GET', '/api/runs/run-fixture-001/events?projectId=project-product-builder');
  assert.equal(runEvents.status, 200);
  assert.equal(runEvents.body.runId, 'run-fixture-001');
  assert.ok(runEvents.body.events.length >= 10);
  const persistedArtifactId = entities.body.artifacts[0].id;
  const artifactDetail = await call('GET', `/api/persistence/artifacts/${encodeURIComponent(persistedArtifactId)}?projectId=project-product-builder`);
  assert.equal(artifactDetail.status, 200);
  assert.ok(artifactDetail.body.content.includes('#'));
  assert.equal(artifactDetail.body.releaseStatus, 'draft');
  const sourceDetail = await call('GET', `/api/persistence/sources/${encodeURIComponent(entities.body.sources[0].id)}?projectId=project-product-builder`);
  assert.equal(sourceDetail.status, 200);

  const revokeRun = await runtimeStore.createRun({
    id: 'run-http-revoke' as any,
    projectId: 'project-product-builder' as any,
    botId: 'bot-product-builder' as any,
    request: { objective: '验证 HTTP 动态撤销', input: {} },
  });
  const revokeStores = await defaultProductBuilderContinuityStores(smokeDataDir);
  try {
    const revokeApproval: ApprovalRequest = {
      id: 'run-http-revoke:approval:call-1' as any,
      projectId: 'project-product-builder' as any,
      runId: revokeRun.id,
      action: 'filesystem.write',
      description: '允许写入',
      permissionTier: 'workspace_write',
      status: 'approved',
      requestedAt: '2026-10-03T00:00:00.000Z',
      resolvedAt: '2026-10-03T00:00:01.000Z',
      resolvedBy: 'user',
      metadata: { callId: 'call-1', policyVersion: 1 },
    };
    revokeStores.entityStore?.saveApprovalRequest(revokeApproval);
  } finally {
    revokeStores.close?.();
  }
  const revoked = await call('POST', `/api/runs/${revokeRun.id}/approvals/run-http-revoke%3Aapproval%3Acall-1/revoke`, { reason: 'HTTP 撤销测试' });
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.changed, true);
  assert.equal(revoked.body.approval.status, 'cancelled');
  assert.equal(revoked.body.event.type, 'tool.authorization_revoked');
  const revokedReplay = await call('POST', `/api/runs/${revokeRun.id}/approvals/run-http-revoke%3Aapproval%3Acall-1/revoke`, { reason: '重复撤销' });
  assert.equal(revokedReplay.status, 200);
  assert.equal(revokedReplay.body.changed, false);
  assert.equal(revokedReplay.body.idempotent, true);
  const revokeEvents = await call('GET', `/api/runs/${revokeRun.id}/events?projectId=project-product-builder`);
  assert.equal(revokeEvents.status, 200);
  assert.equal(revokeEvents.body.events.filter((event: any) => event.type === 'tool.authorization_revoked').length, 1);

  const retry = await call('POST', '/api/runs/run-fixture-001/retry');
  assert.equal(retry.status, 200);
  assert.equal(retry.body.ok, true);
  assert.equal(retry.body.event.data.retry.attempt, 1);
  assert.equal(retry.body.event.data.retry.maxRetries, 2);
  const retriedEvents = await call('GET', '/api/runs/run-fixture-001/events?projectId=project-product-builder');
  assert.equal(retriedEvents.status, 200);
  assert.ok(retriedEvents.body.events.some((event: any) => event.type === 'run.retry_requested'));
  const approval = await call('POST', `/api/runs/run-fixture-001/approvals/${encodeURIComponent(approvalId)}/resolve`, { decision: 'approved' });
  assert.equal(approval.status, 200);
  assert.equal(approval.body.changed, true);
  assert.equal(approval.body.artifactRelease, 'released');
  assert.equal(approval.body.finalArtifactIds.length, 5);
  const releasedEntities = await call('GET', '/api/persistence/entities?projectId=project-product-builder');
  assert.equal(releasedEntities.status, 200);
  const releasedState = releasedEntities.body.productBuilderStates.find((state: any) => state.runId === 'run-fixture-001');
  assert.equal(releasedState?.artifactRelease, 'released');
  assert.deepEqual(releasedState?.releaseBlockers, []);
  assert.equal(releasedState?.finalArtifactIds.length, 5);
  const releasedArtifactDetail = await call('GET', `/api/persistence/artifacts/${encodeURIComponent(persistedArtifactId)}?projectId=project-product-builder`);
  assert.equal(releasedArtifactDetail.status, 200);
  assert.equal(releasedArtifactDetail.body.releaseStatus, 'final');

  const project = await call('POST', '/api/persistence/projects', { id: 'project-http-smoke', name: 'HTTP 项目', workspacePath: '/tmp/http-project' });
  assert.equal(project.status, 201);
  const missingProjectScope = await call('GET', `/api/persistence/artifacts/${encodeURIComponent(persistedArtifactId)}`);
  assert.equal(missingProjectScope.status, 400);
  const crossProjectArtifact = await call('GET', `/api/persistence/artifacts/${encodeURIComponent(persistedArtifactId)}?projectId=project-http-smoke`);
  assert.equal(crossProjectArtifact.status, 404);
  const crossProjectSource = await call('GET', `/api/persistence/sources/${encodeURIComponent(entities.body.sources[0].id)}?projectId=project-http-smoke`);
  assert.equal(crossProjectSource.status, 404);
  const projectRead = await call('GET', '/api/persistence/projects/project-http-smoke');
  assert.equal(projectRead.status, 200);
  const projectUpdate = await call('PATCH', '/api/persistence/projects/project-http-smoke', { name: 'HTTP 项目已更新' });
  assert.equal(projectUpdate.status, 200);
  assert.equal(projectUpdate.body.name, 'HTTP 项目已更新');

  const projectARun = await runtimeStore.createRun({
    id: 'run-http-project-a' as any,
    projectId: 'project-product-builder' as any,
    botId: 'bot-product-builder' as any,
    request: { objective: '项目 A 的运行', input: {} },
  });
  const projectBRun = await runtimeStore.createRun({
    id: 'run-http-project-b' as any,
    projectId: 'project-http-smoke' as any,
    botId: 'bot-http-smoke' as any,
    request: { objective: '项目 B 的运行', input: {} },
  });
  const projectARuns = await call('GET', '/api/core/runs?projectId=project-product-builder');
  assert.equal(projectARuns.status, 200);
  assert.ok(projectARuns.body.runs.some((run: any) => run.id === projectARun.id));
  assert.equal(projectARuns.body.runs.some((run: any) => run.id === projectBRun.id), false);
  const projectBRunThroughA = await call('GET', `/api/core/runs/${projectBRun.id}?projectId=project-product-builder`);
  assert.equal(projectBRunThroughA.status, 404);
  const projectAEvents = await call('GET', `/api/runs/${projectARun.id}/events?projectId=project-product-builder`);
  assert.equal(projectAEvents.status, 200);
  const projectBEventsThroughA = await call('GET', `/api/runs/${projectBRun.id}/events?projectId=project-product-builder`);
  assert.equal(projectBEventsThroughA.status, 404);
  const reopenedRuntime = openSqliteRunStore(path.join(os.tmpdir(), `local-agent-workspace-test-${process.pid}.db`));
  if ((runtimeStore as any).backend === 'sqlite') {
    try {
      assert.ok((await reopenedRuntime.store.listRuns('project-product-builder')).some((run) => run.id === projectARun.id));
      assert.equal((await reopenedRuntime.store.listRuns('project-product-builder')).some((run) => run.id === projectBRun.id), false);
    } finally {
      reopenedRuntime.close();
    }
  } else {
    await reopenedRuntime.store.createRun({ id: 'run-http-reopen-a' as any, projectId: 'project-product-builder' as any, botId: 'bot-product-builder' as any, request: { objective: '重开后的项目 A', input: {} } });
    await reopenedRuntime.store.createRun({ id: 'run-http-reopen-b' as any, projectId: 'project-http-smoke' as any, botId: 'bot-http-smoke' as any, request: { objective: '重开后的项目 B', input: {} } });
    reopenedRuntime.close();
    const reopenedAgain = openSqliteRunStore(path.join(os.tmpdir(), `local-agent-workspace-test-${process.pid}.db`));
    try {
      assert.ok((await reopenedAgain.store.listRuns('project-product-builder')).some((run) => run.id === 'run-http-reopen-a'));
      assert.equal((await reopenedAgain.store.listRuns('project-product-builder')).some((run) => run.id === 'run-http-reopen-b'), false);
    } finally {
      reopenedAgain.close();
    }
  }
  const reopenedContinuity = await defaultProductBuilderContinuityStores(smokeDataDir);
  try {
    assert.ok((reopenedContinuity.entityStore?.listArtifacts('project-product-builder').length ?? 0) >= 5);
    assert.equal(reopenedContinuity.entityStore?.listArtifacts('project-http-smoke').length ?? 0, 0);
    assert.ok((await reopenedContinuity.eventLog.readAll()).some((event: any) => event.runId === 'run-fixture-001'));
  } finally {
    reopenedContinuity.close?.();
  }
  const scopedEntitiesA = await call('GET', '/api/persistence/entities?projectId=project-product-builder');
  const scopedEntitiesB = await call('GET', '/api/persistence/entities?projectId=project-http-smoke');
  assert.equal(scopedEntitiesA.status, 200);
  assert.equal(scopedEntitiesB.status, 200);
  assert.ok(scopedEntitiesA.body.artifacts.length >= 5);
  assert.equal(scopedEntitiesB.body.artifacts.length, 0);
  assert.ok(scopedEntitiesA.body.handoffs.length >= 4);
  assert.equal(scopedEntitiesB.body.handoffs.length, 0);
  assert.ok(scopedEntitiesA.body.receipts.length >= 1);
  assert.equal(scopedEntitiesB.body.receipts.length, 0);

  const skill = await call('POST', '/api/persistence/skills', { id: 'skill-http-smoke', name: 'HTTP Skill', description: 'HTTP skill', version: '1.0.0', instructions: '输出结构化结果' });
  assert.equal(skill.status, 201);
  const skillUpdate = await call('PATCH', '/api/persistence/skills/skill-http-smoke', { enabled: false });
  assert.equal(skillUpdate.status, 200);
  assert.equal(skillUpdate.body.enabled, false);

  const bot = await call('POST', '/api/persistence/bots', {
    id: 'bot-http-smoke', projectId: 'project-http-smoke', name: 'HTTP Bot', description: 'HTTP bot', responsibility: '测试 HTTP 持久化',
    inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, skillIds: ['skill-http-smoke'],
    toolPolicy: { permissionTier: 'read_only', allowedTools: [], approvalRequiredActions: [] }, providerPolicy: { fallbackEnabled: false },
    memoryPolicy: { readScopes: [], writeScopes: [], requireUserApprovalForWrites: true }, approvalPolicy: { approvalRequiredActions: [], autoApproveReadOnly: true },
  });
  assert.equal(bot.status, 201);
  const unscopedBotUpdate = await call('PATCH', '/api/persistence/bots/bot-http-smoke', { name: '不应写入' });
  assert.equal(unscopedBotUpdate.status, 400);
  const botRead = await call('GET', '/api/persistence/bots/bot-http-smoke?projectId=project-http-smoke');
  assert.equal(botRead.status, 200);
  assert.equal(botRead.body.projectId, 'project-http-smoke');
  const crossProjectBotRead = await call('GET', '/api/persistence/bots/bot-http-smoke?projectId=project-product-builder');
  assert.equal(crossProjectBotRead.status, 404);
  const botUpdate = await call('PATCH', '/api/persistence/bots/bot-http-smoke?projectId=project-http-smoke', { name: 'HTTP Bot 已更新' });
  assert.equal(botUpdate.status, 200);
  assert.equal(botUpdate.body.name, 'HTTP Bot 已更新');
  const botCopy = await call('POST', '/api/persistence/bots', {
    projectId: 'project-http-smoke', name: 'HTTP Bot 副本', description: '复制测试', responsibility: '验证 Bot 复制',
    inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, skillIds: [],
    toolPolicy: { permissionTier: 'read_only', allowedTools: [], approvalRequiredActions: [] }, providerPolicy: { fallbackEnabled: false },
    memoryPolicy: { readScopes: [], writeScopes: [], requireUserApprovalForWrites: true }, approvalPolicy: { approvalRequiredActions: [], autoApproveReadOnly: true },
  });
  assert.equal(botCopy.status, 201);
  const botDisabled = await call('PATCH', '/api/persistence/bots/bot-http-smoke?projectId=project-http-smoke', { enabled: false });
  assert.equal(botDisabled.status, 200);
  assert.equal(botDisabled.body.enabled, false);
  assert.ok(botDisabled.body.disabledAt);

  const created = await call('POST', '/api/runs', { goal: '验证持久化取消' });
  assert.equal(created.status, 201);
  const createdRead = await call('GET', `/api/core/runs/${created.body.id}?projectId=project-product-builder`);
  assert.equal(createdRead.status, 200);
  assert.equal(createdRead.body.run.id, created.body.id);
  assert.equal(createdRead.body.events.length, 2);
  assert.ok(Array.isArray(createdRead.body.receipts));
  const receiptStores = await defaultProductBuilderContinuityStores(process.env.AGENT_WORKSPACE_DATA_DIR ?? path.join(process.cwd(), 'data'));
  try {
    receiptStores.entityStore?.saveProviderReceipt({
      id: `${created.body.id}:codex:model:1`,
      runId: created.body.id,
      segment: 1,
      provider: { harness: 'codex-cli', provider: 'openai-codex', model: 'gpt-6', authMode: 'subscription', billingSource: 'subscription', isMock: false },
      receipt: {
        schemaVersion: 'provider.model-response.v1',
        requestId: `${created.body.id}:codex:1`,
        rawResponseRef: 'sha256:test-response',
        toolCalls: [],
        usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19, cachedInputTokens: 0, source: 'provider' },
        promptCache: { schemaVersion: 'provider.prompt-cache-receipt.v1', status: 'unknown', providerReported: false },
        providerFields: { bridge: 'codex-cli', parseStatus: 'text' },
      },
      createdAt: new Date().toISOString(),
    });
  } finally {
    receiptStores.close?.();
  }
  const modelRead = await call('GET', `/api/core/runs/${created.body.id}?projectId=project-product-builder`);
  assert.equal(modelRead.status, 200);
  assert.equal(modelRead.body.modelReceipt.id, `${created.body.id}:codex:model:1`);
  assert.equal(modelRead.body.modelReceipt.usage.inputTokens, 12);
  assert.equal(modelRead.body.modelReceipt.promptCache.status, 'unknown');
  assert.equal(modelRead.body.modelReceipt.promptCache.providerReported, false);
  assert.equal(modelRead.body.modelReceipt.rawResponseRef, 'sha256:test-response');
  assert.match(modelRead.body.modelReceipt.replayRef, new RegExp(encodeURIComponent(created.body.id)));
  const cancelled = await call('POST', `/api/runs/${created.body.id}/cancel`);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.run.status, 'cancelled');
  const cancelledRetry = await call('POST', `/api/runs/${created.body.id}/retry`);
  assert.equal(cancelledRetry.status, 409);
  assert.equal(cancelledRetry.body.error, 'retry_not_allowed');
  assert.equal(cancelledRetry.body.reason, 'run_cancelled');
  const missing = await call('POST', '/api/runs/run-does-not-exist/cancel');
  assert.equal(missing.status, 404);
  assert.match(String(missing.body.correlationId), /^corr_/);
  const correlated = await call('GET', '/api/persistence/projects/missing-project', undefined, 'test-correlation-001');
  assert.equal(correlated.status, 404);
  assert.equal(correlated.body.correlationId, 'test-correlation-001');
  assert.equal(correlated.headers?.['x-correlation-id'], 'test-correlation-001');

  const retrySeed = await runtimeStore.createRun({ projectId: 'project-product-builder' as any, botId: 'bot-product-builder' as any, request: { objective: '验证持久化重试', input: {} } });
  await runtimeStore.transition(retrySeed.id, 'start');
  await runtimeStore.transition(retrySeed.id, 'fail', { reason: '可重试失败', error: { code: 'TEST_RETRY', message: '可重试失败', retryable: true } });
  const retried = await call('POST', `/api/runs/${retrySeed.id}/retry`);
  assert.equal(retried.status, 200);
  assert.equal(retried.body.run.status, 'queued');
  assert.equal(retried.body.attempt, 1);
  const retryReplay = await call('POST', `/api/runs/${retrySeed.id}/retry`, { idempotencyKey: retried.body.event.data.idempotencyKey });
  assert.equal(retryReplay.status, 200);
  assert.equal(retryReplay.body.alreadyRecorded, true);
  assert.equal(retryReplay.body.event.id, retried.body.event.id);
  await runtimeStore.transition(retrySeed.id, 'start');
  await runtimeStore.transition(retrySeed.id, 'fail', { reason: '第二次可重试失败', error: { code: 'TEST_RETRY', message: '第二次可重试失败', retryable: true } });
  const retriedAgain = await call('POST', `/api/runs/${retrySeed.id}/retry`);
  assert.equal(retriedAgain.status, 200);
  assert.notEqual(retriedAgain.body.event.id, retried.body.event.id);
  assert.equal(retriedAgain.body.attempt, 2);
  await runtimeStore.transition(retrySeed.id, 'start');
  await runtimeStore.transition(retrySeed.id, 'fail', { reason: '超过上限', error: { code: 'TEST_RETRY', message: '超过上限', retryable: true } });
  const exhaustedRetry = await call('POST', `/api/runs/${retrySeed.id}/retry`);
  assert.equal(exhaustedRetry.status, 409);
  assert.equal(exhaustedRetry.body.error, 'retry_limit_reached');
  assert.equal(exhaustedRetry.body.retryCount, 2);
  const retryEvents = await call('GET', `/api/runs/${retrySeed.id}/events?projectId=project-product-builder`);
  assert.equal(retryEvents.status, 200);
  assert.equal(retryEvents.body.events.filter((event: any) => event.type === 'run.retry_requested').length, 2);
  assert.equal(retryEvents.body.events.some((event: any) => event.type === 'tool.invoked' || event.type === 'artifact.created'), false);

  const nonRetryableSeed = await runtimeStore.createRun({ projectId: 'project-product-builder' as any, botId: 'bot-product-builder' as any, request: { objective: '验证不可重试失败', input: {} } });
  await runtimeStore.transition(nonRetryableSeed.id, 'start');
  await runtimeStore.transition(nonRetryableSeed.id, 'fail', { reason: '结构错误', error: { code: 'SCHEMA_INVALID', message: '结构错误', retryable: false } });
  const nonRetryableRetry = await call('POST', `/api/runs/${nonRetryableSeed.id}/retry`);
  assert.equal(nonRetryableRetry.status, 409);
  assert.equal(nonRetryableRetry.body.error, 'retry_not_allowed');
  assert.equal(nonRetryableRetry.body.reason, 'failure_not_retryable');

  const toolRun = await call('POST', '/api/runs', { provider: 'tool-fixture', goal: '验证受控 ToolRuntime', path: 'fixtures/demo-project.json' });
  assert.equal(toolRun.status, 200);
  assert.equal(toolRun.body.provider, 'tool-fixture');
  assert.equal(toolRun.body.status, 'succeeded');
  assert.equal(toolRun.body.receipt.schemaVersion, 'tool.execution-receipt.v1');
  assert.equal(toolRun.body.receipt.status, 'succeeded');
  const succeededRetry = await call('POST', `/api/runs/${toolRun.body.runId}/retry`);
  assert.equal(succeededRetry.status, 409);
  assert.equal(succeededRetry.body.error, 'retry_not_allowed');
  assert.equal(succeededRetry.body.reason, 'run_succeeded');
  assert.equal(toolRun.body.output.relativePath, 'fixtures/demo-project.json');
  const toolEvents = await call('GET', `/api/runs/${toolRun.body.runId}/events?projectId=project-product-builder`);
  assert.equal(toolEvents.status, 200);
  assert.deepEqual(toolEvents.body.events.map((event: any) => event.type), [
    'run.created', 'run.started', 'tool.invoked', 'tool.completed', 'run.succeeded',
  ]);
  assert.deepEqual(toolEvents.body.events.map((event: any) => event.sequence), [1, 2, 3, 4, 5]);

  const loopRun = await call('POST', '/api/runs', { provider: 'tool-loop-fixture', goal: '验证模型工具结果循环', scenario: 'normal' });
  assert.equal(loopRun.status, 200);
  assert.equal(loopRun.body.provider, 'fixture-tool-loop');
  assert.equal(loopRun.body.status, 'succeeded');
  assert.equal(loopRun.body.run.status, 'succeeded');
  assert.ok(loopRun.body.artifact.id);
  assert.deepEqual(loopRun.body.events.map((event: any) => event.type), [
    'run.created', 'run.started', 'provider.event', 'tool.invoked', 'tool.completed', 'provider.event', 'artifact.created', 'run.succeeded',
  ]);

  const localLoopRun = await call('POST', '/api/runs', { provider: 'tool-loop-local', goal: '验证真实本地只读工具循环', path: 'fixtures/demo-project.json' });
  assert.equal(localLoopRun.status, 200);
  assert.equal(localLoopRun.body.provider, 'tool-loop-local');
  assert.equal(localLoopRun.body.isMock, true);
  assert.equal(localLoopRun.body.status, 'succeeded');
  assert.equal(localLoopRun.body.run.status, 'succeeded');
  assert.ok(localLoopRun.body.artifact.id);
  assert.deepEqual(localLoopRun.body.events.map((event: any) => event.type), [
    'run.created', 'run.started', 'provider.event', 'tool.invoked', 'tool.completed', 'provider.event', 'artifact.created', 'run.succeeded',
  ]);
  const blockedLocalLoopRun = await call('POST', '/api/runs', { provider: 'tool-loop-local', goal: '验证循环路径边界', path: '../outside.txt' });
  assert.equal(blockedLocalLoopRun.status, 422);
  assert.equal(blockedLocalLoopRun.body.status, 'failed');
  assert.equal(blockedLocalLoopRun.body.error.errorCode, 'tool_path_traversal');

  const blockedToolRun = await call('POST', '/api/runs', { provider: 'tool-fixture', goal: '验证路径越权', path: '../outside.txt' });
  assert.equal(blockedToolRun.status, 422);
  assert.equal(blockedToolRun.body.status, 'failed');
  assert.equal(blockedToolRun.body.receipt.status, 'failed');
  assert.equal(blockedToolRun.body.receipt.errorCode, 'tool_path_traversal');

  const localToolRun = await call('POST', '/api/runs', { provider: 'tool-local', goal: '读取项目 fixture 文件', path: 'fixtures/demo-project.json' });
  assert.equal(localToolRun.status, 200);
  assert.equal(localToolRun.body.provider, 'tool-local');
  assert.equal(localToolRun.body.status, 'succeeded');
  assert.equal(localToolRun.body.receipt.schemaVersion, 'tool.execution-receipt.v1');
  assert.equal(localToolRun.body.receipt.status, 'succeeded');
  assert.equal(localToolRun.body.output.relativePath, 'fixtures/demo-project.json');
  assert.match(String(localToolRun.body.output.content), /AI Product Builder Demo/);
  const localToolEvents = await call('GET', `/api/runs/${localToolRun.body.runId}/events?projectId=project-product-builder`);
  assert.equal(localToolEvents.status, 200);
  assert.deepEqual(localToolEvents.body.events.map((event: any) => event.type), [
    'run.created', 'run.started', 'tool.invoked', 'tool.completed', 'run.succeeded',
  ]);

  const blockedLocalToolRun = await call('POST', '/api/runs', { provider: 'tool-local', goal: '读取项目外文件', path: '../outside.txt' });
  assert.equal(blockedLocalToolRun.status, 422);
  assert.equal(blockedLocalToolRun.body.status, 'failed');
  assert.equal(blockedLocalToolRun.body.receipt.errorCode, 'tool_path_traversal');

  const gitToolRun = await call('POST', '/api/runs', { provider: 'tool-git', goal: '查看当前项目 Git 状态' });
  assert.equal(gitToolRun.status, 200);
  assert.equal(gitToolRun.body.provider, 'tool-git');
  assert.equal(gitToolRun.body.status, 'succeeded');
  assert.equal(gitToolRun.body.receipt.status, 'succeeded');
  assert.deepEqual(gitToolRun.body.output.argv, ['git', 'status', '--short']);
  assert.equal(gitToolRun.body.output.timedOut, false);

  const gitDiffToolRun = await call('POST', '/api/runs', { provider: 'tool-git-diff', goal: '查看当前项目 diff 摘要' });
  assert.equal(gitDiffToolRun.status, 200);
  assert.equal(gitDiffToolRun.body.provider, 'tool-git-diff');
  assert.equal(gitDiffToolRun.body.status, 'succeeded');
  assert.deepEqual(gitDiffToolRun.body.output.argv, ['git', 'diff', '--stat']);
  assert.equal(gitDiffToolRun.body.output.timedOut, false);
});

test('desktop server serves the built Web shell at the root URL', async () => {
  let status: number | undefined;
  let contentType: string | undefined;
  let html = '';
  await handleRequest(request('GET', '/'), {
    writeHead(nextStatus, headers) { status = nextStatus; contentType = headers?.['content-type']; },
    end(value) { html = value ?? ''; },
  });
  assert.equal(status, 200);
  assert.equal(contentType, 'text/html; charset=utf-8');
  assert.match(html, /<div id="root"><\/div>/);
});
