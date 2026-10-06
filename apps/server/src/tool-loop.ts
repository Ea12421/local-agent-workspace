import { createHash } from 'node:crypto';
import {
  createRunEvent,
  semanticEventKey,
  type ApprovalRequest,
  type JsonObject,
  type JsonValue,
  type ModelRequestEnvelope,
  type ProviderResponseEnvelope,
  type ProviderIdentity,
  type Run,
  type RunEvent,
  type RunId,
  type RunRequest,
  type ToolAuthorizationSnapshot,
  type ToolDefinition,
  type ToolPolicy,
} from '../../../packages/core/src/index.ts';
import type { RunStore } from '../../../packages/core/src/run-store.ts';
import { FixtureToolRuntime, normalizeProviderResponse, type ToolExecutionRequest, type ToolExecutionResult, type ToolRuntimeMode } from '../../../packages/adapters/src/index.ts';
import { buildModelRequestEnvelope } from '../../../packages/adapters/src/provider-request.ts';
import { addSemanticEventData } from './event-idempotency.ts';

export type ToolLoopProvider = {
  identity: ProviderIdentity;
  respond(request: ModelRequestEnvelope): Promise<ProviderResponseEnvelope>;
};

export type ToolLoopStatus = 'succeeded' | 'waiting_user' | 'failed';

export type ToolLoopResult = {
  run: Run;
  events: RunEvent[];
  status: ToolLoopStatus;
  artifact?: JsonObject;
  approval?: ApprovalRequest;
  error?: JsonObject;
};

export type ProviderResponseReceiptWriter = (input: {
  runId: RunId;
  segment: number;
  response: ProviderResponseEnvelope;
}) => Promise<void> | void;

export type ApprovalWriter = (approval: ApprovalRequest) => Promise<void> | void;

export type ToolAuthorizationVerificationInput = {
  run: Run;
  call: { callId: string; name: string; arguments: JsonObject };
  policy: ToolPolicy;
  authorization: ToolAuthorizationSnapshot;
};

export type ToolAuthorizationDecision =
  | { allowed: true; policyVersion: number }
  | { allowed: false; policyVersion: number; reasonCode: 'authorization_revoked' | 'approval_missing' | 'approval_not_approved' | 'policy_changed' | 'verifier_failed'; message: string };

export type ToolLoopOptions = {
  store: RunStore;
  run: Run;
  provider: ToolLoopProvider;
  toolRuntime?: { execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> };
  /** The control plane defaults to deterministic fixture execution. Real local execution must be explicit. */
  toolRuntimeMode?: ToolRuntimeMode;
  workspaceRoot: string;
  toolDefinitions?: ToolDefinition[];
  toolPolicy?: ToolPolicy;
  maxIterations?: number;
  approvalDecisions?: Record<string, 'approved' | 'rejected'>;
  responseReceiptWriter?: ProviderResponseReceiptWriter;
  approvalWriter?: ApprovalWriter;
  /** Re-reads current policy/approval immediately before any real tool call. */
  authorizationVerifier?: (input: ToolAuthorizationVerificationInput) => Promise<ToolAuthorizationDecision> | ToolAuthorizationDecision;
};

const DEFAULT_TOOLS: ToolDefinition[] = [
  {
    name: 'filesystem.read',
    description: 'Read one file inside the current project workspace.',
    inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } }, additionalProperties: false },
    permissionTier: 'read_only',
  },
  {
    name: 'filesystem.write',
    description: 'Write a file inside the current project workspace.',
    inputSchema: { type: 'object', required: ['path', 'content'], properties: { path: { type: 'string' }, content: { type: 'string' } }, additionalProperties: false },
    permissionTier: 'workspace_write',
  },
];

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateSchema(value: unknown, schema: JsonObject): string | undefined {
  if (schema.type === 'object' && !isJsonObject(value)) return 'arguments_must_be_object';
  if (schema.type === 'string' && typeof value !== 'string') return 'value_must_be_string';
  if (schema.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) return 'value_must_be_number';
  if (schema.type === 'boolean' && typeof value !== 'boolean') return 'value_must_be_boolean';
  if (schema.type === 'object' && isJsonObject(value)) {
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) if (typeof key === 'string' && !(key in value)) return `missing_required:${key}`;
    const properties = isJsonObject(schema.properties) ? schema.properties : {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in properties)) return `unknown_property:${key}`;
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value && isJsonObject(propertySchema)) {
        const nested = validateSchema(value[key], propertySchema);
        if (nested) return `${key}:${nested}`;
      }
    }
  }
  return undefined;
}

