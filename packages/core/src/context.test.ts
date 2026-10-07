import { strict as assert } from "node:assert";
import test from "node:test";
import {
  buildContextPacket,
  buildContextSnapshot,
  shouldCompact,
  verifyContextSnapshot,
  type ContextLedger,
  type ContextPolicy,
  type ProjectId,
  type RunEvent,
  type RunId,
} from "./index.ts";

const projectId = "project_context" as ProjectId;
const runId = "run_context" as RunId;
const policy: ContextPolicy = {
  softThresholdTokens: 100,
  hardThresholdTokens: 160,
  reserveOutputTokens: 20,
  maxSummaryTokens: 600,
  maxTailEvents: 2,
};

const events: RunEvent[] = [1, 2, 3, 4].map((sequence) => ({
  id: `event-${sequence}` as RunEvent["id"],
  runId,
  sequence,
  type: sequence === 1 ? "run.created" : "provider.event",
  occurredAt: `2026-01-01T00:00:0${sequence}.000Z`,
  actor: { type: "system" },
  data: { sequence },
}));

function ledger(): ContextLedger {
  return {
    projectId,
    runId,
    objective: "持续推进 Product Builder",
    constraints: ["不外发", "保留人工审批"],
    durableFacts: [{ id: "fact-1", text: "用户是独立开发者", eventRefs: ["event-1"], sourceRefs: [], priority: "critical" }],
    decisions: [{ id: "decision-1", text: "先验证单 Bot，再判断多 Bot", status: "accepted", actor: "user", eventRefs: ["event-2"] }],
    unknowns: ["真实用户基线未知"],
    pendingApprovalRefs: ["approval-1"],
    activeHandoffRefs: ["handoff-1"],
    artifactRefs: ["artifact-1"],
    sourceRefs: ["source-1"],
    nextAction: "完成一次 replay",
    items: [{ id: "item-1", kind: "conversation", content: "最近的用户决定", eventRefs: ["event-4"], sourceRefs: [], priority: "important", createdAt: "2026-01-01T00:00:04.000Z" }],
    events,
  };
}

test("context compaction uses thresholds and preserves a recent tail", () => {
  assert.equal(shouldCompact(99, policy), "none");
  assert.equal(shouldCompact(100, policy), "soft");
  assert.equal(shouldCompact(140, policy), "hard");
  const snapshot = buildContextSnapshot(ledger(), policy, { id: "snapshot-1" as any, createdAt: "2026-01-01T00:01:00.000Z", trigger: "threshold" });
  assert.deepEqual(snapshot.covers, { fromSequence: 1, toSequence: 4 });
  assert.deepEqual(snapshot.tailEventIds, ["event-3", "event-4"]);
  assert.equal(verifyContextSnapshot(snapshot, events, projectId, runId).length, 0);
  const packet = buildContextPacket(snapshot, events);
  assert.deepEqual(packet.tailEvents.map((event) => event.sequence), [3, 4]);
  assert.match(packet.continuationInstruction, /same logical Run/);
});

test("context snapshot rejects tampering, gaps, and cross-project restore", () => {
  const snapshot = buildContextSnapshot(ledger(), policy, { id: "snapshot-2" as any, createdAt: "2026-01-01T00:01:00.000Z", trigger: "interrupt" });
  const tampered = { ...snapshot, summary: { ...snapshot.summary, nextAction: "改写过" } };
  assert.ok(verifyContextSnapshot(tampered, events, projectId, runId).includes("content_hash_mismatch"));
  assert.ok(verifyContextSnapshot(snapshot, events.slice(1), projectId, runId).includes("event_range_gap"));
  assert.ok(verifyContextSnapshot(snapshot, events, "other-project", runId).includes("project_mismatch"));
});
