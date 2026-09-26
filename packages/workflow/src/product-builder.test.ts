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
  assert.equal(result.receipt.isMock, true);
});
