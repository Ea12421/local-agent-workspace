import { InMemoryRunStore, buildContextPacket, buildContextSnapshot, createOpaqueId, createRunEvent, type BotId, type ContextLedger, type ContextPacket, type ContextPolicy, type ContextSnapshotId, type JsonValue, type ProjectId, type ProviderAdapter, type Run, type RunEvent, type RunId, type RunHandle } from '../../../packages/core/src/index.ts';
import type { RunStore } from '../../../packages/core/src/run-store.ts';
import type { JsonObject } from '../../../packages/core/src/types.ts';
import { CodexExternalAdapter } from '../../../packages/adapters/src/index.ts';
import { openContextSnapshotStore, openSqliteRunStore, type ContextSnapshotStore } from './persistence.ts';
import os from 'node:os';
import path from 'node:path';

const projectId = 'project-product-builder' as ProjectId;
const productBuilderId = 'bot-product-builder' as BotId;

function runningUnderNodeTest(): boolean {
  return process.argv.includes('--test') || Boolean(process.env.NODE_TEST_CONTEXT);
}

function defaultRuntimeDatabasePath(): string {
  if (process.env.AGENT_WORKSPACE_DB) return process.env.AGENT_WORKSPACE_DB;
  if (runningUnderNodeTest()) return path.join(os.tmpdir(), `local-agent-workspace-test-${process.pid}.db`);
  return path.join(process.cwd(), 'data', 'workspace.db');
}