function toolDefinition(name: string, definitions: ToolDefinition[]): ToolDefinition | undefined {
  return definitions.find((item) => item.name === name);
}

function policyVersion(policy: ToolPolicy): number {
  return Number.isInteger(policy.policyVersion) && (policy.policyVersion as number) >= 1 ? policy.policyVersion as number : 1;
}

function runtimeRequest(call: { callId: string; name: string; arguments: JsonObject }, run: Run, workspaceRoot: string, policy: ToolPolicy, mode: ToolRuntimeMode, authorization: ToolAuthorizationSnapshot): ToolExecutionRequest | undefined {
  const [toolName, operationName] = call.name.split('.', 2);
  if (toolName !== 'filesystem' || (operationName !== 'read' && operationName !== 'write')) return undefined;
  return {
    requestId: `${run.id}:tool:${call.callId}`,
    runId: String(run.id),
    mode,
    tool: 'filesystem' as const,
    operation: operationName as 'read' | 'write',
    workspaceRoot,
    path: typeof call.arguments.path === 'string' ? call.arguments.path : undefined,
    content: typeof call.arguments.content === 'string' ? call.arguments.content : undefined,
    approvalGranted: authorization.status === 'approved',
    authorization,
    policy,
  };
}

function eventData(event: RunEvent): JsonObject {
  return event.data;
}

function priorToolResults(events: RunEvent[]): Map<string, JsonObject> {
  const result = new Map<string, JsonObject>();
  for (const event of events) {
    const data = eventData(event);
    if ((event.type === 'tool.completed' || event.type === 'tool.failed') && typeof data.callId === 'string') result.set(data.callId, data);
  }
  return result;
}

function pendingApproval(events: RunEvent[], callId: string): JsonObject | undefined {
  return events.find((event) => event.type === 'approval.requested' && event.data.callId === callId)?.data;
}

function approvalRecord(run: Run, callId: string, action: string, permissionTier: ApprovalRequest['permissionTier'], status: ApprovalRequest['status'], resolvedBy?: string, decisionReason?: string, currentPolicyVersion = 1): ApprovalRequest {
  const now = new Date().toISOString();
  return {
    id: `${run.id}:approval:${callId}` as ApprovalRequest['id'],
    projectId: run.projectId,
    runId: run.id,
    action,
    description: `允许 Bot 调用 ${action}`,
    permissionTier,
    status,
    metadata: { callId, policyVersion: currentPolicyVersion },
    requestedAt: now,
    ...(status === 'pending' ? {} : { resolvedAt: now, resolvedBy: resolvedBy ?? 'fixture-test', decisionReason: decisionReason ?? `fixture ${status}` }),
  };
}

function resolvedApprovalRecord(run: Run, pending: JsonObject, callId: string, action: string, permissionTier: ApprovalRequest['permissionTier'], status: 'approved' | 'rejected'): ApprovalRequest {
  const pendingPolicyVersion = typeof pending.policyVersion === 'number'
    ? pending.policyVersion
    : pending.metadata && isJsonObject(pending.metadata) && typeof pending.metadata.policyVersion === 'number'
      ? pending.metadata.policyVersion
      : 1;
  const base = approvalRecord(run, callId, action, permissionTier, status, 'fixture-test', status === 'approved' ? 'fixture approval' : 'fixture rejection', pendingPolicyVersion);
  return {
    ...base,
    id: String(pending.id ?? base.id) as ApprovalRequest['id'],
    requestedAt: String(pending.requestedAt ?? base.requestedAt),
    metadata: (pending.metadata && isJsonObject(pending.metadata) ? pending.metadata : { callId }),
  };
}

function resolvedApprovalEvent(events: RunEvent[], callId: string): JsonObject | undefined {
  return events.find((event) => event.type === 'approval.resolved' && event.data.callId === callId)?.data;
}

async function appendLoopEvent(store: RunStore, runId: RunId, type: RunEvent['type'], data: JsonObject, actor: RunEvent['actor'], correlationId: string): Promise<RunEvent> {
  const events = await store.listEvents(runId);
  const enriched = addSemanticEventData(runId, type, data, events);
  const incomingSemanticKey = semanticEventKey({ type, data: enriched, actor });
  const replay = incomingSemanticKey ? events.find((existing) => semanticEventKey(existing) === incomingSemanticKey) : undefined;
  if (replay) return replay;
  const event = createRunEvent(runId, type, enriched, events.length + 1, actor, undefined);
  event.correlationId = correlationId;
  await store.appendEvent(event);
  return event;
}

