import {
  buildContextPacket,
  buildContextSnapshot,
  createRunEvent,
  createOpaqueId,
  type ContextLedger,
  type ContextPolicy,
  type ContextSnapshot,
  type ContextSnapshotId,
  type ProjectId,
  type RunEvent,
  type RunId,
} from '../../../packages/core/src/index.ts';
import type { ProductBuilderCheckpoint, ProductBuilderResult } from '../../../packages/workflow/src/index.ts';
import { openContextSnapshotStore, openEventLog, openSqliteProductBuilderContinuity, type ContextSnapshotStore, type EventLog, type EventLogHandle, type ContextSnapshotStoreHandle, type SqliteEntityStore } from './persistence.ts';

export type ProductBuilderContinuityOptions = {
  eventLog: EventLog;
  snapshotStore: ContextSnapshotStore;
  persistence?: {
    eventLog: Pick<EventLogHandle, 'backend' | 'mode' | 'driver' | 'reason'>;
    snapshotStore: Pick<ContextSnapshotStoreHandle, 'backend' | 'mode' | 'driver' | 'reason'>;
  };
  close?: () => void;
  contextPolicy?: ContextPolicy;
  entityStore?: SqliteEntityStore;
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

export async function defaultProductBuilderContinuityStores(root: string): Promise<ProductBuilderContinuityOptions> {
  const databasePath = `${root}/workspace.db`;
  const sharedSqlite = openSqliteProductBuilderContinuity(databasePath);
  if (sharedSqlite) {
    return {
      eventLog: sharedSqlite.eventLog,
      snapshotStore: sharedSqlite.snapshotStore,
      persistence: {
        eventLog: { backend: sharedSqlite.backend, mode: sharedSqlite.mode, driver: sharedSqlite.driver },
        snapshotStore: { backend: sharedSqlite.backend, mode: sharedSqlite.mode, driver: sharedSqlite.driver },
      },
      close: sharedSqlite.close,
      contextPolicy: defaultPolicy,
      entityStore: sharedSqlite.entityStore,
    };
  }
  const eventLog = await openEventLog(databasePath);
  const snapshotStore = openContextSnapshotStore(databasePath);
  return {
    eventLog: eventLog.log,
    snapshotStore: snapshotStore.store,
    persistence: {
      eventLog: { backend: eventLog.backend, mode: eventLog.mode, driver: eventLog.driver, reason: eventLog.reason },
      snapshotStore: { backend: snapshotStore.backend, mode: snapshotStore.mode, driver: snapshotStore.driver, reason: snapshotStore.reason },
    },
    close: () => {
      eventLog.close?.();
      snapshotStore.close?.();
    },
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
    const allEvents = await stores.eventLog.readAll();
    const events = runEvents(allEvents, input.runId);
    const event = createRunEvent(input.runId, eventTypeFor(checkpoint), {
      idempotencyKey: checkpoint.idempotencyKey,
      boundary: checkpoint.boundary,
      ref: checkpoint.ref,
      label: checkpoint.label,
      order: checkpoint.order,
    }, events.length + 1);
    recordedKeys.add(checkpoint.idempotencyKey);
    createdCheckpoints += 1;
    const nextEvents = [...events, event];
    latestSnapshot = await checkpointSnapshot(input, result, nextEvents, stores);
    createdSnapshots += 1;
    const snapshotEvent = createRunEvent(input.runId, 'context.snapshot_created', {
      snapshotId: latestSnapshot.id,
      contentSha256: latestSnapshot.contentSha256,
      covers: latestSnapshot.covers,
      afterEventId: String(event.id),
    }, nextEvents.length + 1);
    if (stores.eventLog.backend === 'sqlite' && stores.eventLog.checkpoint) {
      await stores.eventLog.checkpoint({ event: event as unknown as Record<string, unknown>, snapshot: latestSnapshot, snapshotEvent: snapshotEvent as unknown as Record<string, unknown>, idempotencyKey: checkpoint.idempotencyKey });
    } else {
      await stores.eventLog.append(event as unknown as Record<string, unknown>);
      await stores.snapshotStore.append(latestSnapshot);
      await stores.eventLog.append(snapshotEvent as unknown as Record<string, unknown>);
    }
  }

  const events = runEvents(await stores.eventLog.readAll(), input.runId);
  if (stores.entityStore && createdCheckpoints > 0) {
    stores.entityStore.saveProductBuilderEntities({
      handoffs: result.handoffs,
      approval: result.approval,
      sources: result.sources,
      artifacts: result.artifacts,
      receipts: [{
        id: `${input.runId}:product-builder:receipt`,
        runId: input.runId,
        provider: { harness: result.receipt.harness, provider: result.receipt.provider, model: result.receipt.model, authMode: 'local', billingSource: 'local', isMock: result.receipt.isMock },
        receipt: result.receipt,
        createdAt: new Date().toISOString(),
      }],
    });
  }
  if (latestSnapshot) buildContextPacket(latestSnapshot, events.slice(0, latestSnapshot.covers.toSequence));
  return { runId: input.runId, createdCheckpoints, skippedCheckpoints, createdSnapshots, latestSnapshot, events };
}
