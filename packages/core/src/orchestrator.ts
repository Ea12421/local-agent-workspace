import { createOpaqueId } from "./ids.ts";
import type {
  BotId,
  ExecutionPlanId,
  ExecutionPlanStepId,
  JsonObject,
  ProjectId,
  RunId,
  SessionId,
  SkillId,
} from "./types.ts";

export type PlanIntent = "conversation" | "inspect_project" | "product_builder" | "controlled_task";
export type ExecutionPlanStatus = "queued" | "running" | "waiting_user" | "succeeded" | "failed" | "cancelled";
export type ExecutionPlanStepStatus = ExecutionPlanStatus;

export type ExecutionPlanAction = "start" | "wait_user" | "resume" | "succeed" | "fail" | "cancel" | "retry";
export type ExecutionPlanStepAction = "start" | "wait_user" | "resume" | "succeed" | "fail" | "cancel" | "retry";

export const DEFAULT_PLAN_MAX_STEPS = 8;
export const HARD_PLAN_MAX_STEPS = 12;
export const DEFAULT_PLAN_MAX_ATTEMPTS = 1;
export const HARD_PLAN_MAX_ATTEMPTS = 3;

export interface ExecutionPlanStep {
  id: ExecutionPlanStepId;
  planId: ExecutionPlanId;
  order: number;
  objective: string;
  dependsOn: ExecutionPlanStepId[];
  skillId?: SkillId;
  toolId?: string;
  botId?: BotId;
  inputRefs: string[];
  outputRefs: string[];
  outputSchema?: JsonObject;
  status: ExecutionPlanStepStatus;
  approvalRequired: boolean;
  attempt: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface ExecutionPlan {
  id: ExecutionPlanId;
  projectId: ProjectId;
  sessionId?: SessionId;
  runId: RunId;
  objective: string;
  intent: PlanIntent;
  status: ExecutionPlanStatus;
  steps: ExecutionPlanStep[];
  maxSteps: number;
  createdAt: string;
  updatedAt: string;
  waitingReason?: string;
  error?: string;
}

export interface ExecutionPlanStepInput {
  id?: ExecutionPlanStepId;
  order: number;
  objective: string;
  dependsOn?: ExecutionPlanStepId[];
  skillId?: SkillId;
  toolId?: string;
  botId?: BotId;
  inputRefs?: string[];
  outputSchema?: JsonObject;
  approvalRequired?: boolean;
  maxAttempts?: number;
}

export interface CreateExecutionPlanInput {
  id?: ExecutionPlanId;
  projectId: ProjectId;
  sessionId?: SessionId;
  runId: RunId;
  objective: string;
  intent: PlanIntent;
  steps: ExecutionPlanStepInput[];
  maxSteps?: number;
  now?: string;
}

export interface PlanTransitionOptions {
  now?: string;
  reason?: string;
  error?: string;
  outputRefs?: string[];
}

export class InvalidExecutionPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidExecutionPlanError";
  }
}

export class InvalidExecutionPlanTransitionError extends Error {
  readonly targetId: string;
  readonly status: string;
  readonly action: string;

  constructor(targetId: string, status: string, action: string) {
    super(`Cannot ${action} ${targetId} while it is ${status}`);
    this.name = "InvalidExecutionPlanTransitionError";
    this.targetId = targetId;
    this.status = status;
    this.action = action;
  }
}

