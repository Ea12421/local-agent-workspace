import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  InMemoryRunStore,
  createRunEvent,
  type JsonObject,
  type RunEvent,
  type RunId,
} from '../../../packages/core/src/index.ts';
import { addSemanticEventData } from './event-idempotency.ts';
import { JsonlEventLog, openSqliteProductBuilderContinuity, openSqliteRunStore } from './persistence.ts';

const projectId = 'semantic-idempotency-project' as any;
const botId = 'semantic-idempotency-bot' as any;

function event(runId: RunId, sequence: number, type: RunEvent['type'], data: JsonObject): RunEvent {
  return createRunEvent(runId, type, data, sequence, { type: 'system' });
}

test('semantic event replay is idempotent while distinct attempts remain distinct', async () => {
  const store = new InMemoryRunStore();
  const run = await store.createRun({ id: 'run-semantic-memory' as any, projectId, botId, request: { objective: 'semantic replay', input: {} } });
  const first = event(run.id, 2, 'provider.event', {
    attemptId: 'run-semantic-memory:attempt:1',
    sourceEventId: 'provider-event-1',
    semanticKey: 'provider-event-1',
  });
  await store.appendEvent(first);
  await store.appendEvent(event(run.id, 99, 'provider.event', {
    attemptId: 'run-semantic-memory:attempt:1',
    sourceEventId: 'provider-event-1',
    semanticKey: 'provider-event-1',
  }));
  await store.appendEvent(event(run.id, 3, 'provider.event', {
    attemptId: 'run-semantic-memory:attempt:2',
    sourceEventId: 'provider-event-1',
    semanticKey: 'provider-event-1-attempt-2',
  }));
  const events = await store.listEvents(run.id);
  assert.equal(events.filter((item) => item.type === 'provider.event').length, 2);
  assert.deepEqual(events.map((item) => item.sequence), [1, 2, 3]);

  await store.appendEvent(event(run.id, 4, 'provider.event', { sourceEventId: 'provider-event-2', semanticKey: 'provider-event-2' }));
  await store.appendEvent(event(run.id, 5, 'provider.event', { sourceEventId: 'provider-event-1-replayed-late', semanticKey: 'provider-event-1-replayed-late' }));
  assert.deepEqual((await store.listEvents(run.id)).slice(-2).map((item) => item.data.sourceEventId), ['provider-event-2', 'provider-event-1-replayed-late']);
});

test('terminal events are preserved, duplicate finals are dropped, and a bounded retry starts a new attempt', async () => {
  const store = new InMemoryRunStore();
  const run = await store.createRun({ id: 'run-semantic-terminal' as any, projectId, botId, request: { objective: 'terminal replay', input: {} } });
  await store.appendEvent(event(run.id, 2, 'run.succeeded', { semanticKey: 'final-attempt-1', result: { ok: true } }));
  await store.appendEvent(event(run.id, 99, 'run.succeeded', { semanticKey: 'final-attempt-1', result: { ok: true } }));
  await assert.rejects(() => store.appendEvent(event(run.id, 3, 'run.failed', { semanticKey: 'different-final', error: { code: 'late', message: 'late', retryable: false } })), /Cannot append terminal event/);
  await store.appendEvent(event(run.id, 3, 'run.retry_requested', { retry: { attempt: 1, maxRetries: 1, mode: 'manual', reasonClass: 'manual' } }));
  await store.appendEvent(event(run.id, 4, 'run.failed', { semanticKey: 'final-attempt-2', error: { code: 'attempt-2', message: 'failed again', retryable: false } }));
  assert.equal((await store.listEvents(run.id)).filter((item) => item.type === 'run.succeeded').length, 1);
  assert.equal((await store.listEvents(run.id)).filter((item) => item.type === 'run.failed').length, 1);
});

test('tool and artifact semantic keys prevent replayed side effects', async () => {
  const store = new InMemoryRunStore();
  const run = await store.createRun({ id: 'run-semantic-tool' as any, projectId, botId, request: { objective: 'tool replay', input: {} } });
  await store.appendEvent(event(run.id, 2, 'tool.invoked', { callId: 'call-1', attemptId: 'attempt-1', semanticKey: 'call-1' }));
  await store.appendEvent(event(run.id, 99, 'tool.invoked', { callId: 'call-1', attemptId: 'attempt-1', semanticKey: 'call-1' }));
  await store.appendEvent(event(run.id, 3, 'artifact.created', { id: 'artifact-1', semanticKey: 'artifact-1' }));
  await store.appendEvent(event(run.id, 99, 'artifact.created', { id: 'artifact-1', semanticKey: 'artifact-1' }));
  const events = await store.listEvents(run.id);
  assert.equal(events.filter((item) => item.type === 'tool.invoked').length, 1);
  assert.equal(events.filter((item) => item.type === 'artifact.created').length, 1);
});

