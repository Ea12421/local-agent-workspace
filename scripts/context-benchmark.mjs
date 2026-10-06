import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import {
  buildContextPacket,
  buildContextSnapshot,
  estimateTokens,
  sha256,
  shouldCompact,
  stableJson,
  verifyContextSnapshot,
} from '../packages/core/src/context.ts';

const evidencePath = 'validation/context-benchmark-v1-2026-10-03.json';
const reportPath = 'validation/context-benchmark-v1-2026-10-03.md';
const projectId = 'project-context-benchmark';
const runId = 'run-context-benchmark';
const historySizes = [10, 30, 100, 300];
const maxPasses = 20;
const policy = {
  softThresholdTokens: 400,
  hardThresholdTokens: 800,
  reserveOutputTokens: 100,
  maxSummaryTokens: 2_000,
  maxTailEvents: 4,
};

const baseline = {
  objective: '把一个产品想法推进成可审阅的执行计划',
  constraints: ['不外发', '保留人工审批', '只读项目文件'],
  durableFacts: [{ id: 'fact-user', text: '目标用户是独立开发者', eventRefs: ['event-1'], sourceRefs: ['source-1'], priority: 'critical' }],
  decisions: [{ id: 'decision-local-first', text: '先保持本地优先，不启用全局监听', status: 'accepted', actor: 'user', eventRefs: ['event-2'] }],
  unknowns: ['真实用户提效尚未验证'],
  pendingApprovalRefs: ['approval-1'],
  activeHandoffRefs: ['handoff-product-to-architecture'],
  artifactRefs: ['artifact-product-brief'],
  sourceRefs: ['source-1'],
  nextAction: '等待用户确认技术方案',
};

const fieldChecks = [
  ['objective', (summary) => summary.objective === baseline.objective],
  ['constraints', (summary) => stableJson(summary.constraints) === stableJson(baseline.constraints)],
  ['durableFacts', (summary) => stableJson(summary.durableFacts) === stableJson(baseline.durableFacts)],
  ['decisions', (summary) => stableJson(summary.decisions) === stableJson(baseline.decisions)],
  ['unknowns', (summary) => stableJson(summary.unknowns) === stableJson(baseline.unknowns)],
  ['approvals', (summary) => stableJson(summary.pendingApprovalRefs) === stableJson(baseline.pendingApprovalRefs)],
  ['handoffs', (summary) => stableJson(summary.activeHandoffRefs) === stableJson(baseline.activeHandoffRefs)],
  ['artifacts', (summary) => stableJson(summary.artifactRefs) === stableJson(baseline.artifactRefs)],
  ['sources', (summary) => stableJson(summary.sourceRefs) === stableJson(baseline.sourceRefs)],
  ['nextAction', (summary) => summary.nextAction === baseline.nextAction],
];

function event(sequence) {
  return {
    id: `event-${sequence}`,
    runId,
    sequence,
    type: sequence === 1 ? 'run.created' : sequence === 2 ? 'approval.requested' : 'provider.event',
    occurredAt: `2026-10-03T00:00:${String(sequence % 60).padStart(2, '0')}.000Z`,
    actor: { type: 'system' },
    data: {
      sequence,
      detail: `历史事件 ${sequence}：这是用于测量长上下文包大小的固定噪声，不代表真实模型生成内容。${'x'.repeat(80)}`,
    },
  };
}

function item(sequence) {
  return {
    id: `item-${sequence}`,
    kind: sequence % 3 === 0 ? 'tool_result' : 'conversation',
    content: `历史条目 ${sequence}：用于模拟经过多轮交互后仍需保留事件引用的内容。${'y'.repeat(100)}`,
    eventRefs: [`event-${sequence}`],
    sourceRefs: sequence === 1 ? ['source-1'] : [],
    priority: sequence === 1 ? 'critical' : 'normal',
    createdAt: `2026-10-03T00:00:${String(sequence % 60).padStart(2, '0')}.000Z`,
  };
}

function makeLedger(eventCount) {
  const events = Array.from({ length: eventCount }, (_, index) => event(index + 1));
  return {
    projectId,
    runId,
    ...baseline,
    items: events.map((entry) => item(entry.sequence)),
    events,
  };
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return Number(sorted[index].toFixed(3));
}

