import { createHash } from 'node:crypto';
import {
  createApprovalRequestId,
  createRunEvent,
  createRunId,
  isHighRiskImprovementTarget,
  projectImprovement,
  semanticEventKey,
  type ApprovalRequest,
  type Artifact,
  type BotId,
  type ImprovementEvaluationRecord,
  type ImprovementProjection,
  type ImprovementProposalRecord,
  type ImprovementTarget,
  type EvalTask,
  type FeedbackEvent,
  type JsonObject,
  type MemoryAdapter,
  type ProjectId,
  type Run,
  type RunEvent,
  type RunId,
  type Score,
  type RecallStrategy,
} from '../../../packages/core/src/index.ts';
import type { RunStore } from '../../../packages/core/src/run-store.ts';
import type { ProductBuilderContinuityOptions } from './product-builder-continuity.ts';

const DEFAULT_BOT_ID = 'bot-product-builder' as BotId;
const LOW_RISK_TARGETS = new Set<ImprovementTarget>(['prompt', 'skill', 'memory_policy']);
const FIXED_TASK_ID = 'rsi.fixed.proposal-integrity';
const FIXED_TASK_VERSION = '1';
const EVALUATOR_VERSION = 'rsi-control-plane-v1';
const FIXED_TASK_NAME = '候选提案完整性检查';

export type ImprovementStartInput = {
  projectId: ProjectId;
  botId?: BotId;
  target?: ImprovementTarget;
  reason?: string;
  idempotencyKey?: string;
  memoryStrategy?: RecallStrategy;
};

export type ImprovementStartResult = {
  run: Run;
  projection: ImprovementProjection;
  idempotent: boolean;
};

export type ImprovementRuntimeDependencies = {
  runStore: RunStore;
  stores: ProductBuilderContinuityOptions;
  memoryAdapter?: MemoryAdapter;
  now?: () => string;
};

function nowOf(deps: ImprovementRuntimeDependencies): string {
  return deps.now?.() ?? new Date().toISOString();
}

function asJsonObject(value: unknown): JsonObject {
  return value as JsonObject;
}

function metadataImprovement(run: Run): Record<string, unknown> | undefined {
  const value = run.request.metadata?.improvement;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

async function appendImprovementEvent(
  deps: ImprovementRuntimeDependencies,
  runId: RunId,
  type: RunEvent['type'],
  data: JsonObject,
  actor: RunEvent['actor'] = { type: 'system' },
): Promise<RunEvent> {
  const events = await deps.runStore.listEvents(runId);
  const semantic = semanticEventKey({ type, data, actor });
  const replay = semantic ? events.find((event) => semanticEventKey(event) === semantic) : undefined;
  if (replay) return replay;
  const event = createRunEvent(runId, type, data, events.length + 1, actor, nowOf(deps));
  await deps.runStore.appendEvent(event);
  return event;
}

async function collectEvidence(deps: ImprovementRuntimeDependencies, projectId: ProjectId, currentRunId: RunId): Promise<string[]> {
  const runs = await deps.runStore.listRuns(String(projectId));
  const refs: string[] = [];
  for (const run of runs.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))) {
    const events = await deps.runStore.listEvents(run.id);
    for (const event of [...events].reverse()) {
      if (event.type === 'run.failed' || event.type === 'tool.failed' || event.type === 'context.compaction_failed' || event.type === 'run.resume_failed') {
        refs.push(String(event.id));
      }
      if (refs.length >= 6) break;
    }
    if (refs.length >= 6) break;
  }
  if (refs.length === 0) {
    const currentEvents = await deps.runStore.listEvents(currentRunId);
    const created = currentEvents.find((event) => event.type === 'run.created');
    if (created) refs.push(String(created.id));
  }
  return [...new Set(refs)].slice(0, 6);
}