test('provider replay keys are stable within a segment and differ across attempts', () => {
  const runId = 'run-semantic-helper' as RunId;
  const data = { stream: { type: 'item.completed', item_id: 'item-1' } } as JsonObject;
  const first = addSemanticEventData(runId, 'provider.event', data, [], 'segment:1');
  const replay = addSemanticEventData(runId, 'provider.event', data, [], 'segment:1');
  const nextAttempt = addSemanticEventData(runId, 'provider.event', data, [], 'segment:2');
  assert.equal(first.semanticKey, replay.semanticKey);
  assert.notEqual(first.semanticKey, nextAttempt.semanticKey);
});

test('SQLite event replay survives restart and keeps the first terminal receipt', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-semantic-idempotency-'));
  const filePath = path.join(dir, 'workspace.db');
  const first = openSqliteRunStore(filePath);
  const run = await first.store.createRun({ id: 'run-semantic-sqlite' as any, projectId, botId, request: { objective: 'sqlite replay', input: {} } });
  await first.store.appendEvent(event(run.id, 2, 'provider.event', { semanticKey: 'provider-segment-1', sourceEventId: 'source-1' }));
  await first.store.appendEvent(event(run.id, 99, 'provider.event', { semanticKey: 'provider-segment-1', sourceEventId: 'source-1' }));
  first.close();

  const reopened = openSqliteRunStore(filePath);
  await reopened.store.appendEvent(event(run.id, 3, 'provider.event', { semanticKey: 'provider-segment-2', sourceEventId: 'source-2' }));
  await reopened.store.appendEvent(event(run.id, 4, 'run.succeeded', { semanticKey: 'sqlite-final-1' }));
  await reopened.store.appendEvent(event(run.id, 99, 'run.succeeded', { semanticKey: 'sqlite-final-1' }));
  await assert.rejects(() => reopened.store.appendEvent(event(run.id, 5, 'run.cancelled', { semanticKey: 'sqlite-final-other' })), /Cannot append terminal event/);
  assert.deepEqual((await reopened.store.listEvents(run.id)).map((item) => item.sequence), [1, 2, 3, 4]);
  reopened.close();

  const continuity = openSqliteProductBuilderContinuity(path.join(dir, 'continuity.db'));
  assert.ok(continuity);
  const provider = { harness: 'test', provider: 'fixture', model: 'fixture', authMode: 'local' as const, billingSource: 'local' as const, isMock: true };
  continuity.entityStore.saveProviderReceipt({ id: 'receipt-semantic', runId: run.id, segment: 1, provider, receipt: { status: 'succeeded' }, createdAt: '2026-10-03T00:00:00.000Z' });
  continuity.entityStore.saveProviderReceipt({ id: 'receipt-semantic', runId: run.id, segment: 1, provider, receipt: { status: 'succeeded' }, createdAt: '2026-10-03T00:00:00.000Z' });
  continuity.entityStore.saveProviderReceipt({ id: 'receipt-semantic', runId: run.id, segment: 1, provider, receipt: { status: 'failed', reason: 'reconnect variant' }, createdAt: '2026-10-03T00:00:01.000Z' });
  const receipts = continuity.entityStore.listReceipts(run.id);
  assert.equal(receipts.length, 2);
  assert.equal(receipts[0]?.id, 'receipt-semantic');
  assert.equal(receipts[0]?.receipt.status, 'succeeded');
  assert.match(receipts[1]?.id ?? '', /^receipt-semantic:variant:/);
  continuity.close();

  const jsonl = new JsonlEventLog(path.join(dir, 'events.jsonl'));
  await jsonl.append(event(run.id, 1, 'provider.event', { semanticKey: 'jsonl-replay' }) as unknown as Record<string, unknown>);
  await jsonl.append(event(run.id, 99, 'provider.event', { semanticKey: 'jsonl-replay' }) as unknown as Record<string, unknown>);
  await jsonl.append(event('run-jsonl-other' as RunId, 1, 'provider.event', { semanticKey: 'jsonl-replay' }) as unknown as Record<string, unknown>);
  assert.equal((await jsonl.readAll()).length, 2);
  await rm(dir, { recursive: true, force: true });
});
