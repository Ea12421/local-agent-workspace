import test from 'node:test';
import assert from 'node:assert/strict';
import type { ModelRequestEnvelope, ProviderIdentity, ProviderResponseEnvelope, RunRequest } from '../../../packages/core/src/types.ts';
import { InMemoryRunStore } from '../../../packages/core/src/run-store.ts';
import { normalizeProviderResponse } from '../../../packages/adapters/src/provider-envelope.ts';
import { FixtureToolRuntime, LocalToolRuntime } from '../../../packages/adapters/src/tool-runtime.ts';
import { FixtureToolLoopProvider, runToolLoop, type ToolLoopProvider } from './tool-loop.ts';

const projectId = 'tool-loop-project' as any;
const botId = 'tool-loop-bot' as any;
const identity: ProviderIdentity = { harness: 'test', provider: 'test', model: 'test-v1', authMode: 'local', billingSource: 'local', isMock: true };

async function startedRun(store: InMemoryRunStore, objective = '验证工具循环') {
  const run = await store.createRun({ projectId, botId, request: { objective, input: {} } satisfies RunRequest });
  return (await store.transition(run.id, 'start')).run;
}

test('fixture Tool Loop performs model → read tool → result → next model → artifact', async () => {
  const store = new InMemoryRunStore();
  const run = await startedRun(store);
  const result = await runToolLoop({ store, run, provider: new FixtureToolLoopProvider(), workspaceRoot: process.cwd() });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.run.status, 'succeeded');
  assert.ok(result.artifact?.id);
  const events = await store.listEvents(run.id);
  assert.deepEqual(events.map((event) => event.type), [
    'run.created', 'run.started', 'provider.event', 'tool.invoked', 'tool.completed', 'provider.event', 'artifact.created', 'run.succeeded',
  ]);
  assert.equal(events.filter((event) => event.type === 'provider.event').length, 2);
});

test('Tool Loop carries provider replay fields into the next assistant message', async () => {
  const store = new InMemoryRunStore();
  const run = await startedRun(store, '验证推理字段回放');
  let secondRequest: ModelRequestEnvelope | undefined;
  const provider: ToolLoopProvider = {
    identity,
    async respond(request) {
      if (request.messages.some((message) => message.role === 'tool')) {
        secondRequest = request;
        return normalizeProviderResponse({ requestId: request.requestId, provider: identity, raw: { final: true }, outputText: '完成', usage: { source: 'unknown' } });
      }
      return normalizeProviderResponse({ requestId: request.requestId, provider: identity, raw: { tool: true }, toolCalls: [{ callId: 'reasoning-call-1', name: 'filesystem.read', arguments: { path: 'fixtures/demo-project.json' } }], providerFields: { providerFormat: 'deepseek-chat-completions', reasoning_content: '先读取文件。' }, usage: { source: 'unknown' } });
    },
  };
  const result = await runToolLoop({
    store, run, provider, workspaceRoot: process.cwd(), toolRuntime: new LocalToolRuntime(), toolRuntimeMode: 'local',
    toolPolicy: { permissionTier: 'read_only', allowedTools: ['filesystem'], approvalRequiredActions: [] },
  });
  assert.equal(result.status, 'succeeded');
  const assistant = secondRequest?.messages.find((message) => message.role === 'assistant');
  assert.equal(assistant?.providerFields?.reasoning_content, '先读取文件。');
});

test('explicit local Tool Loop reads a real workspace file and preserves the event contract', async () => {
  const store = new InMemoryRunStore();
  const run = await startedRun(store, '验证本地只读工具循环');
  const result = await runToolLoop({
    store,
    run,
    provider: new FixtureToolLoopProvider(),
    toolRuntime: new LocalToolRuntime(),
    toolRuntimeMode: 'local',
    toolPolicy: { permissionTier: 'read_only', allowedTools: ['filesystem'], approvalRequiredActions: [] },
    workspaceRoot: process.cwd(),
  });
  assert.equal(result.status, 'succeeded');
  const events = await store.listEvents(run.id);
  assert.deepEqual(events.map((event) => event.type), [
    'run.created', 'run.started', 'provider.event', 'tool.invoked', 'tool.completed', 'provider.event', 'artifact.created', 'run.succeeded',
  ]);
  const completed = events.find((event) => event.type === 'tool.completed');
  assert.equal(completed?.data.mode, 'local');
  assert.equal((completed?.data.output as any)?.relativePath, 'fixtures/demo-project.json');
  assert.match(String((completed?.data.output as any)?.content), /AI Product Builder Demo/);
  assert.equal(events.filter((event) => event.type === 'tool.invoked').length, 1);
});

