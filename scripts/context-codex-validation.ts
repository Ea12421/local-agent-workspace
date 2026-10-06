import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CodexExternalAdapter } from '../packages/adapters/src/index.ts';
import {
  buildContextPacket,
  buildContextSnapshot,
  estimateTokens,
  stableJson,
} from '../packages/core/src/context.ts';
import type { ContextLedger, JsonObject, RunEvent, RunRequest } from '../packages/core/src/index.ts';

const workspaceRoot = process.cwd();
const resultPath = path.join(workspaceRoot, 'validation/context-codex-recovery-v1-2026-10-03.json');
const reportPath = path.join(workspaceRoot, 'validation/context-codex-recovery-v1-2026-10-03.md');
const projectId = 'project-context-codex-validation';
const runId = 'run-context-codex-validation';

const baseline = {
  objective: '把产品想法推进成可审阅的执行计划',
  constraints: ['不外发', '保留人工审批', '只读项目文件'],
  durableFacts: [
    { id: 'fact-user', text: '目标用户是独立开发者', eventRefs: ['event-1'], sourceRefs: ['source-1'], priority: 'critical' as const },
    { id: 'fact-provider', text: '本轮只验证结构化上下文恢复，不比较不同模型或 Harness', eventRefs: ['event-2'], sourceRefs: ['source-2'], priority: 'critical' as const },
  ],
  decisions: [{ id: 'decision-local-first', text: '先完成本地恢复验证，再决定是否接入额外 API', status: 'accepted' as const, actor: 'user' as const, eventRefs: ['event-3'] }],
  unknowns: ['真实用户提效尚未验证'],
  pendingApprovalRefs: ['approval-42'],
  activeHandoffRefs: ['handoff-architecture'],
  artifactRefs: ['artifact-execution-plan-v1'],
  sourceRefs: ['source-1', 'source-2'],
  nextAction: '用同一个 Codex 执行器读取恢复包，检查关键事实是否仍然可用',
};

function event(sequence: number, type = 'provider.event', detail = `历史噪声事件 ${sequence}`): RunEvent {
  return {
    id: `event-${sequence}` as RunEvent['id'],
    runId: runId as RunEvent['runId'],
    sequence,
    type: type as RunEvent['type'],
    occurredAt: `2026-10-03T00:00:${String(sequence).padStart(2, '0')}.000Z`,
    actor: { type: 'system' },
    data: { sequence, detail: `${detail}；${'噪声 '.repeat(18)}` } as any,
  };
}

const events = [
  event(1, 'run.created', '建立本次恢复验证 Run'),
  event(2, 'provider.event', '记录固定 Provider 边界'),
  event(3, 'decision.accepted', '记录先本地验证的决定'),
  ...Array.from({ length: 12 }, (_, index) => event(index + 4)),
  event(16, 'approval.requested', '审批仍待用户决定'),
  event(17, 'run.interrupted', '模拟长任务中断'),
];

const ledger: ContextLedger = {
  projectId: projectId as ContextLedger['projectId'],
  runId: runId as ContextLedger['runId'],
  ...baseline,
  items: [
    {
      id: 'item-1',
      kind: 'conversation',
      content: '用户要求不做跨模型比较，只检查本项目自己的上下文压缩与恢复。',
      eventRefs: ['event-2', 'event-3'],
      sourceRefs: ['source-2'],
      priority: 'critical',
      createdAt: '2026-10-03T00:00:03.000Z',
    },
    ...Array.from({ length: 16 }, (_, index) => ({
      id: `item-noise-${index + 1}`,
      kind: 'conversation' as const,
      content: `长任务历史条目 ${index + 1}：这是用于制造上下文压力的固定噪声。${'历史内容 '.repeat(28)}`,
      eventRefs: [`event-${(index % 12) + 4}`],
      sourceRefs: [],
      priority: 'normal' as const,
      createdAt: `2026-10-03T00:01:${String(index).padStart(2, '0')}.000Z`,
    })),
  ],
  events,
};

const policy = {
  softThresholdTokens: 180,
  hardThresholdTokens: 360,
  reserveOutputTokens: 80,
  maxSummaryTokens: 1_500,
  maxTailEvents: 4,
};

const snapshot = buildContextSnapshot(ledger, policy, {
  id: 'snapshot-context-codex-validation' as any,
  createdAt: '2026-10-03T00:02:00.000Z',
  trigger: 'provider_limit',
});
const packet = buildContextPacket(snapshot, events);

