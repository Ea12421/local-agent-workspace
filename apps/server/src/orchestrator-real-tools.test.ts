import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'local-agent-workspace-orchestrator-real-tools-'));
process.env.AGENT_WORKSPACE_DATA_DIR = dataDir;
process.env.AGENT_WORKSPACE_DB = path.join(dataDir, 'workspace.db');
const { handleRequest } = await import('./index.ts');

test.after(async () => {
  delete process.env.AGENT_WORKSPACE_DATA_DIR;
  delete process.env.AGENT_WORKSPACE_DB;
  await rm(dataDir, { recursive: true, force: true });
});

type Capture = { status?: number; body?: any };
function request(method: string, url: string, payload?: unknown) {
  const encoded = payload === undefined ? undefined : Buffer.from(JSON.stringify(payload));
  return { method, url, headers: { host: '127.0.0.1' }, async *[Symbol.asyncIterator]() { if (encoded) yield encoded; } };
}
async function call(method: string, url: string, payload?: unknown): Promise<Capture> {
  const capture: Capture = {};
  await handleRequest(request(method, url, payload), { writeHead(status) { capture.status = status; }, end(value) { capture.body = value ? JSON.parse(value) : undefined; } });
  return capture;
}

test('orchestrator plan can execute real filesystem and git read-only tools', async () => {
  assert.equal((await call('POST', '/api/persistence/projects', { id: 'orchestrator-real-project', name: 'Real tools', workspacePath: process.cwd() })).status, 201);
  assert.equal((await call('POST', '/api/persistence/skills', { id: 'skill-real-inspect', name: '项目检查', description: '只读检查', version: '1.0.0', instructions: '读取项目配置和状态', enabled: true })).status, 201);
  assert.equal((await call('POST', '/api/persistence/bots', {
    id: 'bot-real-orchestrator', projectId: 'orchestrator-real-project', name: '真实总控', description: 'test', responsibility: '规划',
    inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, skillIds: ['skill-real-inspect'],
    toolPolicy: { permissionTier: 'read_only', allowedTools: ['filesystem', 'shell'], allowedCommands: ['git status --short', 'git diff --stat'], approvalRequiredActions: [] },
    providerPolicy: { providerPreference: ['fixture'], fallbackEnabled: false },
    memoryPolicy: { readScopes: ['project'], writeScopes: [], requireUserApprovalForWrites: true },
    approvalPolicy: { approvalRequiredActions: [], autoApproveReadOnly: true },
  })).status, 201);
  const session = await call('POST', '/api/persistence/sessions', { projectId: 'orchestrator-real-project', botId: 'bot-real-orchestrator', title: '真实工具会话' });
  assert.equal(session.status, 201);
  const planned = await call('POST', `/api/persistence/sessions/${session.body.id}/plan`, { projectId: 'orchestrator-real-project', messageId: 'real-plan-1', content: '检查项目结构和 Git 状态' });
  assert.equal(planned.status, 201);
  assert.equal(planned.body.plan.steps.length, 2);
  const executed = await call('POST', `/api/persistence/plans/${planned.body.plan.id}/run`, { projectId: 'orchestrator-real-project', executionMode: 'real' });
  assert.equal(executed.status, 200);
  assert.equal(executed.body.plan.status, 'succeeded');
  assert.ok(executed.body.plan.steps.every((step: any) => step.outputRefs.some((ref: string) => ref.startsWith('receipt:'))));
  assert.ok(executed.body.events.some((event: any) => event.type === 'plan.step_completed' && event.data?.isMock === false));
  const replay = await call('POST', `/api/persistence/plans/${planned.body.plan.id}/run`, { projectId: 'orchestrator-real-project', executionMode: 'real' });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.events.filter((event: any) => event.type === 'plan.step_started').length, 2);
});
