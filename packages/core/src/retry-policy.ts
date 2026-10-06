import type { Run, RunError, RunEvent, RunTransitionOptions, RetryAttemptMetadata, RetryMode, RetryReasonClass } from "./types.ts";

/** Default budget for a run. It counts retries after the initial execution. */
export const DEFAULT_MAX_RETRIES = 2;
/** A request may lower the default, but never raise this process safety cap. */
export const MAX_RETRIES_HARD_LIMIT = 5;

export class RetryBudgetExceededError extends Error {
  readonly runId: string;
  readonly attempts: number;
  readonly maxRetries: number;

  constructor(runId: string, attempts: number, maxRetries: number) {
    super(`Retry budget exhausted for run ${runId}: ${attempts}/${maxRetries}`);
    this.name = "RetryBudgetExceededError";
    this.runId = runId;
    this.attempts = attempts;
    this.maxRetries = maxRetries;
  }
}

export function normalizeMaxRetries(value: unknown, fallback = DEFAULT_MAX_RETRIES): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_RETRIES_HARD_LIMIT, Math.max(0, Math.floor(value)));
}

export function maxRetriesForRun(run: Pick<Run, "request">): number {
  return normalizeMaxRetries(run.request.retryPolicy?.maxRetries);
}

export function retryEvents(events: readonly RunEvent[]): RunEvent[] {
  return events.filter((event) => event.type === "run.retry_requested");
}

export function retryAttemptCount(events: readonly RunEvent[]): number {
  return retryEvents(events).length;
}

export function classifyRetryReason(error: RunError | undefined, mode: RetryMode): RetryReasonClass {
  if (mode === "manual") return "manual";
  const code = String(error?.code ?? "").toLowerCase();
  if (/(quota|rate[_-]?limit|too_many_requests|\b429\b)/.test(code)) return "provider_limit";
  if (/(tool|filesystem|shell)/.test(code)) return "tool_transient";
  if (/(timeout|temporar|unavailable|network|connection|provider|receipt|\b5\d\d\b)/.test(code)) return "provider_transient";
  return "unknown";
}

/**
 * Adds a unique, auditable retry attempt to a transition without changing the
 * database schema. The caller must still decide whether the failure itself is
 * retryable; this helper only owns the bounded attempt contract.
 */
export function prepareRetryTransition(
  run: Run,
  events: readonly RunEvent[],
  options: RunTransitionOptions = {},
): RunTransitionOptions {
  const maxRetries = maxRetriesForRun(run);
  const attempts = retryAttemptCount(events);
  if (attempts >= maxRetries) throw new RetryBudgetExceededError(String(run.id), attempts, maxRetries);
  const attempt = attempts + 1;
  const mode = options.retry?.mode ?? "automatic";
  const retry: RetryAttemptMetadata = {
    attempt,
    maxRetries,
    mode,
    reasonClass: options.retry?.reasonClass ?? classifyRetryReason(run.error, mode),
    ...(run.error?.code ? { previousFailureCode: run.error.code } : {}),
  };
  return {
    ...options,
    idempotencyKey: options.idempotencyKey ?? `retry:${String(run.id)}:attempt:${attempt}`,
    retry,
  };
}
