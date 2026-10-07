import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildModelRequestEnvelope, buildProviderOutputReceipt, canUseSandboxOperation, CodexExternalAdapter, DeepSeekApiAdapter, DeepSeekToolLoopProvider, FixtureAdapter, FixtureToolRuntime, isAllowedCommand, LocalToolRuntime, parseStructuredJsonObject, permissionLabels, canUseTool, resolveSandboxPath, validateStructuredOutput } from './index.ts';

const execFile = promisify(execFileCallback);

test('fixture and Codex adapters expose distinct provenance', async () => {
  const fixture = await new FixtureAdapter().probeCapabilities();
  const codex = await new CodexExternalAdapter('/definitely/missing/codex').probeCapabilities();
  assert.equal(fixture.identity.isMock, true);
  assert.equal(codex.identity.harness, 'codex-cli');
  assert.equal((codex as any).disabledReason, 'codex CLI unavailable');
});

test('DeepSeek capability probe reports only the implemented one-shot contract', async () => {
  const capabilities = await new DeepSeekApiAdapter({ apiKey: 'test-only' }).probeCapabilities();
  assert.equal(capabilities.streaming, false);
  assert.equal(capabilities.toolCalling, false);
  assert.equal(capabilities.structuredOutput, true);
  assert.deepEqual(capabilities.structuredOutputModes, ['json_object']);
  assert.equal(capabilities.promptCaching, 'unknown');
  assert.equal(capabilities.cancellation, false);
  assert.equal(capabilities.resume, false);
  assert.equal(capabilities.reasoningContentPassthrough, true);
});

test('DeepSeek request preserves RunRequest fields and normalizes provider usage', async () => {
  let captured: { url: string; init: RequestInit; body: any } | undefined;
  const adapter = new DeepSeekApiAdapter({
    apiKey: 'test-only-key',
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      captured = { url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body)) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: 'deepseek-chat',
          choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}', reasoning_content: 'internal reasoning', tool_calls: [] } }],
          usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
        }),
      } as Response;
    }) as typeof fetch,
  });
  const handle = await adapter.startRun({
    objective: '设计一个本地工具',
    input: { idea: 'workspace' },
    inputRefs: ['source-1'],
    constraints: ['必须引用来源'],
    outputSchema: { type: 'object', required: ['ok'] },
    metadata: { runId: 'deepseek-request-test' },
  });
  const events = [];
  for await (const item of adapter.streamEvents(handle)) events.push(item);
  assert.equal(captured?.url, 'https://api.deepseek.com/chat/completions');
  assert.equal(captured?.body.model, 'deepseek-chat');
  assert.equal(captured?.body.response_format.type, 'json_object');
  assert.equal(captured?.body.messages.at(-1)?.role, 'user');
  assert.match(captured?.body.messages.at(-1)?.content ?? '', /workspace/);
  assert.match(captured?.body.messages.at(-1)?.content ?? '', /source-1/);
  assert.match(captured?.body.messages.at(-1)?.content ?? '', /必须引用来源/);
  const envelope = (events[0]?.data as any).envelope;
  assert.equal(envelope.usage.source, 'provider');
  assert.equal(envelope.providerFields.reasoning_content, 'internal reasoning');
});

test('DeepSeek adapter keeps defaults when optional environment values are undefined', async () => {
  let requestedUrl = '';
  const adapter = new DeepSeekApiAdapter({
    apiKey: 'test-only-key',
    baseUrl: undefined,
    model: undefined,
    fetchImpl: (async (url: string | URL | Request) => {
      requestedUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => ({ model: 'deepseek-chat', choices: [{ message: { content: '{"ok":true}' } }] }),
      } as Response;
    }) as typeof fetch,
  });
  const handle = await adapter.startRun({ objective: 'default endpoint', input: {} });
  for await (const _event of adapter.streamEvents(handle)) { /* consume */ }
  assert.equal(requestedUrl, 'https://api.deepseek.com/chat/completions');
  assert.equal(handle.provider.model, 'deepseek-chat');
});