test('schema-invalid tool call fails before ToolRuntime and creates no artifact', async () => {
  const store = new InMemoryRunStore();
  const run = await startedRun(store);
  let executions = 0;
  const runtime = new class extends FixtureToolRuntime {
    override async execute(request: any) { executions += 1; return super.execute(request); }
  }();
  const result = await runToolLoop({ store, run, provider: new FixtureToolLoopProvider('schema-error'), toolRuntime: runtime, workspaceRoot: process.cwd() });
  assert.equal(result.run.status, 'failed');
  assert.equal(executions, 0);
  assert.equal((await store.listEvents(run.id)).some((event) => event.type === 'artifact.created'), false);
  assert.equal(result.error?.errorCode, 'tool_schema_invalid');
});

test('approval-required write waits, then rejection fails without invoking ToolRuntime', async () => {
  const store = new InMemoryRunStore();
  const run = await startedRun(store);
  let executions = 0;
  const runtime = new class extends FixtureToolRuntime {
    override async execute(request: any) { executions += 1; return super.execute(request); }
  }();
  const pending = await runToolLoop({ store, run, provider: new FixtureToolLoopProvider('approval'), toolRuntime: runtime, workspaceRoot: process.cwd() });
  assert.equal(pending.run.status, 'waiting_user');
  assert.equal(executions, 0);
  const resumed = await runToolLoop({
    store, run: pending.run, provider: new FixtureToolLoopProvider('approval'), toolRuntime: runtime, workspaceRoot: process.cwd(),
    approvalDecisions: { 'fixture-call-1': 'rejected' },
  });
  assert.equal(resumed.run.status, 'failed');
  assert.equal(executions, 0);
  const events = await store.listEvents(run.id);
  assert.equal(events.filter((event) => event.type === 'approval.requested').length, 1);
  assert.equal(events.filter((event) => event.type === 'approval.resolved').length, 1);
  assert.equal(events.some((event) => event.type === 'tool.invoked'), false);
});

test('authorization verifier blocks an approved tool after dynamic revocation', async () => {
  const store = new InMemoryRunStore();
  const run = await startedRun(store, '动态撤销授权');
  let executions = 0;
  const runtime = new class extends FixtureToolRuntime {
    override async execute(request: any) { executions += 1; return super.execute(request); }
  }();
  const pending = await runToolLoop({ store, run, provider: new FixtureToolLoopProvider('approval'), toolRuntime: runtime, workspaceRoot: process.cwd() });
  assert.equal(pending.run.status, 'waiting_user');
  const resumed = await runToolLoop({
    store, run: pending.run, provider: new FixtureToolLoopProvider('approval'), toolRuntime: runtime, workspaceRoot: process.cwd(),
    approvalDecisions: { 'fixture-call-1': 'approved' },
    authorizationVerifier: () => ({ allowed: false, policyVersion: 1, reasonCode: 'authorization_revoked' as const, message: 'approval was revoked before execution' }),
  });
  assert.equal(resumed.run.status, 'failed');
  assert.equal(executions, 0);
  const events = await store.listEvents(run.id);
  assert.equal(events.filter((event) => event.type === 'tool.authorization_revoked').length, 1);
  assert.equal(events.filter((event) => event.type === 'tool.invoked').length, 0);
  assert.equal(resumed.error?.errorCode, 'tool_authorization_revoked');
});