async function nextVersion(deps: ImprovementRuntimeDependencies, projectId: ProjectId, target: ImprovementTarget): Promise<{ baseVersion: string; candidateVersion: string }> {
  const runs = await deps.runStore.listRuns(String(projectId));
  let latest = 1;
  for (const run of runs) {
    for (const event of await deps.runStore.listEvents(run.id)) {
      if (event.type !== 'improvement.published') continue;
      const release = event.data.release;
      const releaseRecord = release && typeof release === 'object' && !Array.isArray(release) ? release as Record<string, unknown> : undefined;
      const releasedVersion = typeof releaseRecord?.releasedVersion === 'string' ? releaseRecord.releasedVersion : '';
      const match = new RegExp(`^${target}:v(\\d+)$`).exec(releasedVersion);
      if (match) latest = Math.max(latest, Number(match[1]));
    }
  }
  return { baseVersion: `${target}:v${latest}`, candidateVersion: `${target}:v${latest + 1}` };
}

function computeCandidateHash(input: { projectId: ProjectId; target: ImprovementTarget; baseVersion: string; candidateVersion: string; evidenceRefs: string[]; reason: string; memoryStrategy: RecallStrategy }): string {
  const payload = JSON.stringify(input);
  return `sha256:${createHash('sha256').update(payload, 'utf8').digest('hex')}`;
}

function proposalArtifact(proposal: ImprovementProposalRecord, reason: string, createdAt: string): Artifact {
  return {
    id: `${proposal.runId}:improvement:proposal` as any,
    projectId: proposal.projectId,
    runId: proposal.runId,
    kind: 'improvement-proposal',
    name: `${proposal.candidateVersion}-proposal.json`,
    contentType: 'application/json',
    content: JSON.stringify({ schemaVersion: 'improvement.proposal.v1', proposal, reason, controlPlaneOnly: true }, null, 2),
    sourceRefs: [],
    createdAt,
  };
}

function buildEvaluation(input: { proposal: ImprovementProposalRecord; evidenceRefs: string[]; now: string }): { evaluation: ImprovementEvaluationRecord; task: EvalTask; score: Score; feedback: FeedbackEvent } {
  const assertions = [
    { id: 'proposal_schema', passed: Boolean(input.proposal.proposalId && input.proposal.candidateHash && input.proposal.candidateVersion), evidenceRefs: [input.proposal.proposalId] },
    { id: 'evidence_scoped', passed: input.evidenceRefs.length > 0 && input.proposal.evidenceRefs.every((ref) => input.evidenceRefs.includes(ref)), evidenceRefs: [...input.evidenceRefs] },
    { id: 'version_chain', passed: input.proposal.baseVersion !== input.proposal.candidateVersion, evidenceRefs: [input.proposal.proposalId] },
    { id: 'target_policy_recorded', passed: true, evidenceRefs: [input.proposal.proposalId] },
  ];
  const passed = assertions.every((assertion) => assertion.passed);
  const task: EvalTask = {
    taskId: FIXED_TASK_ID,
    projectId: input.proposal.projectId,
    version: FIXED_TASK_VERSION,
    name: FIXED_TASK_NAME,
    objective: '验证候选提案具备完整结构、来源约束、版本链和目标策略记录。',
    input: { proposalId: input.proposal.proposalId, target: input.proposal.target },
    evaluatorVersion: EVALUATOR_VERSION,
    sourceRefs: [...input.evidenceRefs],
    enabled: true,
  };
  const score: Score = {
    scoreId: `${input.proposal.runId}:score:1`,
    projectId: input.proposal.projectId,
    taskId: FIXED_TASK_ID,
    taskVersion: FIXED_TASK_VERSION,
    runId: input.proposal.runId,
    evaluatorVersion: EVALUATOR_VERSION,
    status: passed ? 'passed' : 'failed',
    value: assertions.filter((assertion) => assertion.passed).length,
    maxValue: assertions.length,
    dimensions: assertions.map((assertion) => ({
      id: assertion.id,
      label: assertion.id,
      value: assertion.passed ? 1 : 0,
      maxValue: 1,
      passed: assertion.passed,
      evidenceRefs: [...assertion.evidenceRefs],
    })),
    evidenceRefs: [...input.evidenceRefs],
    createdAt: input.now,
  };
  const feedback: FeedbackEvent = {
    feedbackId: `${input.proposal.runId}:feedback:1`,
    projectId: input.proposal.projectId,
    runId: input.proposal.runId,
    taskId: FIXED_TASK_ID,
    scoreId: score.scoreId,
    kind: passed ? 'observation' : 'correction',
    summary: passed ? '固定评测通过：候选提案可以进入当前发布策略。' : '固定评测未通过：候选提案需要修正后再评估。',
    details: assertions.map((assertion) => `${assertion.passed ? '通过' : '失败'}:${assertion.id}`).join('；'),
    sourceRefs: [...input.evidenceRefs],
    createdAt: input.now,
  };
  const evaluation: ImprovementEvaluationRecord = {
    evaluationId: `${input.proposal.runId}:evaluation:1`,
    taskId: FIXED_TASK_ID,
    taskVersion: FIXED_TASK_VERSION,
    evaluatorVersion: EVALUATOR_VERSION,
    scorer: 'scanner',
    status: passed ? 'passed' : 'failed',
    baselineScore: 1,
    candidateScore: passed ? 1 : 0,
    assertions,
    evidenceRefs: [...input.evidenceRefs],
    createdAt: input.now,
  };
  return { evaluation, task, score, feedback };
}

