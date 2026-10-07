import test from "node:test";
import assert from "node:assert/strict";
import {
  InvalidExecutionPlanError,
  createExecutionPlan,
  readyExecutionPlanSteps,
  transitionExecutionPlan,
  transitionExecutionPlanStep,
  validateExecutionPlan,
} from "./orchestrator.ts";
import type { ExecutionPlanStepId, ProjectId, RunId } from "./types.ts";

const projectId = "project-test" as ProjectId;
const runId = "run-test" as RunId;
const first = "step-first" as ExecutionPlanStepId;
const second = "step-second" as ExecutionPlanStepId;

function plan() {
  return createExecutionPlan({
    projectId,
    runId,
    objective: "检查项目并汇报结果",
    intent: "inspect_project",
    maxSteps: 4,
    now: "2026-10-07T10:00:00.000Z",
    steps: [
      { id: first, order: 1, objective: "读取项目结构", toolId: "filesystem.read" },
      { id: second, order: 2, objective: "汇总检查结果", dependsOn: [first] },
    ],
  });
}

test("execution plan only exposes dependency-ready steps and keeps step transitions immutable", () => {
  const initial = plan();
  assert.deepEqual(readyExecutionPlanSteps(initial).map((step) => step.id), [first]);

  const started = transitionExecutionPlanStep(initial, first, "start", { now: "2026-10-07T10:00:01.000Z" });
  assert.equal(started.steps[0].status, "running");
  assert.equal(started.steps[0].attempt, 1);
  assert.equal(initial.steps[0].status, "queued");

  const completed = transitionExecutionPlanStep(started, first, "succeed", { outputRefs: ["artifact:one"], now: "2026-10-07T10:00:02.000Z" });
  assert.deepEqual(readyExecutionPlanSteps(completed).map((step) => step.id), [second]);
});

test("plan transitions require completed steps before success and preserve waiting reasons", () => {
  const running = transitionExecutionPlan(plan(), "start", { now: "2026-10-07T10:00:01.000Z" });
  const waiting = transitionExecutionPlan(running, "wait_user", { reason: "需要用户确认项目范围", now: "2026-10-07T10:00:02.000Z" });
  assert.equal(waiting.status, "waiting_user");
  assert.equal(waiting.waitingReason, "需要用户确认项目范围");
  const resumed = transitionExecutionPlan(waiting, "resume", { now: "2026-10-07T10:00:03.000Z" });
  assert.equal(resumed.status, "running");
  assert.throws(() => transitionExecutionPlan(resumed, "succeed"), /incomplete steps/);
});

test("plan validation rejects cycles and step explosions", () => {
  assert.throws(() => createExecutionPlan({
    projectId,
    runId,
    objective: "循环计划",
    intent: "conversation",
    steps: [
      { id: first, order: 1, objective: "第一步", dependsOn: [second] },
      { id: second, order: 2, objective: "第二步", dependsOn: [first] },
    ],
  }), InvalidExecutionPlanError);

  assert.throws(() => validateExecutionPlan({ objective: "太多步骤", maxSteps: 12, steps: Array.from({ length: 13 }, (_, index) => ({ order: index + 1, objective: `步骤 ${index + 1}` })) }), /1-12 steps/);
});

test("failed plan steps have a bounded retry budget", () => {
  const initial = createExecutionPlan({
    projectId,
    runId,
    objective: "有界重试",
    intent: "inspect_project",
    steps: [{ id: first, order: 1, objective: "读取文件", maxAttempts: 2 }],
  });
  const started = transitionExecutionPlanStep(initial, first, "start");
  const failed = transitionExecutionPlanStep(started, first, "fail", { error: "临时失败" });
  const retrying = transitionExecutionPlanStep(failed, first, "retry");
  const startedAgain = transitionExecutionPlanStep(retrying, first, "start");
  const failedAgain = transitionExecutionPlanStep(startedAgain, first, "fail", { error: "再次失败" });
  assert.throws(() => transitionExecutionPlanStep(failedAgain, first, "retry"), /retry budget exceeded/);
});
