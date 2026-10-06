import { createHash } from "node:crypto";
import type {
  ContextLedger,
  ContextPacket,
  ContextPolicy,
  ContextSnapshot,
  ContextSnapshotId,
  ContextTrigger,
  JsonValue,
  RunEvent,
} from "./types.ts";

export type CompactionLevel = "none" | "soft" | "hard";

export interface ContextSnapshotOptions {
  id: ContextSnapshotId;
  createdAt: string;
  createdBy?: ContextSnapshot["createdBy"];
  trigger: ContextTrigger;
  parentSnapshotId?: ContextSnapshotId;
}

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, ordered(item)]));
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(ordered(value));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function estimateTokens(value: string | JsonValue | unknown): number {
  const text = typeof value === "string" ? value : stableJson(value);
  return Math.ceil(Buffer.byteLength(text, "utf8") / 4);
}

export function shouldCompact(tokenEstimate: number, policy: ContextPolicy): CompactionLevel {
  const budget = Math.max(0, policy.hardThresholdTokens - policy.reserveOutputTokens);
  if (tokenEstimate >= budget) return "hard";
  if (tokenEstimate >= policy.softThresholdTokens) return "soft";
  return "none";
}

export function selectTail(events: RunEvent[], maxTailEvents: number): RunEvent[] {
  if (maxTailEvents <= 0) return [];
  return [...events].sort((a, b) => a.sequence - b.sequence).slice(-maxTailEvents);
}

function summaryFor(ledger: ContextLedger): ContextSnapshot["summary"] {
  return {
    objective: ledger.objective,
    durableFacts: ledger.durableFacts,
    decisions: ledger.decisions,
    constraints: [...ledger.constraints],
    unknowns: [...ledger.unknowns],
    pendingApprovalRefs: [...ledger.pendingApprovalRefs],
    activeHandoffRefs: [...ledger.activeHandoffRefs],
    artifactRefs: [...ledger.artifactRefs],
    sourceRefs: [...ledger.sourceRefs],
    nextAction: ledger.nextAction,
  };
}

function snapshotPayload(snapshot: Omit<ContextSnapshot, "contentSha256">): Omit<ContextSnapshot, "contentSha256"> {
  return snapshot;
}

export function buildContextSnapshot(
  ledger: ContextLedger,
  policy: ContextPolicy,
  options: ContextSnapshotOptions,
): ContextSnapshot {
  const events = [...ledger.events].sort((a, b) => a.sequence - b.sequence);
  const firstSequence = events[0]?.sequence ?? 0;
  const lastSequence = events.at(-1)?.sequence ?? 0;
  const summary = summaryFor(ledger);
  const summaryTokenEstimate = estimateTokens(summary);
  if (summaryTokenEstimate > policy.maxSummaryTokens) {
    throw new Error(`Context summary exceeds maxSummaryTokens (${summaryTokenEstimate} > ${policy.maxSummaryTokens})`);
  }
  const tail = selectTail(events, policy.maxTailEvents);
  const tokenEstimate = estimateTokens({ summary, events: ledger.events, items: ledger.items });
  const snapshotWithoutHash: Omit<ContextSnapshot, "contentSha256"> = {
    id: options.id,
    schemaVersion: "context.snapshot.v1",
    projectId: ledger.projectId,
    runId: ledger.runId,
    parentSnapshotId: options.parentSnapshotId,
    covers: { fromSequence: firstSequence, toSequence: lastSequence },
    trigger: options.trigger,
    summary,
    tailEventIds: tail.map((event) => event.id),
    tokenEstimate,
    summaryTokenEstimate,
    createdAt: options.createdAt,
    createdBy: options.createdBy ?? "system",
  };
  return {
    ...snapshotWithoutHash,
    contentSha256: sha256(stableJson(snapshotPayload(snapshotWithoutHash))),
  };
}

export function verifyContextSnapshot(snapshot: ContextSnapshot, events: RunEvent[], projectId: string, runId: string): string[] {
  const errors: string[] = [];
  if (snapshot.schemaVersion !== "context.snapshot.v1") errors.push("unsupported_schema");
  if (snapshot.projectId !== projectId) errors.push("project_mismatch");
  if (snapshot.runId !== runId) errors.push("run_mismatch");
  if (snapshot.covers.fromSequence > snapshot.covers.toSequence && snapshot.covers.toSequence !== 0) errors.push("invalid_event_range");
  const sorted = [...events].sort((a, b) => a.sequence - b.sequence);
  const covered = sorted.filter((event) => event.sequence >= snapshot.covers.fromSequence && event.sequence <= snapshot.covers.toSequence);
  const expectedCount = snapshot.covers.toSequence === 0 ? 0 : snapshot.covers.toSequence - snapshot.covers.fromSequence + 1;
  if (covered.length !== expectedCount || covered.some((event, index) => event.sequence !== snapshot.covers.fromSequence + index)) errors.push("event_range_gap");
  const eventIds = new Set(covered.map((event) => String(event.id)));
  if (snapshot.tailEventIds.some((id) => !eventIds.has(id))) errors.push("tail_event_missing");
  const { contentSha256: _ignored, ...withoutHash } = snapshot;
  if (sha256(stableJson(withoutHash)) !== snapshot.contentSha256) errors.push("content_hash_mismatch");
  return errors;
}

export function buildContextPacket(snapshot: ContextSnapshot, events: RunEvent[]): ContextPacket {
  const errors = verifyContextSnapshot(snapshot, events, snapshot.projectId, snapshot.runId);
  if (errors.length > 0) throw new Error(`Cannot restore context snapshot: ${errors.join(",")}`);
  const byId = new Map(events.map((event) => [String(event.id), event]));
  const tailEvents = snapshot.tailEventIds.map((id) => byId.get(String(id))).filter((event): event is RunEvent => Boolean(event)).sort((a, b) => a.sequence - b.sequence);
  return {
    snapshot,
    tailEvents,
    continuationInstruction: "Continue the same logical Run. Treat the snapshot as a verified summary, use tail events for recent detail, preserve constraints and pending approvals, and do not repeat completed tool or artifact work.",
  };
}
