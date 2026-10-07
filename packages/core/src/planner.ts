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
import {
  createExecutionPlan,
  type CreateExecutionPlanInput,
  type ExecutionPlan,
  type ExecutionPlanStepInput,
  type PlanIntent,
} from "./orchestrator.ts";

export type PlannerCapabilityKind = "skill" | "tool" | "bot";

export type PlannerCapability = {
  kind: PlannerCapabilityKind;
  id: string;
  label?: string;
  readOnly: boolean;
  approvalRequired?: boolean;
};

export type PlannerCapabilityCatalog = {
  capabilities: PlannerCapability[];
};

export type PlannerStepDraft = {
  id: ExecutionPlanStepId;
  order: number;
  objective: string;
  capability: { kind: PlannerCapabilityKind; id: string };
  dependsOn?: ExecutionPlanStepId[];
  inputRefs?: string[];
  outputSchema?: JsonObject;
  approvalRequired?: boolean;
  maxAttempts?: number;
};

export type PlannerOutput = {
  schemaVersion: "orchestrator.plan.v1";
  objective: string;
  intent: PlanIntent;
  steps: PlannerStepDraft[];
  clarification?: undefined;
} | {
  schemaVersion: "orchestrator.plan.v1";
  objective: string;
  intent: PlanIntent;
  steps: [];
  clarification: {
    question: string;
    reason: string;
  };
};

/** Strict schema sent to real planners before the domain-level allowlist check. */
export const ORCHESTRATOR_PLAN_OUTPUT_SCHEMA: JsonObject = {
  type: "object",
  required: ["schemaVersion", "objective", "intent", "steps"],
  additionalProperties: false,
  properties: {
    schemaVersion: { type: "string", enum: ["orchestrator.plan.v1"] },
    objective: { type: "string" },
    intent: { type: "string", enum: ["conversation", "inspect_project", "product_builder", "controlled_task"] },
    steps: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "order", "objective", "capability"],
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          order: { type: "integer" },
          objective: { type: "string" },
          capability: {
            type: "object",
            required: ["kind", "id"],
            additionalProperties: false,
            properties: {
              kind: { type: "string", enum: ["skill", "tool", "bot"] },
              id: { type: "string" },
            },
          },
          dependsOn: { type: "array", items: { type: "string" } },
          inputRefs: { type: "array", items: { type: "string" } },
          approvalRequired: { type: "boolean" },
          maxAttempts: { type: "integer" },
        },
      },
    },
    clarification: {
      type: "object",
      required: ["question", "reason"],
      additionalProperties: false,
      properties: { question: { type: "string" }, reason: { type: "string" } },
    },
  },
};

export type PlannerRequest = {
  projectId: ProjectId;
  planId?: ExecutionPlanId;
  sessionId?: SessionId;
  runId: RunId;
  objective: string;
  now?: string;
  maxSteps?: number;
};

export type PlannerResult =
  | { kind: "plan"; plan: ExecutionPlan }
  | { kind: "clarification"; objective: string; intent: PlanIntent; question: string; reason: string };

export class InvalidPlannerOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPlannerOutputError";
  }
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * Deterministic fallback classifier used by Fixture and as a guard around a
 * model planner. It intentionally prefers clarification over a risky guess.
 */
export function classifyPlannerIntent(objective: string): PlanIntent | undefined {
  const text = normalize(objective);
  if (!text) return undefined;
  if (/(产品|prd|mvp|用户|需求|方案|产品经理|builder|想法)/i.test(text)) return "product_builder";
  if (/(检查|分析|查看|目录|代码结构|项目结构|git 状态|git status|仓库|文件)/i.test(text)) return "inspect_project";
  if (/(运行|执行|测试|构建|启动|命令|build|test|lint|compile)/i.test(text)) return "controlled_task";
  if (/(解释|介绍|说明|为什么|怎么|如何|聊聊|理解)/i.test(text)) return "conversation";
  return undefined;
}

function capabilityKey(capability: PlannerStepDraft["capability"]): string {
  return `${capability.kind}:${capability.id}`;
}

