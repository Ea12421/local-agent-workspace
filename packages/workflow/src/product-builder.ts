import { randomUUID } from 'node:crypto';
import type {
  ApprovalRequest, Artifact, BotId, HandoffEnvelope, JsonObject, JsonValue, ProjectId, Source,
} from '../../core/src/index.ts';

export type ProductBuilderInput = {
  projectId: ProjectId;
  runId: string;
  idea: string;
  user?: string;
  constraints?: string[];
};

export type ProductBuilderClarificationStatus = 'provided' | 'unknown';

export type ProductBuilderClarification = {
  id: 'target_user' | 'primary_scenario' | 'success_metric' | 'external_evidence';
  label: string;
  value?: string;
  sourceRefs: string[];
  blocking: boolean;
  status: ProductBuilderClarificationStatus;
};

export type ProductBuilderPlanStep = {
  id: 'clarify' | 'research' | 'product' | 'architecture' | 'evaluation' | 'approval' | 'release';
  label: string;
  ownerBotId: string;
  dependsOn: string[];
  status: 'ready' | 'blocked' | 'waiting_user';
};

export type ProductBuilderPlan = {
  id: 'product-builder-plan-v1';
  steps: ProductBuilderPlanStep[];
  unresolvedClarificationIds: ProductBuilderClarification['id'][];
};

export type ProductBuilderResult = {
  status: 'waiting_user';
  handoffs: HandoffEnvelope[];
  handoffValidation: HandoffValidation;
  sources: Source[];
  artifacts: Artifact[];
  conflicts: ProductBuilderConflict[];
  releaseBlockers: string[];
  artifactRelease: 'blocked' | 'released';
  finalArtifactIds: string[];
  approval: ApprovalRequest;
  checkpoints: ProductBuilderCheckpoint[];
  clarifications: ProductBuilderClarification[];
  plan: ProductBuilderPlan;
  executionPlan: string[];
  receipt: { harness: 'fixture'; provider: 'fixture'; model: 'deterministic-product-builder'; isMock: true };
};

/**
 * Provider output that is allowed to become a Product Builder draft.
 *
 * This is deliberately separate from ProductBuilderResult: a model may propose
 * content, but the deterministic workflow remains the source of truth and an
 * approval is required before a draft can be promoted to a canonical Artifact.
 */
export type ProductBuilderProviderDraft = {
  user: string;
  scenario: string;
  pain: string;
  value: string;
  mvp: JsonValue;
  unknowns: JsonValue;
  success_metrics: JsonValue;
  source_refs: string[];
  approval_required: true;
};

export type ProductBuilderDraftValidation = {
  valid: boolean;
  errors: string[];
  draft?: ProductBuilderProviderDraft;
};

export const PRODUCT_BUILDER_DRAFT_OUTPUT_SCHEMA: JsonObject = {
  type: 'object',
  required: ['user', 'scenario', 'pain', 'value', 'mvp', 'unknowns', 'success_metrics', 'source_refs', 'approval_required'],
  properties: {
    user: { type: 'string' },
    scenario: { type: 'string' },
    pain: { type: 'string' },
    value: { type: 'string' },
    mvp: { type: 'object' },
    unknowns: { type: 'array' },
    success_metrics: { type: 'array' },
    source_refs: { type: 'array' },
    approval_required: { type: 'boolean' },
  },
  additionalProperties: false,
};

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Validate model output before it can enter the Product Builder artifact path. */
export function validateProductBuilderProviderDraft(value: unknown): ProductBuilderDraftValidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, errors: ['draft_must_be_object'] };
  const candidate = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const key of ['user', 'scenario', 'pain', 'value']) if (!nonEmptyString(candidate[key])) errors.push(`${key}_required`);
  if (!candidate.mvp || typeof candidate.mvp !== 'object' || Array.isArray(candidate.mvp)) errors.push('mvp_must_be_object');
  if (!Array.isArray(candidate.unknowns) || candidate.unknowns.length === 0) errors.push('unknowns_required');
  if (!Array.isArray(candidate.success_metrics) || candidate.success_metrics.length === 0) errors.push('success_metrics_required');
  if (!Array.isArray(candidate.source_refs) || candidate.source_refs.length === 0 || candidate.source_refs.some((item) => !nonEmptyString(item))) errors.push('source_refs_required');
  if (candidate.approval_required !== true) errors.push('approval_required_must_be_true');
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], draft: candidate as unknown as ProductBuilderProviderDraft };
}

