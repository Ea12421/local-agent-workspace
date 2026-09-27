import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from './index.ts';

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
});
