import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'local-agent-workspace-command-http-'));
process.env.AGENT_WORKSPACE_DATA_DIR = dataDir;
process.env.AGENT_WORKSPACE_PROJECT_ROOT = process.cwd();
const { handleRequest } = await import('./index.ts');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

type Capture = { status?: number; body?: any };
function request(method: string, url: string, payload?: unknown) {
  const encoded = payload === undefined ? undefined : Buffer.from(JSON.stringify(payload));
  return {
    method,
    url,
    headers: { host: '127.0.0.1', ...(encoded ? { 'content-type': 'application/json' } : {}) },
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

test('controlled command HTTP flow previews, requires one approval, executes, cancels, and replays safely', async () => {
  const profiles = await call('GET', '/api/commands');
  assert.equal(profiles.status, 200);
  assert.deepEqual(profiles.body.commands.map((item: any) => item.id), ['project.test', 'project.build_web']);
  assert.equal(profiles.body.commands[0].approvalRequired, true);

  const preview = await call('POST', '/api/commands/preview', { projectId: 'project-product-builder', commandId: 'project.test' });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.receipt.status, 'dry_run');
  assert.deepEqual(preview.body.output.argv, ['npm', 'run', 'test']);

  const created = await call('POST', '/api/commands/runs', {
    projectId: 'project-product-builder',
    commandId: 'project.test',
    objective: 'HTTP 受控测试命令链路',
    idempotencyKey: 'controlled-http-test-001',
  });
  assert.equal(created.status, 202);
  assert.equal(created.body.status, 'waiting_user');
  assert.equal(created.body.approval.status, 'pending');
  assert.equal(created.body.profile.argv.join(' '), 'npm run test');
  assert.ok(created.body.events.some((event: any) => event.type === 'approval.requested'));
  assert.equal(created.body.events.some((event: any) => event.type === 'tool.invoked'), false);

  const duplicate = await call('POST', '/api/commands/runs', {
    projectId: 'project-product-builder',
    commandId: 'project.test',
    objective: '重复提交不会创建第二个 Run',
    idempotencyKey: 'controlled-http-test-001',
  });
  assert.equal(duplicate.status, 200);
  assert.equal(duplicate.body.idempotent, true);
  assert.equal(duplicate.body.runId, created.body.runId);

  const approvalId = created.body.approval.id;
  const approved = await call('POST', `/api/runs/${encodeURIComponent(created.body.runId)}/approvals/${encodeURIComponent(approvalId)}/resolve`, { decision: 'approved' });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.ok, true);
  assert.equal(approved.body.controlledCommand.status, 'succeeded');
  assert.equal(approved.body.controlledCommand.receipt.schemaVersion, 'controlled-command-receipt.v1');
  const eventTypes = approved.body.controlledCommand.events.map((event: any) => event.type);
  assert.ok(eventTypes.includes('approval.resolved'));
  assert.ok(eventTypes.includes('tool.invoked'));
  assert.ok(eventTypes.includes('tool.completed'));
  assert.ok(eventTypes.includes('run.succeeded'));

  const approvedReplay = await call('POST', `/api/runs/${encodeURIComponent(created.body.runId)}/approvals/${encodeURIComponent(approvalId)}/resolve`, { decision: 'approved' });
  assert.equal(approvedReplay.status, 200);
  assert.equal(approvedReplay.body.idempotent, true);

  const replay = await call('POST', `/api/commands/runs/${encodeURIComponent(created.body.runId)}/replay?projectId=project-product-builder`);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.run.status, 'succeeded');
  assert.equal(replay.body.events.filter((event: any) => event.type === 'tool.invoked').length, 1);

  const cancelled = await call('POST', '/api/commands/runs', { commandId: 'project.build_web', objective: '取消构建命令', idempotencyKey: 'controlled-http-cancel-001' });
  assert.equal(cancelled.status, 202);
  const cancellation = await call('POST', `/api/runs/${encodeURIComponent(cancelled.body.runId)}/cancel`);
  assert.equal(cancellation.status, 200);
  assert.equal(cancellation.body.status, 'cancelled');
  const cancelledReplay = await call('POST', `/api/commands/runs/${encodeURIComponent(cancelled.body.runId)}/replay`);
  assert.equal(cancelledReplay.status, 200);
  assert.equal(cancelledReplay.body.run.status, 'cancelled');

  const rejected = await call('POST', '/api/commands/runs', { commandId: 'project.test', objective: '拒绝命令', idempotencyKey: 'controlled-http-reject-001' });
  assert.equal(rejected.status, 202);
  const rejection = await call('POST', `/api/runs/${encodeURIComponent(rejected.body.runId)}/approvals/${encodeURIComponent(rejected.body.approval.id)}/resolve`, { decision: 'rejected' });
  assert.equal(rejection.status, 200);
  assert.equal(rejection.body.controlledCommand.status, 'cancelled');
  assert.equal(rejection.body.controlledCommand.run.status, 'cancelled');
});