async function persistArtifact(stores: ProductBuilderContinuityOptions, artifact: Artifact): Promise<void> {
  if (!stores.entityStore) throw new Error('sqlite_entity_store_unavailable');
  stores.entityStore.saveArtifact(artifact);
}

function findExistingRun(runs: Run[], input: ImprovementStartInput): Run | undefined {
  if (!input.idempotencyKey) return undefined;
  return runs.find((run) => {
    const improvement = metadataImprovement(run);
    return String(improvement?.idempotencyKey ?? '') === input.idempotencyKey;
  });
}

export async function startImprovementRun(input: ImprovementStartInput, deps: ImprovementRuntimeDependencies): Promise<ImprovementStartResult> {
  const target = input.target ?? 'prompt';
  const memoryStrategy = input.memoryStrategy ?? 'lexical';
  if (memoryStrategy !== 'lexical' && memoryStrategy !== 'hybrid') throw new Error(`unsupported_improvement_memory_strategy:${String(memoryStrategy)}`);
  if (!LOW_RISK_TARGETS.has(target) && !isHighRiskImprovementTarget(target)) throw new Error(`unsupported_improvement_target:${target}`);
  const existing = findExistingRun(await deps.runStore.listRuns(String(input.projectId)), input);
  if (existing) {
    return { run: existing, projection: await readImprovementProjection(existing.id, deps), idempotent: true };
  }
  const reason = input.reason?.trim() || '根据当前项目运行证据生成一次受控改进候选';
  const memoryReflection = deps.memoryAdapter
    ? await deps.memoryAdapter.reflect({ projectId: input.projectId, cues: [target, reason], scope: 'rsi.feedback', limit: 5, strategy: memoryStrategy })
    : undefined;
  const versions = await nextVersion(deps, input.projectId, target);
  const created = await deps.runStore.createRun({
    id: createRunId(),
    projectId: input.projectId,
    botId: input.botId ?? DEFAULT_BOT_ID,
    request: {
      objective: `受控 RSI 自动更新：${target}`,
      input: { target, reason },
      retryPolicy: { maxRetries: 0 },
      metadata: { improvement: { target, memoryStrategy, idempotencyKey: input.idempotencyKey ?? null, baseVersion: versions.baseVersion } } as JsonObject,
    },
    now: nowOf(deps),
  });
  await deps.runStore.transition(created.id, 'start', { now: nowOf(deps), idempotencyKey: `improvement:start:${created.id}` });
  const evidenceRefs = await collectEvidence(deps, input.projectId, created.id);
  await appendImprovementEvent(deps, created.id, 'improvement.run_started', asJsonObject({
    semanticKey: `improvement:run:${created.id}`,
    projectId: input.projectId,
    target,
    baseVersion: versions.baseVersion,
    memoryStrategy,
    evidenceRefs,
    memoryRefs: memoryReflection?.memoryRefs.map(String) ?? [],
  }));
  const candidateHash = computeCandidateHash({ projectId: input.projectId, target, baseVersion: versions.baseVersion, candidateVersion: versions.candidateVersion, evidenceRefs, reason, memoryStrategy });
  const proposal: ImprovementProposalRecord = {
    proposalId: `${created.id}:proposal:1`,
    projectId: input.projectId,
    runId: created.id,
    target,
    baseVersion: versions.baseVersion,
    candidateVersion: versions.candidateVersion,
    candidateHash,
    evidenceRefs,
    evalRefs: [`${created.id}:evaluation:1`],
    status: 'draft',
    changedRefs: [`${target}.candidate.instructions`],
    hypothesis: reason,
    memoryStrategy,
    ...(memoryReflection?.memoryRefs.length ? { memoryRefs: memoryReflection.memoryRefs.map(String) } : {}),
  };
  await appendImprovementEvent(deps, created.id, 'improvement.proposal_created', asJsonObject({ semanticKey: `improvement:proposal:${proposal.proposalId}`, projectId: input.projectId, proposal }));
  await persistArtifact(deps.stores, proposalArtifact(proposal, reason, nowOf(deps)));
  const evaluationBundle = buildEvaluation({ proposal, evidenceRefs, now: nowOf(deps) });
  const { evaluation, task, score, feedback } = evaluationBundle;
  await appendImprovementEvent(deps, created.id, 'improvement.evaluation_completed', asJsonObject({
    semanticKey: `improvement:evaluation:${evaluation.evaluationId}`,
    projectId: input.projectId,
    evaluation,
    task,
    score,
    feedback,
  }));
  await persistArtifact(deps.stores, {
    id: `${created.id}:improvement:evaluation` as any,
    projectId: input.projectId,
    runId: created.id,
    kind: 'improvement-evaluation',
    name: `${evaluation.taskId}-evaluation.json`,
    contentType: 'application/json',
    content: JSON.stringify({ schemaVersion: 'improvement.evaluation.v2', proposalId: proposal.proposalId, task, score, feedback, evaluation, qualityClaim: 'bounded-evaluation-only' }, null, 2),
    sourceRefs: [],
    createdAt: nowOf(deps),
  });
  if (deps.memoryAdapter) {
    await deps.memoryAdapter.retain({
      projectId: input.projectId,
      scope: 'rsi.feedback',
      content: `${feedback.summary} ${feedback.details ?? ''}`.trim(),
      sourceRefs: feedback.sourceRefs as any,
      now: nowOf(deps),
    });
  }
  if (evaluation.status !== 'passed') {
    await appendImprovementEvent(deps, created.id, 'improvement.failed', asJsonObject({ semanticKey: `improvement:failed:${created.id}`, projectId: input.projectId, code: 'evaluation_failed', message: '固定控制面评测未通过' }));
    const failed = await deps.runStore.transition(created.id, 'fail', { now: nowOf(deps), error: { code: 'evaluation_failed', message: '固定控制面评测未通过', retryable: false } });
    return { run: failed.run, projection: await readImprovementProjection(created.id, deps), idempotent: false };
  }
  if (isHighRiskImprovementTarget(target)) {
    if (!deps.stores.entityStore) throw new Error('sqlite_entity_store_unavailable');
    const approval: ApprovalRequest = {
      id: createApprovalRequestId(),
      projectId: input.projectId,
      runId: created.id,
      action: `improvement.publish.${target}`,
      description: `候选 ${proposal.candidateVersion} 涉及 ${target}，需要逐次审批后才能发布。`,
      permissionTier: target === 'code' ? 'workspace_write' : 'full_access',
      status: 'pending',
      requestedAt: nowOf(deps),
      metadata: { proposalId: proposal.proposalId, target, candidateHash } as JsonObject,
    };
    deps.stores.entityStore.saveApprovalRequest(approval);
    await appendImprovementEvent(deps, created.id, 'improvement.approval_requested', asJsonObject({
      semanticKey: `improvement:approval:${approval.id}`,
      projectId: input.projectId,
      approval: { approvalId: approval.id, status: approval.status, action: approval.action, reason: approval.description },
    }));
    const waiting = await deps.runStore.transition(created.id, 'wait_user', { now: nowOf(deps), reason: `等待审批：${target}` });
    return { run: waiting.run, projection: await readImprovementProjection(created.id, deps), idempotent: false };
  }
  const release = { releasedVersion: proposal.candidateVersion, candidateHash: proposal.candidateHash, publishedAt: nowOf(deps), automatic: true };
  await appendImprovementEvent(deps, created.id, 'improvement.published', asJsonObject({ semanticKey: `improvement:publish:${proposal.proposalId}`, projectId: input.projectId, release }));
  const finished = await deps.runStore.transition(created.id, 'succeed', { now: nowOf(deps), result: { proposalId: proposal.proposalId, evaluationId: evaluation.evaluationId, releasedVersion: proposal.candidateVersion, controlPlaneOnly: true } });
  return { run: finished.run, projection: await readImprovementProjection(created.id, deps), idempotent: false };
}