function toolResultMessage(callId: string, data: JsonObject): { role: 'tool'; content: string; toolCallId: string } {
  return { role: 'tool', toolCallId: callId, content: JSON.stringify(data) };
}

function auditToolArguments(call: { name: string; arguments: JsonObject }): JsonObject {
  if (call.name !== 'filesystem.write' || typeof call.arguments.content !== 'string') return call.arguments;
  const content = call.arguments.content;
  return {
    ...call.arguments,
    content: '[omitted from audit event]',
    contentSha256: createHash('sha256').update(content, 'utf8').digest('hex'),
    contentBytes: Buffer.byteLength(content, 'utf8'),
  };
}

function artifactFromResponse(run: Run, response: ProviderResponseEnvelope, segment: number): JsonObject {
  const artifactName = response.provider.provider === 'fixture-tool-loop'
    ? 'Fixture Tool Loop Result'
    : `${response.provider.provider} Tool Loop Result`;
  return {
    id: `${run.id}:artifact:tool-loop`,
    runId: run.id,
    kind: 'tool-loop-result',
    name: artifactName,
    contentType: 'application/json',
    content: JSON.stringify(response.structuredOutput ?? { outputText: response.outputText ?? '' }),
    providerResponseRef: response.rawResponseRef ?? null,
    segment,
  };
}

/**
 * Execute one provider-neutral model/tool loop. The provider only proposes
 * calls; the control plane owns validation, approvals, execution, receipts,
 * idempotency, event ordering and the final artifact.
 */
