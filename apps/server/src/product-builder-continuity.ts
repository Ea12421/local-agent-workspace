import {
  buildContextPacket,
  buildContextSnapshot,
  createRunEvent,
  createOpaqueId,
  type ContextLedger,
  type ContextPolicy,
  type ContextSnapshot,
  type ContextSnapshotId,
  type JsonObject,
  type ProjectId,
  type RunEvent,
  type RunId,
} from '../../../packages/core/src/index.ts';
import type { ProductBuilderCheckpoint, ProductBuilderResult } from '../../../packages/workflow/src/index.ts';
import { JsonlContextSnapshotStore, JsonlEventLog, type ContextSnapshotStore } from './persistence.ts';

export type ProductBuilderContinuityOptions = {
  eventLog: JsonlEventLog;
  snapshotStore: ContextSnapshotStore;
  contextPolicy?: ContextPolicy;
};

export type ProductBuilderContinuityResult = {
  runId: string;
  createdCheckpoints: number;
  skippedCheckpoints: number;
  createdSnapshots: number;
  latestSnapshot?: ContextSnapshot;
  events: RunEvent[];
};

const defaultPolicy: ContextPolicy = {
  softThresholdTokens: 6_000,
  hardThresholdTokens: 8_000,
  reserveOutputTokens: 1_000,
  maxSummaryTokens: 2_000,
  maxTailEvents: 12,
};

export function defaultProductBuilderContinuityStores(root: string): ProductBuilderContinuityOptions {
  return {
    eventLog: new JsonlEventLog(`${root}/product-builder-events.jsonl`),
    snapshotStore: new JsonlContextSnapshotStore(`${root}/context-snapshots.jsonl`),
    contextPolicy: defaultPolicy,
  };
}

function eventTypeFor(checkpoint: ProductBuilderCheckpoint): RunEvent['type'] {
  if (checkpoint.boundary === 'handoff') return 'handoff.created';
  if (checkpoint.boundary === 'artifact') return 'artifact.created';
  return 'approval.requested';
}

function runEvents(all: Record<string, unknown>[], runId: string): RunEvent[] {
  return all.filter((event) => event.runId === runId) as unknown as RunEvent[];
}

async function appendEvent(log: JsonlEventLog, runId: RunId, type: RunEvent['type'], data: JsonObject): Promise<RunEvent> {
  const all = await log.readAll();
  const events = runEvents(all, runId);
  const event = createRunEvent(runId, type, data, events.length + 1);
  await log.append(event as unknown as Record<string, unknown>);
  return event;
}

async function checkpointSnapshot(
  input: { projectId: ProjectId; runId: RunId; idea: string },
  result: ProductBuilderResult,
  events: RunEvent[],
  stores: ProductBuilderContinuityOptions,
): Promise<ContextSnapshot> {
  const ledger: ContextLedger = {
    projectId: input.projectId,
    runId: input.runId,
    objective: input.idea,
    constraints: result.executionPlan,
    durableFacts: [{
      id: `${input.runId}:product-builder:objective`,
      text: input.idea,
      eventRefs: events.map((event) => String(event.id)),
      sourceRefs: result.sources.map((source) => String(source.id)),
      priority: 'critical',
    }],
    decisions: [],
    unknowns: ['外部研究事实仍需在真实 Research Bot 运行中补齐。'],
    pendingApprovalRefs: result.approval.status === 'pending' ? [String(result.approval.id)] : [],
    activeHandoffRefs: result.handoffs.filter((handoff) => handoff.status === 'running' || handoff.status === 'queued').map((handoff) => String(handoff.id)),
    artifactRefs: result.artifacts.map((artifact) => String(artifact.id)),
    sourceRefs: result.sources.map((source) => String(source.id)),
    nextAction: result.executionPlan[0] ?? '等待用户确认',
    items: [],
    events,
  };
  const snapshot = buildContextSnapshot(ledger, stores.contextPolicy ?? defaultPolicy, {
    id: createOpaqueId('snapshot') as ContextSnapshotId,
    createdAt: new Date().toISOString(),
    trigger: 'handoff',
  });
  await stores.snapshotStore.append(snapshot);
  return snapshot;
}

/**
 * Records Product Builder boundaries in append-only storage. Replaying the
 * same logical run uses checkpoint idempotency keys, so completed handoffs,
 * artifacts, and approvals are not written twice.
 */
export async function checkpointProductBuilderResult(
  input: { projectId: ProjectId; runId: RunId; idea: string },
  result: ProductBuilderResult,
  stores: ProductBuilderContinuityOptions,
): Promise<ProductBuilderContinuityResult> {
  let createdCheckpoints = 0;
  let skippedCheckpoints = 0;
  let createdSnapshots = 0;
  let latestSnapshot: ContextSnapshot | undefined;
  const initialEvents = runEvents(await stores.eventLog.readAll(), input.runId);
  const recordedKeys = new Set(initialEvents.map((event) => String(event.data.idempotencyKey ?? '')));

  for (const checkpoint of result.checkpoints) {
    if (recordedKeys.has(checkpoint.idempotencyKey)) {
      skippedCheckpoints += 1;
      continue;
    }
    const event = await appendEvent(stores.eventLog, input.runId, eventTypeFor(checkpoint), {
      idempotencyKey: checkpoint.idempotencyKey,
      boundary: checkpoint.boundary,
      ref: checkpoint.ref,
      label: checkpoint.label,
      order: checkpoint.order,
    });
    recordedKeys.add(checkpoint.idempotencyKey);
    createdCheckpoints += 1;
    const events = runEvents(await stores.eventLog.readAll(), input.runId);
    latestSnapshot = await checkpointSnapshot(input, result, events, stores);
    createdSnapshots += 1;
    await appendEvent(stores.eventLog, input.runId, 'context.snapshot_created', {
      snapshotId: latestSnapshot.id,
      contentSha256: latestSnapshot.contentSha256,
      covers: latestSnapshot.covers,
      afterEventId: String(event.id),
    });
  }

  const events = runEvents(await stores.eventLog.readAll(), input.runId);
  if (latestSnapshot) buildContextPacket(latestSnapshot, events.slice(0, latestSnapshot.covers.toSequence));
  return { runId: input.runId, createdCheckpoints, skippedCheckpoints, createdSnapshots, latestSnapshot, events };
}
