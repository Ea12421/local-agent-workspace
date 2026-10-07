import { createRunEventId } from "./ids.ts";
import type {
  EventActor,
  JsonObject,
  Run,
  RunAction,
  RunEvent,
  RunEventType,
  RunTransitionOptions,
  RunTransitionResult,
  RunStatus,
} from "./types.ts";

const DEFAULT_ACTOR: EventActor = { type: "system" };

const TRANSITIONS: Record<RunStatus, Partial<Record<RunAction, RunStatus>>> = {
  queued: { start: "running", cancel: "cancelled" },
  running: { wait_user: "waiting_user", succeed: "succeeded", fail: "failed", cancel: "cancelled" },
  waiting_user: { resume: "running", cancel: "cancelled" },
  succeeded: {},
  failed: { retry: "queued" },
  cancelled: {},
};

const EVENT_TYPES: Record<RunAction, RunEventType> = {
  start: "run.started",
  wait_user: "run.waiting_user",
  resume: "run.resumed",
  succeed: "run.succeeded",
  fail: "run.failed",
  cancel: "run.cancelled",
  retry: "run.retry_requested",
};

export class InvalidRunTransitionError extends Error {
  readonly runId: string;
  readonly status: RunStatus;
  readonly action: RunAction;

  constructor(run: Run, action: RunAction) {
    super(`Cannot ${action} run ${run.id} while it is ${run.status}`);
    this.name = "InvalidRunTransitionError";
    this.runId = run.id;
    this.status = run.status;
    this.action = action;
  }
}

function isoNow(): string {
  return new Date().toISOString();
}

/**
 * Pure state transition. The input run is never mutated, which keeps replay
 * and recovery deterministic. Persistence and event sequencing belong to the
 * repository layer.
 */
export function transitionRun(
  run: Run,
  action: RunAction,
  options: RunTransitionOptions = {},
  sequence = 1,
): RunTransitionResult {
  const nextStatus = TRANSITIONS[run.status][action];
  if (!nextStatus) throw new InvalidRunTransitionError(run, action);

  const now = options.now ?? isoNow();
  const nextRun: Run = {
    ...run,
    status: nextStatus,
    version: run.version + 1,
    updatedAt: now,
  };

  if (action === "start") nextRun.startedAt = now;
  if (action === "wait_user") nextRun.waitingReason = options.reason ?? "User input required";
  if (action === "resume") delete nextRun.waitingReason;
  if (action === "succeed") {
    nextRun.result = options.result;
    nextRun.completedAt = now;
  }
  if (action === "fail") {
    nextRun.error = options.error ?? {
      code: "RUN_FAILED",
      message: options.reason ?? "Run failed",
      retryable: false,
    };
    nextRun.completedAt = now;
  }
  if (action === "cancel") {
    nextRun.error = undefined;
    nextRun.completedAt = now;
  }
  if (action === "retry") {
    nextRun.error = undefined;
    nextRun.completedAt = undefined;
    nextRun.waitingReason = undefined;
  }

  const data: RunEvent["data"] = {
    action,
    fromStatus: run.status,
    toStatus: nextStatus,
  };
  if (options.reason) data.reason = options.reason;
  if (options.result !== undefined && action === "succeed") data.result = options.result;
  if (options.error !== undefined && action === "fail") {
    const error: JsonObject = {
      code: options.error.code,
      message: options.error.message,
      retryable: options.error.retryable,
    };
    if (options.error.details !== undefined) error.details = options.error.details;
    data.error = error;
  }
  if (options.idempotencyKey && action === "retry") data.idempotencyKey = options.idempotencyKey;
  if (options.retry && action === "retry") {
    data.retry = {
      attempt: options.retry.attempt,
      maxRetries: options.retry.maxRetries,
      mode: options.retry.mode,
      reasonClass: options.retry.reasonClass,
      ...(options.retry.previousFailureCode ? { previousFailureCode: options.retry.previousFailureCode } : {}),
    };
  }

  const event: RunEvent = {
    id: createRunEventId(),
    runId: run.id,
    sequence,
    type: EVENT_TYPES[action],
    occurredAt: now,
    actor: options.actor ?? DEFAULT_ACTOR,
    data,
    correlationId: options.correlationId,
  };

  return { run: nextRun, event };
}

export function canTransition(status: RunStatus, action: RunAction): boolean {
  return Boolean(TRANSITIONS[status][action]);
}

export function allowedActions(status: RunStatus): RunAction[] {
  return Object.keys(TRANSITIONS[status]) as RunAction[];
}
