import { strict as assert } from 'node:assert';
import test from 'node:test';
import { buildContextPacket, buildContextSnapshot, verifyContextSnapshot, type ContextLedger, type ContextPolicy, type ProjectId, type RunEvent, type RunId } from './index.ts';

const projectId = 'project_context_multi' as ProjectId;
const runId = 'run_context_multi' as RunId;
const policy: ContextPolicy = { softThresholdTokens: 120, hardThresholdTokens: 240, reserveOutputTokens: 40, maxSummaryTokens: 1000, maxTailEvents: 3 };

function events(count: number): RunEvent[] {
  return Array.from({ length: count }, (_, index) => {
    const sequence = index + 1;
    return { id: `event-${sequence}` as RunEvent['id'], runId, sequence, type: sequence === 1 ? 'run.created' : 'provider.event', occurredAt: `2026-10-03T00:00:${String(sequence).padStart(2, '0')}.000Z`, actor: { type: 'system' }, data: { sequence } };
  });
}

function ledger(currentEvents: RunEvent[]): ContextLedger {
  return {
    projectId,
    runId,
    objective: '把产品想法推进成可审阅的执行计划',
    constraints: ['不外发', '保留人工审批', '只读项目文件'],
    durableFacts: [{ id: 'fact-user', text: '目标用户是独立开发者', eventRefs: ['event-1'], sourceRefs: ['source-1'], priority: 'critical' }],
    decisions: [{ id: 'decision-scope', text: '先做本地 MVP，再评估云端协作', status: 'accepted', actor: 'user', eventRefs: ['event-2'] }],
    unknowns: ['真实用户提效尚未验证'],
    pendingApprovalRefs: ['approval-1'],
    activeHandoffRefs: ['handoff-architecture'],
    artifactRefs: ['artifact-product-brief'],
    sourceRefs: ['source-1'],
    nextAction: '等待用户确认技术方案',
    items: [],
    events: currentEvents,
  };
}

test('three sequential context snapshots preserve structured continuity and parent links', () => {
  let parentSnapshotId: string | undefined;
  const allEvents = events(8);
  for (let pass = 1; pass <= 3; pass += 1) {
    const coveredEvents = allEvents.slice(0, pass * 2 + 2);
    const snapshot = buildContextSnapshot(ledger(coveredEvents), policy, {
      id: `snapshot-${pass}` as any,
      parentSnapshotId: parentSnapshotId as any,
      createdAt: `2026-10-03T00:01:0${pass}.000Z`,
      trigger: pass === 1 ? 'threshold' : 'provider_limit',
    });
    assert.deepEqual(verifyContextSnapshot(snapshot, coveredEvents, projectId, runId), []);
    const packet = buildContextPacket(snapshot, coveredEvents);
    assert.equal(packet.snapshot.summary.objective, '把产品想法推进成可审阅的执行计划');
    assert.deepEqual(packet.snapshot.summary.constraints, ['不外发', '保留人工审批', '只读项目文件']);
    assert.equal(packet.snapshot.summary.durableFacts[0]?.text, '目标用户是独立开发者');
    assert.equal(packet.snapshot.summary.decisions[0]?.status, 'accepted');
    assert.equal(packet.snapshot.summary.nextAction, '等待用户确认技术方案');
    if (parentSnapshotId) assert.equal(snapshot.parentSnapshotId, parentSnapshotId);
    parentSnapshotId = snapshot.id;
  }
});