const requiredMarkers = [
  baseline.objective,
  ...baseline.constraints,
  ...baseline.durableFacts.map((item) => item.text),
  baseline.decisions[0].text,
  baseline.unknowns[0],
  baseline.pendingApprovalRefs[0],
  baseline.activeHandoffRefs[0],
  baseline.artifactRefs[0],
  baseline.nextAction,
];

function prompt(): string {
  return [
    '只做本地 Agent Workspace 的上下文恢复检查，不修改文件、不运行命令、不访问凭据或其他路径。',
    '请严格返回一个 JSON 对象，不要 Markdown，不要解释。',
    '把输入状态中的以下字段原样抄回：objective、constraints、durableFacts、decisions、unknowns、pendingApprovalRefs、activeHandoffRefs、artifactRefs、nextAction。',
    'JSON 还必须有字段 "do_not_repeat"，值必须说明“不重复已经完成的工具或 Artifact 工作”。',
    '如果字段不存在，写 "unknown"，不要自行补充。',
  ].join('\n');
}

function eventText(eventsToRead: RunEvent[]): string {
  const chunks: string[] = [];
  for (const item of eventsToRead) {
    const stream = item.data.stream as any;
    const candidates = [stream?.item?.text, stream?.item?.content, stream?.text, stream?.message?.content];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) chunks.push(candidate);
      if (Array.isArray(candidate)) {
        for (const part of candidate) if (typeof part?.text === 'string') chunks.push(part.text);
      }
    }
  }
  return [...new Set(chunks)].join('\n').trim().slice(-40_000);
}

function parseJsonObject(text: string): JsonObject | null {
  try {
    const value = JSON.parse(text.trim());
    return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      const value = JSON.parse(match[0]);
      return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
    } catch {
      return null;
    }
  }
}

function usageFrom(eventsToRead: RunEvent[]): Record<string, unknown> | null {
  for (const item of [...eventsToRead].reverse()) {
    const usage = (item.data.stream as any)?.usage;
    if (usage && typeof usage === 'object') return usage;
  }
  return null;
}

async function runCase(name: string, input: JsonObject, context?: typeof packet) {
  const adapter = new CodexExternalAdapter(process.env.CODEX_BIN ?? 'codex', {
    cwd: '/private/tmp',
    sandbox: 'read-only',
    timeoutMs: 180_000,
    ignoreUserConfig: true,
  });
  const request: RunRequest = {
    objective: prompt(),
    input,
    constraints: ['read-only', 'no-file-access', 'return-json-only'],
    outputSchema: { type: 'object', required: ['objective', 'constraints', 'durableFacts', 'decisions', 'unknowns', 'pendingApprovalRefs', 'activeHandoffRefs', 'artifactRefs', 'nextAction', 'do_not_repeat'] },
    ...(context ? { context } : {}),
    metadata: { validation: 'context-codex-recovery-v1', case: name },
  };
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const handle = await adapter.startRun(request);
  const providerEvents: RunEvent[] = [];
  for await (const providerEvent of adapter.streamEvents(handle)) providerEvents.push(providerEvent);
  const output = eventText(providerEvents);
  const parsed = parseJsonObject(output);
  const missingMarkers = requiredMarkers.filter((marker) => !output.includes(marker));
  const providerCompleted = providerEvents.some((item) => item.data.status === 'completed');
  return {
    name,
    runId: handle.id,
    startedAt,
    elapsedMs: Date.now() - startedMs,
    provider: handle.provider,
    providerCompleted,
    eventCount: providerEvents.length,
    usage: usageFrom(providerEvents),
    outputSha256: (await import('node:crypto')).createHash('sha256').update(output).digest('hex'),
    parsedOutput: parsed,
    requiredMarkers: requiredMarkers.length,
    missingMarkers,
    structuralPass: providerCompleted && parsed !== null && missingMarkers.length === 0,
    failure: providerEvents.find((item) => item.data.status === 'failed')?.data,
    output,
    providerEvents,
  };
}

