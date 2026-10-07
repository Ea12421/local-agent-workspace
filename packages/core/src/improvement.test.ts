import { strict as assert } from "node:assert";
import test from "node:test";
import { projectImprovement, isHighRiskImprovementTarget, type ProjectId, type RunEvent, type RunId } from "./index.ts";

const runId = "run_improvement_test" as RunId;
const projectId = "project_improvement_test" as ProjectId;

function event(sequence: number, type: RunEvent["type"], data: RunEvent["data"]): RunEvent {
  return {
    id: `event_improvement_${sequence}` as RunEvent["id"],
    runId,
    sequence,
    type,
    occurredAt: `2026-10-03T00:00:0${sequence}.000Z`,
    actor: { type: "system" },
    data,
  };
}

test("improvement projection replays proposal, evaluation, publish and rollback", () => {
  const proposal = {
    proposalId: "proposal_1",
    projectId,
    runId,
    target: "prompt",
    baseVersion: "prompt:v1",
    candidateVersion: "prompt:v2",
    candidateHash: "sha256:candidate",
    evidenceRefs: ["event_failure_1"],
    evalRefs: ["eval_1"],
    status: "draft",
    changedRefs: ["prompt.instructions"],
    hypothesis: "保留未知项并显式标记来源。",
  };
  const evaluation = {
    evaluationId: "eval_1",
    taskId: "rsi.fixed.001",
    taskVersion: "1",
    evaluatorVersion: "rule-v1",
    scorer: "rule",
    status: "passed",
    baselineScore: 0.75,
    candidateScore: 1,
    assertions: [{ id: "schema", passed: true, evidenceRefs: ["eval_1"] }],
    evidenceRefs: ["eval_1"],
    createdAt: "2026-10-03T00:00:03.000Z",
  };
  const projection = projectImprovement(runId, [
    event(1, "improvement.run_started", { semanticKey: "improvement:run:1", projectId, target: "prompt", baseVersion: "prompt:v1", evidenceRefs: ["event_failure_1"] }),
    event(2, "improvement.proposal_created", { semanticKey: "improvement:proposal:1", proposal }),
    event(3, "improvement.evaluation_completed", { semanticKey: "improvement:evaluation:1", evaluation }),
    event(4, "improvement.published", { semanticKey: "improvement:publish:1", release: { releasedVersion: "prompt:v2", candidateHash: "sha256:candidate", publishedAt: "2026-10-03T00:00:04.000Z", automatic: true } }),
    event(5, "improvement.rolled_back", { semanticKey: "improvement:rollback:1", rollback: { restoredVersion: "prompt:v1", rolledBackVersion: "prompt:v2", reason: "health check regression", rolledBackAt: "2026-10-03T00:00:05.000Z", evidenceRefs: ["eval_regression_1"] } }),
  ]);
  assert.equal(projection.status, "rolled_back");
  assert.equal(projection.proposal?.candidateVersion, "prompt:v2");
  assert.equal(projection.proposal?.status, "rolled_back");
  assert.equal(projection.evaluation?.candidateScore, 1);
  assert.equal(projection.rollback?.restoredVersion, "prompt:v1");
  assert.equal(projection.eventIds.length, 5);
});

test("improvement projection ignores unrelated run events and detects project mismatch", () => {
  const unrelated = event(1, "run.created", { status: "queued" });
  const projection = projectImprovement(runId, [unrelated]);
  assert.equal(projection.status, "not_started");
  assert.equal(projection.eventIds.length, 1);
  assert.throws(() => projectImprovement(runId, [
    event(2, "improvement.run_started", { semanticKey: "improvement:run:2", projectId, target: "prompt", baseVersion: "prompt:v1", evidenceRefs: [] }),
    event(3, "improvement.proposal_created", { semanticKey: "improvement:proposal:2", projectId: "project_other", proposal: {} }),
  ]));
});

test("high-risk targets are never eligible for automatic publish", () => {
  assert.equal(isHighRiskImprovementTarget("tool_policy"), true);
  assert.equal(isHighRiskImprovementTarget("provider"), true);
  assert.equal(isHighRiskImprovementTarget("code"), true);
  assert.equal(isHighRiskImprovementTarget("bot"), true);
  assert.equal(isHighRiskImprovementTarget("routine"), true);
  assert.equal(isHighRiskImprovementTarget("prompt"), false);
  assert.equal(isHighRiskImprovementTarget("skill"), false);
});
