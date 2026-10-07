import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'local-agent-workspace-orchestrator-plan-http-'));
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

test('session planning creates a project-scoped plan, clarifies unknown goals and is idempotent', async () => {
  assert.equal((await call('POST', '/api/persistence/projects', { id: 'orchestrator-http-project', name: 'Orchestrator HTTP', workspacePath: dataDir })).status, 201);
  assert.equal((await call('POST', '/api/persistence/skills', { id: 'skill-http-inspect', name: '项目检查', description: '只读检查', version: '1.0.0', instructions: '读取项目结构', enabled: true })).status, 201);
  assert.equal((await call('POST', '/api/persistence/bots', {
    id: 'bot-http-orchestrator', projectId: 'orchestrator-http-project', name: '总控 Bot', description: 'test', responsibility: '规划',
    inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, skillIds: ['skill-http-inspect'],
    toolPolicy: { permissionTier: 'read_only', allowedTools: ['filesystem'], approvalRequiredActions: [] },
    providerPolicy: { providerPreference: ['fixture'], fallbackEnabled: false },
    memoryPolicy: { readScopes: ['project'], writeScopes: [], requireUserApprovalForWrites: true },
    approvalPolicy: { approvalRequiredActions: [], autoApproveReadOnly: true },
  })).status, 201);
  const session = await call('POST', '/api/persistence/sessions', { projectId: 'orchestrator-http-project', botId: 'bot-http-orchestrator', title: '总控规划会话' });
  assert.equal(session.status, 201);
  const planned = await call('POST', `/api/persistence/sessions/${session.body.id}/plan`, { projectId: 'orchestrator-http-project', messageId: 'plan-message-1', content: '检查项目结构和 Git 状态' });
  assert.equal(planned.status, 201);
  assert.equal(planned.body.kind, 'plan');
  assert.equal(planned.body.plan.intent, 'inspect_project');
  assert.equal(planned.body.plan.steps[0].toolId, 'filesystem.read');
  assert.equal(planned.body.events[0].type, 'plan.created');
  const executed = await call('POST', `/api/persistence/plans/${planned.body.plan.id}/run`, { projectId: 'orchestrator-http-project' });
  assert.equal(executed.status, 200);
  assert.equal(executed.body.plan.status, 'succeeded');
  assert.equal(executed.body.events.at(-1).type, 'plan.succeeded');
  const executedAgain = await call('POST', `/api/persistence/plans/${planned.body.plan.id}/run`, { projectId: 'orchestrator-http-project' });
  assert.equal(executedAgain.status, 200);
  assert.equal(executedAgain.body.plan.status, 'succeeded');
  assert.equal(executedAgain.body.events.filter((event: any) => event.type === 'plan.step_started').length, 1);
  const replay = await call('POST', `/api/persistence/sessions/${session.body.id}/plan`, { projectId: 'orchestrator-http-project', messageId: 'plan-message-1', content: '检查项目结构和 Git 状态' });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.idempotent, true);
  assert.equal(replay.body.plan.id, planned.body.plan.id);
  const clarification = await call('POST', `/api/persistence/sessions/${session.body.id}/plan`, { projectId: 'orchestrator-http-project', messageId: 'plan-message-2', content: '帮我把事情做好' });
  assert.equal(clarification.status, 200);
  assert.equal(clarification.body.kind, 'clarification');
  const approvalPlan = await call('POST', `/api/persistence/sessions/${session.body.id}/plan`, { projectId: 'orchestrator-http-project', messageId: 'plan-message-3', content: '运行项目测试' });
  assert.equal(approvalPlan.status, 201);
  assert.equal(approvalPlan.body.plan.steps[0].approvalRequired, true);
  const blocked = await call('POST', `/api/persistence/plans/${approvalPlan.body.plan.id}/run`, { projectId: 'orchestrator-http-project' });
  assert.equal(blocked.status, 202);
  assert.equal(blocked.body.plan.status, 'waiting_user');
  const approved = await call('POST', `/api/persistence/plans/${approvalPlan.body.plan.id}/resume`, { projectId: 'orchestrator-http-project', stepId: approvalPlan.body.plan.steps[0].id, decision: 'approved' });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.plan.status, 'succeeded');
  const crossProject = await call('POST', `/api/persistence/sessions/${session.body.id}/plan`, { projectId: 'other-project', content: '检查项目' });
  assert.equal(crossProject.status, 404);
});