export type HandoffValidationIssue = {
  code: 'depth_exceeded' | 'missing_parent' | 'cycle_detected';
  handoffIds: string[];
  message: string;
};

export type HandoffValidation = {
  valid: boolean;
  maxDepth: number;
  issues: HandoffValidationIssue[];
};

export type ProductBuilderConflict = {
  code: 'duplicate_artifact_kind' | 'missing_source_ref' | 'missing_handoff_input_ref';
  refs: string[];
  message: string;
};

export type ProductBuilderCheckpoint = {
  idempotencyKey: string;
  boundary: 'handoff' | 'artifact' | 'approval';
  ref: string;
  label: string;
  order: number;
  resumeBehavior: 'skip_if_recorded';
};

const bot = (id: string) => id as BotId;
const now = new Date().toISOString();

function artifact(projectId: ProjectId, runId: string, kind: string, name: string, content: string, sourceRefs: string[] = []): Artifact {
  return { id: `artifact-${randomUUID()}` as Artifact['id'], projectId, runId: runId as Artifact['runId'], kind, name, contentType: 'text/markdown', content, sourceRefs: sourceRefs as Artifact['sourceRefs'], createdAt: now };
}

function handoff(projectId: ProjectId, fromBotId: string, toBotId: string, objective: string, inputRefs: string[], outputSchema: string, approvalRequired = false): HandoffEnvelope {
  return { id: `handoff-${randomUUID()}` as HandoffEnvelope['id'], fromBotId: bot(fromBotId), toBotId: bot(toBotId), objective, inputRefs, outputSchema, constraints: ['结构化输出', '失败必须可追溯'], approvalRequired, status: 'succeeded', depth: 1, createdAt: now, updatedAt: now };
}

export function validateHandoffGraph(handoffs: HandoffEnvelope[], maxDepth = 8): HandoffValidation {
  const issues: HandoffValidationIssue[] = [];
  const byId = new Map(handoffs.map((item) => [String(item.id), item]));
  for (const item of handoffs) {
    if (item.depth < 1 || item.depth > maxDepth) {
      issues.push({ code: 'depth_exceeded', handoffIds: [String(item.id)], message: `Handoff ${item.id} exceeds maximum depth ${maxDepth}.` });
    }
    if (item.parentHandoffId && !byId.has(String(item.parentHandoffId))) {
      issues.push({ code: 'missing_parent', handoffIds: [String(item.id), String(item.parentHandoffId)], message: `Handoff ${item.id} references a missing parent.` });
    }
  }
  for (const item of handoffs) {
    const seen = new Set<string>();
    const chain: string[] = [];
    let current: HandoffEnvelope | undefined = item;
    while (current?.parentHandoffId) {
      const currentId = String(current.id);
      if (seen.has(currentId)) {
        const cycleStart = chain.indexOf(currentId);
        const cycleIds = [...chain.slice(cycleStart), currentId];
        issues.push({ code: 'cycle_detected', handoffIds: cycleIds, message: `Handoff parent cycle detected: ${cycleIds.join(' -> ')}.` });
        break;
      }
      seen.add(currentId);
      chain.push(currentId);
      current = byId.get(String(current.parentHandoffId));
      if (!current) break;
    }
  }
  const uniqueIssues = [...new Map(issues.map((issue) => [`${issue.code}:${issue.handoffIds.join(',')}`, issue])).values()];
  return { valid: uniqueIssues.length === 0, maxDepth, issues: uniqueIssues };
}

export function detectProductBuilderConflicts(
  sources: Source[],
  handoffs: HandoffEnvelope[],
  artifacts: Artifact[],
): ProductBuilderConflict[] {
  const conflicts: ProductBuilderConflict[] = [];
  const sourceIds = new Set(sources.map((source) => String(source.id)));
  const handoffIds = new Set(handoffs.map((item) => String(item.id)));
  for (const artifact of artifacts) {
    for (const sourceRef of artifact.sourceRefs) {
      if (!sourceIds.has(String(sourceRef))) conflicts.push({ code: 'missing_source_ref', refs: [String(artifact.id), String(sourceRef)], message: `Artifact ${artifact.id} references an unknown source ${sourceRef}.` });
    }
  }
  for (const item of handoffs) {
    for (const inputRef of item.inputRefs) {
      if (!sourceIds.has(String(inputRef)) && !artifacts.some((artifact) => String(artifact.id) === String(inputRef))) {
        conflicts.push({ code: 'missing_handoff_input_ref', refs: [String(item.id), String(inputRef)], message: `Handoff ${item.id} references an unknown input ${inputRef}.` });
      }
    }
  }
  const byKind = new Map<string, Artifact>();
  for (const artifact of artifacts) {
    const previous = byKind.get(artifact.kind);
    if (previous && previous.content !== artifact.content) {
      conflicts.push({ code: 'duplicate_artifact_kind', refs: [String(previous.id), String(artifact.id)], message: `Artifacts ${previous.id} and ${artifact.id} disagree on kind ${artifact.kind}.` });
    }
    byKind.set(artifact.kind, artifact);
  }
  return conflicts;
}

