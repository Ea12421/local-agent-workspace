import { createHash } from 'node:crypto';
import type {
  JsonObject,
  JsonValue,
  ProviderIdentity,
  ProviderResponseEnvelope,
  PromptCacheReceipt,
  RunError,
  ToolCallEnvelope,
  UsageSummary,
} from '../../core/src/index.ts';
import { parseStructuredJsonObject } from './structured-output.ts';

export type ProviderRawResponse = {
  requestId: string;
  provider: ProviderIdentity;
  raw?: unknown;
  outputText?: string;
  structuredOutput?: JsonValue;
  toolCalls?: Array<Partial<ToolCallEnvelope> & { callId: string; name: string; arguments: JsonObject }>;
  usage?: Partial<UsageSummary> & Record<string, unknown>;
  promptCache?: Partial<PromptCacheReceipt>;
  finishReason?: string;
  error?: RunError;
  providerFields?: JsonObject;
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function normalizeUsage(usage: ProviderRawResponse['usage']): UsageSummary {
  const inputTokens = usage?.inputTokens ?? numberField(usage, 'prompt_tokens') ?? numberField(usage, 'input_tokens');
  const outputTokens = usage?.outputTokens ?? numberField(usage, 'completion_tokens') ?? numberField(usage, 'output_tokens');
  const totalTokens = usage?.totalTokens ?? numberField(usage, 'total_tokens') ?? (inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined);
  const cachedInputTokens = usage?.cachedInputTokens ?? numberField(usage, 'prompt_cache_hit_tokens') ?? numberField(usage, 'cache_read_input_tokens') ?? numberField(usage, 'cached_input_tokens');
  const estimatedCostCents = usage?.estimatedCostCents;
  return {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    ...(estimatedCostCents === undefined ? {} : { estimatedCostCents }),
    source: usage?.source ?? 'unknown',
  };
}

function numberField(value: Record<string, unknown> | undefined, key: string): number | undefined {
  const candidate = value?.[key];
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined;
}

function normalizePromptCache(promptCache: ProviderRawResponse['promptCache']): PromptCacheReceipt {
  return {
    schemaVersion: 'provider.prompt-cache-receipt.v1',
    status: promptCache?.status ?? 'unknown',
    providerReported: promptCache?.providerReported ?? false,
    ...(promptCache?.stablePrefixSha256 ? { stablePrefixSha256: promptCache.stablePrefixSha256 } : {}),
    ...(promptCache?.cachedInputTokens === undefined ? {} : { cachedInputTokens: promptCache.cachedInputTokens }),
  };
}

/**
 * Convert provider-specific output into the control-plane envelope. The raw
 * response is represented by a content hash so receipts stay auditable without
 * copying provider payloads or secrets into the domain event.
 */
export function normalizeProviderResponse(input: ProviderRawResponse): ProviderResponseEnvelope {
  const rawResponseRef = `sha256:${sha256(input.raw ?? input)}`;
  const toolCalls = (input.toolCalls ?? []).map((call) => ({
    callId: call.callId,
    name: call.name,
    arguments: call.arguments,
    status: call.status ?? 'requested',
    ...(call.approvalRequestId ? { approvalRequestId: call.approvalRequestId } : {}),
    ...(call.resultRef ? { resultRef: call.resultRef } : {}),
    ...(call.errorCode ? { errorCode: call.errorCode } : {}),
  } satisfies ToolCallEnvelope));
  return {
    schemaVersion: 'provider.model-response.v1',
    requestId: input.requestId,
    provider: input.provider,
    rawResponseRef,
    ...(input.outputText === undefined ? {} : { outputText: input.outputText }),
    ...(input.structuredOutput === undefined ? {} : { structuredOutput: input.structuredOutput }),
    toolCalls,
    usage: normalizeUsage(input.usage),
    promptCache: normalizePromptCache(input.promptCache),
    ...(input.finishReason ? { finishReason: input.finishReason } : {}),
    ...(input.error ? { error: input.error } : {}),
    ...(input.providerFields ? { providerFields: input.providerFields } : {}),
  };
}

/**
 * Normalize a DeepSeek/OpenAI-compatible chat response without assuming the
 * providers are identical. This is a replayable parser only: the DeepSeek
 * adapter still advertises its current one-shot contract, and the control
 * plane must opt into a tool loop explicitly before executing these calls.
 *
 * `reasoning_content` and the unmodified tool payload are kept under
 * `providerFields` for audit/debugging. Tool arguments are accepted only when
 * they decode to a JSON object; malformed arguments become an explicit
 * provider error instead of being silently executed.
 */
export function normalizeDeepSeekChatResponse(input: {
  requestId: string;
  provider: ProviderIdentity;
  payload: unknown;
}): ProviderResponseEnvelope {
  const payload = input.payload && typeof input.payload === 'object' ? input.payload as Record<string, any> : {};
  const choice = Array.isArray(payload.choices) ? payload.choices[0] as Record<string, any> | undefined : undefined;
  const message = choice?.message && typeof choice.message === 'object' ? choice.message as Record<string, any> : {};
  const rawToolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  let malformedToolCall = false;
  const toolCalls = rawToolCalls.flatMap((call: any, index: number) => {
    const fn = call?.function && typeof call.function === 'object' ? call.function : {};
    const rawArguments = fn.arguments;
    let argumentsValue: JsonObject = {};
    if (rawArguments && typeof rawArguments === 'object' && !Array.isArray(rawArguments)) {
      argumentsValue = rawArguments as JsonObject;
    } else if (typeof rawArguments === 'string') {
      try {
        const parsed = JSON.parse(rawArguments);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) malformedToolCall = true;
        else argumentsValue = parsed as JsonObject;
      } catch {
        malformedToolCall = true;
      }
    } else {
      malformedToolCall = true;
    }
    const name = typeof fn.name === 'string' ? fn.name : '';
    const callId = typeof call?.id === 'string' ? call.id : `deepseek-tool-${index + 1}`;
    if (!name) malformedToolCall = true;
    return name ? [{ callId, name, arguments: argumentsValue }] : [];
  });
  const content = typeof message.content === 'string' ? message.content : undefined;
  const reasoningContent = typeof message.reasoning_content === 'string' ? message.reasoning_content : undefined;
  const rawUsage = payload.usage && typeof payload.usage === 'object' ? payload.usage as Record<string, unknown> : undefined;
  const cacheHitTokens = numberField(rawUsage, 'prompt_cache_hit_tokens');
  const cacheMissTokens = numberField(rawUsage, 'prompt_cache_miss_tokens');
  const cacheFieldsReported = cacheHitTokens !== undefined || cacheMissTokens !== undefined;
  const response = normalizeProviderResponse({
    requestId: input.requestId,
    provider: input.provider,
    raw: payload,
    ...(content === undefined ? {} : { outputText: content }),
    toolCalls,
    usage: rawUsage ? { ...rawUsage, source: 'provider' } : undefined,
    promptCache: {
      status: cacheHitTokens !== undefined && cacheHitTokens > 0 ? 'hit' : cacheFieldsReported ? 'miss' : 'unknown',
      providerReported: cacheFieldsReported,
      ...(cacheHitTokens === undefined ? {} : { cachedInputTokens: cacheHitTokens }),
    },
    ...(typeof choice?.finish_reason === 'string' ? { finishReason: choice.finish_reason } : {}),
    ...(malformedToolCall ? {
      error: { code: 'provider_tool_arguments_invalid', message: 'DeepSeek tool call arguments were not a JSON object.', retryable: false },
    } : {}),
    providerFields: {
      providerFormat: 'deepseek-chat-completions',
      ...(typeof payload.model === 'string' ? { actualModel: payload.model } : {}),
      ...(rawUsage ? { rawUsage: rawUsage as unknown as JsonObject } : {}),
      ...(reasoningContent === undefined ? {} : { reasoning_content: reasoningContent }),
      ...(rawToolCalls.length ? { raw_tool_calls: rawToolCalls } : {}),
    },
  });
  return response;
}

