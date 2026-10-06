import test from 'node:test';
import assert from 'node:assert/strict';
import { detectProductBuilderConflicts, runProductBuilder, validateHandoffGraph } from './index.ts';

test('Product Builder emits structured handoffs, evidence and an approval boundary', () => {
  const result = runProductBuilder({ projectId: 'p1' as any, runId: 'r1', idea: '在每日内容规划中使用的 AI 视频工具', user: '独立开发者' });
  assert.equal(result.status, 'waiting_user');
  assert.equal(result.handoffs.length, 4);
  assert.ok(result.handoffs.every((item) => item.status === 'succeeded' && item.depth === 1));
  assert.equal(result.handoffValidation.valid, true);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.artifactRelease, 'blocked');
  assert.deepEqual(result.releaseBlockers, ['approval_pending']);
  assert.deepEqual(result.finalArtifactIds, []);
  assert.equal(result.approval.status, 'pending');
  assert.equal(result.artifacts.length, 5);
  assert.ok(result.artifacts.every((item) => item.sourceRefs.length > 0));
  assert.equal(result.checkpoints.length, 10);
  assert.equal(new Set(result.checkpoints.map((item) => item.idempotencyKey)).size, 10);
  assert.ok(result.checkpoints.every((item) => item.resumeBehavior === 'skip_if_recorded'));
  assert.equal(result.receipt.isMock, true);
  assert.deepEqual(result.clarifications.map((item) => item.status), ['provided', 'provided', 'unknown', 'unknown']);
  assert.deepEqual(result.plan.unresolvedClarificationIds, []);
  assert.deepEqual(result.plan.steps.map((item) => item.id), ['clarify', 'research', 'product', 'architecture', 'evaluation', 'approval', 'release']);
  assert.deepEqual(result.plan.steps.map((item) => item.status), ['ready', 'ready', 'ready', 'ready', 'ready', 'waiting_user', 'blocked']);
});

test('Product Builder keeps missing target user as an explicit blocking unknown', () => {
  const result = runProductBuilder({ projectId: 'p1' as any, runId: 'r-user-unknown', idea: '在团队项目中验证一个 AI 产品' });
  const user = result.clarifications.find((item) => item.id === 'target_user');
  assert.equal(user?.status, 'unknown');
  assert.equal(user?.blocking, true);
  assert.deepEqual(user?.sourceRefs, ['source-user-input']);
  assert.deepEqual(result.plan.unresolvedClarificationIds, ['target_user']);
  assert.deepEqual(result.releaseBlockers, ['clarification_pending', 'approval_pending']);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources.some((item) => item.title?.includes('目标用户')), false);
});

test('Product Builder keeps missing scenario as an explicit blocking unknown', () => {
  const result = runProductBuilder({ projectId: 'p1' as any, runId: 'r-scenario-unknown', idea: '做一个 AI 产品', user: '独立开发者' });
  const scenario = result.clarifications.find((item) => item.id === 'primary_scenario');
  assert.equal(scenario?.status, 'unknown');
  assert.equal(scenario?.blocking, true);
  assert.deepEqual(result.plan.unresolvedClarificationIds, ['primary_scenario']);
  assert.equal(result.plan.steps.find((item) => item.id === 'research')?.status, 'blocked');
});

test('Product Builder rejects an empty idea before creating a source', () => {
  assert.throws(() => runProductBuilder({ projectId: 'p1' as any, runId: 'r-empty', idea: '   ' }), /idea_required/);
});

test('Handoff graph rejects cycles and excessive depth', () => {
  const first = { id: 'h1', parentHandoffId: 'h2', depth: 1 } as any;
  const second = { id: 'h2', parentHandoffId: 'h1', depth: 9 } as any;
  const validation = validateHandoffGraph([first, second], 8);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.code === 'cycle_detected'));
  assert.ok(validation.issues.some((issue) => issue.code === 'depth_exceeded'));
});

test('Conflicting artifacts and missing refs block release evidence', () => {
  const sources = [{ id: 's1' } as any];
  const handoffs = [{ id: 'h1', inputRefs: ['missing'] } as any];
  const artifacts = [
    { id: 'a1', kind: 'product_brief', content: 'one', sourceRefs: ['s1'] },
    { id: 'a2', kind: 'product_brief', content: 'two', sourceRefs: ['missing-source'] },
  ] as any;
  const conflicts = detectProductBuilderConflicts(sources, handoffs, artifacts);
  assert.ok(conflicts.some((item) => item.code === 'duplicate_artifact_kind'));
  assert.ok(conflicts.some((item) => item.code === 'missing_source_ref'));
  assert.ok(conflicts.some((item) => item.code === 'missing_handoff_input_ref'));
});

test('Product Builder checkpoint keys remain stable across replay', () => {
  const input = { projectId: 'p1' as any, runId: 'r1', idea: '在同一工作流程中验证同一想法', user: '独立开发者' };
  const first = runProductBuilder(input);
  const second = runProductBuilder(input);
  assert.deepEqual(
    first.checkpoints.map((item) => item.idempotencyKey),
    second.checkpoints.map((item) => item.idempotencyKey),
  );
  assert.deepEqual(first.plan, second.plan);
  assert.deepEqual(first.clarifications, second.clarifications);
});
