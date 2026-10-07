import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'local-agent-workspace-provider-session-'));
process.env.AGENT_WORKSPACE_DATA_DIR = dataDir;
process.env.AGENT_WORKSPACE_DB = path.join(dataDir, 'workspace.db');
delete process.env.AGENT_WORKSPACE_PROJECT_ROOT;

const { handleRequest } = await import('./index.ts');

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

test('provider connections, project bindings and sessions are real project-scoped persistence paths', async () => {
  assert.equal((await call('POST', '/api/persistence/projects', { id: 'provider-project', name: 'Provider Project', workspacePath: dataDir })).status, 201);
  assert.equal((await call('POST', '/api/persistence/bots', {
    id: 'provider-bot', projectId: 'provider-project', name: 'Provider Bot', description: 'test', responsibility: 'test',
    inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, skillIds: [],
    toolPolicy: { permissionTier: 'read_only', allowedTools: [], approvalRequiredActions: [] },
    providerPolicy: { providerPreference: ['deepseek'], fallbackEnabled: false },
    memoryPolicy: { readScopes: ['project'], writeScopes: [], requireUserApprovalForWrites: true },
    approvalPolicy: { approvalRequiredActions: [], autoApproveReadOnly: true },
  })).status, 201);

  const connection = await call('POST', '/api/persistence/provider-connections', {
    id: 'provider-connection', label: 'DeepSeek API', provider: 'deepseek', harness: 'deepseek-api',
    authMode: 'api_key', billingSource: 'api', secretRef: { kind: 'env', name: 'DEEPSEEK_API_KEY' }, status: 'available',
  });
  assert.equal(connection.status, 201);
  assert.equal(connection.body.secretRef.name, 'DEEPSEEK_API_KEY');
  assert.equal(connection.body.apiKey, undefined);

  const binding = await call('POST', '/api/persistence/provider-bindings', {
    projectId: 'provider-project', connectionId: 'provider-connection', model: 'deepseek-chat', role: 'primary', priority: 0,
  });
  assert.equal(binding.status, 201);
  assert.equal(binding.body.projectId, 'provider-project');
  const duplicateBinding = await call('POST', '/api/persistence/provider-bindings', {
    projectId: 'provider-project', connectionId: 'provider-connection', model: 'deepseek-chat', role: 'primary', priority: 0,
  });
  assert.equal(duplicateBinding.status, 200);
  assert.equal(duplicateBinding.body.id, binding.body.id);
  assert.equal(duplicateBinding.body.idempotent, true);
  const resolved = await call('GET', '/api/provider/resolve?projectId=provider-project');
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.selection, 'primary');
  assert.equal(resolved.body.binding.model, 'deepseek-chat');
  assert.equal(resolved.body.connection.secretRef.name, 'DEEPSEEK_API_KEY');

  const session = await call('POST', '/api/persistence/sessions', { projectId: 'provider-project', botId: 'provider-bot', title: '真实会话' });
  assert.equal(session.status, 201);
  const message = await call('POST', `/api/persistence/sessions/${session.body.id}/messages?projectId=provider-project`, { sequence: 1, role: 'user', content: '保留上下文' });
  assert.equal(message.status, 201);
  const messages = await call('GET', `/api/persistence/sessions/${session.body.id}/messages?projectId=provider-project`);
  assert.equal(messages.status, 200);
  assert.deepEqual(messages.body.map((item: any) => item.content), ['保留上下文']);

  const entities = await call('GET', '/api/persistence/entities?projectId=provider-project');
  assert.equal(entities.status, 200);
  assert.equal(entities.body.providerConnections.length, 1);
  assert.equal(entities.body.providerBindings.length, 1);
  assert.equal(entities.body.sessions.length, 1);

  const crossProject = await call('GET', `/api/persistence/sessions/${session.body.id}/messages?projectId=other-project`);
  assert.equal(crossProject.status, 404);
});

test('explicit Bot selection cannot cross project ownership', async () => {
  assert.equal((await call('POST', '/api/persistence/projects', { id: 'project-a', name: 'A', workspacePath: dataDir })).status, 201);
  assert.equal((await call('POST', '/api/persistence/projects', { id: 'project-b', name: 'B', workspacePath: dataDir })).status, 201);
  assert.equal((await call('POST', '/api/persistence/bots', {
    id: 'bot-a', projectId: 'project-a', name: 'A Bot', description: 'test', responsibility: 'test',
    inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, skillIds: [],
    toolPolicy: { permissionTier: 'read_only', allowedTools: [], approvalRequiredActions: [] },
    providerPolicy: { providerPreference: ['fixture'], fallbackEnabled: false },
    memoryPolicy: { readScopes: ['project'], writeScopes: [], requireUserApprovalForWrites: true },
    approvalPolicy: { approvalRequiredActions: [], autoApproveReadOnly: true },
  })).status, 201);
  const response = await call('POST', '/api/runs', { provider: 'tool-local', projectId: 'project-b', botId: 'bot-a', goal: '越权 Bot' });
  assert.equal(response.status, 404);
  assert.equal(response.body.error, 'bot_not_found');
});

