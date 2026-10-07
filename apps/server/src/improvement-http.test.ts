import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'local-agent-workspace-rsi-http-'));
process.env.AGENT_WORKSPACE_DATA_DIR = dataDir;
const { handleRequest } = await import('./index.ts');

test.after(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

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

test('RSI HTTP contract publishes, deduplicates, reads, rolls back and gates high-risk targets', async () => {
  const projectId = 'project-rsi-http';
  const first = await call('POST', '/api/improvements/run', {
    projectId,
    target: 'prompt',
    reason: 'HTTP 固定任务验证候选可回放',
    idempotencyKey: 'http-rsi-once',
    memoryStrategy: 'hybrid',
  });
  assert.equal(first.status, 201);
  assert.equal(first.body.projection.status, 'published');
  assert.equal(first.body.idempotent, false);
  assert.equal(first.body.approvals.length, 0);
  assert.ok(first.body.artifacts.some((artifact: any) => artifact.kind === 'improvement-proposal'));
  assert.equal(first.body.evaluationBundle.score.status, 'passed');
  assert.equal(first.body.evaluationBundle.score.value, 4);
  assert.match(first.body.evaluationBundle.feedback.summary, /固定评测通过/);
  assert.equal(first.body.projection.proposal.memoryStrategy, 'hybrid');

  const invalidStrategy = await call('POST', '/api/improvements/run', {
    projectId,
    target: 'prompt',
    memoryStrategy: 'unsupported',
    idempotencyKey: 'http-rsi-invalid-memory-strategy',
  });
  assert.equal(invalidStrategy.status, 400);
  assert.equal(invalidStrategy.body.error, 'invalid_memory_strategy');

  const repeat = await call('POST', '/api/improvements/run', {
    projectId,
    target: 'prompt',
    reason: '同一幂等键不得再次产生副作用',
    idempotencyKey: 'http-rsi-once',
  });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body.idempotent, true);
  assert.equal(repeat.body.runId, first.body.runId);

  const read = await call('GET', `/api/improvements/${encodeURIComponent(first.body.runId)}?projectId=${encodeURIComponent(projectId)}`);
  assert.equal(read.status, 200);
  assert.equal(read.body.projection.status, 'published');
  assert.equal(read.body.evaluationBundle.task.taskId, 'rsi.fixed.proposal-integrity');
  assert.ok(read.body.events.some((event: any) => event.type === 'improvement.run_started' && event.data.memoryStrategy === 'hybrid'));
  assert.ok(read.body.events.some((event: any) => event.type === 'improvement.published'));

  const rollback = await call('POST', `/api/improvements/${encodeURIComponent(first.body.runId)}/rollback`, {
    projectId,
    reason: 'HTTP 回滚验证',
  });
  assert.equal(rollback.status, 200);
  assert.equal(rollback.body.projection.status, 'rolled_back');
  assert.equal(rollback.body.projection.rollback.restoredVersion, 'prompt:v1');

  const wrongProject = await call('GET', `/api/improvements/${encodeURIComponent(first.body.runId)}?projectId=project-other`);
  assert.equal(wrongProject.status, 404);

  const highRisk = await call('POST', '/api/improvements/run', {
    projectId,
    target: 'provider',
    reason: 'HTTP 验证高风险候选必须审批',
    idempotencyKey: 'http-rsi-provider-once',
  });
  assert.equal(highRisk.status, 202);
  assert.equal(highRisk.body.run.status, 'waiting_user');
  assert.equal(highRisk.body.projection.status, 'waiting_user');
  assert.equal(highRisk.body.projection.approval.status, 'pending');
  assert.equal(highRisk.body.projection.release, undefined);
  assert.equal(highRisk.body.approvals.length, 1);
});
