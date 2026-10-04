import { createHash } from 'node:crypto';
import type { JsonObject, RunEvent, RunId } from '../../../packages/core/src/index.ts';

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'semanticKey')
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function hash(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

function stringField(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function numberField(value: unknown, key: string): number | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'number' && Number.isInteger(candidate) ? candidate : undefined;
}

function attemptId(runId: RunId, events: readonly RunEvent[], scope?: string): string {
  if (scope) return `${runId}:${scope}`;
  const retries = events.filter((event) => event.type === 'run.retry_requested').length;
  return `${runId}:attempt:${retries + 1}`;
}

/** Add a stable semantic key without changing provider payload fields. */
export function addSemanticEventData(
  runId: RunId,
  type: RunEvent['type'],
  data: JsonObject,
  events: readonly RunEvent[],
  scope?: string,
): JsonObject {
  if (typeof data.semanticKey === 'string' && data.semanticKey.length > 0) return data;
  const currentAttemptId = attemptId(runId, events, scope);
  const callId = stringField(data, 'callId');
  if ((type === 'tool.invoked' || type === 'tool.completed' || type === 'tool.failed') && callId) {
    return { ...data, attemptId: currentAttemptId, semanticKey: `${type}:${currentAttemptId}:call:${callId}` };
  }
  if (type === 'artifact.created') {
    const artifactId = stringField(data, 'id');
    if (artifactId) return { ...data, semanticKey: `${type}:artifact:${artifactId}` };
  }
  if (type === 'provider.event') {
    const stream = data.stream;
    const sourceId = stringField(data, 'sourceEventId')
      ?? stringField(data, 'providerEventId')
      ?? stringField(data, 'eventId')
      ?? stringField(stream, 'id')
      ?? stringField(stream, 'event_id')
      ?? stringField(stream, 'eventId')
      ?? stringField(stream, 'item_id')
      ?? stringField(stream, 'itemId');
    const sourceKey = sourceId ? `source:${sourceId}` : `hash:${hash(data)}`;
    return { ...data, attemptId: currentAttemptId, semanticKey: `${type}:${currentAttemptId}:${sourceKey}` };
  }
  const segment = numberField(data, 'segment');
  if (segment !== undefined && (type === 'run.segment_started' || type === 'run.segment_completed' || type === 'run.resume_requested')) {
    return { ...data, semanticKey: `${type}:segment:${segment}` };
  }
  return data;
}
