import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ProviderAdapter, ProviderCapabilities, RunEvent, RunHandle, RunRequest } from '../../../packages/core/src/types.ts';
import { JsonlContextSnapshotStore } from './persistence.ts';
import { snapshot, cancelCodexRun, createRuntimeRun, executeCodexRun, runtimeStore } from './runtime.ts';

test('core runtime keeps an inspectable fixture and starts new runs', async () => {
  const fixture = await snapshot();
  assert.equal(fixture.run.status, 'succeeded');
  assert.ok(fixture.events.length >= 5);
  const created = await createRuntimeRun('验证一个新的产品想法');
  assert.equal(created.run.status, 'running');
  assert.equal(created.event.type, 'run.started');
});

class SequenceAdapter implements ProviderAdapter {
  private readonly completes: boolean;

  constructor(completes: boolean) {
    this.completes = completes;
  }

  async probeCapabilities(): Promise<ProviderCapabilities> {
    return {
      streaming: true,
      toolCalling: false,
      structuredOutput: true,
      cancellation: true,
      resume: false,
      identity: {
        harness: 'test',
        provider: 'sequence-fixture',
        model: 'sequence-fixture',
        authMode: 'local',
        billingSource: 'local',
        isMock: true,
      },
    };
  }

  async startRun(_request: RunRequest): Promise<RunHandle> {
    return { id: randomUUID(), provider: (await this.probeCapabilities()).identity };
  }

  async *streamEvents(handle: RunHandle): AsyncIterable<RunEvent> {
    yield {
      id: `sequence-event-${randomUUID()}` as RunEvent['id'],
      runId: `external-${handle.id}` as RunEvent['runId'],
      sequence: 1,
      type: 'provider.event',
      occurredAt: new Date().toISOString(),
      actor: { type: 'provider', provider: handle.provider.provider },
      data: this.completes ? { status: 'completed' } : { status: 'failed', retryable: true },
    };
  }

  async cancel(_handle: RunHandle): Promise<void> {}
  async resume(_handle: RunHandle): Promise<void> {}
}

test('runtime resumes the same logical run in a new segment after a provider interruption', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agent-workspace-runtime-resume-'));
  const contextStore = new JsonlContextSnapshotStore(path.join(dir, 'context-snapshots.jsonl'));
  let factoryCalls = 0;
  let resumedPacket: import('../../../packages/core/src/types.ts').ContextPacket | undefined;
  const result = await executeCodexRun('跨上下文限制继续执行', { source: 'test' }, {
    maxSegments: 2,
    contextSnapshotStore: contextStore,
    adapterFactory: (_segment, packet) => {
      factoryCalls += 1;
      if (packet) resumedPacket = packet;
      return new SequenceAdapter(factoryCalls === 2);
    },
  });
  const events = await runtimeStore.listEvents(result.run.id);
  const types = events.map((event) => event.type);
  assert.equal(result.run.status, 'succeeded');
  assert.equal(factoryCalls, 2);
  assert.ok(resumedPacket?.snapshot.id);
  assert.ok((resumedPacket?.tailEvents.length ?? 0) > 0);
  assert.equal(new Set(events.map((event) => event.runId)).size, 1);
  assert.equal(types.filter((type) => type === 'run.segment_started').length, 2);
  assert.ok(types.includes('run.resume_requested'));
  assert.ok(types.includes('context.snapshot_created'));
  assert.equal((await contextStore.latest('project-product-builder', result.run.id))?.runId, result.run.id);
  await rm(dir, { recursive: true, force: true });
});

test('control plane cancels an active Codex run before it can be marked succeeded', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agent-workspace-runtime-cancel-'));
  const binary = path.join(dir, 'fake-codex.mjs');
  await writeFile(binary, [
    '#!/usr/bin/env node',
    "if (process.argv[2] === '--version') { console.log('codex-cli test'); process.exit(0); }",
    "if (process.argv[2] === 'login') { console.log('Logged in using ChatGPT'); process.exit(0); }",
    "console.log(JSON.stringify({ type: 'item.started', item: { type: 'command_execution' } }));",
    'setTimeout(() => {}, 10_000);',
  ].join('\n'));
  await chmod(binary, 0o755);
  const previous = process.env.CODEX_BIN;
  process.env.CODEX_BIN = binary;
  try {
    const pending = executeCodexRun('cancel this run', { source: 'test' });
    let run;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      run = (await runtimeStore.listRuns()).at(-1);
      if (run?.status === 'running') break;
    }
    assert.equal(run?.status, 'running');
    const cancelled = await cancelCodexRun(run!.id);
    assert.equal(cancelled?.status, 'cancelled');
    const result = await pending;
    assert.equal(result.run.status, 'cancelled');
    assert.equal(result.finalEvent?.type, 'run.cancelled');
    const events = await runtimeStore.listEvents(result.run.id);
    assert.ok(events.some((item) => item.type === 'run.cancelled'));
    assert.ok(!events.some((item) => item.type === 'run.succeeded'));
  } finally {
    if (previous === undefined) delete process.env.CODEX_BIN;
    else process.env.CODEX_BIN = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
