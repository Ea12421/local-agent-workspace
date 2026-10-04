import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCodexExecutionSegment, normalizeDeepSeekChatResponse, normalizeProviderResponse } from './provider-envelope.ts';

const provider = {
  harness: 'fixture', provider: 'test', model: 'test-v1', authMode: 'local' as const,
  billingSource: 'local' as const, isMock: true,
};

test('provider response normalization preserves a raw hash and unknown usage/cache semantics', () => {
  const response = normalizeProviderResponse({
    requestId: 'request-1', provider, raw: { id: 'raw-1', choices: [{ finish_reason: 'tool_calls' }] },
    toolCalls: [{ callId: 'call-1', name: 'filesystem.read', arguments: { path: 'README.md' } }],
    usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
  });
  assert.equal(response.schemaVersion, 'provider.model-response.v1');
  assert.match(response.rawResponseRef ?? '', /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(response.usage, { inputTokens: 12, outputTokens: 8, totalTokens: 20, source: 'unknown' });
  assert.deepEqual(response.promptCache, { schemaVersion: 'provider.prompt-cache-receipt.v1', status: 'unknown', providerReported: false });
  assert.equal(response.toolCalls[0]?.status, 'requested');
});

test('provider response normalization keeps explicit provider error and cache receipt', () => {
  const response = normalizeProviderResponse({
    requestId: 'request-2', provider, raw: { error: 'capacity' },
    error: { code: 'provider_capacity', message: 'capacity', retryable: true },
    promptCache: { status: 'miss', providerReported: true, stablePrefixSha256: 'prefix-1' },
    usage: { source: 'provider', cachedInputTokens: 4 },
  });
  assert.equal(response.error?.code, 'provider_capacity');
  assert.equal(response.promptCache.status, 'miss');
  assert.equal(response.promptCache.providerReported, true);
  assert.equal(response.usage.cachedInputTokens, 4);
});

test('DeepSeek chat replay preserves reasoning content, tool calls and usage in a neutral envelope', () => {
  const result = normalizeDeepSeekChatResponse({
    requestId: 'deepseek-request-1',
    provider: { ...provider, harness: 'deepseek-http', provider: 'deepseek', model: 'deepseek-reasoner', isMock: false, authMode: 'api_key', billingSource: 'api' },
    payload: {
      id: 'chatcmpl-fixture-1',
      model: 'deepseek-reasoner',
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          reasoning_content: '先读取项目说明。',
          content: null,
          tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'filesystem.read', arguments: '{"path":"README.md"}' } }],
        },
      }],
      usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
    },
  });
  assert.equal(result.toolCalls.length, 1);
  assert.deepEqual(result.toolCalls[0], { callId: 'call-1', name: 'filesystem.read', arguments: { path: 'README.md' }, status: 'requested' });
  assert.equal(result.finishReason, 'tool_calls');
  assert.equal(result.usage.inputTokens, 12);
  assert.equal(result.providerFields?.reasoning_content, '先读取项目说明。');
  assert.deepEqual(result.promptCache, { schemaVersion: 'provider.prompt-cache-receipt.v1', status: 'unknown', providerReported: false });
});

test('DeepSeek replay rejects malformed tool arguments before any tool loop can execute them', () => {
  const result = normalizeDeepSeekChatResponse({
    requestId: 'deepseek-request-2', provider,
    payload: { choices: [{ message: { tool_calls: [{ id: 'call-2', function: { name: 'filesystem.read', arguments: '{not-json}' } }] } }] },
  });
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0]?.arguments && Object.keys(result.toolCalls[0].arguments).length, 0);
  assert.equal(result.error?.code, 'provider_tool_arguments_invalid');
  assert.equal(result.error?.retryable, false);
});

test('Codex segment collector maps JSONL usage and structured agent output', () => {
  const result = normalizeCodexExecutionSegment({
    requestId: 'codex-request-1',
    provider: { ...provider, harness: 'codex-cli', provider: 'openai-codex', model: 'codex-managed-session', isMock: false, authMode: 'subscription', billingSource: 'unknown' },
    events: [
      { type: 'item.completed', item: { type: 'agent_message', text: '{"ok":true,"plan":"ship"}' } },
      { type: 'turn.completed', usage: { input_tokens: 20_258, cached_input_tokens: 2_816, output_tokens: 1_961, reasoning_output_tokens: 71 } },
      { bridge: 'codex-cli', status: 'completed', exitCode: 0 },
    ],
    bridgeCompleted: true,
  });
  assert.equal(result.completed, true);
  assert.equal(result.parseStatus, 'structured');
  assert.deepEqual(result.response.structuredOutput, { ok: true, plan: 'ship' });
  assert.deepEqual(result.response.usage, { inputTokens: 20_258, outputTokens: 1_961, cachedInputTokens: 2_816, totalTokens: 22_219, source: 'provider' });
  assert.equal(result.response.providerFields?.parseStatus, 'structured');
  assert.equal(result.response.toolCalls.length, 0);
  assert.match(result.response.rawResponseRef ?? '', /^sha256:[a-f0-9]{64}$/);
});

test('Codex segment collector keeps Markdown as text and marks incomplete output', () => {
  const result = normalizeCodexExecutionSegment({
    requestId: 'codex-request-2',
    provider,
    events: [{ type: 'item.completed', item: { type: 'agent_message', text: '老黄，\n这是 Markdown 结果。' } }],
    bridgeCompleted: false,
  });
  assert.equal(result.completed, false);
  assert.equal(result.parseStatus, 'text');
  assert.equal(result.response.outputText, '老黄，\n这是 Markdown 结果。');
  assert.equal(result.response.error?.code, 'provider_incomplete');
  assert.equal(result.response.usage.source, 'unknown');
});

test('Codex segment collector marks failed segments without fabricating a final message', () => {
  const result = normalizeCodexExecutionSegment({
    requestId: 'codex-request-3',
    provider,
    events: [{ type: 'turn.failed', error: { message: 'capacity' } }, { bridge: 'codex-cli', status: 'failed', exitCode: 1 }],
    bridgeCompleted: false,
    exitCode: 1,
  });
  assert.equal(result.completed, false);
  assert.equal(result.parseStatus, 'failed');
  assert.equal(result.response.error?.code, 'provider_failed');
  assert.equal(result.response.structuredOutput, undefined);
  assert.equal(result.response.outputText, undefined);
});