test('DeepSeek request failures remain explicit without retrying or exposing secrets', async () => {
  const httpError = new DeepSeekApiAdapter({ apiKey: 'test-only-key', fetchImpl: (async () => ({ ok: false, status: 503 })) as unknown as typeof fetch });
  const httpHandle = await httpError.startRun({ objective: 'http failure', input: {} });
  await assert.rejects(async () => { for await (const _event of httpError.streamEvents(httpHandle)) {} }, /DeepSeek request failed \(503\)/);

  const jsonError = new DeepSeekApiAdapter({
    apiKey: 'test-only-key',
    fetchImpl: (async () => ({ ok: true, status: 200, json: async () => { throw new Error('invalid json'); } })) as unknown as typeof fetch,
  });
  const jsonHandle = await jsonError.startRun({ objective: 'json failure', input: {} });
  await assert.rejects(async () => { for await (const _event of jsonError.streamEvents(jsonHandle)) {} }, /DeepSeek response JSON invalid: invalid json/);
});

test('DeepSeek Tool Loop serializes tools and replays assistant reasoning plus tool results', async () => {
  const requests: any[] = [];
  const payloads = [
    {
      model: 'deepseek-reasoner',
      choices: [{ finish_reason: 'tool_calls', message: {
        role: 'assistant', reasoning_content: '先读取文件。', content: null,
        tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'filesystem.read', arguments: '{"path":"fixtures/demo-project.json"}' } }],
      } }],
      usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 20 },
    },
    {
      model: 'deepseek-reasoner',
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: '已读取文件。' } }],
      usage: { prompt_tokens: 34, completion_tokens: 6, total_tokens: 40, prompt_cache_hit_tokens: 20, prompt_cache_miss_tokens: 14 },
    },
  ];
  const provider = new DeepSeekToolLoopProvider({
    apiKey: 'test-only-key', model: 'deepseek-reasoner',
    fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      const payload = payloads.shift();
      return { ok: true, status: 200, json: async () => payload } as Response;
    }) as typeof fetch,
  });
  const request = buildModelRequestEnvelope({
    requestId: 'deepseek-loop-1', runId: 'deepseek-loop-run' as any,
    request: { objective: '检查项目文件', input: { path: 'fixtures/demo-project.json' } },
    tools: [{ name: 'filesystem.read', description: '读取项目文件', inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } }, additionalProperties: false }, permissionTier: 'read_only' }],
    cachePolicy: { mode: 'opportunistic' },
  });
  const first = await provider.respond(request);
  assert.equal(requests[0].tool_choice, 'auto');
  assert.equal(requests[0].tools[0].function.name, 'filesystem_read');
  assert.match(requests[0].messages.find((item: any) => item.role === 'user').content, /fixtures\/demo-project\.json/);
  const secondRequest = {
    ...request,
    requestId: 'deepseek-loop-2',
    messages: [
      ...request.messages,
      { role: 'assistant' as const, content: '', toolCalls: first.toolCalls, providerFields: first.providerFields },
      { role: 'tool' as const, toolCallId: 'call-1', content: JSON.stringify({ ok: true, content: '{"name":"demo"}' }) },
    ],
  };
  const second = await provider.respond(secondRequest);
  const assistant = requests[1].messages.find((item: any) => item.role === 'assistant');
  const tool = requests[1].messages.find((item: any) => item.role === 'tool');
  assert.equal(assistant.reasoning_content, '先读取文件。');
  assert.equal(assistant.tool_calls[0].function.name, 'filesystem_read');
  assert.equal(tool.tool_call_id, 'call-1');
  assert.equal(second.outputText, '已读取文件。');
  assert.equal(first.promptCache.status, 'miss');
  assert.equal(first.promptCache.providerReported, true);
  assert.equal(second.promptCache.status, 'hit');
  assert.equal(second.provider.model, 'deepseek-reasoner');
});