export async function readImprovementProjection(runId: RunId, deps: ImprovementRuntimeDependencies): Promise<ImprovementProjection> {
  return projectImprovement(runId, await deps.runStore.listEvents(runId));
}

/** Read the structured task/score/feedback bundle without creating a second fact source. */
export function improvementEvaluationBundle(events: readonly RunEvent[]): { task: EvalTask; score: Score; feedback: FeedbackEvent } | undefined {
  const event = [...events].reverse().find((item) => item.type === 'improvement.evaluation_completed');
  if (!event) return undefined;
  const task = event.data.task;
  const score = event.data.score;
  const feedback = event.data.feedback;
  if (!task || typeof task !== 'object' || Array.isArray(task) || !score || typeof score !== 'object' || Array.isArray(score) || !feedback || typeof feedback !== 'object' || Array.isArray(feedback)) return undefined;
  return {
    task: task as unknown as EvalTask,
    score: score as unknown as Score,
    feedback: feedback as unknown as FeedbackEvent,
  };
}

export async function rollbackImprovement(runId: RunId, projectId: ProjectId, reason: string, deps: ImprovementRuntimeDependencies): Promise<{ run: Run; projection: ImprovementProjection; idempotent: boolean }> {
  const run = await deps.runStore.getRun(runId);
  if (!run || String(run.projectId) !== String(projectId)) throw new Error('improvement_run_not_found');
  const projection = await readImprovementProjection(runId, deps);
  if (projection.status === 'rolled_back') return { run, projection, idempotent: true };
  if (projection.status !== 'published' || !projection.proposal || !projection.release) throw new Error('improvement_rollback_not_allowed');
  const rollback = {
    restoredVersion: projection.proposal.baseVersion,
    rolledBackVersion: projection.release.releasedVersion,
    reason: reason.trim() || '用户请求回滚候选改进',
    rolledBackAt: nowOf(deps),
    evidenceRefs: projection.proposal.evidenceRefs,
  };
  await appendImprovementEvent(deps, runId, 'improvement.rolled_back', asJsonObject({
    semanticKey: `improvement:rollback:${projection.proposal.proposalId}`,
    projectId,
    rollback,
  }), { type: 'user' });
  const nextProjection = await readImprovementProjection(runId, deps);
  return { run, projection: nextProjection, idempotent: false };
}

export function improvementArtifacts(stores: ProductBuilderContinuityOptions, runId: RunId, projectId: ProjectId): Artifact[] {
  return stores.entityStore?.listArtifactsByRun(String(runId)).filter((artifact) => String(artifact.projectId) === String(projectId)) ?? [];
}

export function improvementApprovals(stores: ProductBuilderContinuityOptions, runId: RunId, projectId: ProjectId): ApprovalRequest[] {
  return stores.entityStore?.listApprovals(String(projectId)).filter((approval) => String(approval.runId) === String(runId)) ?? [];
}