export async function runToolLoop(options: ToolLoopOptions): Promise<ToolLoopResult> {
  const definitions = options.toolDefinitions ?? DEFAULT_TOOLS;
  const policy = options.toolPolicy ?? {
    permissionTier: 'workspace_write' as const,
    allowedTools: ['filesystem'],
    approvalRequiredActions: ['filesystem.write'],
    policyVersion: 1,
  };
  const runtime = options.toolRuntime ?? new FixtureToolRuntime();
  const runtimeMode = options.toolRuntimeMode ?? 'fixture';
  const maxIterations = Math.max(1, Math.floor(options.maxIterations ?? 4));
  let run = options.run;
  let events = await options.store.listEvents(run.id);
  const previousResults = priorToolResults(events);
  const request = buildModelRequestEnvelope({
    requestId: `${run.id}:model:1`,
    runId: run.id,
    request: run.request,
    tools: definitions,
    cachePolicy: { mode: 'opportunistic' },
  });
  let currentRequest = request;

  for (let segment = 1; segment <= maxIterations; segment += 1) {
    let response: ProviderResponseEnvelope;
    try {
      response = await options.provider.respond(currentRequest);
    } catch (error) {
      const failed = await options.store.transition(run.id, 'fail', {
        reason: error instanceof Error ? error.message : String(error),
        error: { code: 'provider_response_failed', message: error instanceof Error ? error.message : String(error), retryable: true },
      });
      events = await options.store.listEvents(run.id);
      return { run: failed.run, events, status: 'failed', error: failed.event.data.error as JsonObject };
    }
    const correlationId = response.requestId;
    await appendLoopEvent(options.store, run.id, 'provider.event', { phase: 'model.response', segment, response: response as unknown as JsonObject }, { type: 'provider', provider: response.provider.provider }, correlationId);
    try {
      await options.responseReceiptWriter?.({ runId: run.id, segment, response });
    } catch (error) {
      const failed = await options.store.transition(run.id, 'fail', {
        reason: error instanceof Error ? error.message : String(error),
        error: { code: 'provider_receipt_persist_failed', message: error instanceof Error ? error.message : String(error), retryable: true },
        correlationId,
      });
      events = await options.store.listEvents(run.id);
      return { run: failed.run, events, status: 'failed', error: failed.event.data.error as JsonObject };
    }
    events = await options.store.listEvents(run.id);

    if (response.error) {
      const failed = await options.store.transition(run.id, 'fail', { reason: response.error.message, error: response.error });
      events = await options.store.listEvents(run.id);
      return { run: failed.run, events, status: 'failed', error: response.error as unknown as JsonObject };
    }

    if (response.toolCalls.length === 0) {
      const artifact = artifactFromResponse(run, response, segment);
      const existingArtifact = events.find((event) => event.type === 'artifact.created' && event.data.id === artifact.id);
      if (!existingArtifact) await appendLoopEvent(options.store, run.id, 'artifact.created', artifact, { type: 'bot', botId: run.botId }, correlationId);
      const finished = run.status === 'running' ? await options.store.transition(run.id, 'succeed', { result: { artifactId: artifact.id, provider: { harness: response.provider.harness, provider: response.provider.provider, model: response.provider.model, authMode: response.provider.authMode, billingSource: response.provider.billingSource, isMock: response.provider.isMock }, responseRef: response.rawResponseRef ?? null } }) : { run };
      events = await options.store.listEvents(run.id);
      return { run: finished.run, events, status: 'succeeded', artifact };
    }

    const nextMessages = [...currentRequest.messages];
    nextMessages.push({
      role: 'assistant',
      content: '',
      toolCalls: response.toolCalls,
      ...(response.providerFields ? { providerFields: response.providerFields } : {}),
    });
    const toolResults: Array<{ callId: string; data: JsonObject }> = [];
    for (const call of response.toolCalls) {
      const prior = previousResults.get(call.callId);
      if (prior) {
        toolResults.push({ callId: call.callId, data: { ...prior, replayed: true } });
        nextMessages.push(toolResultMessage(call.callId, { ...prior, replayed: true }));
        continue;
      }
      const definition = toolDefinition(call.name, definitions);
      if (!definition) {
        const failedData: JsonObject = { callId: call.callId, name: call.name, errorCode: 'tool_schema_invalid', message: 'unknown_tool', executed: false };
        await appendLoopEvent(options.store, run.id, 'tool.failed', failedData, { type: 'bot', botId: run.botId }, correlationId);
        previousResults.set(call.callId, failedData);
        const failed = await options.store.transition(run.id, 'fail', { reason: 'Unknown tool or invalid tool schema', error: { code: 'tool_schema_invalid', message: 'Unknown tool or invalid tool schema', retryable: false }, correlationId });
        events = await options.store.listEvents(run.id);
        return { run: failed.run, events, status: 'failed', error: failedData };
      }
      const schemaError = validateSchema(call.arguments, definition.inputSchema);
      if (schemaError) {
        const failedData: JsonObject = { callId: call.callId, name: call.name, errorCode: 'tool_schema_invalid', message: schemaError, executed: false };
        await appendLoopEvent(options.store, run.id, 'tool.failed', failedData, { type: 'bot', botId: run.botId }, correlationId);
        previousResults.set(call.callId, failedData);
        const failed = await options.store.transition(run.id, 'fail', { reason: 'Tool arguments failed schema validation', error: { code: 'tool_schema_invalid', message: schemaError, retryable: false }, correlationId });
        events = await options.store.listEvents(run.id);
        return { run: failed.run, events, status: 'failed', error: failedData };
      }

      const requiredApproval = policy.approvalRequiredActions.includes(call.name);
      let authorization: ToolAuthorizationSnapshot = { policyVersion: policyVersion(policy), status: 'not_required' };
      if (requiredApproval) {
        const pending = pendingApproval(events, call.callId);
        const decision = options.approvalDecisions?.[call.callId];
        if (!pending) {
          const approval = approvalRecord(run, call.callId, call.name, definition.permissionTier, 'pending');
          const approvalData: JsonObject = { ...approval as unknown as JsonObject, callId: call.callId };
          await appendLoopEvent(options.store, run.id, 'approval.requested', approvalData, { type: 'bot', botId: run.botId }, correlationId);
          await options.approvalWriter?.(approval);
          const waiting = await options.store.transition(run.id, 'wait_user', { reason: `等待审批：${call.name}`, correlationId });
          events = await options.store.listEvents(run.id);
          return { run: waiting.run, events, status: 'waiting_user', approval };
        }
        if (!decision) {
          if (run.status !== 'waiting_user') run = (await options.store.transition(run.id, 'wait_user', { reason: `等待审批：${call.name}`, correlationId })).run;
          events = await options.store.listEvents(run.id);
          return { run, events, status: 'waiting_user', approval: pending as unknown as ApprovalRequest };
        }
        const resolvedApproval = resolvedApprovalRecord(run, pending, call.callId, call.name, definition.permissionTier, decision);
        const alreadyResolved = resolvedApprovalEvent(events, call.callId);
        const resolved = alreadyResolved
          ? { id: String(alreadyResolved.id ?? `${run.id}:approval-resolved:${call.callId}`), data: alreadyResolved } as unknown as RunEvent
          : await appendLoopEvent(options.store, run.id, 'approval.resolved', { ...resolvedApproval as unknown as JsonObject, callId: call.callId }, { type: 'user' }, correlationId);
        if (!alreadyResolved) await options.approvalWriter?.(resolvedApproval);
        if (decision === 'rejected') {
          const deniedData: JsonObject = { callId: call.callId, name: call.name, errorCode: 'approval_rejected', message: 'approval_rejected', executed: false, approvalEventId: resolved.id };
          await appendLoopEvent(options.store, run.id, 'tool.failed', deniedData, { type: 'bot', botId: run.botId }, correlationId);
          if (run.status === 'waiting_user') run = (await options.store.transition(run.id, 'resume', { reason: '审批已处理', correlationId })).run;
          const failed = await options.store.transition(run.id, 'fail', { reason: 'Tool approval rejected', error: { code: 'approval_rejected', message: 'Tool approval rejected', retryable: false }, correlationId });
          events = await options.store.listEvents(run.id);
          return { run: failed.run, events, status: 'failed', error: deniedData };
        }
        authorization = {
          policyVersion: policyVersion(policy),
          status: 'approved',
          approvalId: resolvedApproval.id,
        };
        if (run.status === 'waiting_user') run = (await options.store.transition(run.id, 'resume', { correlationId })).run;
      }

      const request = runtimeRequest(call, run, options.workspaceRoot, policy, runtimeMode, authorization);
      if (!request) {
        const failedData: JsonObject = { callId: call.callId, name: call.name, errorCode: 'tool_not_supported', message: 'tool_not_supported', executed: false };
        await appendLoopEvent(options.store, run.id, 'tool.failed', failedData, { type: 'bot', botId: run.botId }, correlationId);
        previousResults.set(call.callId, failedData);
        toolResults.push({ callId: call.callId, data: failedData });
        nextMessages.push(toolResultMessage(call.callId, failedData));
        continue;
      }
      let authorizationDecision: ToolAuthorizationDecision = { allowed: true, policyVersion: authorization.policyVersion };
      if (options.authorizationVerifier) {
        try {
          authorizationDecision = await options.authorizationVerifier({ run, call, policy, authorization });
        } catch (error) {
          authorizationDecision = {
            allowed: false,
            policyVersion: authorization.policyVersion,
            reasonCode: 'verifier_failed',
            message: error instanceof Error ? error.message : String(error),
          };
        }
      }
      if (!authorizationDecision.allowed) {
        const revokedData: JsonObject = {
          callId: call.callId,
          name: call.name,
          approvalId: authorization.approvalId ?? null,
          policyVersion: authorization.policyVersion,
          currentPolicyVersion: authorizationDecision.policyVersion,
          reasonCode: authorizationDecision.reasonCode,
          message: authorizationDecision.message,
        };
        await appendLoopEvent(options.store, run.id, 'tool.authorization_revoked', revokedData, { type: 'system' }, correlationId);
        const failedData: JsonObject = { ...revokedData, errorCode: `tool_${authorizationDecision.reasonCode}`, executed: false };
        await appendLoopEvent(options.store, run.id, 'tool.failed', failedData, { type: 'bot', botId: run.botId }, correlationId);
        if (run.status === 'waiting_user') run = (await options.store.transition(run.id, 'resume', { reason: '工具授权已撤销', correlationId })).run;
        const failed = await options.store.transition(run.id, 'fail', {
          reason: authorizationDecision.message,
          error: { code: `tool_${authorizationDecision.reasonCode}`, message: authorizationDecision.message, retryable: false },
          correlationId,
        });
        events = await options.store.listEvents(run.id);
        return { run: failed.run, events, status: 'failed', error: failedData };
      }
      const invokedData: JsonObject = { callId: call.callId, name: call.name, arguments: auditToolArguments(call), requestId: request.requestId ?? `${run.id}:tool:${call.callId}`, providerResponseRef: response.rawResponseRef ?? null };
      await appendLoopEvent(options.store, run.id, 'tool.invoked', invokedData, { type: 'bot', botId: run.botId }, correlationId);
      const result: ToolExecutionResult = await runtime.execute(request);
      const resultData: JsonObject = result.failed
        ? { ...result.failed, callId: call.callId, name: call.name, executed: false }
        : { ...result.completed, callId: call.callId, name: call.name, output: result.output ?? null, executed: true };
      await appendLoopEvent(options.store, run.id, result.failed ? 'tool.failed' : 'tool.completed', resultData, { type: 'bot', botId: run.botId }, correlationId);
      previousResults.set(call.callId, resultData);
      toolResults.push({ callId: call.callId, data: resultData });
      nextMessages.push(toolResultMessage(call.callId, resultData));
      if (result.failed) {
        const failed = await options.store.transition(run.id, 'fail', { reason: String(result.failed.message ?? 'ToolRuntime failed'), error: { code: String(result.receipt.errorCode ?? 'tool_runtime_failed'), message: String(result.failed.message ?? 'ToolRuntime failed'), retryable: false }, correlationId });
        events = await options.store.listEvents(run.id);
        return { run: failed.run, events, status: 'failed', error: resultData };
      }
    }

    if (segment === maxIterations) {
      const failed = await options.store.transition(run.id, 'fail', { reason: 'Tool loop reached max iterations', error: { code: 'tool_loop_max_iterations', message: 'Tool loop reached max iterations', retryable: false }, correlationId });
      events = await options.store.listEvents(run.id);
      return { run: failed.run, events, status: 'failed', error: failed.event.data.error as JsonObject };
    }
    currentRequest = {
      ...currentRequest,
      requestId: `${run.id}:model:${segment + 1}`,
      messages: nextMessages,
      metadata: { ...(currentRequest.metadata ?? {}), toolResults: toolResults.map((item) => item.callId) },
    };
  }
  throw new Error('unreachable_tool_loop');
}

