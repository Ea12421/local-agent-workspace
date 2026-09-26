import { randomUUID } from 'node:crypto';
import type {
  ApprovalRequest, Artifact, BotId, HandoffEnvelope, ProjectId, Source,
} from '../../core/src/index.ts';

export type ProductBuilderInput = {
  projectId: ProjectId;
  runId: string;
  idea: string;
  user?: string;
  constraints?: string[];
};

export type ProductBuilderResult = {
  status: 'waiting_user';
  handoffs: HandoffEnvelope[];
  sources: Source[];
  artifacts: Artifact[];
  approval: ApprovalRequest;
  checkpoints: ProductBuilderCheckpoint[];
  executionPlan: string[];
  receipt: { harness: 'fixture'; provider: 'fixture'; model: 'deterministic-product-builder'; isMock: true };
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

export function runProductBuilder(input: ProductBuilderInput): ProductBuilderResult {
  const source = { id: 'source-user-input' as Source['id'], projectId: input.projectId, uri: 'workspace://user-input', title: '用户输入', excerpt: input.idea, retrievedAt: now };
  const sourceRefs = [source.id as string];
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
  return { status: 'waiting_user', handoffs, sources: [source], artifacts: [research, product, architecture, evaluation, plan], approval, checkpoints, executionPlan: input.constraints ?? ['确认目标用户', '补充外部来源', '执行固定评测'], receipt: { harness: 'fixture', provider: 'fixture', model: 'deterministic-product-builder', isMock: true } };
}
