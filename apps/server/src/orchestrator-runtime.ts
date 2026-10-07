import {
  readyExecutionPlanSteps,
  transitionExecutionPlan,
  transitionExecutionPlanStep,
  type ExecutionPlan,
  type ExecutionPlanStep,
  type PlanTransitionOptions,
} from '../../../packages/core/src/orchestrator.ts';
import type { EventLog } from './persistence.ts';
import {
  appendExecutionPlanCreated,
  appendExecutionPlanEvent,
  appendExecutionPlanStarted,
  appendExecutionPlanStepEvent,
} from './orchestrator-events.ts';

export type ExecutionStepResult =
  | { status: 'succeeded'; outputRefs?: string[]; data?: Record<string, unknown> }
  | { status: 'waiting_user'; reason: string; data?: Record<string, unknown> }
  | { status: 'failed'; error: string; retryable?: boolean; data?: Record<string, unknown> };

export type ExecutionPlanStore = {
  getExecutionPlan(id: string, projectId?: string): ExecutionPlan | undefined;
  saveExecutionPlan(plan: ExecutionPlan): void;
};

export type ExecutionPlanRuntime = {
  planStore: ExecutionPlanStore;
  eventLog: EventLog;
  executeStep: (step: ExecutionPlanStep, plan: ExecutionPlan) => Promise<ExecutionStepResult>;
  now?: () => string;
  /** One-off approvals are supplied by the caller and never persisted as a blanket bypass. */
  approvedStepIds?: ReadonlySet<string>;
};

export type ExecutionPlanRunResult = {
  plan: ExecutionPlan;
  executedStepIds: string[];
  skippedStepIds: string[];
  waitingReason?: string;
};

function nowOf(runtime: ExecutionPlanRuntime): string | undefined {
  return runtime.now?.();
}

function transitionOptions(runtime: ExecutionPlanRuntime): PlanTransitionOptions {
  const now = nowOf(runtime);
  return now ? { now } : {};
}

/**
 * Run a persisted plan with bounded, sequential scheduling. The executor is
 * deliberately injected: this layer decides *when* a capability may run, but
 * never bypasses ToolPolicy or ApprovalRequest.
 */