export class FixtureToolLoopProvider implements ToolLoopProvider {
  readonly identity: ProviderIdentity = { harness: 'fixture', provider: 'fixture-tool-loop', model: 'fixture-tool-loop-v1', authMode: 'local', billingSource: 'local', isMock: true };
  private readonly scenario: 'normal' | 'approval' | 'schema-error' | 'failure' | 'duplicate' | 'max-loop';
  private readonly readPath: string;
  private callCount = 0;

  constructor(scenario: 'normal' | 'approval' | 'schema-error' | 'failure' | 'duplicate' | 'max-loop' = 'normal', readPath = 'fixtures/demo-project.json') {
    this.scenario = scenario;
    this.readPath = readPath;
  }

  async respond(request: ModelRequestEnvelope): Promise<ProviderResponseEnvelope> {
    const hasToolResult = request.messages.some((message) => message.role === 'tool');
    this.callCount += 1;
    if (this.scenario === 'max-loop' || (!hasToolResult && this.scenario !== 'schema-error' && this.scenario !== 'failure' && this.scenario !== 'approval' && this.scenario !== 'duplicate')) {
      const callId = this.scenario === 'max-loop' ? `max-loop-${this.callCount}` : 'fixture-read-1';
      return normalizeProviderResponse({ requestId: request.requestId, provider: this.identity, raw: { scenario: this.scenario, callCount: this.callCount }, toolCalls: [{ callId, name: 'filesystem.read', arguments: { path: this.readPath } }], usage: { source: 'unknown' }, promptCache: { status: 'unknown', providerReported: false } });
    }
    if (!hasToolResult) {
      const name = this.scenario === 'approval' ? 'filesystem.write' : 'filesystem.read';
      const argumentsValue = this.scenario === 'schema-error'
        ? {}
        : this.scenario === 'failure'
          ? { path: '../outside.txt' }
          : this.scenario === 'approval'
            ? { path: 'fixtures/demo-project.json', content: 'fixture write' }
            : { path: this.readPath };
      const calls = [{ callId: 'fixture-call-1', name, arguments: argumentsValue as JsonObject }];
      if (this.scenario === 'duplicate') calls.push({ ...calls[0] });
      return normalizeProviderResponse({ requestId: request.requestId, provider: this.identity, raw: { scenario: this.scenario, callCount: this.callCount }, toolCalls: calls, usage: { source: 'unknown' }, promptCache: { status: 'unknown', providerReported: false } });
    }
    return normalizeProviderResponse({ requestId: request.requestId, provider: this.identity, raw: { scenario: this.scenario, callCount: this.callCount }, outputText: 'fixture tool loop complete', structuredOutput: { ok: true, scenario: this.scenario, toolResults: request.messages.filter((message) => message.role === 'tool').length }, finishReason: 'stop', usage: { source: 'unknown' }, promptCache: { status: 'unknown', providerReported: false } });
  }
}