test('provider request builder injects verified context as an explicit envelope', () => {
  const context = {
    snapshot: {
      id: 'snapshot-1',
      covers: { fromSequence: 4, toSequence: 7 },
      contentSha256: 'hash-1',
      summary: { objective: 'resume', nextAction: 'continue' },
    },
    tailEvents: [{ sequence: 7, type: 'provider.event' }],
    continuationInstruction: 'Continue the same logical Run.',
  } as any;
  const envelope = buildModelRequestEnvelope({
    requestId: 'request-1',
    runId: 'run-1' as any,
    request: { objective: '继续执行', input: {}, context },
  });
  assert.equal(envelope.schemaVersion, 'provider.model-request.v1');
  assert.equal(envelope.context?.snapshot.id, 'snapshot-1');
  assert.match(envelope.messages[0]?.content ?? '', /snapshotSha256=hash-1/);
  assert.equal(envelope.cachePolicy.mode, 'disabled');
});

test('provider request builder records only a stable-prefix hash for cache-aware modes', () => {
  const base = {
    runId: 'run-cache' as any,
    request: { objective: '第一条目标', input: {}, constraints: ['必须引用来源'] },
    tools: [{ name: 'filesystem.read', description: 'read', inputSchema: { type: 'object' }, permissionTier: 'read_only' as const }],
    cachePolicy: { mode: 'opportunistic' as const },
  };
  const first = buildModelRequestEnvelope({ ...base, requestId: 'request-cache-1' });
  const second = buildModelRequestEnvelope({ ...base, requestId: 'request-cache-2', request: { ...base.request, objective: '第二条目标' } });
  assert.match(first.cachePolicy.stablePrefixSha256 ?? '', /^sha256:[0-9a-f]{64}$/);
  assert.equal(first.cachePolicy.stablePrefixSha256, second.cachePolicy.stablePrefixSha256);
  const changed = buildModelRequestEnvelope({ ...base, requestId: 'request-cache-3', request: { ...base.request, constraints: ['不要外发消息'] } });
  assert.notEqual(first.cachePolicy.stablePrefixSha256, changed.cachePolicy.stablePrefixSha256);
  const disabled = buildModelRequestEnvelope({ ...base, requestId: 'request-cache-4', cachePolicy: { mode: 'disabled' } });
  assert.equal(disabled.cachePolicy.stablePrefixSha256, undefined);
});

test('Codex execution bridge streams JSONL-compatible events and completes', async () => {
  // /bin/echo is a deterministic stand-in here; it proves subprocess lifecycle and
  // raw-line fallback without spending a real Codex subscription call in the suite.
  const adapter = new CodexExternalAdapter('/bin/echo', { timeoutMs: 1_000 });
  const handle = await adapter.startRun({ objective: 'bridge test', input: { source: 'fixture' } });
  const events = [];
  for await (const item of adapter.streamEvents(handle)) events.push(item);
  assert.equal(events.at(-1)?.data.status, 'completed');
  assert.equal(events[0]?.data.bridge, 'codex-cli');
  assert.equal(handle.provider.isMock, false);
});

