import test from 'node:test';
import assert from 'node:assert/strict';
import { runProductBuilder } from './index.ts';

test('Product Builder emits structured handoffs, evidence and an approval boundary', () => {
  const result = runProductBuilder({ projectId: 'p1' as any, runId: 'r1', idea: '做一个 AI 视频工具', user: '独立开发者' });
  assert.equal(result.status, 'waiting_user');
  assert.equal(result.handoffs.length, 4);
  assert.ok(result.handoffs.every((item) => item.status === 'succeeded' && item.depth === 1));
  assert.equal(result.approval.status, 'pending');
  assert.equal(result.artifacts.length, 5);
  assert.ok(result.artifacts.every((item) => item.sourceRefs.length > 0));
  assert.equal(result.checkpoints.length, 10);
  assert.equal(new Set(result.checkpoints.map((item) => item.idempotencyKey)).size, 10);
  assert.ok(result.checkpoints.every((item) => item.resumeBehavior === 'skip_if_recorded'));
  assert.equal(result.receipt.isMock, true);
});

test('Product Builder checkpoint keys remain stable across replay', () => {
  const input = { projectId: 'p1' as any, runId: 'r1', idea: '同一想法' };
  const first = runProductBuilder(input);
  const second = runProductBuilder(input);
  assert.deepEqual(
    first.checkpoints.map((item) => item.idempotencyKey),
    second.checkpoints.map((item) => item.idempotencyKey),
  );
});