test('bound run executes the project-selected provider instead of falling back to fixture', async () => {
  assert.equal((await call('POST', '/api/persistence/projects', { id: 'fixture-bound-project', name: 'Fixture Bound', workspacePath: dataDir })).status, 201);
  const connection = await call('POST', '/api/persistence/provider-connections', {
    id: 'fixture-bound-connection', label: '离线 Fixture', provider: 'fixture', harness: 'fixture',
    authMode: 'local', billingSource: 'local', status: 'available',
  });
  assert.equal(connection.status, 201);
  const binding = await call('POST', '/api/persistence/provider-bindings', {
    projectId: 'fixture-bound-project', connectionId: 'fixture-bound-connection', model: 'deterministic-demo', role: 'primary', priority: 0,
  });
  assert.equal(binding.status, 201);
  const response = await call('POST', '/api/runs', { provider: 'bound', projectId: 'fixture-bound-project', goal: '用项目绑定执行一次离线诊断' });
  assert.equal(response.status, 200);
  assert.equal(response.body.provider, 'bound');
  assert.equal(response.body.boundProvider, 'fixture');
  assert.equal(response.body.connectionId, 'fixture-bound-connection');
  assert.equal(response.body.isMock, true);
  assert.ok(Array.isArray(response.body.events));
});

test('provider probe records Fixture availability and keeps DeepSeek secret handling explicit', async () => {
  const fixtureConnection = await call('POST', '/api/persistence/provider-connections', {
    id: 'probe-fixture-connection', label: 'Probe Fixture', provider: 'fixture', harness: 'fixture',
    authMode: 'local', billingSource: 'local', status: 'unconfigured',
  });
  assert.equal(fixtureConnection.status, 201);
  const fixtureProbe = await call('POST', '/api/persistence/provider-connections/probe-fixture-connection/probe');
  assert.equal(fixtureProbe.status, 200);
  assert.equal(fixtureProbe.body.ok, true);
  assert.equal(fixtureProbe.body.result.status, 'available');
  assert.equal(fixtureProbe.body.connection.status, 'available');
  assert.equal(typeof fixtureProbe.body.connection.lastProbeAt, 'string');
  assert.equal(fixtureProbe.body.connection.apiKey, undefined);

  const deepSeekConnection = await call('POST', '/api/persistence/provider-connections', {
    id: 'probe-deepseek-connection', label: 'Probe DeepSeek', provider: 'deepseek', harness: 'deepseek-api',
    authMode: 'api_key', billingSource: 'api', secretRef: { kind: 'env', name: 'DEEPSEEK_API_KEY' }, status: 'unconfigured',
  });
  assert.equal(deepSeekConnection.status, 201);
  const deepSeekProbe = await call('POST', '/api/persistence/provider-connections/probe-deepseek-connection/probe');
  assert.equal(deepSeekProbe.status, 200);
  assert.equal(deepSeekProbe.body.ok, false);
  assert.equal(deepSeekProbe.body.result.status, 'unconfigured');
  assert.match(deepSeekProbe.body.result.reason, /不会读取或接收 Key/);
  assert.equal(deepSeekProbe.body.connection.status, 'unconfigured');
  assert.deepEqual(deepSeekProbe.body.connection.secretRef, { kind: 'env', name: 'DEEPSEEK_API_KEY' });
  assert.equal(deepSeekProbe.body.connection.apiKey, undefined);
});

test('Skill registration, Bot binding and disabled-skill audit stay in the project run request', async () => {
  const skill = await call('POST', '/api/persistence/skills', {
    id: 'skill-project-research', name: '项目研究', description: '固定研究输出规则', version: '1.0.0', instructions: '保留来源和未知项。',
  });
  assert.equal(skill.status, 201);
  assert.equal((await call('PATCH', '/api/persistence/bots/provider-bot?projectId=provider-project', { skillIds: ['skill-project-research'] })).status, 200);
  const run = await call('POST', '/api/runs', { provider: 'tool-loop-fixture', projectId: 'provider-project', botId: 'provider-bot', goal: '执行绑定 Skill 的受控运行' });
  assert.equal(run.status, 200);
  assert.deepEqual(run.body.run.request.metadata.skillIds, ['skill-project-research']);
  assert.equal(run.body.run.request.metadata.disabledSkillIds, undefined);

  assert.equal((await call('PATCH', '/api/persistence/skills/skill-project-research', { enabled: false })).status, 200);
  const disabledRun = await call('POST', '/api/runs', { provider: 'tool-loop-fixture', projectId: 'provider-project', botId: 'provider-bot', goal: '执行停用 Skill 后的受控运行' });
  assert.equal(disabledRun.status, 200);
  assert.equal(disabledRun.body.run.request.metadata.skillIds, undefined);
  assert.deepEqual(disabledRun.body.run.request.metadata.disabledSkillIds, ['skill-project-research']);

  const unknownSkillUpdate = await call('PATCH', '/api/persistence/bots/provider-bot?projectId=provider-project', { skillIds: ['skill-does-not-exist'] });
  assert.equal(unknownSkillUpdate.status, 422);
  assert.equal((await call('PATCH', '/api/persistence/bots/provider-bot?projectId=provider-project', { enabled: false })).status, 200);
  const disabledBotRun = await call('POST', '/api/runs', { provider: 'tool-loop-fixture', projectId: 'provider-project', botId: 'provider-bot', goal: '停用 Bot 不应启动运行' });
  assert.equal(disabledBotRun.status, 409);
  assert.equal(disabledBotRun.body.error, 'bot_disabled');
});