function hasConcreteScenario(idea: string, constraints: string[] = []): boolean {
  const text = [idea, ...constraints].join(' ');
  return /用于|帮助|让|场景|流程|工作中|项目中|每天|团队中|在[^，。；;]{1,32}(?:时|中)/.test(text);
}

function buildClarifications(input: ProductBuilderInput, sourceRef: string): ProductBuilderClarification[] {
  const user = input.user?.trim();
  const constraints = input.constraints ?? [];
  const metric = constraints.find((item) => /成功指标|指标|KPI|衡量|目标/.test(item))?.trim();
  return [
    user
      ? { id: 'target_user', label: '目标用户', value: user, sourceRefs: [sourceRef], blocking: true, status: 'provided' as const }
      : { id: 'target_user', label: '目标用户', sourceRefs: [sourceRef], blocking: true, status: 'unknown' as const },
    hasConcreteScenario(input.idea, constraints)
      ? { id: 'primary_scenario', label: '主要使用场景', value: input.idea.trim(), sourceRefs: [sourceRef], blocking: true, status: 'provided' as const }
      : { id: 'primary_scenario', label: '主要使用场景', sourceRefs: [sourceRef], blocking: true, status: 'unknown' as const },
    metric
      ? { id: 'success_metric', label: '成功指标', value: metric, sourceRefs: [sourceRef], blocking: false, status: 'provided' as const }
      : { id: 'success_metric', label: '成功指标', sourceRefs: [sourceRef], blocking: false, status: 'unknown' as const },
    { id: 'external_evidence', label: '外部证据来源', sourceRefs: [], blocking: false, status: 'unknown' as const },
  ];
}

function buildPlan(unresolvedClarificationIds: ProductBuilderClarification['id'][]): ProductBuilderPlan {
  const clarificationBlocked = unresolvedClarificationIds.length > 0;
  const steps: ProductBuilderPlanStep[] = [
    { id: 'clarify', label: '确认未知项', ownerBotId: 'bot-product-builder', dependsOn: [], status: 'ready' },
    { id: 'research', label: '补充研究来源', ownerBotId: 'bot-research', dependsOn: ['clarify'], status: clarificationBlocked ? 'blocked' : 'ready' },
    { id: 'product', label: '定义产品与 MVP', ownerBotId: 'bot-product', dependsOn: ['research'], status: clarificationBlocked ? 'blocked' : 'ready' },
    { id: 'architecture', label: '评估技术路线', ownerBotId: 'bot-architecture', dependsOn: ['product'], status: clarificationBlocked ? 'blocked' : 'ready' },
    { id: 'evaluation', label: '建立固定评测', ownerBotId: 'bot-evaluation', dependsOn: ['architecture'], status: clarificationBlocked ? 'blocked' : 'ready' },
    { id: 'approval', label: '等待用户确认', ownerBotId: 'bot-product-builder', dependsOn: ['evaluation'], status: clarificationBlocked ? 'blocked' : 'waiting_user' },
    { id: 'release', label: '释放最终产物', ownerBotId: 'bot-product-builder', dependsOn: ['approval'], status: 'blocked' },
  ];
  return { id: 'product-builder-plan-v1', steps, unresolvedClarificationIds: [...unresolvedClarificationIds] };
}

