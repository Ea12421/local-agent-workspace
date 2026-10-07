import test from "node:test";
import assert from "node:assert/strict";
import {
  createExecutionPlanFromPlannerOutput,
  createFixturePlannerOutput,
  type PlannerCapabilityCatalog,
  type PlannerOutput,
  validatePlannerOutput,
} from "./planner.ts";

const catalog: PlannerCapabilityCatalog = {
  capabilities: [
    { kind: "skill", id: "skill-project-explain", label: "解释项目", readOnly: true },
    { kind: "skill", id: "skill-product-builder", label: "产品方案", readOnly: true },
    { kind: "tool", id: "tool-files-read", label: "读取文件", readOnly: true },
    { kind: "tool", id: "tool-command-run", label: "运行测试", readOnly: false, approvalRequired: true },
  ],
};

test("fixture planner classifies supported goals and creates a validated plan", () => {
  const output = createFixturePlannerOutput({ objective: "检查项目目录和 Git 状态" }, catalog);
  assert.equal(output.intent, "inspect_project");
  assert.equal(output.steps.length, 1);
  const result = createExecutionPlanFromPlannerOutput({
    projectId: "project-planner" as any,
    runId: "run-planner" as any,
    objective: "检查项目目录和 Git 状态",
    now: "2026-10-07T02:00:00.000Z",
  }, output, catalog);
  assert.equal(result.kind, "plan");
  if (result.kind === "plan") {
    assert.equal(result.plan.intent, "inspect_project");
    assert.equal(result.plan.steps[0]?.toolId, "tool-files-read");
  }
});

test("planner prefers clarification for an unclassified goal", () => {
  const output = createFixturePlannerOutput({ objective: "帮我把事情做好" }, catalog);
  assert.equal(output.steps.length, 0);
  assert.ok(output.clarification?.question);
  const result = createExecutionPlanFromPlannerOutput({ projectId: "p" as any, runId: "r" as any, objective: "帮我把事情做好" }, output, catalog);
  assert.equal(result.kind, "clarification");
});

test("planner rejects unknown capabilities, dependency cycles and missing approval", () => {
  const unknown: PlannerOutput = {
    schemaVersion: "orchestrator.plan.v1",
    objective: "检查项目",
    intent: "inspect_project",
    steps: [{ id: "step-1" as any, order: 1, objective: "读取", capability: { kind: "tool", id: "tool-unknown" } }],
  };
  assert.throws(() => validatePlannerOutput(unknown, catalog), /unavailable capability/);

  const cycle: PlannerOutput = {
    schemaVersion: "orchestrator.plan.v1",
    objective: "检查项目",
    intent: "inspect_project",
    steps: [
      { id: "step-a" as any, order: 1, objective: "A", capability: { kind: "tool", id: "tool-files-read" }, dependsOn: ["step-b" as any] },
      { id: "step-b" as any, order: 2, objective: "B", capability: { kind: "tool", id: "tool-files-read" }, dependsOn: ["step-a" as any] },
    ],
  };
  assert.throws(() => validatePlannerOutput(cycle, catalog), /cycle/);

  const unsafeCatalog: PlannerCapabilityCatalog = { capabilities: [{ kind: "tool", id: "tool-command-run", readOnly: false }] };
  const unsafe: PlannerOutput = {
    schemaVersion: "orchestrator.plan.v1",
    objective: "运行测试",
    intent: "controlled_task",
    steps: [{ id: "step-unsafe" as any, order: 1, objective: "运行测试", capability: { kind: "tool", id: "tool-command-run" } }],
  };
  // Non-read-only capabilities are promoted to approval by the validator;
  // this assertion documents that an unsafe plan cannot silently become read-only.
  validatePlannerOutput(unsafe, unsafeCatalog);
  const result = createExecutionPlanFromPlannerOutput({ projectId: "p" as any, runId: "r" as any, objective: "运行测试" }, unsafe, unsafeCatalog);
  assert.equal(result.kind, "plan");
  if (result.kind === "plan") assert.equal(result.plan.steps[0]?.approvalRequired, true);
});

test("planner limits step explosion before the domain plan is created", () => {
  const output: PlannerOutput = {
    schemaVersion: "orchestrator.plan.v1",
    objective: "检查项目",
    intent: "inspect_project",
    steps: Array.from({ length: 3 }, (_, index) => ({ id: `step-${index}` as any, order: index + 1, objective: `步骤 ${index + 1}`, capability: { kind: "tool" as const, id: "tool-files-read" } })),
  };
  assert.throws(() => validatePlannerOutput(output, catalog, 2), /exceeds maxSteps/);
});
