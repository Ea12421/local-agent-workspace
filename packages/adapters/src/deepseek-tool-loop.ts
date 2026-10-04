import type {
  JsonObject,
  ModelRequestEnvelope,
  ProviderIdentity,
  ProviderMessage,
  ProviderResponseEnvelope,
  ToolDefinition,
} from '../../core/src/index.ts';
import { normalizeDeepSeekChatResponse } from './provider-envelope.ts';
import { renderProviderRequestContent } from './provider-request.ts';
import type { DeepSeekConfig } from './provider-adapters.ts';

type DeepSeekChatMessage = {
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  reasoning_content?: string;
};

function providerIdentity(model: string): ProviderIdentity {
  return {
    harness: 'deepseek-http',
    provider: 'deepseek',
    model,
    authMode: 'api_key',
    billingSource: 'api',
    isMock: false,
  };
}

function toolDefinition(definition: ToolDefinition) {
  return {
    type: 'function' as const,
    function: {
      name: externalToolName(definition.name),
      description: definition.description,
      parameters: definition.inputSchema,
    },
  };
}

/** DeepSeek's function-name contract forbids dots used by our domain names. */
function externalToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function providerMessage(message: ProviderMessage, firstUserMessage: boolean, request: ModelRequestEnvelope): DeepSeekChatMessage {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      content: message.content,
      ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    };
  }
  if (message.role === 'assistant') {
    const reasoningContent = message.providerFields?.reasoning_content;
    return {
      role: 'assistant',
      content: message.content || null,
      ...(message.name ? { name: message.name } : {}),
      ...(message.toolCalls?.length ? {
        tool_calls: message.toolCalls.map((call) => ({
          id: call.callId,
          type: 'function' as const,
          function: { name: externalToolName(call.name), arguments: JSON.stringify(call.arguments) },
        })),
      } : {}),
      ...(typeof reasoningContent === 'string' ? { reasoning_content: reasoningContent } : {}),
    };
  }
  return {
    role: message.role,
    content: firstUserMessage ? renderProviderRequestContent(request) : message.content,
    ...(message.name ? { name: message.name } : {}),
  };
}

/**
 * DeepSeek-backed control-plane provider for the read-only Tool Loop.
 * The provider only proposes calls; runToolLoop owns validation and execution.
 */
export class DeepSeekToolLoopProvider {
  readonly identity: ProviderIdentity;
  private readonly config: Required<Pick<DeepSeekConfig, 'baseUrl' | 'model'>> & DeepSeekConfig;

  constructor(config: DeepSeekConfig = {}) {
    this.config = { ...config, baseUrl: config.baseUrl ?? 'https://api.deepseek.com', model: config.model ?? 'deepseek-chat' };
    this.identity = providerIdentity(this.config.model);
  }

  async respond(request: ModelRequestEnvelope): Promise<ProviderResponseEnvelope> {
    if (!this.config.apiKey) throw new Error('DeepSeek API key is not configured');
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const hasToolHistory = request.messages.some((message) => message.role === 'assistant' || message.role === 'tool');
    const messages: DeepSeekChatMessage[] = request.messages.map((message, index) => providerMessage(message, index === 0 && message.role === 'user', request));
    if (!messages.length) messages.push({ role: 'user', content: renderProviderRequestContent(request) });
    const systemMessage: DeepSeekChatMessage = {
      role: 'system',
      content: [
        'You are the model inside a local Agent Workspace control plane.',
        'Use only the listed tools. For a requested project file, call filesystem.read before making claims about its contents.',
        'Never request writes, shell commands, external messages, credentials, cookies, or tokens in this read-only run.',
        'After receiving a tool result, give a concise final answer grounded in that result.',
      ].join('\n'),
    };
    if (!hasToolHistory) messages.unshift(systemMessage);
    const response = await fetchImpl(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.config.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        tools: request.tools.map(toolDefinition),
        tool_choice: 'auto',
        // DeepSeek/OpenAI-compatible APIs do not reliably accept json_object
        // response_format together with a tool proposal. The final response is
        // still normalized into the provider-neutral envelope.
      }),
    });
    if (!response.ok) {
      let detail = '';
      try {
        const rawDetail = await response.text();
        detail = rawDetail.slice(0, 600).replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]');
      } catch { /* keep the stable status-only error */ }
      throw new Error(`DeepSeek tool-loop request failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }
    let payload: any;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(`DeepSeek tool-loop response JSON invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
    const actualModel = typeof payload?.model === 'string' ? payload.model : this.config.model;
    const normalized = normalizeDeepSeekChatResponse({
      requestId: request.requestId,
      provider: providerIdentity(actualModel),
      payload,
    });
    const toolNames = new Map(request.tools.map((tool) => [externalToolName(tool.name), tool.name]));
    normalized.toolCalls = normalized.toolCalls.map((call) => ({
      ...call,
      name: toolNames.get(call.name) ?? call.name,
    }));
    normalized.promptCache = {
      ...normalized.promptCache,
      ...(request.cachePolicy.stablePrefixSha256 ? { stablePrefixSha256: request.cachePolicy.stablePrefixSha256 } : {}),
    };
    normalized.providerFields = {
      ...(normalized.providerFields ?? {}),
      requestedModel: this.config.model,
      actualModel,
    } as JsonObject;
    return normalized;
  }
}