test('tool invocation audit omits filesystem.write content', async () => {
  const store = new InMemoryRunStore();
  const run = await startedRun(store, '写入审计');
  const pending = await runToolLoop({ store, run, provider: new FixtureToolLoopProvider('approval'), workspaceRoot: process.cwd() });
  const resumed = await runToolLoop({
    store, run: pending.run, provider: new FixtureToolLoopProvider('approval'), workspaceRoot: process.cwd(),
    approvalDecisions: { 'fixture-call-1': 'approved' },
  });
  assert.equal(resumed.run.status, 'succeeded');
  const invoked = (await store.listEvents(run.id)).find((event) => event.type === 'tool.invoked');
  assert.ok(invoked);
  const args = invoked?.data.arguments as any;
  assert.equal(args.content, '[omitted from audit event]');
  assert.equal(args.contentBytes, 13);
  assert.match(String(args.contentSha256), /^[a-f0-9]{64}$/);
});

test('duplicate callId is replayed without a second ToolRuntime side effect', async () => {
  const store = new InMemoryRunStore();
  const run = await startedRun(store);
  let executions = 0;
  const runtime = new class extends FixtureToolRuntime {
    override async execute(request: any) { executions += 1; return super.execute(request); }
  }();
  const result = await runToolLoop({ store, run, provider: new FixtureToolLoopProvider('duplicate'), toolRuntime: runtime, workspaceRoot: process.cwd() });
  assert.equal(result.run.status, 'succeeded');
  assert.equal(executions, 1);
  assert.equal((await store.listEvents(run.id)).filter((event) => event.type === 'tool.invoked').length, 1);
});

test('tool failure is diagnosable and max loop terminates without artifact', async () => {
  const store = new InMemoryRunStore();
  const failureRun = await startedRun(store, '工具失败');
  const failure = await runToolLoop({ store, run: failureRun, provider: new FixtureToolLoopProvider('failure'), workspaceRoot: process.cwd() });
  assert.equal(failure.run.status, 'failed');
  assert.equal(failure.error?.errorCode, 'tool_path_traversal');

  const loopRun = await startedRun(store, '循环上限');
  const limited = await runToolLoop({ store, run: loopRun, provider: new FixtureToolLoopProvider('max-loop'), workspaceRoot: process.cwd(), maxIterations: 2 });
  assert.equal(limited.run.status, 'failed');
  assert.equal(limited.run.error?.code, 'tool_loop_max_iterations');
  assert.equal((await store.listEvents(loopRun.id)).some((event) => event.type === 'artifact.created'), false);
});

class InterruptingProvider implements ToolLoopProvider {
  identity = identity;
  private calls = 0;
  async respond(request: ModelRequestEnvelope): Promise<ProviderResponseEnvelope> {
    this.calls += 1;
    if (this.calls > 1) throw new Error('simulated interruption after tool result');
    return normalizeProviderResponse({ requestId: request.requestId, provider: identity, raw: { call: this.calls }, toolCalls: [{ callId: 'recover-call-1', name: 'filesystem.read', arguments: { path: 'README.md' } }] });
  }
}

class RecoveryProvider implements ToolLoopProvider {
  identity = identity;
  async respond(request: ModelRequestEnvelope): Promise<ProviderResponseEnvelope> {
    if (request.messages.some((message) => message.role === 'tool')) {
      return normalizeProviderResponse({ requestId: request.requestId, provider: identity, raw: { recovery: 'final' }, structuredOutput: { ok: true, recovered: true } });
    }
    return normalizeProviderResponse({ requestId: request.requestId, provider: identity, raw: { recovery: 'tool' }, toolCalls: [{ callId: 'recover-call-1', name: 'filesystem.read', arguments: { path: 'README.md' } }] });
  }
}

test('recovery replays a completed callId once and creates one artifact', async () => {
  const store = new InMemoryRunStore();
  let run = await startedRun(store, '中断恢复');
  const interrupted = await runToolLoop({ store, run, provider: new InterruptingProvider(), workspaceRoot: process.cwd() });
  assert.equal(interrupted.run.status, 'failed');
  run = (await store.transition(run.id, 'retry')).run;
  run = (await store.transition(run.id, 'start')).run;
  const resumed = await runToolLoop({ store, run, provider: new RecoveryProvider(), workspaceRoot: process.cwd() });
  assert.equal(resumed.run.status, 'succeeded');
  const events = await store.listEvents(run.id);
  assert.equal(events.filter((event) => event.type === 'tool.invoked').length, 1);
  assert.equal(events.filter((event) => event.type === 'artifact.created').length, 1);
});
