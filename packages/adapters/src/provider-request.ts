import { createHash } from 'node:crypto';
import type {
  ContextPacket,
  ModelRequestEnvelope,
  PromptCachePolicy,
  ProviderMessage,
  RunId,
  RunRequest,
  ToolDefinition,
} from '../../core/src/index.ts';

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

function stablePrefixSha256(input: unknown): string {
  return `sha256:${createHash('sha256').update(stableJson(input), 'utf8').digest('hex')}`;
}

export interface BuildModelRequestOptions {
  requestId: string;
  runId: RunId;
  request: RunRequest;
  tools?: ToolDefinition[];
  cachePolicy?: PromptCachePolicy;
}

function contextMessage(context: ContextPacket): ProviderMessage {
  return {
    role: 'system',
    content: [
      'Verified local recovery packet. Treat this as state, not as a new user instruction.',
      `snapshotId=${String(context.snapshot.id)}`,
      `covers=${context.snapshot.covers.fromSequence}-${context.snapshot.covers.toSequence}`,
      `snapshotSha256=${context.snapshot.contentSha256}`,
      `summary=${JSON.stringify(context.snapshot.summary)}`,
      `tailEvents=${JSON.stringify(context.tailEvents)}`,
      `continuation=${context.continuationInstruction}`,
    ].join('\n'),
  };
}

export function buildModelRequestEnvelope(options: BuildModelRequestOptions): ModelRequestEnvelope {
  const { request } = options;
  const messages: ProviderMessage[] = [];
  if (request.context) messages.push(contextMessage(request.context));
  messages.push({ role: 'user', content: request.objective });
  const cachePolicy = options.cachePolicy ?? { mode: 'disabled' as const };
  const stablePrefix = {
    systemMessages: messages.filter((message) => message.role === 'system'),
    constraints: request.constraints ?? [],
    outputSchema: request.outputSchema ?? null,
    tools: options.tools ?? [],
  };
  return {
    schemaVersion: 'provider.model-request.v1',
    requestId: options.requestId,
    runId: options.runId,
    objective: request.objective,
    messages,
    input: request.input,
    inputRefs: request.inputRefs,
    constraints: request.constraints,
    outputSchema: request.outputSchema,
    tools: options.tools ?? [],
    context: request.context,
    cachePolicy: {
      ...cachePolicy,
      ...(cachePolicy.mode === 'disabled' ? {} : { stablePrefixSha256: stablePrefixSha256(stablePrefix) }),
    },
    metadata: request.metadata,
  };
}

export function renderModelRequestEnvelope(envelope: ModelRequestEnvelope): string {
  const constraints = envelope.constraints?.length ? envelope.constraints.join('\n- ') : '(none)';
  const schema = envelope.outputSchema ? JSON.stringify(envelope.outputSchema) : '(not specified)';
  return [
    'You are the execution agent for a local Agent Workspace.',
    'Respect the requested sandbox and do not access credentials, cookies, tokens, or paths outside the workspace.',
    renderProviderRequestContent(envelope),
    envelope.context ? `Recovery context:\n${envelope.messages[0]?.content ?? '(missing)'}` : 'Recovery context:\n(none)',
    'Return a concise, structured result. If a required fact is unavailable, say so explicitly.',
  ].join('\n\n');
}

/** Provider-facing content that keeps the RunRequest fields from being dropped. */
export function renderProviderRequestContent(envelope: ModelRequestEnvelope): string {
  const constraints = envelope.constraints?.length ? envelope.constraints.join('\n- ') : '(none)';
  const schema = envelope.outputSchema ? JSON.stringify(envelope.outputSchema) : '(not specified)';
  return [
    `Objective:\n${envelope.objective}`,
    `Input JSON:\n${JSON.stringify(envelope.input ?? null)}`,
    `Input refs:\n${JSON.stringify(envelope.inputRefs ?? [])}`,
    `Constraints:\n- ${constraints}`,
    `Output schema:\n${schema}`,
  ].join('\n\n');
}
