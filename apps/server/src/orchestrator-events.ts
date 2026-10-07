import { createRunEvent, type ExecutionPlan, type ExecutionPlanStep, type JsonObject, type RunEvent, type RunEventType, type RunId } from '../../../packages/core/src/index.ts';
import type { EventLog } from './persistence.ts';

export type ExecutionPlanEventData = JsonObject & {
  idempotencyKey?: string;
  stepId?: string;
};

function planEventKey(plan: ExecutionPlan, type: RunEventType, step?: ExecutionPlanStep): string {
  if (step) return `execution-plan:${plan.id}:step:${step.id}:${type}:attempt-${step.attempt}`;
  return `execution-plan:${plan.id}:${type}`;
}

function baseData(plan: ExecutionPlan, step?: ExecutionPlanStep): ExecutionPlanEventData {
  return {
    planId: String(plan.id),
    projectId: String(plan.projectId),
    objective: plan.objective,
    planStatus: plan.status,
    ...(step ? {
      stepId: String(step.id),
      stepOrder: step.order,
      stepStatus: step.status,
      attempt: step.attempt,
      maxAttempts: step.maxAttempts,
      stepObjective: step.objective,
    } : {}),
  } as ExecutionPlanEventData;
}

/** Append one idempotent plan lifecycle event to the existing RunEvent source. */
export async function appendExecutionPlanEvent(
  eventLog: EventLog,
  plan: ExecutionPlan,
  type: Extract<RunEventType, `plan.${string}`>,
  options: { step?: ExecutionPlanStep; data?: ExecutionPlanEventData; idempotencyKey?: string; occurredAt?: string } = {},
): Promise<RunEvent> {
  const events = (await eventLog.readAll()).filter((event) => String(event.runId) === String(plan.runId)) as unknown as RunEvent[];
  const key = options.idempotencyKey ?? planEventKey(plan, type, options.step);
  const existing = events.find((event) => String(event.data?.idempotencyKey ?? '') === key);
  if (existing) return existing;
  const data = {
    ...baseData(plan, options.step),
    ...(plan.waitingReason ? { waitingReason: plan.waitingReason } : {}),
    ...(plan.error ? { error: plan.error } : {}),
    ...(options.data ?? {}),
    idempotencyKey: key,
  } as JsonObject;
  const event = createRunEvent(plan.runId as RunId, type, data, events.length + 1, { type: 'system' }, options.occurredAt);
  await eventLog.append(event as unknown as Record<string, unknown>);
  return event;
}

export async function appendExecutionPlanCreated(eventLog: EventLog, plan: ExecutionPlan): Promise<RunEvent> {
  return appendExecutionPlanEvent(eventLog, plan, 'plan.created');
}

export async function appendExecutionPlanStarted(eventLog: EventLog, plan: ExecutionPlan): Promise<RunEvent> {
  return appendExecutionPlanEvent(eventLog, plan, 'plan.started');
}

export async function appendExecutionPlanStepEvent(eventLog: EventLog, plan: ExecutionPlan, type: Extract<RunEventType, `plan.step_${string}`>, step: ExecutionPlanStep, data?: ExecutionPlanEventData): Promise<RunEvent> {
  return appendExecutionPlanEvent(eventLog, plan, type, { step, data });
}
