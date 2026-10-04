import type { RunEvent } from "./types.ts";

export const TERMINAL_RUN_EVENT_TYPES = ["run.succeeded", "run.failed", "run.cancelled"] as const;

export function isTerminalRunEvent(event: Pick<RunEvent, "type">): boolean {
  return (TERMINAL_RUN_EVENT_TYPES as readonly string[]).includes(event.type);
}

/**
 * Return the terminal event for the current retry attempt. A previous
 * attempt's failure is historical and must not block a later bounded retry.
 */
export function currentAttemptTerminalEvent(events: readonly Pick<RunEvent, "type">[]): Pick<RunEvent, "type"> | undefined {
  let lastRetry = -1;
  events.forEach((event, index) => {
    if (event.type === "run.retry_requested") lastRetry = index;
  });
  return events.slice(lastRetry + 1).find((event) => isTerminalRunEvent(event));
}

function stringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

/**
 * Return the stable semantic identity of an event when its producer supplied
 * enough information to deduplicate it. The random event id remains the
 * storage identity; this key protects replay and reconnect paths.
 */
export function semanticEventKey(event: Pick<RunEvent, "type" | "data" | "actor">): string | undefined {
  const data = event.data;
  const explicit = stringField(data, "semanticKey");
  if (explicit) return `${event.type}:semantic:${explicit}`;
  const idempotencyKey = stringField(data, "idempotencyKey");
  if (idempotencyKey) return `${event.type}:idempotency:${idempotencyKey}`;

  if (event.type === "provider.event") {
    const stream = data.stream;
    const sourceId = stringField(data, "sourceEventId")
      ?? stringField(data, "providerEventId")
      ?? stringField(data, "eventId")
      ?? stringField(stream, "id")
      ?? stringField(stream, "event_id")
      ?? stringField(stream, "eventId")
      ?? stringField(stream, "item_id")
      ?? stringField(stream, "itemId");
    if (sourceId) return `${event.type}:source:${event.actor.type === "provider" ? event.actor.provider : "unknown"}:${sourceId}`;
  }

  const attemptId = stringField(data, "attemptId");
  const callId = stringField(data, "callId");
  if (attemptId && callId && (event.type === "tool.invoked" || event.type === "tool.completed" || event.type === "tool.failed" || event.type === "tool.authorization_revoked")) {
    return `${event.type}:attempt:${attemptId}:call:${callId}`;
  }
  if (event.type === "artifact.created") {
    const artifactId = stringField(data, "id");
    if (artifactId) return `${event.type}:artifact:${artifactId}`;
  }
  if (event.type === "approval.requested" || event.type === "approval.resolved") {
    const approvalId = stringField(data, "approvalId") ?? stringField(data, "id");
    if (approvalId) return `${event.type}:approval:${approvalId}`;
  }
  if (event.type === "run.retry_requested") {
    const retry = data.retry;
    const attempt = retry && typeof retry === "object" && !Array.isArray(retry) ? (retry as Record<string, unknown>).attempt : undefined;
    if (typeof attempt === "number" && Number.isInteger(attempt)) return `${event.type}:attempt:${attempt}`;
  }
  return undefined;
}

export function sameSemanticEvent(left: Pick<RunEvent, "type" | "data" | "actor">, right: Pick<RunEvent, "type" | "data" | "actor">): boolean {
  const leftKey = semanticEventKey(left);
  return Boolean(leftKey && leftKey === semanticEventKey(right));
}
