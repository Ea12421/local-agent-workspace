import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ProviderAdapter, ProviderCapabilities, RunEvent, RunHandle, RunRequest } from '../../../packages/core/src/types.ts';

const dataDir = await mkdtemp(path.join(os.tmpdir(), 'local-agent-workspace-orchestrator-provider-'));
process.env.AGENT_WORKSPACE_DATA_DIR = dataDir;
process.env.AGENT_WORKSPACE_DB = path.join(dataDir, 'workspace.db');
const { executeCodexPlanner } = await import('./orchestrator-provider.ts');

test.after(async () => {
  delete process.env.AGENT_WORKSPACE_DATA_DIR;
  delete process.env.AGENT_WORKSPACE_DB;
  await rm(dataDir, { recursive: true, force: true });
});

class StructuredPlannerAdapter implements ProviderAdapter {
  private readonly text: string;
  constructor(text: string) { this.text = text; }
  async probeCapabilities(): Promise<ProviderCapabilities> {
    return {
      streaming: true, toolCalling: false, structuredOutput: true, cancellation: true, resume: false,
      identity: { harness: 'test', provider: 'codex-test', model: 'codex-test', authMode: 'cli', billingSource: 'unknown', isMock: false },
    };
  }
  async startRun(_request: RunRequest): Promise<RunHandle> { return { id: randomUUID(), provider: (await this.probeCapabilities()).identity }; }
  async *streamEvents(handle: RunHandle): AsyncIterable<RunEvent> {
    yield { id: randomUUID() as any, runId: handle.id as any, sequence: 1, type: 'provider.event', occurredAt: new Date().toISOString(), actor: { type: 'provider', provider: handle.provider.provider }, data: { stream: { type: 'item.completed', item: { type: 'agent_message', text: this.text } } } };
    yield { id: randomUUID() as any, runId: handle.id as any, sequence: 2, type: 'provider.event', occurredAt: new Date().toISOString(), actor: { type: 'provider', provider: handle.provider.provider }, data: { stream: { type: 'turn.completed', usage: { input_tokens: 4, output_tokens: 8 } } } };
    yield { id: randomUUID() as any, runId: handle.id as any, sequence: 3, type: 'provider.event', occurredAt: new Date().toISOString(), actor: { type: 'provider', provider: handle.provider.provider }, data: { status: 'completed' } };
  }
  async cancel(_handle: RunHandle): Promise<void> {}
  async resume(_handle: RunHandle): Promise<void> {}
}

const catalog = { capabilities: [{ kind: 'tool' as const, id: 'filesystem.read', label: '读取项目文件', readOnly: true }] };

test('real planner bridge validates structured model output before returning it', async () => {
  const output = JSON.stringify({ schemaVersion: 'orchestrator.plan.v1', objective: '检查项目文件', intent: 'inspect_project', steps: [{ id: 'model-step-1', order: 1, objective: '读取 package.json', capability: { kind: 'tool', id: 'filesystem.read' }, inputRefs: ['path:package.json'] }] });
  const result = await executeCodexPlanner({ objective: '检查项目文件', catalog, maxSteps: 8, cwd: process.cwd(), scope: {}, adapterFactory: () => new StructuredPlannerAdapter(output) });
  assert.equal(result.run.status, 'succeeded');
  assert.equal(result.provider, 'openai-codex');
  assert.equal((result.output as any)?.steps[0]?.capability.id, 'filesystem.read');
  assert.ok(result.events.some((event) => event.type === 'provider.event' && (event.data as any).phase === 'provider.output-validation' && (event.data as any).valid === true));
});

test('real planner bridge fails closed on schema-invalid model output', async () => {
  const result = await executeCodexPlanner({ objective: '检查项目文件', catalog, maxSteps: 8, cwd: process.cwd(), scope: {}, adapterFactory: () => new StructuredPlannerAdapter('{"schemaVersion":"wrong"}') });
  assert.equal(result.run.status, 'failed');
  assert.equal(result.output, undefined);
  assert.ok(result.events.some((event) => event.type === 'provider.event' && (event.data as any).phase === 'provider.output-validation' && (event.data as any).valid === false));
});
