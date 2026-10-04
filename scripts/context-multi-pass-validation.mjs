import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  buildContextPacket,
  buildContextSnapshot,
  verifyContextSnapshot,
} from '../packages/core/src/context.ts';

const validationPath = 'validation/context-multi-pass-v1-2026-10-03.json';
const projectId = 'project-context-multi-pass';
const runId = 'run-context-multi-pass';
const policy = {
  softThresholdTokens: 120,
  hardThresholdTokens: 240,
  reserveOutputTokens: 40,
  maxSummaryTokens: 1_000,
  maxTailEvents: 3,
};

const baseline = {
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
};

function event(sequence, type = 'provider.event') {
  return {
    id: `event-${sequence}`,
    runId,
    sequence,
    type,
    occurredAt: `2026-10-03T00:00:${String(sequence).padStart(2, '0')}.000Z`,
    actor: { type: 'system' },
    data: { sequence },
  };
}

function makeLedger(events) {
  return {
    projectId,
    runId,
    ...baseline,
    items: [{ id: 'item-recent', kind: 'conversation', content: '用户确认先保留人工审批', eventRefs: ['event-3'], sourceRefs: [], priority: 'important', createdAt: '2026-10-03T00:00:03.000Z' }],
    events,
  };
}

const allEvents = [event(1, 'run.created'), event(2, 'approval.requested'), event(3), event(4), event(5), event(6), event(7), event(8)];
const snapshots = [];
let parentSnapshotId;
for (let pass = 1; pass <= 3; pass += 1) {
  const snapshot = buildContextSnapshot(makeLedger(allEvents.slice(0, pass * 2 + 2)), policy, {
    id: `snapshot-context-multi-pass-${pass}`,
    parentSnapshotId,
    createdAt: `2026-10-03T00:01:0${pass}.000Z`,
    trigger: pass === 1 ? 'threshold' : 'provider_limit',
  });
  const coveredEvents = allEvents.slice(0, pass * 2 + 2);
  assert.deepEqual(verifyContextSnapshot(snapshot, coveredEvents, projectId, runId), []);
  const packet = buildContextPacket(snapshot, coveredEvents);
  assert.equal(packet.snapshot.projectId, projectId);
  assert.equal(packet.snapshot.runId, runId);
  assert.equal(packet.snapshot.summary.objective, baseline.objective);
  assert.deepEqual(packet.snapshot.summary.constraints, baseline.constraints);
  assert.deepEqual(packet.snapshot.summary.durableFacts, baseline.durableFacts);
  assert.deepEqual(packet.snapshot.summary.decisions, baseline.decisions);
  assert.deepEqual(packet.snapshot.summary.unknowns, baseline.unknowns);
  assert.deepEqual(packet.snapshot.summary.pendingApprovalRefs, baseline.pendingApprovalRefs);
  assert.deepEqual(packet.snapshot.summary.activeHandoffRefs, baseline.activeHandoffRefs);
  assert.deepEqual(packet.snapshot.summary.artifactRefs, baseline.artifactRefs);
  assert.equal(packet.snapshot.summary.nextAction, baseline.nextAction);
  assert.match(packet.continuationInstruction, /same logical Run/);
  if (pass > 1) assert.equal(snapshot.parentSnapshotId, parentSnapshotId);
  snapshots.push({ pass, snapshot, packet });
  parentSnapshotId = snapshot.id;
}

const corrupted = { ...snapshots[2].snapshot, summary: { ...snapshots[2].snapshot.summary, nextAction: '伪造的下一步' } };
assert.ok(verifyContextSnapshot(corrupted, allEvents, projectId, runId).includes('content_hash_mismatch'));

const evidence = {
  validation: 'context_multi_pass_v1',
  observedAt: '2026-10-03T00:00:00+08:00',
  passes: snapshots.map(({ pass, snapshot, packet }) => ({
    pass,
    snapshotId: snapshot.id,
    parentSnapshotId: snapshot.parentSnapshotId ?? null,
    covers: snapshot.covers,
    tailEventIds: snapshot.tailEventIds,
    packetRestoresSameRun: packet.snapshot.runId === runId,
    preserved: {
      objective: packet.snapshot.summary.objective === baseline.objective,
      constraints: JSON.stringify(packet.snapshot.summary.constraints) === JSON.stringify(baseline.constraints),
      durableFacts: JSON.stringify(packet.snapshot.summary.durableFacts) === JSON.stringify(baseline.durableFacts),
      decisions: JSON.stringify(packet.snapshot.summary.decisions) === JSON.stringify(baseline.decisions),
      unknowns: JSON.stringify(packet.snapshot.summary.unknowns) === JSON.stringify(baseline.unknowns),
      approvals: JSON.stringify(packet.snapshot.summary.pendingApprovalRefs) === JSON.stringify(baseline.pendingApprovalRefs),
      handoffs: JSON.stringify(packet.snapshot.summary.activeHandoffRefs) === JSON.stringify(baseline.activeHandoffRefs),
      artifacts: JSON.stringify(packet.snapshot.summary.artifactRefs) === JSON.stringify(baseline.artifactRefs),
      nextAction: packet.snapshot.summary.nextAction === baseline.nextAction,
    },
  })),
  tamperDetection: 'content_hash_mismatch',
  result: 'passed',
  evidenceBoundary: '证明结构化 ContextLedger 在连续三次快照/恢复中保留目标、约束、事实、决定、未知项、审批、交接、Artifact 和下一步；不证明自由文本没有遗漏，也不证明恢复后模型生成质量与未压缩路径相同。',
};

await mkdir('validation', { recursive: true });
await writeFile(validationPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(`context multi-pass validation passed: ${validationPath}`);