function milliseconds(fn) {
  const started = performance.now();
  const value = fn();
  return { value, elapsedMs: performance.now() - started };
}

function renderPercent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

const sizeRows = [];
const depthRows = [];
let lastSnapshot;
let lastEvents;

for (const eventCount of historySizes) {
  const ledger = makeLedger(eventCount);
  const rawTokens = estimateTokens(ledger);
  const rawBytes = Buffer.byteLength(stableJson(ledger), 'utf8');
  const buildTimes = [];
  const restoreTimes = [];
  const snapshots = [];
  let parentSnapshotId;

  for (let pass = 1; pass <= maxPasses; pass += 1) {
    const built = milliseconds(() => buildContextSnapshot(ledger, policy, {
      id: `snapshot-context-benchmark-${eventCount}-${pass}`,
      parentSnapshotId,
      createdAt: `2026-10-03T01:${String(eventCount).padStart(2, '0')}:${String(pass).padStart(2, '0')}.000Z`,
      trigger: pass === 1 ? 'threshold' : 'provider_limit',
    }));
    const snapshot = built.value;
    buildTimes.push(built.elapsedMs);
    const restored = milliseconds(() => {
      assert.deepEqual(verifyContextSnapshot(snapshot, ledger.events, projectId, runId), []);
      return buildContextPacket(snapshot, ledger.events);
    });
    const packet = restored.value;
    restoreTimes.push(restored.elapsedMs);
    const fields = Object.fromEntries(fieldChecks.map(([name, check]) => [name, check(snapshot.summary)]));
    const fieldsRetained = Object.values(fields).filter(Boolean).length;
    assert.equal(fieldsRetained, fieldChecks.length);
    if (pass > 1) assert.equal(snapshot.parentSnapshotId, parentSnapshotId);
    snapshots.push({ snapshot, packet, fields });
    parentSnapshotId = snapshot.id;
  }

  const representative = snapshots.at(-1);
  const packetTokens = estimateTokens(representative.packet);
  const packetBytes = Buffer.byteLength(stableJson(representative.packet), 'utf8');
  const reduction = 1 - (packetTokens / rawTokens);
  sizeRows.push({
    historyEvents: eventCount,
    repeatedPasses: maxPasses,
    fullLedgerTokens: rawTokens,
    packetTokens,
    reduction,
    fullLedgerBytes: rawBytes,
    packetBytes,
    fieldsRetained: `${fieldChecks.length}/${fieldChecks.length}`,
    buildP50Ms: percentile(buildTimes, 50),
    buildP95Ms: percentile(buildTimes, 95),
    restoreP50Ms: percentile(restoreTimes, 50),
    restoreP95Ms: percentile(restoreTimes, 95),
    parentChainValid: snapshots.every((entry, index) => index === 0 ? !entry.snapshot.parentSnapshotId : entry.snapshot.parentSnapshotId === snapshots[index - 1].snapshot.id),
  });
  lastSnapshot = representative.snapshot;
  lastEvents = ledger.events;

  for (const pass of [1, 3, 10, 20]) {
    const entry = snapshots[pass - 1];
    depthRows.push({
      historyEvents: eventCount,
      pass,
      fieldsRetained: `${Object.values(entry.fields).filter(Boolean).length}/${fieldChecks.length}`,
      restoreSuccess: verifyContextSnapshot(entry.snapshot, ledger.events, projectId, runId).length === 0,
      parentLink: pass === 1 ? !entry.snapshot.parentSnapshotId : entry.snapshot.parentSnapshotId === snapshots[pass - 2].snapshot.id,
      packetTokens: estimateTokens(entry.packet),
    });
  }
}

const tampered = { ...lastSnapshot, summary: { ...lastSnapshot.summary, nextAction: '篡改后的下一步' } };
const tamperErrors = verifyContextSnapshot(tampered, lastEvents, projectId, runId);
const gapErrors = verifyContextSnapshot(lastSnapshot, lastEvents.slice(1), projectId, runId);
assert.ok(tamperErrors.includes('content_hash_mismatch'));
assert.ok(gapErrors.includes('event_range_gap'));
assert.equal(shouldCompact(policy.softThresholdTokens - 1, policy), 'none');
assert.equal(shouldCompact(policy.softThresholdTokens, policy), 'soft');
assert.equal(shouldCompact(policy.hardThresholdTokens - policy.reserveOutputTokens, policy), 'hard');

