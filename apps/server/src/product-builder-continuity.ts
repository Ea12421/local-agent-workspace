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
import type { HandoffValidation, ProductBuilderCheckpoint, ProductBuilderClarification, ProductBuilderConflict, ProductBuilderPlan, ProductBuilderResult } from '../../../packages/workflow/src/index.ts';
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
  persistedState?: ProductBuilderPersistedState;
  events: RunEvent[];
};

/** Durable release projection carried by Product Builder checkpoint events. */
export type ProductBuilderPersistedState = {
  schemaVersion: 'product-builder.release-state.v1';
  projectId: string;
  runId: string;
  artifactRelease: 'blocked' | 'released';
  finalArtifactIds: string[];
  conflicts: ProductBuilderConflict[];
  handoffValidation: HandoffValidation;
  releaseBlockers: string[];
  clarifications?: ProductBuilderClarification[];
  plan?: ProductBuilderPlan;
  checkpointEventId?: string;
  checkpointSequence?: number;
  source: 'checkpoint' | 'legacy_backfill';
};

export type ProductBuilderClarificationResolution = {
  ok: boolean;
  changed: boolean;
  idempotent: boolean;
  state?: ProductBuilderPersistedState;
  error?: string;
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

function stateForResult(input: { projectId: ProjectId; runId: RunId }, result: ProductBuilderResult, source: ProductBuilderPersistedState['source'] = 'checkpoint'): ProductBuilderPersistedState {
  return {
    schemaVersion: 'product-builder.release-state.v1',
    projectId: String(input.projectId),
    runId: String(input.runId),
    artifactRelease: result.artifactRelease,
    finalArtifactIds: [...result.finalArtifactIds],
    conflicts: result.conflicts.map((item) => ({ ...item, refs: [...item.refs] })),
    handoffValidation: {
      valid: result.handoffValidation.valid,
      maxDepth: result.handoffValidation.maxDepth,
      issues: result.handoffValidation.issues.map((item) => ({ ...item, handoffIds: [...item.handoffIds] })),
    },
    releaseBlockers: [...result.releaseBlockers],
    clarifications: result.clarifications.map((item) => ({ ...item, sourceRefs: [...item.sourceRefs] })),
    plan: {
      ...result.plan,
      unresolvedClarificationIds: [...result.plan.unresolvedClarificationIds],
      steps: result.plan.steps.map((step) => ({ ...step, dependsOn: [...step.dependsOn] })),
    },
    source,
  };
}

function stateProjectionFingerprint(state: ProductBuilderPersistedState): string {
  return JSON.stringify({
    artifactRelease: state.artifactRelease,
    finalArtifactIds: state.finalArtifactIds,
    releaseBlockers: state.releaseBlockers,
    conflicts: state.conflicts.map((item) => ({ code: item.code, message: item.message })),
    handoffValidation: state.handoffValidation,
    clarifications: state.clarifications,
    plan: state.plan,
  });
}

function sameStateProjection(left: ProductBuilderPersistedState, right: ProductBuilderPersistedState): boolean {
  return stateProjectionFingerprint(left) === stateProjectionFingerprint(right);
}

function planAfterClarification(state: ProductBuilderPersistedState, unresolvedClarificationIds: string[]): ProductBuilderPersistedState['plan'] {
  if (!state.plan) return undefined;
  const clarificationBlocked = unresolvedClarificationIds.length > 0;
  return {
    ...state.plan,
    unresolvedClarificationIds: [...unresolvedClarificationIds] as ProductBuilderPlan['unresolvedClarificationIds'],
    steps: state.plan.steps.map((step) => ({
      ...step,
      status: step.id === 'clarify'
        ? 'ready'
        : step.id === 'release'
          ? 'blocked'
          : step.id === 'approval'
            ? clarificationBlocked ? 'blocked' : 'waiting_user'
            : clarificationBlocked ? 'blocked' : 'ready',
    })),
  };
}

export async function resolveProductBuilderClarification(
  input: { projectId: ProjectId; runId: RunId; clarificationId: string; value: string; idempotencyKey?: string },
  stores: ProductBuilderContinuityOptions,
): Promise<ProductBuilderClarificationResolution> {
  const events = runEvents(await stores.eventLog.readAll(), String(input.runId));
  const current = readLatestProductBuilderState(events, String(input.runId));
  if (!current?.clarifications) return { ok: false, changed: false, idempotent: false, error: 'clarification_state_not_found' };
  const value = input.value.trim();
  if (!value) return { ok: false, changed: false, idempotent: false, error: 'clarification_value_required' };
  const target = current.clarifications.find((item) => item.id === input.clarificationId);
  if (!target) return { ok: false, changed: false, idempotent: false, error: 'clarification_not_found' };
  if (!target.blocking && input.clarificationId === 'external_evidence') return { ok: false, changed: false, idempotent: false, error: 'external_evidence_requires_source' };
  const idempotencyKey = input.idempotencyKey?.trim() || `${input.runId}:clarification:${input.clarificationId}:${value}`;
  const existing = events.find((event) => String(event.data.idempotencyKey ?? '') === idempotencyKey);
  if (existing) return { ok: true, changed: false, idempotent: true, state: readLatestProductBuilderState(runEvents(await stores.eventLog.readAll(), String(input.runId)), String(input.runId)) };
  const clarifications = current.clarifications.map((item) => item.id === input.clarificationId
    ? { ...item, value, sourceRefs: item.sourceRefs.length ? [...item.sourceRefs] : [`${input.runId}:clarification:${item.id}`], status: 'provided' as const }
    : { ...item, sourceRefs: [...item.sourceRefs] });
  const unresolvedClarificationIds = clarifications.filter((item) => item.blocking && item.status === 'unknown').map((item) => item.id);
  const next: ProductBuilderPersistedState = {
    ...current,
    projectId: String(input.projectId),
    clarifications,
    plan: planAfterClarification(current, unresolvedClarificationIds),
    releaseBlockers: [...new Set([
      ...current.releaseBlockers.filter((item) => item !== 'clarification_pending'),
      ...(unresolvedClarificationIds.length ? ['clarification_pending'] : []),
    ])],
    source: 'checkpoint',
  };
  const event = createRunEvent(input.runId, 'product_builder.state_checkpoint', {
    idempotencyKey,
    reason: 'clarification_resolved',
    clarificationId: input.clarificationId,
    value,
    productBuilderState: next,
  }, events.length + 1);
  await stores.eventLog.append(event as unknown as Record<string, unknown>);
  return { ok: true, changed: true, idempotent: false, state: readLatestProductBuilderState(runEvents(await stores.eventLog.readAll(), String(input.runId)), String(input.runId)) };
}

function stateFromEvent(event: RunEvent): ProductBuilderPersistedState | undefined {
  const candidate = (event.data as Record<string, unknown>).productBuilderState;
  if (!candidate || typeof candidate !== 'object') return undefined;
  const state = candidate as ProductBuilderPersistedState;
  if (state.schemaVersion !== 'product-builder.release-state.v1') return undefined;
  if (!Array.isArray(state.finalArtifactIds) || !Array.isArray(state.conflicts) || !Array.isArray(state.releaseBlockers)) return undefined;
  return { ...state, checkpointEventId: String(event.id), checkpointSequence: event.sequence };
}

export function readLatestProductBuilderState(events: RunEvent[], runId: string): ProductBuilderPersistedState | undefined {
  return events
    .filter((event) => String(event.runId) === runId)
    .map(stateFromEvent)
    .filter((state): state is ProductBuilderPersistedState => Boolean(state))
    .sort((a, b) => (a.checkpointSequence ?? 0) - (b.checkpointSequence ?? 0))
    .at(-1);
}

/**
 * Promotes Product Builder drafts only after a persisted approval is approved.
 * The promotion itself is an append-only state event, so replay can see why
 * and when the final Artifact ids became eligible.
 */
export async function reconcileProductBuilderRelease(
  input: { projectId: ProjectId; runId: RunId },
  stores: ProductBuilderContinuityOptions,
): Promise<ProductBuilderPersistedState | undefined> {
  if (!stores.entityStore) return undefined;
  const allEvents = await stores.eventLog.readAll();
  const events = runEvents(allEvents, String(input.runId));
  const current = readLatestProductBuilderState(events, String(input.runId));
  if (!current) return undefined;
  const approval = stores.entityStore.listApprovals().find((item) => String(item.runId) === String(input.runId));
  const blockers = current.releaseBlockers.filter((item) => item !== 'approval_pending');
  if (!approval || approval.status !== 'approved') blockers.push('approval_pending');
  const uniqueBlockers = [...new Set(blockers)];
  const artifactIds = stores.entityStore.listArtifactsByRun(String(input.runId)).map((item) => String(item.id));
  const plan = current.plan
    ? {
        ...current.plan,
        steps: current.plan.steps.map((step) => ({
          ...step,
          status: step.id === 'approval'
            ? approval?.status === 'approved' ? 'ready' as const : step.status
            : step.id === 'release'
              ? uniqueBlockers.length === 0 ? 'ready' as const : 'blocked' as const
              : step.status,
        })),
      }
    : current.plan;
  const next: ProductBuilderPersistedState = {
    ...current,
    projectId: String(input.projectId),
    artifactRelease: uniqueBlockers.length === 0 ? 'released' : 'blocked',
    finalArtifactIds: uniqueBlockers.length === 0 ? artifactIds : [],
    releaseBlockers: uniqueBlockers,
    plan,
    source: 'checkpoint',
  };
  if (next.artifactRelease === current.artifactRelease && JSON.stringify(next.finalArtifactIds) === JSON.stringify(current.finalArtifactIds) && JSON.stringify(next.releaseBlockers) === JSON.stringify(current.releaseBlockers)) return current;
  const idempotencyKey = `${input.runId}:product-builder:release:${approval?.resolvedAt ?? 'pending'}`;
  if (events.some((event) => String(event.data.idempotencyKey ?? '') === idempotencyKey)) return readLatestProductBuilderState(events, String(input.runId));
  const stateEvent = createRunEvent(input.runId, 'product_builder.state_checkpoint', {
    idempotencyKey,
    reason: 'approval_reconcile',
    productBuilderState: next,
  }, events.length + 1);
  await stores.eventLog.append(stateEvent as unknown as Record<string, unknown>);
  return readLatestProductBuilderState(runEvents(await stores.eventLog.readAll(), String(input.runId)), String(input.runId));
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
    unknowns: [
      ...result.clarifications.filter((item) => item.status === 'unknown').map((item) => `${item.label}：待确认`),
      '外部研究事实仍需在真实 Research Bot 运行中补齐。',
    ],
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
  const persistedState = stateForResult(input, result);
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
      productBuilderState: persistedState,
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
  let recoveredState = readLatestProductBuilderState(events, String(input.runId));
  if (!recoveredState) {
    const backfillEvent = createRunEvent(input.runId, 'product_builder.state_checkpoint', {
      idempotencyKey: `${input.runId}:product-builder:state`,
      reason: 'legacy_checkpoint_backfill',
      productBuilderState: { ...persistedState, source: 'legacy_backfill' },
    }, events.length + 1);
    await stores.eventLog.append(backfillEvent as unknown as Record<string, unknown>);
    const afterBackfill = runEvents(await stores.eventLog.readAll(), input.runId);
    recoveredState = readLatestProductBuilderState(afterBackfill, String(input.runId));
  }
  if (recoveredState && !sameStateProjection(recoveredState, persistedState)) {
    const syncKey = `${input.runId}:product-builder:state-sync:${stateProjectionFingerprint(persistedState)}`;
    const currentEvents = runEvents(await stores.eventLog.readAll(), input.runId);
    if (!currentEvents.some((event) => String(event.data.idempotencyKey ?? '') === syncKey)) {
      const syncEvent = createRunEvent(input.runId, 'product_builder.state_checkpoint', {
        idempotencyKey: syncKey,
        reason: 'result_projection_sync',
        productBuilderState: persistedState,
      }, currentEvents.length + 1);
      await stores.eventLog.append(syncEvent as unknown as Record<string, unknown>);
    }
    recoveredState = readLatestProductBuilderState(runEvents(await stores.eventLog.readAll(), String(input.runId)), String(input.runId));
  }
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
  const finalEvents = runEvents(await stores.eventLog.readAll(), input.runId);
  return { runId: input.runId, createdCheckpoints, skippedCheckpoints, createdSnapshots, latestSnapshot, persistedState: recoveredState, events: finalEvents };
}
