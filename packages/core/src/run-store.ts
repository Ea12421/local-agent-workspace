import { createRunEventId, createRunId } from "./ids.ts";
import { transitionRun } from "./state-machine.ts";
import type {
  CreateRunInput,
  EventActor,
  Run,
  RunAction,
  RunEvent,
  RunEventType,
  RunId,
  RunRequest,
  RunTransitionOptions,
  RunTransitionResult,
} from "./types.ts";

export interface RunStore {
  createRun(input: CreateRunInput): Promise<Run>;
  getRun(runId: RunId): Promise<Run | undefined>;
  listRuns(projectId?: string): Promise<Run[]>;
  listEvents(runId: RunId): Promise<RunEvent[]>;
  appendEvent(event: RunEvent): Promise<void>;
  transition(runId: RunId, action: RunAction, options?: RunTransitionOptions): Promise<RunTransitionResult>;
}

function isoNow(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  // Domain values are JSON-safe by contract. Structured cloning also keeps
  // callers from mutating values held by this in-memory repository.
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Small repository used by fixtures and tests. Its append-only event array is
 * intentionally visible through listEvents, while state updates happen only
 * through transition().
 */
export class InMemoryRunStore implements RunStore {
  private readonly runs = new Map<RunId, Run>();
  private readonly events = new Map<RunId, RunEvent[]>();
  private readonly idempotentTransitions = new Map<string, { action: RunAction; result: RunTransitionResult }>();

  async createRun(input: CreateRunInput): Promise<Run> {
    const now = input.now ?? isoNow();
    const run: Run = {
      id: input.id ?? createRunId(),
      projectId: input.projectId,
      botId: input.botId,
      request: clone(input.request),
      status: "queued",
      version: 0,
      createdAt: now,
      updatedAt: now,
    };
    if (this.runs.has(run.id)) throw new Error(`Run already exists: ${run.id}`);
    this.runs.set(run.id, clone(run));
    const created: RunEvent = {
      id: createRunEventId(),
      runId: run.id,
      sequence: 1,
      type: "run.created",
      occurredAt: now,
      actor: { type: "system" },
      data: {
        status: "queued",
        projectId: run.projectId,
        botId: run.botId,
        objective: run.request.objective,
      },
    };
    this.events.set(run.id, [created]);
    return clone(run);
  }

  async getRun(runId: RunId): Promise<Run | undefined> {
    const run = this.runs.get(runId);
    return run ? clone(run) : undefined;
  }

  async listRuns(projectId?: string): Promise<Run[]> {
    const values = [...this.runs.values()].filter((run) => !projectId || run.projectId === projectId);
    return clone(values);
  }

  async listEvents(runId: RunId): Promise<RunEvent[]> {
    return clone(this.events.get(runId) ?? []);
  }

  async appendEvent(event: RunEvent): Promise<void> {
    const events = this.events.get(event.runId);
    if (!events) throw new Error(`Cannot append event for unknown run: ${event.runId}`);
    const expectedSequence = events.length + 1;
    if (event.sequence !== expectedSequence) {
      throw new Error(`Event sequence must be ${expectedSequence}, received ${event.sequence}`);
    }
    if (events.some((existing) => existing.id === event.id)) {
      throw new Error(`Duplicate event id: ${event.id}`);
    }
    events.push(clone(event));
  }

  async transition(runId: RunId, action: RunAction, options: RunTransitionOptions = {}): Promise<RunTransitionResult> {
    const idempotencyKey = options.idempotencyKey;
    if (idempotencyKey) {
      const previous = this.idempotentTransitions.get(`${runId}:${idempotencyKey}`);
      if (previous) {
        if (previous.action !== action) {
          throw new Error(`Idempotency key already used for action ${previous.action}: ${idempotencyKey}`);
        }
        return { run: clone(previous.result.run), event: clone(previous.result.event) };
      }
    }
    const current = this.runs.get(runId);
    if (!current) throw new Error(`Unknown run: ${runId}`);
    const events = this.events.get(runId);
    if (!events) throw new Error(`Events missing for run: ${runId}`);
    const result = transitionRun(current, action, options, events.length + 1);
    await this.appendEvent(result.event);
    this.runs.set(runId, clone(result.run));
    if (idempotencyKey) this.idempotentTransitions.set(`${runId}:${idempotencyKey}`, { action, result: clone(result) });
    return { run: clone(result.run), event: clone(result.event) };
  }
}

export function createRunRequest(objective: string, input: RunRequest["input"] = {}): RunRequest {
  return { objective, input };
}

/** Utility for adapters that need to append a non-transition event. */
export function createRunEvent(
  runId: RunId,
  type: RunEventType,
  data: RunEvent["data"],
  sequence: number,
  actor: EventActor = { type: "system" },
  occurredAt = isoNow(),
): RunEvent {
  return { id: createRunEventId(), runId, type, data, sequence, actor, occurredAt };
}