export type CodexExecutionSegmentInput = {
  requestId: string;
  provider: ProviderIdentity;
  /** Raw JSONL payloads, or the RunEvent.data wrappers emitted by CodexExternalAdapter. */
  events: unknown[];
  bridgeCompleted?: boolean;
  exitCode?: number | null;
  signal?: string | null;
};

export type CodexExecutionSegmentResult = {
  response: ProviderResponseEnvelope;
  completed: boolean;
  parseStatus: 'structured' | 'text' | 'missing' | 'failed';
  eventCount: number;
  eventTypes: Record<string, number>;
};

function unwrapCodexEvent(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const value = input as Record<string, unknown>;
  if (value.stream && typeof value.stream === 'object') return value.stream as Record<string, unknown>;
  return value;
}

/**
 * Normalize one Codex CLI JSONL segment without treating the CLI's internal
 * command execution as this product's external ToolCall protocol.
 */
export function normalizeCodexExecutionSegment(input: CodexExecutionSegmentInput): CodexExecutionSegmentResult {
  const streams = input.events.map(unwrapCodexEvent);
  const eventTypes: Record<string, number> = {};
  for (const stream of streams) {
    const type = typeof stream.type === 'string' ? stream.type : 'unknown';
    eventTypes[type] = (eventTypes[type] ?? 0) + 1;
  }
  const completionEventSeen = streams.some((stream) => stream.type === 'turn.completed');
  const bridgeCompleted = input.bridgeCompleted ?? streams.some((stream) => stream.status === 'completed');
  const failed = streams.some((stream) => stream.status === 'failed' || stream.type === 'turn.failed') || (input.exitCode !== undefined && input.exitCode !== null && input.exitCode !== 0);
  const messageTexts = streams
    .filter((stream) => stream.type === 'item.completed' && stream.item && typeof stream.item === 'object' && (stream.item as Record<string, unknown>).type === 'agent_message')
    .map((stream) => String((stream.item as Record<string, unknown>).text ?? ''))
    .filter(Boolean);
  const outputText = messageTexts.at(-1);
  const parsed = outputText ? parseStructuredJsonObject(outputText) : { status: 'rejected' as const, reason: 'empty' as const, candidateCount: 0 };
  const usage = streams.find((stream) => stream.type === 'turn.completed')?.usage as Record<string, unknown> | undefined;
  const parseStatus: CodexExecutionSegmentResult['parseStatus'] = failed ? 'failed' : parsed.status === 'parsed' ? 'structured' : outputText ? 'text' : 'missing';
  const response = normalizeProviderResponse({
    requestId: input.requestId,
    provider: input.provider,
    raw: streams,
    ...(outputText && parseStatus === 'text' ? { outputText } : {}),
    ...(parsed.status === 'parsed' ? { structuredOutput: parsed.value } : {}),
    usage: { ...(usage ?? {}), source: usage ? 'provider' : 'unknown' },
    promptCache: { status: 'unknown', providerReported: false },
    ...(bridgeCompleted && !failed ? { finishReason: 'completed' } : {}),
    ...(failed || (!bridgeCompleted && !completionEventSeen) ? {
      error: {
        code: failed ? 'provider_failed' : 'provider_incomplete',
        message: failed ? 'Codex execution segment failed.' : 'Codex execution segment did not reach a completed bridge event.',
        retryable: !failed,
      },
    } : {}),
    providerFields: {
      bridge: 'codex-cli',
      eventTypes,
      eventCount: streams.length,
      completionEventSeen,
      bridgeCompleted,
      parseStatus,
      ...(parsed.status === 'parsed' ? { normalizationMode: parsed.mode } : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    },
  });
  return { response, completed: bridgeCompleted && !failed && Boolean(outputText), parseStatus, eventCount: streams.length, eventTypes };
}
