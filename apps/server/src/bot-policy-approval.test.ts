import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'local-agent-workspace-bot-policy-'));
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

test('Bot policy PATCH waits for approval and records a policy audit event and row', async () => {
  const project = await call('POST', '/api/persistence/projects', { id: 'project-policy', name: 'Policy Project', workspacePath: dataDir });
  assert.equal(project.status, 201);
  const bot = await call('POST', '/api/persistence/bots', {
    id: 'bot-policy',
    projectId: 'project-policy',
    name: 'Policy Bot',
    description: '测试 Bot',
    responsibility: '测试策略审批',
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    skillIds: [],
    toolPolicy: { permissionTier: 'read_only', allowedTools: [], approvalRequiredActions: [] },
    providerPolicy: { providerPreference: ['fixture'], fallbackEnabled: false },
    memoryPolicy: { readScopes: ['project'], writeScopes: [], requireUserApprovalForWrites: true },
    approvalPolicy: { approvalRequiredActions: [], autoApproveReadOnly: true },
  });
  assert.equal(bot.status, 201);

  const patch = await call('PATCH', '/api/persistence/bots/bot-policy?projectId=project-policy', {
    toolPolicy: { permissionTier: 'workspace_write', allowedTools: ['filesystem'], approvalRequiredActions: ['filesystem.write'] },
  });
  assert.equal(patch.status, 202);
  assert.equal(patch.body.approvalRequired, true);
  assert.equal(patch.body.approval.metadata.kind, 'bot_policy');
  const approval = patch.body.approval;
  const before = await call('GET', '/api/persistence/bots/bot-policy?projectId=project-policy');
  assert.equal(before.body.toolPolicy.permissionTier, 'read_only');

  const resolved = await call('POST', `/api/runs/${encodeURIComponent(approval.runId)}/approvals/${encodeURIComponent(approval.id)}/resolve`, { decision: 'approved' });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.policyAudit.kind, 'bot_policy');
  assert.deepEqual(resolved.body.policyAudit.changedFields, ['toolPolicy']);
  const after = await call('GET', '/api/persistence/bots/bot-policy?projectId=project-policy');
  assert.equal(after.body.toolPolicy.permissionTier, 'workspace_write');
  assert.ok(resolved.body.events.some((event: any) => event.type === 'bot.policy.updated'));
  const entities = await call('GET', '/api/persistence/entities?projectId=project-policy');
  assert.equal(entities.status, 200);
  assert.equal(entities.body.policyAudit.length, 1);
  assert.deepEqual(entities.body.policyAudit[0].changedFields, ['toolPolicy']);
});