function createRuntimeStore(): RunStore {
  try {
    return openSqliteRunStore(defaultRuntimeDatabasePath()).store;
  } catch (error) {
    if (runningUnderNodeTest()) return new InMemoryRunStore();
    throw new Error(`SQLite runtime store unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** SQLite is the default runtime source of truth; tests may use an isolated temp DB. */
export const runtimeStore = createRuntimeStore();
let seededRun: Run | undefined;
type ActiveCodexRun = {
  adapter: ProviderAdapter;
  handle?: RunHandle;
  cancellationRequested: boolean;
};
const activeCodexRuns = new Map<RunId, ActiveCodexRun>();

export type CodexExecutionOptions = {
  maxSegments?: number;
  adapterFactory?: (segment: number, packet?: ContextPacket) => ProviderAdapter;
  contextSnapshotStore?: ContextSnapshotStore;
  contextPolicy?: ContextPolicy;
};

const defaultContextPolicy: ContextPolicy = {
  softThresholdTokens: 6_000,
  hardThresholdTokens: 8_000,
  reserveOutputTokens: 1_000,
  maxSummaryTokens: 2_000,
  maxTailEvents: 12,
};

function defaultContextSnapshotStore(): ContextSnapshotStore {
  return openContextSnapshotStore(path.join(process.cwd(), 'data', 'workspace.db')).store;
}

async function appendRuntimeEvent(runId: RunId, type: RunEvent['type'], data: JsonObject, actor: RunEvent['actor'] = { type: 'system' }) {
  const current = await runtimeStore.listEvents(runId);
  const event = createRunEvent(runId, type, data, current.length + 1, actor);
  await runtimeStore.appendEvent(event);
  return event;
}

async function createRecoverySnapshot(run: Run, events: RunEvent[], store: ContextSnapshotStore, policy: ContextPolicy, trigger: 'provider_limit' | 'interrupt'): Promise<{ snapshot: Awaited<ReturnType<typeof buildContextSnapshot>>; packet: ContextPacket }> {
  const ledger: ContextLedger = {
    projectId: run.projectId,
    runId: run.id,
    objective: run.request.objective,
    constraints: [...(run.request.constraints ?? [])],
    durableFacts: [],
    decisions: [],
    unknowns: ['上一个 provider segment 未完成，需在恢复后确认是否产生了外部副作用。'],
    pendingApprovalRefs: [],
    activeHandoffRefs: [],
    artifactRefs: [],
    sourceRefs: [...(run.request.inputRefs ?? [])],
    nextAction: '使用已保存上下文继续同一逻辑 Run，并避免重复已完成的工具或产物工作。',
    items: [],
    events,
  };
  const snapshot = buildContextSnapshot(ledger, policy, {
    id: createOpaqueId('snapshot') as ContextSnapshotId,
    createdAt: new Date().toISOString(),
    trigger,
  });
  await store.append(snapshot);
  const packet = buildContextPacket(snapshot, events);
  return { snapshot, packet };
}

export async function ensureSeeded() {
  if (seededRun) return seededRun;
  const existing = await runtimeStore.getRun('run-core-fixture-001' as Run['id']);
  if (existing) {
    seededRun = existing;
    return seededRun;
  }
  seededRun = await runtimeStore.createRun({
    id: 'run-core-fixture-001' as Run['id'],
    projectId,
    botId: productBuilderId,
    now: '2026-09-26T10:00:00.000Z',
    request: {
      objective: '设计一个面向独立开发者的 AI 视频产品',
      input: { idea: 'AI 视频生成平台' },
      constraints: ['外部事实必须带来源', '需要用户确认 MVP'],
      outputSchema: { type: 'object', required: ['productBrief', 'executionPlan'] } as JsonObject,
    },
  });
  await runtimeStore.transition(seededRun.id, 'start', { now: '2026-09-26T10:00:00.100Z' });
  await runtimeStore.transition(seededRun.id, 'wait_user', { now: '2026-09-26T10:00:03.000Z', reason: '等待用户确认 MVP 范围' });
  await runtimeStore.transition(seededRun.id, 'resume', { now: '2026-09-26T10:00:04.000Z' });
  await runtimeStore.transition(seededRun.id, 'succeed', { now: '2026-09-26T10:00:05.000Z', result: { artifactIds: ['artifact-brief', 'artifact-plan'] } });
  seededRun = (await runtimeStore.getRun(seededRun.id))!;
  return seededRun;
}

export async function createRuntimeRun(objective: string) {
  const run = await runtimeStore.createRun({ projectId, botId: productBuilderId, request: { objective, input: { idea: objective } } });
  const started = await runtimeStore.transition(run.id, 'start');
  return { run: started.run, event: started.event };
}

/**
 * Execute one Codex CLI run while keeping the project's Run/Event store as the
 * source of truth. The adapter only supplies provider events; state transitions
 * remain owned by the control plane.
 */
export async function executeCodexRun(objective: string, input: JsonValue = {}, options: CodexExecutionOptions = {}) {
  const created = await runtimeStore.createRun({
    projectId,
    botId: productBuilderId,
    request: { objective, input, metadata: { provider: 'openai-codex', executionAgent: 'codex-cli' } },
  });
  const started = await runtimeStore.transition(created.id, 'start');
  const maxSegments = Math.max(1, Math.floor(options.maxSegments ?? 1));
  const ownsContextSnapshotStore = !options.contextSnapshotStore;
  const snapshotStore = options.contextSnapshotStore ?? defaultContextSnapshotStore();
  const contextPolicy = options.contextPolicy ?? defaultContextPolicy;
  const adapterFactory = options.adapterFactory ?? (() => new CodexExternalAdapter(process.env.CODEX_BIN ?? 'codex'));
  const active: ActiveCodexRun = { adapter: adapterFactory(1), cancellationRequested: false };
  activeCodexRuns.set(created.id, active);
  let handle: RunHandle | undefined;
  const providerEvents: RunEvent[] = [];
  let packet: ContextPacket | undefined;
  let lastProvider: RunHandle['provider'] | undefined;
  try {
    for (let segment = 1; segment <= maxSegments; segment += 1) {
      const adapter = segment === 1 ? active.adapter : adapterFactory(segment, packet);
      active.adapter = adapter;
      await appendRuntimeEvent(created.id, 'run.segment_started', {
        segment,
        contextSnapshotId: packet?.snapshot.id ?? null,
        provider: 'execution-adapter',
      });
      try {
        handle = await adapter.startRun({
          objective,
          input,
          metadata: {
            runId: created.id,
            provider: 'openai-codex',
            segment,
            contextSnapshot: packet?.snapshot ?? null,
            contextTailEventIds: packet?.tailEvents.map((event) => String(event.id)) ?? [],
          } as JsonObject,
        });
        lastProvider = handle.provider;
        active.handle = handle;
        if (active.cancellationRequested) {
          const events = await runtimeStore.listEvents(created.id);
          return { run: (await runtimeStore.getRun(created.id))!, startEvent: started.event, providerEvents, finalEvent: events.find((item) => item.type === 'run.cancelled'), provider: handle.provider };
        }
        let completed = false;
        for await (const providerEvent of adapter.streamEvents(handle)) {
          const stored = await appendRuntimeEvent(created.id, 'provider.event', providerEvent.data, providerEvent.actor);
          providerEvents.push(stored);
          completed ||= providerEvent.data.status === 'completed';
        }
        const current = await runtimeStore.getRun(created.id);
        if (active.cancellationRequested || current?.status === 'cancelled') {
          const events = await runtimeStore.listEvents(created.id);
          return { run: current!, startEvent: started.event, providerEvents, finalEvent: [...events].reverse().find((item) => item.type === 'run.cancelled') ?? events.at(-1), provider: handle.provider };
        }
        if (completed) {
          await appendRuntimeEvent(created.id, 'run.segment_completed', { segment, status: 'succeeded', contextSnapshotId: packet?.snapshot.id ?? null });
          const providerSummary: JsonObject = {
            harness: handle.provider.harness,
            provider: handle.provider.provider,
            model: handle.provider.model,
            authMode: handle.provider.authMode,
            billingSource: handle.provider.billingSource,
            isMock: handle.provider.isMock,
          };
          const final = await runtimeStore.transition(created.id, 'succeed', { result: { provider: providerSummary, eventCount: providerEvents.length, segmentCount: segment } });
          return { run: final.run, startEvent: started.event, providerEvents, finalEvent: final.event, provider: handle.provider };
        }
        await appendRuntimeEvent(created.id, 'run.segment_completed', { segment, status: 'failed', code: 'provider_incomplete' });
        if (segment < maxSegments) {
          const events = await runtimeStore.listEvents(created.id);
          const recovery = await createRecoverySnapshot((await runtimeStore.getRun(created.id))!, events, snapshotStore, contextPolicy, 'provider_limit');
          packet = recovery.packet;
          await appendRuntimeEvent(created.id, 'context.snapshot_created', { snapshotId: recovery.snapshot.id, contentSha256: recovery.snapshot.contentSha256, covers: recovery.snapshot.covers });
          await appendRuntimeEvent(created.id, 'run.resume_requested', { fromSegment: segment, toSegment: segment + 1, snapshotId: recovery.snapshot.id });
          continue;
        }
        const final = await runtimeStore.transition(created.id, 'fail', { reason: 'Codex execution did not complete', error: { code: 'provider_incomplete', message: 'Codex CLI did not emit a completed event.', retryable: true } });
        return { run: final.run, startEvent: started.event, providerEvents, finalEvent: final.event, provider: handle.provider };
      } catch (error) {
        const current = await runtimeStore.getRun(created.id);
        if (active.cancellationRequested || current?.status === 'cancelled') {
          const events = await runtimeStore.listEvents(created.id);
          return { run: current!, startEvent: started.event, providerEvents, finalEvent: [...events].reverse().find((item) => item.type === 'run.cancelled') ?? events.at(-1), provider: handle?.provider ?? (await adapter.probeCapabilities()).identity };
        }
        await appendRuntimeEvent(created.id, 'run.segment_completed', { segment, status: 'failed', code: 'provider_error', message: error instanceof Error ? error.message : String(error) });
        if (segment < maxSegments) {
          const events = await runtimeStore.listEvents(created.id);
          const recovery = await createRecoverySnapshot((await runtimeStore.getRun(created.id))!, events, snapshotStore, contextPolicy, 'interrupt');
          packet = recovery.packet;
          await appendRuntimeEvent(created.id, 'context.snapshot_created', { snapshotId: recovery.snapshot.id, contentSha256: recovery.snapshot.contentSha256, covers: recovery.snapshot.covers });
          await appendRuntimeEvent(created.id, 'run.resume_requested', { fromSegment: segment, toSegment: segment + 1, snapshotId: recovery.snapshot.id });
          continue;
        }
        const final = await runtimeStore.transition(created.id, 'fail', { reason: 'Codex execution failed', error: { code: 'provider_error', message: error instanceof Error ? error.message : String(error), retryable: true } });
        return { run: final.run, startEvent: started.event, providerEvents, finalEvent: final.event, provider: handle?.provider ?? (await adapter.probeCapabilities()).identity };
      }
    }
    throw new Error('Execution loop ended without a terminal result');
  } catch (error) {
    const current = await runtimeStore.getRun(created.id);
    if (active.cancellationRequested || current?.status === 'cancelled') {
      const events = await runtimeStore.listEvents(created.id);
      return { run: current!, startEvent: started.event, providerEvents, finalEvent: [...events].reverse().find((item) => item.type === 'run.cancelled') ?? events.at(-1), provider: handle?.provider ?? (await active.adapter.probeCapabilities()).identity };
    }
    const final = await runtimeStore.transition(created.id, 'fail', { reason: 'Codex execution failed', error: { code: 'provider_error', message: error instanceof Error ? error.message : String(error), retryable: true } });
    return { run: final.run, startEvent: started.event, providerEvents, finalEvent: final.event, provider: handle?.provider ?? lastProvider };
  } finally {
    activeCodexRuns.delete(created.id);
    if (ownsContextSnapshotStore) snapshotStore.close?.();
  }
}

/** Cancel the provider process and then record the domain transition. */
export async function cancelCodexRun(runId: string) {
  const current = await runtimeStore.getRun(runId as RunId);
  if (!current) return undefined;
  if (current.status === 'cancelled') return { run: current, status: 'cancelled' as const, alreadyCancelled: true };
  if (current.status !== 'queued' && current.status !== 'running' && current.status !== 'waiting_user') {
    return { run: current, status: current.status };
  }
  const active = activeCodexRuns.get(runId as RunId);
  if (active) {
    active.cancellationRequested = true;
    if (active.handle) await active.adapter.cancel(active.handle);
  }
  const cancelled = await runtimeStore.transition(runId as RunId, 'cancel', {
    actor: { type: 'user' },
    reason: '用户取消运行',
    idempotencyKey: `cancel:${runId}`,
  });
  return { run: cancelled.run, status: 'cancelled' as const, event: cancelled.event };
}

export async function snapshot() {
  const run = await ensureSeeded();
  const events = await runtimeStore.listEvents(run.id);
  return { run, events };
}

export const demoProject = {
  id: projectId,
  name: 'AI Product Builder Demo',
  description: '用结构化 Bot 交接把一个产品想法推进为可执行方案。',
  status: 'active',
};