export function runProductBuilder(input: ProductBuilderInput): ProductBuilderResult {
  if (!input.idea.trim()) throw new Error('idea_required');
  const source = { id: 'source-user-input' as Source['id'], projectId: input.projectId, uri: 'workspace://user-input', title: '用户输入', excerpt: input.idea, retrievedAt: now };
  const sourceRefs = [source.id as string];
  const clarifications = buildClarifications(input, String(source.id));
  const unresolvedClarificationIds = clarifications.filter((item) => item.blocking && item.status === 'unknown').map((item) => item.id);
  const workflowPlan = buildPlan(unresolvedClarificationIds);
  const research = artifact(input.projectId, input.runId, 'research_report', 'research-report.md', `# Research\n\n当前只有用户输入这一条事实来源：\n\n- ${input.idea}\n\n需要外部研究的事实先标为未知。`, sourceRefs);
  const product = artifact(input.projectId, input.runId, 'product_brief', 'product-brief.md', `# Product Brief\n\n## 初始目标\n${input.user ?? '待确认用户'}\n\n## 想法\n${input.idea}\n\n## MVP 边界\n先验证一个最小可用场景，不自动扩大范围。`, sourceRefs);
  const architecture = artifact(input.projectId, input.runId, 'technical_proposal', 'technical-proposal.md', '# Technical Proposal\n\n建议先使用结构化单 Bot workflow，只有固定任务评测证明多 Bot 有收益时才扩展。', sourceRefs);
  const evaluation = artifact(input.projectId, input.runId, 'evaluation_plan', 'evaluation-plan.md', '# Evaluation Plan\n\n- Schema 错误不得进入正式 Artifact\n- 外部事实必须带来源或明确未知\n- 记录人工修改量、耗时和恢复能力', sourceRefs);
  const plan = artifact(input.projectId, input.runId, 'execution_plan', 'execution-plan.md', '# Execution Plan\n\n1. 确认用户与场景\n2. 补充研究来源\n3. 评审技术方案\n4. 执行固定任务评测', sourceRefs);
  const handoffs = [
    handoff(input.projectId, 'bot-product-builder', 'bot-research', '为产品想法建立事实和未知项清单', sourceRefs, 'research_report'),
    handoff(input.projectId, 'bot-product-builder', 'bot-product', '定义目标用户、场景和 MVP', [research.id], 'product_brief', true),
    handoff(input.projectId, 'bot-product-builder', 'bot-architecture', '评估实现路线与约束', [product.id], 'technical_proposal'),
    handoff(input.projectId, 'bot-product-builder', 'bot-evaluation', '把成功标准变成固定评测', [architecture.id], 'evaluation_plan'),
  ];
  const handoffValidation = validateHandoffGraph(handoffs);
  const conflicts = detectProductBuilderConflicts([source], handoffs, [research, product, architecture, evaluation, plan]);
  const approval: ApprovalRequest = { id: `approval-${randomUUID()}` as ApprovalRequest['id'], projectId: input.projectId, runId: input.runId as ApprovalRequest['runId'], action: 'confirm_product_scope', description: '确认目标用户与 MVP 范围后继续', permissionTier: 'read_only', status: 'pending', requestedAt: now };
  const checkpoints: ProductBuilderCheckpoint[] = [
    ...handoffs.map((item, index) => ({
      idempotencyKey: `${input.runId}:handoff:${item.toBotId}`,
      boundary: 'handoff' as const,
      ref: item.id as string,
      label: `交接：${item.objective}`,
      order: index + 1,
      resumeBehavior: 'skip_if_recorded' as const,
    })),
    ...[research, product, architecture, evaluation, plan].map((item, index) => ({
      idempotencyKey: `${input.runId}:artifact:${item.kind}`,
      boundary: 'artifact' as const,
      ref: item.id as string,
      label: `产物：${item.name}`,
      order: handoffs.length + index + 1,
      resumeBehavior: 'skip_if_recorded' as const,
    })),
    {
      idempotencyKey: `${input.runId}:approval:${approval.action}`,
      boundary: 'approval' as const,
      ref: approval.id as string,
      label: `审批：${approval.description}`,
      order: handoffs.length + 6,
      resumeBehavior: 'skip_if_recorded',
    },
  ];
  const artifacts = [research, product, architecture, evaluation, plan];
  const releaseBlockers = [
    ...(unresolvedClarificationIds.length > 0 ? ['clarification_pending'] : []),
    ...(approval.status === 'pending' ? ['approval_pending'] : []),
    ...(handoffValidation.valid ? [] : ['handoff_graph_invalid']),
    ...(conflicts.length > 0 ? ['unresolved_conflict'] : []),
  ];
  return {
    status: 'waiting_user',
    handoffs,
    handoffValidation,
    sources: [source],
    artifacts,
    conflicts,
    releaseBlockers,
    artifactRelease: releaseBlockers.length === 0 ? 'released' : 'blocked',
    finalArtifactIds: releaseBlockers.length === 0 ? artifacts.map((item) => String(item.id)) : [],
    approval,
    checkpoints,
    clarifications,
    plan: workflowPlan,
    executionPlan: input.constraints ?? ['确认目标用户', '补充外部来源', '执行固定评测'],
    receipt: { harness: 'fixture', provider: 'fixture', model: 'deterministic-product-builder', isMock: true },
  };
}
