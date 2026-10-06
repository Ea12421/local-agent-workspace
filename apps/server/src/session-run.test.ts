import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'local-agent-workspace-session-run-'));
process.env.AGENT_WORKSPACE_DATA_DIR = dataDir;
process.env.AGENT_WORKSPACE_DB = path.join(dataDir, 'workspace.db');
delete process.env.AGENT_WORKSPACE_PROJECT_ROOT;

const { handleRequest } = await import('./index.ts');
const { executeFixtureToolLoop, runtimeStore } = await import('./runtime.ts');
const { defaultProductBuilderContinuityStores } = await import('./product-builder-continuity.ts');

test.after(async () => {
  delete process.env.AGENT_WORKSPACE_DATA_DIR;
  delete process.env.AGENT_WORKSPACE_DB;
  await rm(dataDir, { recursive: true, force: true });
});

type Capture = { status?: number; body?: any };
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
    writeHead(status) { capture.status = status; },
    end(value) { capture.body = value ? JSON.parse(value) : undefined; },
  });
  return capture;
}

async function createSession(projectId: string, botId: string) {
  assert.equal((await call('POST', '/api/persistence/projects', { id: projectId, name: 'Session Run Project', workspacePath: dataDir })).status, 201);
  assert.equal((await call('POST', '/api/persistence/bots', {
    id: botId,
    projectId,
    name: 'Session Bot',
    description: 'session test',
    responsibility: 'run session tasks',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    skillIds: [],
    toolPolicy: { permissionTier: 'read_only', allowedTools: ['filesystem'], approvalRequiredActions: [] },
    providerPolicy: { providerPreference: ['fixture'], fallbackEnabled: false },
    memoryPolicy: { readScopes: ['project'], writeScopes: [], requireUserApprovalForWrites: true },
    approvalPolicy: { approvalRequiredActions: [], autoApproveReadOnly: true },
  })).status, 201);
  const session = await call('POST', '/api/persistence/sessions', { projectId, botId, title: 'Session Run' });
  assert.equal(session.status, 201);
  return session.body;
}

test('session message starts a project-scoped run, writes assistant reply, and is idempotent', async () => {
  const session = await createSession('session-run-project', 'session-run-bot');
  const first = await call('POST', `/api/persistence/sessions/${session.id}/run`, {
    projectId: session.projectId,
    provider: 'fixture',
    messageId: 'session-message-1',
    content: '读取当前项目并给出运行回执',
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.run.status, 'succeeded');
  assert.equal(first.body.run.request.sessionId, session.id);
  assert.equal(first.body.userMessage.runId, first.body.run.id);
  assert.equal(first.body.assistantMessage.runId, first.body.run.id);
  assert.deepEqual(first.body.messages.map((item: any) => item.role), ['user', 'assistant']);

  const repeat = await call('POST', `/api/persistence/sessions/${session.id}/run`, {
    projectId: session.projectId,
    provider: 'fixture',
    messageId: 'session-message-1',
    content: '读取当前项目并给出运行回执',
  });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body.idempotent, true);
  assert.equal(repeat.body.run.id, first.body.run.id);
  assert.equal((await runtimeStore.listRuns(session.projectId)).filter((run) => String(run.request.sessionId) === session.id).length, 1);
});

test('first session creation seeds the built-in project and bot on a clean database', async () => {
  const session = await call('POST', '/api/persistence/sessions', { projectId: 'project-product-builder', botId: 'bot-product-builder', title: '首次会话' });
  assert.equal(session.status, 201);
  assert.equal(session.body.projectId, 'project-product-builder');
  assert.equal(session.body.botId, 'bot-product-builder');
});

test('disabled Bot cannot create or continue a session', async () => {
  const session = await createSession('session-disabled-bot-project', 'session-disabled-bot');
  const disabled = await call('PATCH', `/api/persistence/bots/${session.botId}?projectId=${session.projectId}`, { enabled: false });
  assert.equal(disabled.status, 200);
  const rejectedCreate = await call('POST', '/api/persistence/sessions', { projectId: session.projectId, botId: session.botId, title: '不应创建' });
  assert.equal(rejectedCreate.status, 409);
  assert.equal(rejectedCreate.body.error, 'bot_disabled');
  const rejectedRun = await call('POST', `/api/persistence/sessions/${session.id}/run`, { projectId: session.projectId, provider: 'fixture', messageId: 'disabled-run', content: '不应运行' });
  assert.equal(rejectedRun.status, 409);
  assert.equal(rejectedRun.body.error, 'bot_disabled');
});

test('session failure is written back and remains readable', async () => {
  const session = await createSession('session-failure-project', 'session-failure-bot');
  const failed = await call('POST', `/api/persistence/sessions/${session.id}/run`, {
    projectId: session.projectId,
    provider: 'fixture',
    scenario: 'failure',
    messageId: 'session-message-failure',
    content: '验证失败结果回写',
  });
  assert.equal(failed.status, 422);
  assert.equal(failed.body.run.status, 'failed');
  assert.equal(failed.body.messages.length, 2);
  assert.equal(failed.body.messages[0].runId, failed.body.run.id);
  assert.equal(failed.body.messages[1].runId, failed.body.run.id);
  const replay = await call('GET', `/api/persistence/sessions/${session.id}/messages?projectId=${session.projectId}`);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.body.map((item: any) => item.role), ['user', 'assistant']);
});

test('session readback repairs a completed run after the entity write was interrupted', async () => {
  const session = await createSession('session-recovery-project', 'session-recovery-bot');
  const messageId = 'session-recovery-message';
  const stores = await defaultProductBuilderContinuityStores(dataDir);
  stores.entityStore!.appendSessionMessage({
    id: messageId as any,
    sessionId: session.id,
    sequence: 1,
    role: 'user',
    content: '恢复中断后的会话结果',
    createdAt: new Date().toISOString(),
  });
  stores.close?.();
  const result = await executeFixtureToolLoop(
    '恢复中断后的会话结果',
    { idea: '恢复中断后的会话结果', path: 'fixtures/demo-project.json' },
    'normal',
    { projectId: session.projectId, botId: session.botId, sessionId: session.id, sessionMessageId: messageId },
  );
  assert.equal(result.run.status, 'succeeded');
  const replay = await call('GET', `/api/persistence/sessions/${session.id}/messages?projectId=${session.projectId}`);
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.body.map((item: any) => item.role), ['user', 'assistant']);
  assert.equal(replay.body[0].runId, result.run.id);
  assert.equal(replay.body[1].runId, result.run.id);
  const secondReplay = await call('GET', `/api/persistence/sessions/${session.id}/messages?projectId=${session.projectId}`);
  assert.deepEqual(secondReplay.body, replay.body);
});

test('fixture retry dispatches a new execution instead of leaving the run queued', async () => {
  const seeded = await runtimeStore.createRun({
    projectId: 'project-product-builder' as any,
    botId: 'bot-product-builder' as any,
    request: { objective: '验证 Fixture 重试派发', input: {}, metadata: { provider: 'fixture-tool-loop', scenario: 'normal' } },
  });
  await runtimeStore.transition(seeded.id, 'start');
  await runtimeStore.transition(seeded.id, 'fail', { reason: '可重试测试失败', error: { code: 'fixture_retry_test', message: '可重试测试失败', retryable: true } });
  const retry = await call('POST', `/api/runs/${seeded.id}/retry`);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.executionDispatched, true);
  assert.equal(retry.body.run.status, 'succeeded');
  assert.ok(retry.body.events.some((event: any) => event.type === 'tool.completed'));
});
