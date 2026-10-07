import type { ExecutionPlan } from '../../../packages/core/src/orchestrator.ts';
import type { RunEvent } from '../../../packages/core/src/types.ts';
import { runtimeStore } from './runtime.ts';

export type OrchestratorAnswer = {
  planId: string;
  content: string;
  sourceRefs: string[];
  unknowns: string[];
  nextSteps: string[];
  isModelGenerated: false;
};

function compact(value: unknown, max = 420): string {
  if (value === undefined || value === null) return '';
  const text = typeof value === 'string' ? value.trim() : JSON.stringify(value);
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function runIdFromRefs(refs: string[]): string | undefined {
  const ref = refs.find((item) => item.startsWith('run:'));
  return ref?.slice('run:'.length) || undefined;
}

function stepEvent(events: RunEvent[], stepId: string): RunEvent | undefined {
  return [...events].reverse().find((event) => event.type === 'plan.step_completed' && String(event.data.stepId ?? '') === stepId);
}

/**
 * Convert completed tool runs into a user-readable answer. This is intentionally
 * deterministic and marked isModelGenerated=false; a later provider synthesis
 * can consume the same refs without changing the persistence contract.
 */
export async function buildOrchestratorAnswer(plan: ExecutionPlan, events: RunEvent[]): Promise<OrchestratorAnswer> {
  const sourceRefs = [...new Set(plan.steps.flatMap((step) => step.outputRefs))];
  const unknowns: string[] = [];
  const lines: string[] = [`已完成：${plan.objective}`, '', '执行结果：'];
  for (const step of plan.steps) {
    const completed = step.status === 'succeeded';
    const childRunId = runIdFromRefs(step.outputRefs);
    const childRun = childRunId ? await runtimeStore.getRun(childRunId as any) : undefined;
    const event = stepEvent(events, String(step.id));
    const isMock = Boolean(event?.data?.isMock) || step.outputRefs.some((ref) => ref.startsWith('fixture:'));
    const output = compact((childRun?.result as any)?.output);
    const status = completed ? '已完成' : step.status;
    const detail = output ? `：${output}` : '';
    lines.push(`- ${step.order}. ${step.objective}：${status}${detail}`);
    if (!completed) unknowns.push(`步骤“${step.objective}”没有完成，当前状态是 ${step.status}。`);
    if (completed && !childRunId && !isMock) unknowns.push(`步骤“${step.objective}”只有执行引用，未找到可读取的工具运行结果。`);
    if (completed && isMock) unknowns.push(`步骤“${step.objective}”使用了本地演示数据，不能证明真实模型或真实工具质量。`);
  }
  if (sourceRefs.length) lines.push('', `可追溯来源：${sourceRefs.join('、')}`);
  if (unknowns.length) {
    lines.push('', '仍需注意：');
    for (const item of unknowns) lines.push(`- ${item}`);
  }
  const nextSteps = plan.steps.some((step) => step.status !== 'succeeded')
    ? ['先处理未完成步骤或审批，再继续本计划。']
    : ['如果需要更完整的结论，下一步可让真实 Provider 阅读这些来源并生成带引用的自然语言总结。'];
  lines.push('', '下一步：', ...nextSteps.map((item) => `- ${item}`));
  return { planId: String(plan.id), content: lines.join('\n'), sourceRefs, unknowns, nextSteps, isModelGenerated: false };
}

export function planAnswerFromEvent(event: RunEvent): OrchestratorAnswer | undefined {
  if (event.type !== 'plan.answer_created') return undefined;
  const data = event.data as Record<string, unknown>;
  if (typeof data.planId !== 'string' || typeof data.content !== 'string') return undefined;
  return {
    planId: data.planId,
    content: data.content,
    sourceRefs: Array.isArray(data.sourceRefs) ? data.sourceRefs.map(String) : [],
    unknowns: Array.isArray(data.unknowns) ? data.unknowns.map(String) : [],
    nextSteps: Array.isArray(data.nextSteps) ? data.nextSteps.map(String) : [],
    isModelGenerated: data.isModelGenerated === true ? false : false,
  };
}