test('Codex managed-session alias delegates model choice to the CLI default', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agent-workspace-codex-default-model-'));
  const binary = path.join(dir, 'fake-codex.mjs');
  const capture = path.join(dir, 'args.json');
  await writeFile(binary, [
    '#!/usr/bin/env node',
    "import { writeFileSync } from 'node:fs';",
    "if (process.argv[2] === '--version') { console.log('codex-cli test'); process.exit(0); }",
    "if (process.argv[2] === 'login') { console.log('Logged in using ChatGPT'); process.exit(0); }",
    "writeFileSync(process.env.CAPTURE_FILE, JSON.stringify(process.argv.slice(2)));",
    "console.log(JSON.stringify({ type: 'turn.completed', usage: {} }));",
  ].join('\n'));
  await chmod(binary, 0o755);
  try {
    const adapter = new CodexExternalAdapter(binary, { model: 'codex-managed-session', env: { CAPTURE_FILE: capture } });
    const handle = await adapter.startRun({ objective: 'default model alias test', input: {} });
    const events = [];
    for await (const item of adapter.streamEvents(handle)) events.push(item);
    const args = JSON.parse(await readFile(capture, 'utf8')) as string[];
    assert.equal(handle.provider.model, 'codex-cli-default');
    assert.equal(args.includes('--model'), false);
    assert.equal(events.at(-1)?.data.status, 'completed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('Codex execution bridge cancels the child process and emits a failed termination event', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agent-workspace-codex-cancel-'));
  const binary = path.join(dir, 'fake-codex.mjs');
  await writeFile(binary, [
    '#!/usr/bin/env node',
    "if (process.argv[2] === '--version') { console.log('codex-cli test'); process.exit(0); }",
    "if (process.argv[2] === 'login') { console.log('Logged in using ChatGPT'); process.exit(0); }",
    "console.log(JSON.stringify({ type: 'item.started', item: { type: 'command_execution' } }));",
    'setTimeout(() => {}, 10_000);',
  ].join('\n'));
  await chmod(binary, 0o755);
  try {
    const adapter = new CodexExternalAdapter(binary, { timeoutMs: 30_000 });
    const handle = await adapter.startRun({ objective: 'cancel test', input: {} });
    const iterator = adapter.streamEvents(handle)[Symbol.asyncIterator]();
    const first = await iterator.next();
    assert.equal(first.done, false);
    await adapter.cancel(handle);
    const rest = [];
    for await (const item of { [Symbol.asyncIterator]: () => iterator } as AsyncIterable<any>) rest.push(item);
    assert.equal(rest.at(-1)?.data.status, 'failed');
    assert.equal(rest.at(-1)?.data.signal, 'SIGTERM');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('permission labels and always-approval actions are explicit', () => {
  assert.equal(permissionLabels.workspace_write, '工作区写入');
  const policy = { permissionTier: 'workspace_write' as const, allowedTools: ['shell'], approvalRequiredActions: [] };
  assert.deepEqual(canUseTool(policy, 'shell', 'publish'), { allowed: true, approvalRequired: true, reason: 'always_requires_one_off_approval' });
});

test('sandbox path resolution rejects traversal and symlink escape', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-workspace-sandbox-'));
  const outside = await mkdtemp(path.join(tmpdir(), 'agent-workspace-outside-'));
  await writeFile(path.join(root, 'safe.txt'), 'safe');
  await writeFile(path.join(outside, 'secret.txt'), 'secret');
  await (await import('node:fs/promises')).symlink(path.join(outside, 'secret.txt'), path.join(root, 'secret-link'));
  try {
    assert.equal((await resolveSandboxPath(root, 'safe.txt')).ok, true);
    assert.deepEqual(await resolveSandboxPath(root, '../secret.txt'), { ok: false, reason: 'path_traversal' });
    assert.deepEqual(await resolveSandboxPath(root, path.join(outside, 'secret.txt')), { ok: false, reason: 'absolute_path' });
    assert.deepEqual(await resolveSandboxPath(root, 'secret-link'), { ok: false, reason: 'symlink_escape' });
    assert.deepEqual(await resolveSandboxPath(root, 'secret-link', { allowSymlink: true }), { ok: false, reason: 'symlink_escape' });
    assert.equal((await resolveSandboxPath(root, 'new/nested.txt')).ok, true);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('sandbox command allowlist uses exact argv and rejects shell composition', () => {
  const policy = { allowedCommands: ['git status --short', 'git diff --check'] };
  assert.equal(isAllowedCommand(['git', 'status', '--short'], policy).allowed, true);
  assert.equal(isAllowedCommand(['/usr/bin/git', 'status', '--short'], policy).allowed, false);
  assert.equal(isAllowedCommand(['git', 'status'], policy).allowed, false);
  assert.deepEqual(isAllowedCommand(['sh', '-c', 'git status'], policy), { allowed: false, reason: 'shell_interpreter' });
  assert.deepEqual(isAllowedCommand(['git', 'status; rm -rf .'], policy), { allowed: false, reason: 'shell_metacharacter' });
  assert.equal(isAllowedCommand(['git', 'diff', '--check'], policy).allowed, true);
});

test('sandbox operation permissions distinguish read-only and workspace-write', () => {
  const readOnly = { permissionTier: 'read_only' as const, allowedTools: ['filesystem', 'shell'], approvalRequiredActions: [] };
  const workspaceWrite = { permissionTier: 'workspace_write' as const, allowedTools: ['filesystem', 'shell'], approvalRequiredActions: [] };
  assert.deepEqual(canUseSandboxOperation(readOnly, 'read'), { allowed: true });
  assert.deepEqual(canUseSandboxOperation(readOnly, 'write'), { allowed: false, reason: 'permission_tier_read_only' });
  assert.deepEqual(canUseSandboxOperation(workspaceWrite, 'write'), { allowed: true });
  assert.deepEqual(canUseSandboxOperation({ ...readOnly, allowedTools: ['shell'] }, 'read'), { allowed: false, reason: 'tool_not_allowlisted' });
});

test('fixture ToolRuntime validates policy and returns an idempotent receipt without touching files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-workspace-tool-runtime-'));
  try {
    const runtime = new FixtureToolRuntime();
    const request = {
      requestId: 'tool-request-fixture-001', runId: 'run-tool-fixture-001', mode: 'fixture' as const,
      tool: 'filesystem' as const, operation: 'read' as const, workspaceRoot: root,
      path: 'README.md', policy: { permissionTier: 'read_only' as const, allowedTools: ['filesystem'], approvalRequiredActions: [] },
    };
    const first = await runtime.execute(request);
    assert.equal(first.receipt.status, 'succeeded');
    assert.equal(first.receipt.schemaVersion, 'tool.execution-receipt.v1');
    assert.equal(first.output?.relativePath, 'README.md');
    assert.equal((first.completed?.output as any).fixtureContent, 'fixture:README.md');
    const replay = await runtime.execute(request);
    assert.deepEqual(replay, first);
    const denied = await runtime.execute({ ...request, requestId: 'tool-request-denied-001', operation: 'write' });
    assert.equal(denied.receipt.status, 'failed');
    assert.equal(denied.receipt.errorCode, 'tool_permission_tier_read_only');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ToolRuntime fails closed when the control plane marks authorization revoked', async () => {
  const runtime = new FixtureToolRuntime();
  const result = await runtime.execute({
    requestId: 'revoked-authorization',
    mode: 'fixture',
    tool: 'filesystem',
    operation: 'read',
    workspaceRoot: process.cwd(),
    path: 'fixtures/demo-project.json',
    policy: { permissionTier: 'read_only', allowedTools: ['filesystem'], approvalRequiredActions: [] },
    authorization: { policyVersion: 2, status: 'revoked', approvalId: 'approval-revoked' as any },
  });
  assert.equal(result.receipt.status, 'failed');
  assert.equal(result.receipt.errorCode, 'tool_authorization_revoked');
  assert.equal(result.failed?.executed, undefined);
});

test('ToolRuntime enforces a non-empty project-relative allowedPaths policy', async () => {
  const runtime = new FixtureToolRuntime();
  const result = await runtime.execute({
    requestId: 'tool-request-path-policy-001',
    mode: 'fixture',
    tool: 'filesystem',
    operation: 'read',
    workspaceRoot: process.cwd(),
    path: 'fixtures/demo-project.json',
    policy: { permissionTier: 'read_only', allowedTools: ['filesystem'], allowedPaths: ['src'], approvalRequiredActions: [] },
  });
  assert.equal(result.receipt.status, 'failed');
  assert.equal(result.receipt.errorCode, 'tool_path_not_allowlisted');
  assert.equal(result.failed?.message, 'path_not_allowlisted');
});

test('ToolRuntime rejects malformed tool and operation pairs before policy evaluation', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-workspace-tool-shape-'));
  try {
    const fixture = new FixtureToolRuntime();
    const fixtureResult = await fixture.execute({
      requestId: 'tool-request-shape-fixture-001', runId: 'run-tool-shape-fixture-001', mode: 'fixture',
      tool: 'filesystem', operation: 'shell', workspaceRoot: root, path: 'README.md',
      policy: { permissionTier: 'read_only', allowedTools: ['shell'], approvalRequiredActions: [] },
    });
    assert.equal(fixtureResult.receipt.status, 'failed');
    assert.equal(fixtureResult.receipt.errorCode, 'tool_operation_mismatch');

    const local = new LocalToolRuntime();
    const localResult = await local.execute({
      requestId: 'tool-request-shape-local-001', runId: 'run-tool-shape-local-001', mode: 'local',
      tool: 'shell', operation: 'read', workspaceRoot: root, path: 'README.md',
      policy: { permissionTier: 'read_only', allowedTools: ['filesystem'], approvalRequiredActions: [] },
    });
    assert.equal(localResult.receipt.status, 'failed');
    assert.equal(localResult.receipt.errorCode, 'tool_operation_mismatch');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('local ToolRuntime reads only an in-workspace file, redacts secrets, and is idempotent', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-workspace-local-tool-'));
  await writeFile(path.join(root, 'notes.md'), 'title\napi_key=fake-api-key-redacted\nkeep=this-value\n');
  try {
    const runtime = new LocalToolRuntime();
    const request = {
      requestId: 'tool-request-local-001', runId: 'run-tool-local-001', mode: 'local' as const,
      tool: 'filesystem' as const, operation: 'read' as const, workspaceRoot: root,
      path: 'notes.md', maxBytes: 200,
      policy: { permissionTier: 'read_only' as const, allowedTools: ['filesystem'], approvalRequiredActions: [] },
    };
    const first = await runtime.execute(request);
    assert.equal(first.receipt.status, 'succeeded');
    assert.equal(first.output?.relativePath, 'notes.md');
    assert.equal(first.output?.redacted, true);
    assert.match(String(first.output?.content), /\[REDACTED/);
    assert.doesNotMatch(String(first.output?.content), /fake-api-key-redacted/);
    assert.deepEqual(await runtime.execute(request), first);
    const outside = await runtime.execute({ ...request, requestId: 'tool-request-local-002', path: '../outside.txt' });
    assert.equal(outside.receipt.status, 'failed');
    assert.equal(outside.receipt.errorCode, 'tool_path_traversal');
    const write = await runtime.execute({ ...request, requestId: 'tool-request-local-003', operation: 'write' });
    assert.equal(write.receipt.status, 'failed');
    assert.equal(write.receipt.errorCode, 'tool_permission_tier_read_only');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('local ToolRuntime writes only bounded in-workspace files after policy approval', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-workspace-local-write-'));
  const outside = await mkdtemp(path.join(tmpdir(), 'agent-workspace-local-write-outside-'));
  await writeFile(path.join(root, 'existing.md'), 'before');
  await writeFile(path.join(outside, 'secret.md'), 'outside');
  await (await import('node:fs/promises')).symlink(path.join(outside, 'secret.md'), path.join(root, 'link.md'));
  try {
    const runtime = new LocalToolRuntime();
    const approvedPolicy = { permissionTier: 'workspace_write' as const, allowedTools: ['filesystem'], approvalRequiredActions: ['filesystem.write'] };
    const request = {
      requestId: 'tool-request-local-write-001', runId: 'run-tool-local-write-001', mode: 'local' as const,
      tool: 'filesystem' as const, operation: 'write' as const, workspaceRoot: root,
      path: 'existing.md', content: 'after', maxBytes: 100, policy: approvedPolicy,
    };
    const denied = await runtime.execute(request);
    assert.equal(denied.receipt.status, 'failed');
    assert.equal(denied.receipt.errorCode, 'tool_approval_required');
    assert.equal(await readFile(path.join(root, 'existing.md'), 'utf8'), 'before');

    const first = await runtime.execute({ ...request, requestId: 'tool-request-local-write-006', approvalGranted: true });
    assert.equal(first.receipt.status, 'succeeded');
    assert.equal(first.output?.relativePath, 'existing.md');
    assert.equal(first.output?.bytesWritten, 5);
    assert.equal(first.output?.replacedExisting, true);
    assert.equal(first.output?.content, undefined);
    assert.equal(await readFile(path.join(root, 'existing.md'), 'utf8'), 'after');
    assert.deepEqual(await runtime.execute({ ...request, requestId: 'tool-request-local-write-006', approvalGranted: true }), first);

    const workspacePolicy = { permissionTier: 'workspace_write' as const, allowedTools: ['filesystem'], approvalRequiredActions: [] };
    const newFile = await runtime.execute({ ...request, requestId: 'tool-request-local-write-007', path: 'new.md', content: 'new', policy: workspacePolicy });
    assert.equal(newFile.receipt.status, 'succeeded');
    const overwriteWithoutApproval = await runtime.execute({ ...request, requestId: 'tool-request-local-write-008', content: 'blocked', policy: workspacePolicy });
    assert.equal(overwriteWithoutApproval.receipt.errorCode, 'tool_approval_required');
    assert.equal(await readFile(path.join(root, 'existing.md'), 'utf8'), 'after');

    const traversal = await runtime.execute({ ...request, requestId: 'tool-request-local-write-002', path: '../outside.md', approvalGranted: true });
    assert.equal(traversal.receipt.errorCode, 'tool_path_traversal');
    const symlink = await runtime.execute({ ...request, requestId: 'tool-request-local-write-003', path: 'link.md', approvalGranted: true });
    assert.equal(symlink.receipt.errorCode, 'tool_symlink_escape');
    assert.equal(await readFile(path.join(outside, 'secret.md'), 'utf8'), 'outside');

    const tooLarge = await runtime.execute({ ...request, requestId: 'tool-request-local-write-004', path: 'large.md', content: '123456', maxBytes: 5, approvalGranted: true });
    assert.equal(tooLarge.receipt.errorCode, 'tool_content_too_large');
    const readOnly = await runtime.execute({ ...request, requestId: 'tool-request-local-write-005', policy: { ...approvedPolicy, permissionTier: 'read_only' }, approvalGranted: true });
    assert.equal(readOnly.receipt.errorCode, 'tool_permission_tier_read_only');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('local ToolRuntime runs only exact read-only git commands', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'agent-workspace-local-git-'));
  await execFile('git', ['init', '--quiet'], { cwd: root });
  await writeFile(path.join(root, 'untracked.md'), 'untracked');
  try {
    const runtime = new LocalToolRuntime();
    const policy = { permissionTier: 'read_only' as const, allowedTools: ['shell'], allowedCommands: ['git status --short', 'git diff --stat'], approvalRequiredActions: [] };
    const result = await runtime.execute({
      requestId: 'tool-request-git-001', runId: 'run-tool-git-001', mode: 'local', tool: 'shell', operation: 'shell',
      workspaceRoot: root, argv: ['git', 'status', '--short'], timeoutMs: 5_000, policy,
    });
    assert.equal(result.receipt.status, 'succeeded');
    assert.match(String(result.output?.stdout), /untracked\.md/);
    const denied = await runtime.execute({
      requestId: 'tool-request-git-002', runId: 'run-tool-git-002', mode: 'local', tool: 'shell', operation: 'shell',
      workspaceRoot: root, argv: ['git', 'log'], timeoutMs: 5_000, policy,
    });
    assert.equal(denied.receipt.status, 'failed');
    assert.equal(denied.receipt.errorCode, 'tool_command_not_allowlisted');
    await execFile('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'add', 'untracked.md'], { cwd: root });
    await execFile('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '--quiet', '-m', 'fixture'], { cwd: root });
    await writeFile(path.join(root, 'untracked.md'), 'changed');
    const diff = await runtime.execute({
      requestId: 'tool-request-git-003', runId: 'run-tool-git-003', mode: 'local', tool: 'shell', operation: 'shell',
      workspaceRoot: root, argv: ['git', 'diff', '--stat'], timeoutMs: 5_000, policy,
    });
    assert.equal(diff.receipt.status, 'succeeded');
    assert.match(String(diff.output?.stdout), /untracked\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('structured output parser preserves exact, fenced, and embedded modes', () => {
  const exact = parseStructuredJsonObject('{"ok":true}');
  assert.equal(exact.status, 'parsed');
  if (exact.status === 'parsed') assert.equal(exact.mode, 'exact');

  const fenced = parseStructuredJsonObject('```json\n{"ok":true}\n```');
  assert.equal(fenced.status, 'parsed');
  if (fenced.status === 'parsed') assert.equal(fenced.mode, 'fenced');

  const transcript = '助手，我先说明边界。\n{"current_state":{"summary":"fixture-only"},"ok":true}';
  const embedded = parseStructuredJsonObject(transcript);
  assert.equal(embedded.status, 'parsed');
  if (embedded.status === 'parsed') {
    assert.equal(embedded.mode, 'embedded');
    assert.deepEqual(embedded.value, { current_state: { summary: 'fixture-only' }, ok: true });
    const receipt = buildProviderOutputReceipt(transcript, embedded);
    assert.deepEqual(receipt, {
      schemaVersion: 'provider.output-receipt.v1',
      status: 'parsed',
      mode: 'embedded',
      rawOutputSha256: '6588b9b764370299350b896adddecbc67b3750b1f72d12ec3934c2d87156a314',
      extractedOutputSha256: '84276a39e2560c854b5c5f4f9d226fc6edcad98c2a4a8cb02386e1c04a4ec924',
    });
  }
});

test('structured output parser rejects ambiguous or non-object transcripts', () => {
  const multiple = parseStructuredJsonObject('{"one":1}\n{"two":2}');
  assert.deepEqual(multiple, { status: 'rejected', reason: 'multiple_objects', candidateCount: 2 });
  const array = parseStructuredJsonObject('[1,2,3]');
  assert.deepEqual(array, { status: 'rejected', reason: 'invalid_json', candidateCount: 0 });
});

test('structured output validation enforces required fields, types, and extra-field policy', () => {
  const schema = {
    type: 'object',
    required: ['facts', 'source_refs'],
    properties: {
      facts: { type: 'array', items: { type: 'string' } },
      source_refs: { type: 'array', items: { type: 'string' } },
    },
    additionalProperties: false,
  } as any;
  assert.deepEqual(validateStructuredOutput({ facts: ['ok'], source_refs: ['AGENTS.md'] }, schema), { valid: true, errors: [] });
  assert.deepEqual(validateStructuredOutput({ facts: [1], source_refs: [], extra: true }, schema), {
    valid: false,
    errors: ['$.extra:unknown_property', '$.facts[0]:expected_string'],
  });
  assert.deepEqual(validateStructuredOutput({ facts: [] }, schema), { valid: false, errors: ['$.source_refs:missing_required'] });
});
