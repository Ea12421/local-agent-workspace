import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from './index.ts';
import { runtimeStore } from './runtime.ts';

type Capture = { status?: number; headers?: Record<string, string>; body?: any };
function request(method: string, url: string, payload?: unknown) {
  const encoded = payload === undefined ? undefined : Buffer.from(JSON.stringify(payload));
  return {
    method,
    url,
    headers: { host: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { if (encoded) yield encoded; },
  };
}
async function call(method: string, url: string, payload?: unknown): Promise<Capture> {
  const capture: Capture = {};
  await handleRequest(request(method, url, payload), {
    writeHead(status, headers) { capture.status = status; capture.headers = headers; },
    end(value) { capture.body = value ? JSON.parse(value) : undefined; },
  });
  return capture;
}

test('HTTP handler can be verified without opening a port', async () => {
  const health = await call('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  const preview = await call('POST', '/api/product-builder/preview', { idea: '验证一个 AI 产品', user: '独立开发者' });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.status, 'waiting_user');
  assert.equal(preview.body.handoffs.length, 4);
  assert.ok(['full', 'portable'].includes(preview.body.continuity.persistence.eventLog.mode));
  assert.ok(['full', 'portable'].includes(preview.body.continuity.persistence.snapshotStore.mode));
  if (preview.body.continuity.persistence.eventLog.mode === 'portable') assert.ok(preview.body.continuity.persistence.eventLog.reason);
  if (preview.body.continuity.persistence.snapshotStore.mode === 'portable') assert.ok(preview.body.continuity.persistence.snapshotStore.reason);
  const replay = await call('POST', '/api/product-builder/preview', { idea: '验证一个 AI 产品', user: '独立开发者' });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.continuity.createdCheckpoints, 0);
  assert.equal(replay.body.continuity.skippedCheckpoints, 10);
  const entities = await call('GET', '/api/persistence/entities?projectId=project-product-builder');
  assert.equal(entities.status, 200);
  assert.ok(entities.body.handoffs.length >= 4);
  assert.ok(entities.body.artifacts.length >= 5);
  const approval = await call('POST', '/api/runs/run-fixture-001/approve');
  assert.equal(approval.status, 200);
  assert.ok(approval.body.approvalRowsUpdated >= 0);

  const project = await call('POST', '/api/persistence/projects', { id: 'project-http-smoke', name: 'HTTP 项目', workspacePath: '/tmp/http-project' });
  assert.equal(project.status, 201);
  const projectRead = await call('GET', '/api/persistence/projects/project-http-smoke');
  assert.equal(projectRead.status, 200);
  const projectUpdate = await call('PATCH', '/api/persistence/projects/project-http-smoke', { name: 'HTTP 项目已更新' });
  assert.equal(projectUpdate.status, 200);
  assert.equal(projectUpdate.body.name, 'HTTP 项目已更新');

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
  const botUpdate = await call('PATCH', '/api/persistence/bots/bot-http-smoke', { name: 'HTTP Bot 已更新' });
  assert.equal(botUpdate.status, 200);
  assert.equal(botUpdate.body.name, 'HTTP Bot 已更新');

  const created = await call('POST', '/api/runs', { goal: '验证持久化取消' });
  assert.equal(created.status, 201);
  const cancelled = await call('POST', `/api/runs/${created.body.id}/cancel`);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.run.status, 'cancelled');
  const missing = await call('POST', '/api/runs/run-does-not-exist/cancel');
  assert.equal(missing.status, 404);

  const retrySeed = await runtimeStore.createRun({ projectId: 'project-product-builder' as any, botId: 'bot-product-builder' as any, request: { objective: '验证持久化重试', input: {} } });
  await runtimeStore.transition(retrySeed.id, 'start');
  await runtimeStore.transition(retrySeed.id, 'fail', { reason: '可重试失败', error: { code: 'TEST_RETRY', message: '可重试失败', retryable: true } });
  const retried = await call('POST', `/api/runs/${retrySeed.id}/retry`);
  assert.equal(retried.status, 200);
  assert.equal(retried.body.run.status, 'queued');
  const retriedAgain = await call('POST', `/api/runs/${retrySeed.id}/retry`);
  assert.equal(retriedAgain.status, 200);
  assert.equal(retriedAgain.body.event.id, retried.body.event.id);
});