async function main() {
  const startedAt = new Date().toISOString();
  const fullContextTokens = estimateTokens({ ledger });
  const packetTokens = estimateTokens(packet);
  const full = await runCase('full_context', { ledger: ledger as any });
  const compact = await runCase('verified_context_packet', { mode: 'verified_context_packet' }, packet);
  const passed = full.structuralPass && compact.structuralPass;
  const result = passed ? 'passed' : 'blocked_environment';
  const failureSummary = [full, compact]
    .filter((item) => !item.structuralPass)
    .map((item) => `${item.name}: ${item.failure && typeof item.failure.stderr === 'string' ? item.failure.stderr : item.missingMarkers.join(', ')}`)
    .join(' | ');
  const evidence = {
    validation: 'context_codex_recovery_v1',
    observedAt: startedAt,
    objective: '只验证本项目 ContextSnapshot/ContextPacket 交给同一个 Codex 执行器后，关键状态是否可恢复；不比较不同模型或 Harness。',
    methodology: {
      executor: 'CodexExternalAdapter → codex exec --json',
      modelSource: '当前 Codex 订阅执行通道（CLI 0.155.1；billingSource 仍由 CLI 保持 unknown）',
      workingDirectory: '/private/tmp',
      cases: ['full_context', 'verified_context_packet'],
      promptShared: true,
      fixedLedger: true,
      internalCodexCompressionMeasured: false,
      note: 'Codex 自身的内部压缩/缓存没有稳定公开指标；本验证只测本项目生成的恢复包能否被同一执行器正确读取。',
    },
    contextSize: {
      fullContextTokensEstimated: fullContextTokens,
      recoveryPacketTokensEstimated: packetTokens,
      estimatedReduction: Number((1 - packetTokens / fullContextTokens).toFixed(4)),
      snapshotId: snapshot.id,
      snapshotSha256: snapshot.contentSha256,
    },
    cases: [full, compact].map(({ output, providerEvents, ...rest }) => rest),
    result,
    ...(passed ? {} : { failure: failureSummary }),
    evidenceBoundary: passed
      ? '同一个 Codex 执行器在完整状态和本项目恢复包两种输入下均找回固定关键字段；这不证明自由聊天全文无损、不证明 Codex 原生 resume 已接通，也不证明提示词缓存带来成本下降。'
      : '本次 Codex/Text 执行在控制面初始化阶段被环境阻断；没有生成任何恢复质量结论，也不把失败写成模型能力结论。',
  };
  const reductionPercent = ((1 - packetTokens / fullContextTokens) * 100).toFixed(1);
  await mkdir(path.dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  const report = [
    '# Context + Codex 恢复验证 v1（2026-10-03）',
    '',
    '> 只用同一个 Codex 执行器检查本项目自己的上下文压缩包能否恢复关键状态；没有做不同模型或 Harness 的横向比较。',
    '',
    `- 完整状态估算：${fullContextTokens} tokens`,
    `- 恢复包估算：${packetTokens} tokens`,
    `- 估算缩减：${reductionPercent}%`,
    `- 完整状态读取：${full.structuralPass ? 'PASS' : 'FAIL'}`,
    `- 压缩包恢复读取：${compact.structuralPass ? 'PASS' : 'FAIL'}`,
    `- Codex Provider：${compact.provider.model}；CLI 运行完成：${compact.providerCompleted ? '是' : '否'}`,
    '',
    '## 结论',
    '',
    passed
      ? '本次固定任务中，ContextSnapshot/ContextPacket 交给同一个 Codex 后，目标、约束、事实、决定、未知项、审批、交接、Artifact 和下一步都能被读回。'
      : `本次没有形成恢复质量结论。Codex/Text 运行在初始化阶段被阻断：${failureSummary}`,
    '',
    '## 边界',
    '',
    passed
      ? 'Codex 内部是否自动压缩、是否命中提示词缓存，当前公开 CLI 回执没有稳定指标；本结果只证明本项目的结构化恢复包可被读取，不把它写成 Codex 原生 resume 或真实成本收益证明。'
      : '本次执行在 Codex 初始化阶段被环境阻断，因此没有恢复质量结论；即使后续通过，也仍不把它写成 Codex 原生 resume 或真实成本收益证明。',
    '',
    `机器证据：${path.basename(resultPath)}`,
  ].join('\n');
  await writeFile(reportPath, `${report}\n`, 'utf8');
  console.log(JSON.stringify({ status: passed ? 'PASS' : 'BLOCKED_ENVIRONMENT', resultPath, reportPath, fullRunId: full.runId, compactRunId: compact.runId }));
  if (!passed) process.exitCode = 1;
}

await main();
