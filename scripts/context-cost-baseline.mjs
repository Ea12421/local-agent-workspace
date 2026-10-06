import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildContextPacket, buildContextSnapshot, shouldCompact } from '../packages/core/src/context.ts';
import { buildModelRequestEnvelope } from '../packages/adapters/src/provider-request.ts';
import { normalizeDeepSeekChatResponse } from '../packages/adapters/src/provider-envelope.ts';

const validationPath = 'validation/context-cost-baseline-v1-2026-10-03.json';
const projectId = 'project-context-cost';
const runId = 'run-context-cost';
const policy = {
  softThresholdTokens: 100,
  hardThresholdTokens: 160,
  reserveOutputTokens: 20,
  maxSummaryTokens: 600,
  maxTailEvents: 2,
};
const events = [1, 2, 3, 4].map((sequence) => ({
  id: `event-${sequence}`,
  runId,
  sequence,
  type: sequence === 1 ? 'run.created' : 'provider.event',
  occurredAt: `2026-01-01T00:00:0${sequence}.000Z`,
  actor: { type: 'system' },
  data: { sequence },
}));
const ledger = {
  projectId,
  runId,
  objective: '持续推进 Product Builder',
  constraints: ['不外发', '保留人工审批'],
  durableFacts: [{ id: 'fact-1', text: '用户是独立开发者', eventRefs: ['event-1'], sourceRefs: [], priority: 'critical' }],
  decisions: [{ id: 'decision-1', text: '先验证单 Bot，再判断多 Bot', status: 'accepted', actor: 'user', eventRefs: ['event-2'] }],
  unknowns: ['真实用户基线未知'],
  pendingApprovalRefs: ['approval-1'],
  activeHandoffRefs: ['handoff-1'],
  artifactRefs: ['artifact-1'],
  sourceRefs: ['source-1'],
  nextAction: '完成一次 replay',
  items: [{ id: 'item-1', kind: 'conversation', content: '最近的用户决定', eventRefs: ['event-4'], sourceRefs: [], priority: 'important', createdAt: '2026-01-01T00:00:04.000Z' }],
  events,
};

assert.equal(shouldCompact(99, policy), 'none');
assert.equal(shouldCompact(100, policy), 'soft');
assert.equal(shouldCompact(140, policy), 'hard');
const snapshot = buildContextSnapshot(ledger, policy, {
  id: 'snapshot-context-cost',
  createdAt: '2026-01-01T00:01:00.000Z',
  trigger: 'threshold',
});
const packet = buildContextPacket(snapshot, events);
assert.deepEqual(packet.tailEvents.map((event) => event.sequence), [3, 4]);

const baseRequest = {
  input: {},
  constraints: ['必须引用来源'],
};
const first = buildModelRequestEnvelope({
  requestId: 'request-context-cost-1',
  runId,
  request: { ...baseRequest, objective: '第一条目标' },
  tools: [{ name: 'filesystem.read', description: 'read', inputSchema: { type: 'object' }, permissionTier: 'read_only' }],
  cachePolicy: { mode: 'opportunistic' },
});
const objectiveChanged = buildModelRequestEnvelope({
  requestId: 'request-context-cost-2',
  runId,
  request: { ...baseRequest, objective: '第二条目标' },
  tools: [{ name: 'filesystem.read', description: 'read', inputSchema: { type: 'object' }, permissionTier: 'read_only' }],
  cachePolicy: { mode: 'opportunistic' },
});
const constraintChanged = buildModelRequestEnvelope({
  requestId: 'request-context-cost-3',
  runId,
  request: { ...baseRequest, objective: '第一条目标', constraints: ['禁止外发'] },
  tools: [{ name: 'filesystem.read', description: 'read', inputSchema: { type: 'object' }, permissionTier: 'read_only' }],
  cachePolicy: { mode: 'opportunistic' },
});
assert.equal(first.cachePolicy.stablePrefixSha256, objectiveChanged.cachePolicy.stablePrefixSha256);
assert.notEqual(first.cachePolicy.stablePrefixSha256, constraintChanged.cachePolicy.stablePrefixSha256);

const normalized = normalizeDeepSeekChatResponse({
  requestId: 'request-context-cost-4',
  provider: { harness: 'deepseek-http', provider: 'deepseek', model: 'deepseek-reasoner', authMode: 'api_key', billingSource: 'api', isMock: false },
  payload: {
    model: 'deepseek-reasoner',
    choices: [{ finish_reason: 'stop', message: { content: '完成', reasoning_content: '保留回放字段。' } }],
    usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25, prompt_cache_hit_tokens: 12, prompt_cache_miss_tokens: 8 },
  },
});
assert.equal(normalized.providerFields?.reasoning_content, '保留回放字段。');
assert.equal(normalized.promptCache.status, 'hit');
assert.equal(normalized.promptCache.providerReported, true);
assert.equal(normalized.usage.cachedInputTokens, 12);
assert.equal(normalized.usage.estimatedCostCents, undefined);

const evidence = {
  validation: 'context_cost_baseline_v1',
  observedAt: '2026-10-03T00:00:00+08:00',
  checks: {
    compactionThresholds: 'soft/hard thresholds reserve output tokens',
    snapshot: { schemaVersion: snapshot.schemaVersion, contentSha256: snapshot.contentSha256, tailEventIds: snapshot.tailEventIds, packetRestoresSameRun: /same logical Run/.test(packet.continuationInstruction) },
    stablePrefix: { objectiveDoesNotChangeHash: true, constraintChangesHash: true, localHashIsComparisonKeyOnly: true },
    providerReplay: { reasoningContentPreserved: true, cacheReceiptProviderReported: true, cachedInputTokens: 12, cost: 'unknown_without_provider_cost' },
  },
  evidenceBoundary: '这是离线契约和可重跑基线，不代表长期缓存命中、成本下降、模型质量或真人提效。',
};
await mkdir('validation', { recursive: true });
await writeFile(validationPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(`context-cost baseline passed: ${validationPath}`);