export async function executeExecutionPlan(runtime: ExecutionPlanRuntime, initial: ExecutionPlan): Promise<ExecutionPlanRunResult> {
  let plan = initial;
  const executedStepIds: string[] = [];
  const skippedStepIds = plan.steps.filter((step) => step.status === 'succeeded').map((step) => String(step.id));
  await appendExecutionPlanCreated(runtime.eventLog, plan);

  if (plan.status === 'succeeded' || plan.status === 'cancelled') return { plan, executedStepIds, skippedStepIds };
  if (plan.status === 'waiting_user') {
    const approved = plan.steps.filter((step) => step.status === 'waiting_user' && runtime.approvedStepIds?.has(String(step.id)));
    if (!approved.length) {
      return { plan, executedStepIds, skippedStepIds, ...(plan.waitingReason ? { waitingReason: plan.waitingReason } : {}) };
    }
    for (const step of approved) plan = transitionExecutionPlanStep(plan, step.id, 'resume', transitionOptions(runtime));
    plan = transitionExecutionPlan(plan, 'resume', transitionOptions(runtime));
    runtime.planStore.saveExecutionPlan(plan);
    await appendExecutionPlanEvent(runtime.eventLog, plan, 'plan.resumed', { data: { approvedStepIds: approved.map((step) => String(step.id)) } });
  }
  if (plan.status === 'queued') {
    plan = transitionExecutionPlan(plan, 'start', transitionOptions(runtime));
    runtime.planStore.saveExecutionPlan(plan);
    await appendExecutionPlanStarted(runtime.eventLog, plan);
  }

  for (let iteration = 0; iteration < plan.maxSteps; iteration += 1) {
    const ready = readyExecutionPlanSteps(plan);
    if (!ready.length) {
      if (plan.steps.every((step) => step.status === 'succeeded')) {
        plan = transitionExecutionPlan(plan, 'succeed', transitionOptions(runtime));
        runtime.planStore.saveExecutionPlan(plan);
        await appendExecutionPlanEvent(runtime.eventLog, plan, 'plan.succeeded');
        return { plan, executedStepIds, skippedStepIds };
      }
      const waiting = plan.steps.find((step) => step.status === 'waiting_user');
      if (waiting) {
        const reason = plan.waitingReason ?? waiting.error ?? '等待用户决定';
        return { plan, executedStepIds, skippedStepIds, waitingReason: reason };
      }
      plan = transitionExecutionPlan(plan, 'fail', { ...transitionOptions(runtime), error: '计划没有可继续执行的步骤，可能存在未满足的依赖。' });
      runtime.planStore.saveExecutionPlan(plan);
      await appendExecutionPlanEvent(runtime.eventLog, plan, 'plan.failed', { data: { error: plan.error ?? 'plan_deadlock' } });
      return { plan, executedStepIds, skippedStepIds };
    }

    const step = ready[0]!;
    if (step.approvalRequired && !runtime.approvedStepIds?.has(String(step.id))) {
      plan = transitionExecutionPlanStep(plan, step.id, 'wait_user', { ...transitionOptions(runtime), reason: `步骤“${step.objective}”需要逐次审批。` });
      plan = transitionExecutionPlan(plan, 'wait_user', { ...transitionOptions(runtime), reason: `步骤“${step.objective}”需要逐次审批。` });
      runtime.planStore.saveExecutionPlan(plan);
      const blockedStep = plan.steps.find((candidate) => String(candidate.id) === String(step.id))!;
      await appendExecutionPlanStepEvent(runtime.eventLog, plan, 'plan.step_blocked', blockedStep, { reason: plan.waitingReason ?? 'approval_required' });
      await appendExecutionPlanEvent(runtime.eventLog, plan, 'plan.waiting_user');
      return { plan, executedStepIds, skippedStepIds, waitingReason: plan.waitingReason };
    }

    plan = transitionExecutionPlanStep(plan, step.id, 'start', transitionOptions(runtime));
    runtime.planStore.saveExecutionPlan(plan);
    const runningStep = plan.steps.find((candidate) => String(candidate.id) === String(step.id))!;
    await appendExecutionPlanStepEvent(runtime.eventLog, plan, 'plan.step_started', runningStep);
    const result = await runtime.executeStep(runningStep, plan);
    executedStepIds.push(String(step.id));
    if (result.status === 'succeeded') {
      plan = transitionExecutionPlanStep(plan, step.id, 'succeed', { ...transitionOptions(runtime), outputRefs: result.outputRefs });
      runtime.planStore.saveExecutionPlan(plan);
      const completedStep = plan.steps.find((candidate) => String(candidate.id) === String(step.id))!;
      await appendExecutionPlanStepEvent(runtime.eventLog, plan, 'plan.step_completed', completedStep, result.data as any);
      continue;
    }
    if (result.status === 'waiting_user') {
      plan = transitionExecutionPlanStep(plan, step.id, 'wait_user', { ...transitionOptions(runtime), reason: result.reason });
      plan = transitionExecutionPlan(plan, 'wait_user', { ...transitionOptions(runtime), reason: result.reason });
      runtime.planStore.saveExecutionPlan(plan);
      const blockedStep = plan.steps.find((candidate) => String(candidate.id) === String(step.id))!;
      await appendExecutionPlanStepEvent(runtime.eventLog, plan, 'plan.step_blocked', blockedStep, { reason: result.reason, ...(result.data as any ?? {}) });
      await appendExecutionPlanEvent(runtime.eventLog, plan, 'plan.waiting_user');
      return { plan, executedStepIds, skippedStepIds, waitingReason: result.reason };
    }
    plan = transitionExecutionPlanStep(plan, step.id, 'fail', { ...transitionOptions(runtime), error: result.error });
    runtime.planStore.saveExecutionPlan(plan);
    const failedStep = plan.steps.find((candidate) => String(candidate.id) === String(step.id))!;
    await appendExecutionPlanStepEvent(runtime.eventLog, plan, 'plan.step_blocked', failedStep, { error: result.error, retryable: Boolean(result.retryable), ...(result.data as any ?? {}) });
    if (result.retryable && failedStep.attempt < failedStep.maxAttempts) {
      plan = transitionExecutionPlanStep(plan, step.id, 'retry', transitionOptions(runtime));
      runtime.planStore.saveExecutionPlan(plan);
      continue;
    }
    plan = transitionExecutionPlan(plan, 'fail', { ...transitionOptions(runtime), error: result.error });
    runtime.planStore.saveExecutionPlan(plan);
    await appendExecutionPlanEvent(runtime.eventLog, plan, 'plan.failed', { data: { error: result.error } });
    return { plan, executedStepIds, skippedStepIds };
  }

  plan = transitionExecutionPlan(plan, 'fail', { ...transitionOptions(runtime), error: '计划超过最大调度步数。' });
  runtime.planStore.saveExecutionPlan(plan);
  await appendExecutionPlanEvent(runtime.eventLog, plan, 'plan.failed', { data: { error: plan.error ?? 'plan_step_limit' } });
  return { plan, executedStepIds, skippedStepIds };
}
