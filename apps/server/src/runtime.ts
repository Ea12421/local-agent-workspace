import { InMemoryRunStore, createRunEvent, type BotId, type JsonValue, type ProjectId, type Run, type RunEvent, type RunId, type RunHandle } from '../../../packages/core/src/index.ts';
import type { JsonObject } from '../../../packages/core/src/types.ts';
import { CodexExternalAdapter } from '../../../packages/adapters/src/index.ts';

const projectId = 'project-product-builder' as ProjectId;
const productBuilderId = 'bot-product-builder' as BotId;

export const runtimeStore = new InMemoryRunStore();
let seededRun: Run | undefined;
type ActiveCodexRun = {
  adapter: CodexExternalAdapter;
  handle?: RunHandle;
  cancellationRequested: boolean;
};
const activeCodexRuns = new Map<RunId, ActiveCodexRun>();

export async function ensureSeeded() {
  if (seededRun) return seededRun;
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
export async function executeCodexRun(objective: string, input: JsonValue = {}) {
  const created = await runtimeStore.createRun({
    projectId,
    botId: productBuilderId,
    request: { objective, input, metadata: { provider: 'openai-codex', executionAgent: 'codex-cli' } },
  });
  const started = await runtimeStore.transition(created.id, 'start');
  const adapter = new CodexExternalAdapter(process.env.CODEX_BIN ?? 'codex');
  const active: ActiveCodexRun = { adapter, cancellationRequested: false };
  activeCodexRuns.set(created.id, active);
  let handle: RunHandle | undefined;
  const providerEvents: RunEvent[] = [];
  try {
    handle = await adapter.startRun({ objective, input, metadata: { runId: created.id, provider: 'openai-codex' } });
    active.handle = handle;
    if (active.cancellationRequested) {
      const events = await runtimeStore.listEvents(created.id);
      return { run: (await runtimeStore.getRun(created.id))!, startEvent: started.event, providerEvents, finalEvent: events.find((item) => item.type === 'run.cancelled'), provider: handle.provider };
    }
    for await (const providerEvent of adapter.streamEvents(handle)) {
      const current = await runtimeStore.listEvents(created.id);
      const stored = createRunEvent(
        created.id,
        'provider.event',
        providerEvent.data,
        current.length + 1,
        providerEvent.actor,
        providerEvent.occurredAt,
      );
      await runtimeStore.appendEvent(stored);
      providerEvents.push(stored);
    }
    const current = await runtimeStore.getRun(created.id);
    if (active.cancellationRequested || current?.status === 'cancelled') {
      const events = await runtimeStore.listEvents(created.id);
      return { run: current!, startEvent: started.event, providerEvents, finalEvent: [...events].reverse().find((item) => item.type === 'run.cancelled') ?? events.at(-1), provider: handle.provider };
    }
    const completed = providerEvents.some((item) => item.data.status === 'completed');
    const providerSummary: JsonObject = {
      harness: handle.provider.harness,
      provider: handle.provider.provider,
      model: handle.provider.model,
      authMode: handle.provider.authMode,
      billingSource: handle.provider.billingSource,
      isMock: handle.provider.isMock,
    };
    const final = completed
      ? await runtimeStore.transition(created.id, 'succeed', { result: { provider: providerSummary, eventCount: providerEvents.length } })
      : await runtimeStore.transition(created.id, 'fail', { reason: 'Codex execution did not complete', error: { code: 'provider_incomplete', message: 'Codex CLI did not emit a completed event.', retryable: true } });
    return { run: final.run, startEvent: started.event, providerEvents, finalEvent: final.event, provider: handle.provider };
  } catch (error) {
    const current = await runtimeStore.getRun(created.id);
    if (active.cancellationRequested || current?.status === 'cancelled') {
      const events = await runtimeStore.listEvents(created.id);
      return { run: current!, startEvent: started.event, providerEvents, finalEvent: [...events].reverse().find((item) => item.type === 'run.cancelled') ?? events.at(-1), provider: handle?.provider ?? (await adapter.probeCapabilities()).identity };
    }
    const final = await runtimeStore.transition(created.id, 'fail', { reason: 'Codex execution failed', error: { code: 'provider_error', message: error instanceof Error ? error.message : String(error), retryable: true } });
    return { run: final.run, startEvent: started.event, providerEvents, finalEvent: final.event, provider: handle?.provider ?? (await adapter.probeCapabilities()).identity };
  } finally {
    activeCodexRuns.delete(created.id);
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