const evidence = {
  validation: 'context_benchmark_v1',
  observedAt: '2026-10-03T00:00:00+08:00',
  methodology: {
    provider: 'none',
    mode: 'deterministic_control_plane',
    historySizes,
    repeatedPasses: maxPasses,
    packetDefinition: 'ContextSnapshot summary + recent tail events + continuation instruction',
    fullContextDefinition: 'ContextLedger including structured fields, items and all events',
    tokenEstimator: 'project estimateTokens (UTF-8 bytes / 4, rounded up); not provider billable tokens',
  },
  sizeRows,
  depthRows,
  integrity: {
    fields: fieldChecks.map(([name]) => name),
    maxFieldRetention: true,
    parentChainValid: sizeRows.every((row) => row.parentChainValid),
    tamperDetected: tamperErrors.includes('content_hash_mismatch'),
    eventGapDetected: gapErrors.includes('event_range_gap'),
    thresholdChecksPassed: true,
  },
  result: 'passed',
  interpretation: '结构化恢复包相对于完整 ContextLedger 的体积缩减和连续快照保留率已量化；这些是控制面指标，不等于真实模型语义质量、Provider 原生 resume、提示词缓存命中或成本下降。',
};

const reportLines = [
  '# Context Benchmark v1（2026-10-03）',
  '',
  '> 这是确定性控制面基准：测量完整 ContextLedger 与恢复 ContextPacket 的估算体积、结构化字段保留、连续快照链和校验耗时。它不调用模型，也不把 token 估算当作 API 账单。',
  '',
  '## 本次结论',
  '',
  `- 历史规模：${historySizes.join(' / ')} 个事件。`,
  `- 连续快照：每种规模 ${maxPasses} 次。`,
  `- 关键结构化字段：${fieldChecks.length}/${fieldChecks.length} 保留。`,
  `- 父快照链：${sizeRows.every((row) => row.parentChainValid) ? '通过' : '失败'}。`,
  `- 篡改检测：${tamperErrors.includes('content_hash_mismatch') ? '通过' : '失败'}；事件缺口检测：${gapErrors.includes('event_range_gap') ? '通过' : '失败'}。`,
  '',
  '## 按历史规模',
  '',
  '| 历史事件 | 完整账本估算 token | 恢复包估算 token | 估算缩减 | 字段保留 | 构建 P95(ms) | 恢复 P95(ms) |',
  '|---:|---:|---:|---:|---:|---:|---:|',
  ...sizeRows.map((row) => `| ${row.historyEvents} | ${row.fullLedgerTokens} | ${row.packetTokens} | ${renderPercent(row.reduction)} | ${row.fieldsRetained} | ${row.buildP95Ms} | ${row.restoreP95Ms} |`),
  '',
  '## 连续次数抽样',
  '',
  '| 历史事件 | 快照次数 | 字段保留 | 恢复成功 | 父链正确 | 恢复包估算 token |',
  '|---:|---:|---:|:---:|:---:|---:|',
  ...depthRows.map((row) => `| ${row.historyEvents} | ${row.pass} | ${row.fieldsRetained} | ${row.restoreSuccess ? '是' : '否'} | ${row.parentLink ? '是' : '否'} | ${row.packetTokens} |`),
  '',
  '## 不能从本表推出的结论',
  '',
  '- 不能推出真实模型在压缩后仍然保持同等自然语言质量。',
  '- 不能推出 Provider 一定命中提示词缓存或成本下降。',
  '- 不能推出任意自由聊天全文都能无损保留。',
  '- 不能推出 DeepSeek/Codex 的原生 resume 已经接通。',
  '',
  `原始证据：\`${evidencePath}\`。运行命令：\`npm run context:benchmark\`。`,
];

await mkdir('validation', { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
await writeFile(reportPath, `${reportLines.join('\n')}\n`, 'utf8');
console.log(`context benchmark passed: ${evidencePath}`);
console.log(`context benchmark report: ${reportPath}`);