function isoNow(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stepMap(plan: Pick<ExecutionPlan, "steps">): Map<string, ExecutionPlanStep> {
  return new Map(plan.steps.map((step) => [String(step.id), step]));
}

function assertAcyclic(steps: ExecutionPlanStepInput[] | ExecutionPlanStep[]): void {
  const byId = new Map(steps.map((step, index) => ["id" in step && step.id ? String(step.id) : `input:${index}`, step]));
  const idsByOrder = new Map(steps.map((step, index) => [step.order, "id" in step && step.id ? String(step.id) : `input:${index}`]));
  const edges = new Map<string, string[]>();
  for (const [id, step] of byId) {
    const dependencies = step.dependsOn ?? [];
    edges.set(id, dependencies.map((dependency) => {
      const dependencyId = String(dependency);
      if (!byId.has(dependencyId)) throw new InvalidExecutionPlanError(`Unknown plan dependency: ${dependencyId}`);
      return dependencyId;
    }));
  }
  // Input steps may use the generated id of an earlier step only after creation;
  // order is still checked separately to keep planner output deterministic.
  void idsByOrder;
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new InvalidExecutionPlanError(`Plan dependency cycle detected at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of edges.get(id) ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of edges.keys()) visit(id);
}

export function validateExecutionPlan(input: Pick<CreateExecutionPlanInput, "objective" | "steps" | "maxSteps"> | ExecutionPlan): void {
  const maxSteps = input.maxSteps ?? DEFAULT_PLAN_MAX_STEPS;
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > HARD_PLAN_MAX_STEPS) {
    throw new InvalidExecutionPlanError(`maxSteps must be an integer between 1 and ${HARD_PLAN_MAX_STEPS}`);
  }
  if (!input.objective.trim()) throw new InvalidExecutionPlanError("Plan objective must not be empty");
  if (!input.steps.length || input.steps.length > maxSteps) throw new InvalidExecutionPlanError(`Plan must contain 1-${maxSteps} steps`);
  const orders = input.steps.map((step) => step.order);
  if (new Set(orders).size !== orders.length || orders.some((order, index) => order !== index + 1)) {
    throw new InvalidExecutionPlanError("Plan step order must be contiguous and start at 1");
  }
  for (const step of input.steps) {
    if (!step.objective.trim()) throw new InvalidExecutionPlanError(`Plan step ${step.order} objective must not be empty`);
    const maxAttempts = step.maxAttempts ?? DEFAULT_PLAN_MAX_ATTEMPTS;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > HARD_PLAN_MAX_ATTEMPTS) {
      throw new InvalidExecutionPlanError(`Plan step ${step.order} maxAttempts is outside the allowed range`);
    }
  }
  assertAcyclic(input.steps);
}

export function createExecutionPlan(input: CreateExecutionPlanInput): ExecutionPlan {
  const now = input.now ?? isoNow();
  const maxSteps = input.maxSteps ?? DEFAULT_PLAN_MAX_STEPS;
  validateExecutionPlan(input);
  const id = input.id ?? createOpaqueId("plan") as ExecutionPlanId;
  const steps = input.steps.map((step) => ({
    id: step.id ?? createOpaqueId("plan_step") as ExecutionPlanStepId,
    planId: id,
    order: step.order,
    objective: step.objective.trim(),
    dependsOn: [...(step.dependsOn ?? [])],
    ...(step.skillId ? { skillId: step.skillId } : {}),
    ...(step.toolId ? { toolId: step.toolId } : {}),
    ...(step.botId ? { botId: step.botId } : {}),
    inputRefs: [...(step.inputRefs ?? [])],
    outputRefs: [],
    ...(step.outputSchema ? { outputSchema: clone(step.outputSchema) } : {}),
    status: "queued" as const,
    approvalRequired: Boolean(step.approvalRequired),
    attempt: 0,
    maxAttempts: step.maxAttempts ?? DEFAULT_PLAN_MAX_ATTEMPTS,
    createdAt: now,
    updatedAt: now,
  }));
  // Planner inputs refer to prior step ids. Since generated ids are opaque, the
  // public constructor accepts no forward references and remaps order references
  // only when the caller already supplied concrete IDs in a persisted plan.
  const plan: ExecutionPlan = { id, projectId: input.projectId, ...(input.sessionId ? { sessionId: input.sessionId } : {}), runId: input.runId, objective: input.objective.trim(), intent: input.intent, status: "queued", steps, maxSteps, createdAt: now, updatedAt: now };
  validateExecutionPlan(plan);
  return plan;
}

export function readyExecutionPlanSteps(plan: ExecutionPlan): ExecutionPlanStep[] {
  const byId = stepMap(plan);
  return plan.steps.filter((step) => step.status === "queued" && step.dependsOn.every((dependency) => byId.get(String(dependency))?.status === "succeeded")).sort((a, b) => a.order - b.order).map(clone);
}

const PLAN_TRANSITIONS: Record<ExecutionPlanStatus, Partial<Record<ExecutionPlanAction, ExecutionPlanStatus>>> = {
  queued: { start: "running", cancel: "cancelled" },
  running: { wait_user: "waiting_user", succeed: "succeeded", fail: "failed", cancel: "cancelled" },
  waiting_user: { resume: "running", cancel: "cancelled" },
  succeeded: {},
  failed: { retry: "queued" },
  cancelled: {},
};

export function transitionExecutionPlan(plan: ExecutionPlan, action: ExecutionPlanAction, options: PlanTransitionOptions = {}): ExecutionPlan {
  const nextStatus = PLAN_TRANSITIONS[plan.status][action];
  if (!nextStatus) throw new InvalidExecutionPlanTransitionError(String(plan.id), plan.status, action);
  if (action === "succeed" && plan.steps.some((step) => step.status !== "succeeded")) throw new InvalidExecutionPlanError("Cannot succeed a plan with incomplete steps");
  const now = options.now ?? isoNow();
  const next: ExecutionPlan = { ...clone(plan), status: nextStatus, updatedAt: now };
  if (action === "wait_user") next.waitingReason = options.reason ?? "User input required";
  if (action === "resume") delete next.waitingReason;
  if (action === "fail") next.error = options.error ?? "Plan failed";
  if (action === "retry") { delete next.error; delete next.waitingReason; }
  return next;
}

const STEP_TRANSITIONS: Record<ExecutionPlanStepStatus, Partial<Record<ExecutionPlanStepAction, ExecutionPlanStepStatus>>> = {
  queued: { start: "running", wait_user: "waiting_user", cancel: "cancelled" },
  running: { wait_user: "waiting_user", succeed: "succeeded", fail: "failed", cancel: "cancelled" },
  waiting_user: { resume: "queued", cancel: "cancelled" },
  succeeded: {},
  failed: { retry: "queued" },
  cancelled: {},
};

export function transitionExecutionPlanStep(plan: ExecutionPlan, stepId: ExecutionPlanStepId, action: ExecutionPlanStepAction, options: PlanTransitionOptions = {}): ExecutionPlan {
  const index = plan.steps.findIndex((step) => String(step.id) === String(stepId));
  if (index < 0) throw new InvalidExecutionPlanError(`Unknown plan step: ${stepId}`);
  const current = plan.steps[index];
  const nextStatus = STEP_TRANSITIONS[current.status][action];
  if (!nextStatus) throw new InvalidExecutionPlanTransitionError(String(stepId), current.status, action);
  if (action === "start" && !readyExecutionPlanSteps(plan).some((step) => String(step.id) === String(stepId))) throw new InvalidExecutionPlanError(`Plan step is not ready: ${stepId}`);
  if (action === "retry" && current.attempt >= current.maxAttempts) throw new InvalidExecutionPlanError(`Plan step retry budget exceeded: ${stepId}`);
  const now = options.now ?? isoNow();
  const step: ExecutionPlanStep = { ...clone(current), status: nextStatus, updatedAt: now };
  if (action === "start") step.attempt += 1;
  if (action === "succeed") { step.outputRefs = [...(options.outputRefs ?? [])]; delete step.error; }
  if (action === "fail") step.error = options.error ?? "Plan step failed";
  if (action === "retry") { delete step.error; step.outputRefs = []; }
  const next = clone(plan);
  next.steps[index] = step;
  next.updatedAt = now;
  return next;
}