function findCapability(catalog: PlannerCapabilityCatalog, capability: PlannerStepDraft["capability"]): PlannerCapability | undefined {
  return catalog.capabilities.find((item) => item.kind === capability.kind && item.id === capability.id);
}

function assertCapabilityBinding(step: PlannerStepDraft, catalog: PlannerCapabilityCatalog): void {
  const capability = findCapability(catalog, step.capability);
  if (!capability) throw new InvalidPlannerOutputError(`Planner selected an unavailable capability: ${capabilityKey(step.capability)}`);
  const approvalRequired = Boolean(step.approvalRequired || capability.approvalRequired || !capability.readOnly);
  if (!capability.readOnly && !approvalRequired) {
    throw new InvalidPlannerOutputError(`Non-read-only capability must require approval: ${capabilityKey(step.capability)}`);
  }
}

export function validatePlannerOutput(output: PlannerOutput, catalog: PlannerCapabilityCatalog, maxSteps = 8): void {
  if (output.schemaVersion !== "orchestrator.plan.v1") throw new InvalidPlannerOutputError("Unsupported planner schema version");
  if (!output.objective.trim()) throw new InvalidPlannerOutputError("Planner objective must not be empty");
  if (output.clarification) {
    if (output.steps.length !== 0) throw new InvalidPlannerOutputError("Clarification output must not contain executable steps");
    if (!output.clarification.question.trim() || !output.clarification.reason.trim()) throw new InvalidPlannerOutputError("Clarification requires a question and reason");
    return;
  }
  if (!output.steps.length) throw new InvalidPlannerOutputError("Planner output must contain steps or a clarification");
  if (output.steps.length > maxSteps) throw new InvalidPlannerOutputError(`Planner output exceeds maxSteps ${maxSteps}`);
  const ids = new Set<string>();
  const byId = new Set<string>();
  for (const step of output.steps) {
    if (ids.has(String(step.id))) throw new InvalidPlannerOutputError(`Duplicate planner step id: ${step.id}`);
    ids.add(String(step.id));
    byId.add(String(step.id));
  }
  for (const [index, step] of output.steps.entries()) {
    if (step.order !== index + 1) throw new InvalidPlannerOutputError("Planner step order must be contiguous and start at 1");
    if (!step.objective.trim()) throw new InvalidPlannerOutputError(`Planner step ${step.order} objective must not be empty`);
    for (const dependency of step.dependsOn ?? []) {
      if (!byId.has(String(dependency))) throw new InvalidPlannerOutputError(`Planner step ${step.id} has unknown dependency ${dependency}`);
      if (String(dependency) === String(step.id)) throw new InvalidPlannerOutputError(`Planner step ${step.id} cannot depend on itself`);
    }
    assertCapabilityBinding(step, catalog);
  }
  // The planner output is deliberately rejected on cycles before it reaches
  // the domain constructor, so a model cannot hide a loop in a valid-looking
  // step list.
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byStep = new Map(output.steps.map((step) => [String(step.id), step]));
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new InvalidPlannerOutputError(`Planner dependency cycle detected at ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byStep.get(id)?.dependsOn ?? []) visit(String(dependency));
    visiting.delete(id);
    visited.add(id);
  };
  for (const step of output.steps) visit(String(step.id));
}

function stepInput(step: PlannerStepDraft): ExecutionPlanStepInput {
  const base = {
    id: step.id,
    order: step.order,
    objective: step.objective,
    dependsOn: step.dependsOn,
    inputRefs: step.inputRefs,
    outputSchema: step.outputSchema,
    approvalRequired: step.approvalRequired,
    maxAttempts: step.maxAttempts,
  } satisfies ExecutionPlanStepInput;
  if (step.capability.kind === "skill") return { ...base, skillId: step.capability.id as SkillId };
  if (step.capability.kind === "bot") return { ...base, botId: step.capability.id as BotId };
  return { ...base, toolId: step.capability.id };
}

export function createExecutionPlanFromPlannerOutput(request: PlannerRequest, output: PlannerOutput, catalog: PlannerCapabilityCatalog): PlannerResult {
  const maxSteps = request.maxSteps ?? 8;
  validatePlannerOutput(output, catalog, maxSteps);
  if (output.clarification) return { kind: "clarification", objective: output.objective, intent: output.intent, question: output.clarification.question, reason: output.clarification.reason };
  const input: CreateExecutionPlanInput = {
    ...(request.planId ? { id: request.planId } : {}),
    projectId: request.projectId,
    ...(request.sessionId ? { sessionId: request.sessionId } : {}),
    runId: request.runId,
    objective: request.objective,
    intent: output.intent,
    maxSteps,
    now: request.now,
    steps: output.steps.map(stepInput),
  };
  const steps = output.steps.map((step) => {
    const capability = findCapability(catalog, step.capability)!;
    return stepInput({
      ...step,
      approvalRequired: Boolean(step.approvalRequired || capability.approvalRequired || !capability.readOnly),
    });
  });
  return { kind: "plan", plan: createExecutionPlan({ ...input, steps }) };
}

export function createFixturePlannerOutput(request: Pick<PlannerRequest, "objective" | "maxSteps">, catalog: PlannerCapabilityCatalog): PlannerOutput {
  const intent = classifyPlannerIntent(request.objective);
  if (!intent) {
    return {
      schemaVersion: "orchestrator.plan.v1",
      objective: request.objective,
      intent: "conversation",
      steps: [],
      clarification: { question: "你希望我解释、检查项目、整理产品方案，还是执行一项受控命令？", reason: "当前目标无法安全归入已支持的任务类型。" },
    };
  }
  const matching = (kind: PlannerCapabilityKind, fallbackLabel: string): PlannerCapability | undefined =>
    catalog.capabilities.find((capability) => capability.kind === kind && (capability.label?.includes(fallbackLabel) || capability.readOnly));
  const steps: PlannerStepDraft[] = [];
  if (intent === "conversation") {
    const skill = matching("skill", "解释") ?? catalog.capabilities.find((capability) => capability.kind === "skill" && capability.readOnly);
    if (skill) steps.push({ id: "fixture-step-conversation" as ExecutionPlanStepId, order: 1, objective: "基于当前项目上下文回答用户问题", capability: { kind: skill.kind, id: skill.id } });
  } else if (intent === "inspect_project") {
    const tool = matching("tool", "读取") ?? catalog.capabilities.find((capability) => capability.kind === "tool" && capability.readOnly);
    if (tool) steps.push({ id: "fixture-step-inspect" as ExecutionPlanStepId, order: 1, objective: "读取当前项目范围内的配置文件", capability: { kind: tool.kind, id: tool.id }, inputRefs: ["path:package.json"] });
    const gitStatus = catalog.capabilities.find((capability) => capability.kind === "tool" && capability.id === "git.status");
    if (gitStatus) steps.push({ id: "fixture-step-git-status" as ExecutionPlanStepId, order: steps.length + 1, objective: "查看当前项目 Git 状态", capability: { kind: gitStatus.kind, id: gitStatus.id }, dependsOn: steps.length ? [steps[0]!.id] : undefined, inputRefs: ["git:status"] });
  } else if (intent === "product_builder") {
    const skill = matching("skill", "产品") ?? catalog.capabilities.find((capability) => capability.kind === "skill" && capability.readOnly);
    if (skill) steps.push({ id: "fixture-step-product" as ExecutionPlanStepId, order: 1, objective: "整理用户想法并生成产品方案草稿", capability: { kind: skill.kind, id: skill.id } });
  } else {
    const tool = matching("tool", "测试") ?? catalog.capabilities.find((capability) => capability.kind === "tool");
    if (tool) steps.push({ id: "fixture-step-controlled" as ExecutionPlanStepId, order: 1, objective: "在执行前检查命令权限并运行用户指定任务", capability: { kind: tool.kind, id: tool.id }, approvalRequired: true });
  }
  if (!steps.length) {
    return {
      schemaVersion: "orchestrator.plan.v1",
      objective: request.objective,
      intent,
      steps: [],
      clarification: { question: "当前项目还没有登记可执行的能力。你希望先登记哪个 Skill 或工具？", reason: "总控只能使用项目白名单中的能力。" },
    };
  }
  return { schemaVersion: "orchestrator.plan.v1", objective: request.objective, intent, steps };
}

export type PlannerIdHints = { planId?: ExecutionPlanId };
