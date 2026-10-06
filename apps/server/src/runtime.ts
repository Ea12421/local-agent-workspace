import { createHash } from 'node:crypto';
import { InMemoryRunStore, buildContextPacket, buildContextSnapshot, createOpaqueId, createRunEvent, semanticEventKey, type ApprovalRequest, type Artifact, type BotId, type ContextLedger, type ContextPacket, type ContextPolicy, type ContextSnapshotId, type JsonObject, type JsonValue, type OutputContractMode, type ProjectId, type ProviderAdapter, type ProviderResponseEnvelope, type ProviderIdentity, type Run, type RunEvent, type RunId, type RunHandle, type SessionId, type ToolAuthorizationSnapshot, type ToolPolicy } from '../../../packages/core/src/index.ts';
import type { RunStore } from '../../../packages/core/src/run-store.ts';
import { buildProviderOutputReceipt, CodexExternalAdapter, DeepSeekApiAdapter, DeepSeekToolLoopProvider, normalizeCodexExecutionSegment, parseStructuredJsonObject, validateStructuredOutput } from '../../../packages/adapters/src/index.ts';
import { ControlledCommandRuntime, CONTROLLED_COMMAND_PROFILES, FixtureToolRuntime, LocalToolRuntime, type ControlledCommandId, type ControlledCommandProfile, type ControlledCommandResult } from '../../../packages/adapters/src/index.ts';
import { PRODUCT_BUILDER_DRAFT_OUTPUT_SCHEMA, validateProductBuilderProviderDraft, type ProductBuilderProviderDraft } from '../../../packages/workflow/src/index.ts';
import { openContextSnapshotStore, openSqliteProductBuilderContinuity, openSqliteRunStore, type ContextSnapshotStore, type ProviderReceipt } from './persistence.ts';
import { FixtureToolLoopProvider, runToolLoop, type ToolAuthorizationDecision, type ToolAuthorizationVerificationInput, type ToolLoopResult } from './tool-loop.ts';
import { addSemanticEventData } from './event-idempotency.ts';
import os from 'node:os';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

const projectId = 'project-product-builder' as ProjectId;
const productBuilderId = 'bot-product-builder' as BotId;

export type RuntimeScope = {
  projectId?: ProjectId;
  botId?: BotId;
  sessionId?: SessionId;
  sessionMessageId?: string;
  skillIds?: string[];
  disabledSkillIds?: string[];
};

function resolveRuntimeScope(scope?: RuntimeScope): { projectId: ProjectId; botId: BotId; sessionId?: SessionId; sessionMessageId?: string; skillIds?: string[]; disabledSkillIds?: string[] } {
  return {
    projectId: scope?.projectId ?? projectId,
    botId: scope?.botId ?? productBuilderId,
    ...(scope?.sessionId ? { sessionId: scope.sessionId } : {}),
    ...(scope?.sessionMessageId ? { sessionMessageId: scope.sessionMessageId } : {}),
    ...(scope?.skillIds?.length ? { skillIds: [...scope.skillIds] } : {}),
    ...(scope?.disabledSkillIds?.length ? { disabledSkillIds: [...scope.disabledSkillIds] } : {}),
  };
}

function runningUnderNodeTest(): boolean {
  return process.argv.includes('--test') || Boolean(process.env.NODE_TEST_CONTEXT);
}

function defaultRuntimeDatabasePath(): string {
  if (process.env.AGENT_WORKSPACE_DB) return process.env.AGENT_WORKSPACE_DB;
  if (runningUnderNodeTest()) return path.join(os.tmpdir(), `local-agent-workspace-test-${process.pid}.db`);
  if (process.env.AGENT_WORKSPACE_DATA_DIR) return path.join(process.env.AGENT_WORKSPACE_DATA_DIR, 'workspace.db');
  return path.join(process.cwd(), 'data', 'workspace.db');
}

export function projectWorkspaceRoot(requestedProjectId: ProjectId | string = projectId): string {
  const configured = process.env.AGENT_WORKSPACE_PROJECT_ROOT;
  try {
    const continuity = openSqliteProductBuilderContinuity(defaultRuntimeDatabasePath());
    const stored = continuity?.entityStore.getProject(String(requestedProjectId));
    continuity?.close();
    if (stored?.workspacePath) return stored.workspacePath;
  } catch (error) {
    throw new Error(`读取项目工作区失败：${error instanceof Error ? error.message : String(error)}`);
  }
  if (String(requestedProjectId) === String(projectId) && configured) return configured;
  if (String(requestedProjectId) !== String(projectId)) throw new Error(`project_not_found:${requestedProjectId}`);
  return process.cwd();
}

function createRuntimeStore(): RunStore {
  try {
    const databasePath = defaultRuntimeDatabasePath();
    mkdirSync(path.dirname(databasePath), { recursive: true });
    return openSqliteRunStore(databasePath).store;
  } catch (error) {
    if (runningUnderNodeTest()) return new InMemoryRunStore();
    throw new Error(`SQLite runtime store unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** SQLite is the default runtime source of truth; tests may use an isolated temp DB. */
export const runtimeStore = createRuntimeStore();
let seededRun: Run | undefined;
type ActiveCodexRun = {
  adapter: ProviderAdapter;
  handle?: RunHandle;
  cancellationRequested: boolean;
};
const activeCodexRuns = new Map<RunId, ActiveCodexRun>();

type ActiveControlledCommandRun = { controller: AbortController };
const activeControlledCommandRuns = new Map<RunId, ActiveControlledCommandRun>();
const controlledCommandRuntime = new ControlledCommandRuntime();

export type ControlledCommandRunResult = {
  run: Run;
  profile: ControlledCommandProfile;
  command: ControlledCommandResult;
  events: RunEvent[];
  approval?: ApprovalRequest;
};

function controlledCommandProfile(commandId: string): ControlledCommandProfile {
  const profile = CONTROLLED_COMMAND_PROFILES.find((item) => item.id === commandId);
  if (!profile) throw new Error(`controlled_command_profile_not_found:${commandId}`);
  return profile;
}

function controlledCommandPolicy(profile: ControlledCommandProfile): ToolPolicy {
  return {
    permissionTier: 'read_only',
    allowedTools: ['command'],
    allowedCommands: [profile.argv.join(' ')],
    allowedPaths: [],
    policyVersion: 1,
    approvalRequiredActions: [profile.approvalAction],
  };
}

export function listControlledCommandProfiles(): readonly ControlledCommandProfile[] {
  return CONTROLLED_COMMAND_PROFILES;
}

export async function previewControlledCommand(commandId: string, requestId?: string, argv?: string[], scope?: RuntimeScope) {
  const profile = controlledCommandProfile(commandId);
  const resolved = resolveRuntimeScope(scope);
  const result = await controlledCommandRuntime.execute({
    requestId: requestId ?? `command-preview:${profile.id}`,
    mode: 'dry_run',
    commandId: profile.id as ControlledCommandId,
    workspaceRoot: projectWorkspaceRoot(resolved.projectId),
    policy: controlledCommandPolicy(profile),
    ...(argv ? { argv } : {}),
  });
  return { profile, result };
}

export async function createControlledCommandRun(objective: string, commandId: string, idempotencyKey?: string, scope?: RuntimeScope) {
  const profile = controlledCommandProfile(commandId);
  const resolved = resolveRuntimeScope(scope);
  projectWorkspaceRoot(resolved.projectId);
  const run = await runtimeStore.createRun({
    projectId: resolved.projectId,
    botId: resolved.botId,
    request: {
      objective,
      input: { commandId: profile.id },
      metadata: {
        provider: 'controlled-command',
        executionAgent: 'controlled-command-runtime',
        commandId: profile.id,
        approvalAction: profile.approvalAction,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
    },
  });
  const started = await runtimeStore.transition(run.id, 'start');
  const waiting = await runtimeStore.transition(run.id, 'wait_user', { reason: `${profile.label}需要一次性用户批准` });
  return { run: waiting.run, profile, events: await runtimeStore.listEvents(run.id), startEvent: started.event, waitingEvent: waiting.event };
}

function controlledCommandMetadata(run: Run): { commandId: string } | undefined {
  const metadata = run.request.metadata;
  const commandId = metadata && typeof metadata.commandId === 'string' ? metadata.commandId : undefined;
  return metadata && metadata.provider === 'controlled-command' && commandId ? { commandId } : undefined;
}

export async function executeControlledCommandRun(runId: string, approval: ApprovalRequest): Promise<ControlledCommandRunResult | undefined> {
  const current = await runtimeStore.getRun(runId as RunId);
  if (!current) return undefined;
  const metadata = controlledCommandMetadata(current);
  if (!metadata) return undefined;
  const profile = controlledCommandProfile(metadata.commandId);
  const existingEvents = await runtimeStore.listEvents(current.id);
  const completedEvent = [...existingEvents].reverse().find((event) => event.type === 'tool.completed' || event.type === 'tool.failed');
  if (current.status === 'succeeded' || current.status === 'failed' || current.status === 'cancelled' || completedEvent) {
    const completedData = completedEvent?.data ?? {};
    const receipt = (completedData.receipt ?? completedData) as unknown as ControlledCommandResult['receipt'];
    return { run: current, profile, command: { receipt, invoked: (existingEvents.find((event) => event.type === 'tool.invoked')?.data ?? {}) as JsonObject, ...(completedEvent?.type === 'tool.completed' ? { completed: completedData } : { failed: completedData }) }, events: existingEvents, approval };
  }
  if (approval.status !== 'approved') throw new Error('controlled_command_approval_not_approved');
  if (current.status !== 'waiting_user' && current.status !== 'running') throw new Error(`controlled_command_run_not_resumable:${current.status}`);
  if (current.status === 'waiting_user') await runtimeStore.transition(current.id, 'resume', { idempotencyKey: `controlled-command:resume:${approval.id}` });
  const controller = new AbortController();
  activeControlledCommandRuns.set(current.id, { controller });
  const authorization: ToolAuthorizationSnapshot = { policyVersion: 1, status: 'approved', approvalId: approval.id };
  const requestId = `controlled-command:${current.id}`;
  try {
    await appendRuntimeEvent(current.id, 'tool.invoked', {
      requestId,
      tool: 'controlled-command',
      operation: 'run',
      commandId: profile.id,
      argv: [...profile.argv],
      declaredEffects: [...profile.declaredEffects],
      approvalId: approval.id,
      approvalAction: profile.approvalAction,
      permissionTier: 'read_only',
      idempotencyKey: requestId,
    });
    const command = await controlledCommandRuntime.execute({
      requestId,
      runId: String(current.id),
      mode: 'local',
      commandId: profile.id as ControlledCommandId,
      workspaceRoot: projectWorkspaceRoot(current.projectId),
      policy: controlledCommandPolicy(profile),
      approvalGranted: true,
      authorization,
      signal: controller.signal,
    });
    const terminalData = (command.receipt.status === 'succeeded' ? command.completed : command.failed) ?? command.receipt;
    const event = await appendRuntimeEvent(current.id, command.receipt.status === 'succeeded' ? 'tool.completed' : 'tool.failed', {
      ...terminalData,
      receipt: command.receipt,
      commandId: profile.id,
      approvalId: approval.id,
    } as JsonObject);
    const after = await runtimeStore.getRun(current.id);
    if (command.receipt.status === 'succeeded' && after?.status === 'running') {
      await runtimeStore.transition(current.id, 'succeed', {
        result: { provider: 'controlled-command', commandId: profile.id, receipt: command.receipt, output: command.output ?? null, eventCount: (await runtimeStore.listEvents(current.id)).length },
      });
    } else if (command.receipt.status !== 'succeeded' && after?.status === 'running') {
      await runtimeStore.transition(current.id, 'fail', {
        reason: String(command.receipt.errorCode ?? 'controlled_command_failed'),
        error: { code: String(command.receipt.errorCode ?? 'controlled_command_failed'), message: String((command.failed as any)?.message ?? command.receipt.errorCode ?? '受控命令执行失败'), retryable: true },
      });
    }
    const finalRun = (await runtimeStore.getRun(current.id))!;
    return { run: finalRun, profile, command, events: await runtimeStore.listEvents(current.id), approval };
  } finally {
    activeControlledCommandRuns.delete(current.id);
  }
}

export async function cancelControlledCommandRun(runId: string) {
  const current = await runtimeStore.getRun(runId as RunId);
  if (!current) return undefined;
  if (!controlledCommandMetadata(current)) return undefined;
  if (current.status === 'cancelled') return { run: current, status: 'cancelled' as const, alreadyCancelled: true };
  if (current.status === 'succeeded' || current.status === 'failed') return { run: current, status: current.status };
  activeControlledCommandRuns.get(current.id)?.controller.abort();
  const cancelled = await runtimeStore.transition(current.id, 'cancel', { actor: { type: 'user' }, reason: '用户取消受控命令', idempotencyKey: `cancel:${current.id}` });
  return { run: cancelled.run, status: 'cancelled' as const, event: cancelled.event };
}

export type CodexExecutionOptions = {
  maxSegments?: number;
  model?: string;
  cwd?: string;
  constraints?: string[];
  outputMode?: OutputContractMode;
  outputSchema?: JsonObject;
  adapterFactory?: (segment: number, packet?: ContextPacket) => ProviderAdapter;
  contextSnapshotStore?: ContextSnapshotStore;
  contextPolicy?: ContextPolicy;
};

function persistCodexReceipt(
  runId: RunId,
  segment: number,
  provider: RunHandle['provider'],
  providerEvents: RunEvent[],
  status: 'succeeded' | 'failed' | 'cancelled',
  details: Record<string, JsonValue> = {},
): string | undefined {
  if (runningUnderNodeTest()) return undefined;
  const continuity = openSqliteProductBuilderContinuity(defaultRuntimeDatabasePath());
  if (!continuity) return undefined;
  const receiptId = `${runId}:codex:segment:${segment}`;
  const eventDigest = createHash('sha256').update(JSON.stringify(providerEvents.map((item) => item.data))).digest('hex');
  const usage = providerEvents.map((item) => item.data as any).find((data) => data?.stream?.type === 'turn.completed')?.stream?.usage;
  const receipt: ProviderReceipt = {
    id: receiptId,
    runId,
    segment,
    provider,
    receipt: {
      schemaVersion: 'provider.execution-receipt.v1',
      status,
      bridge: 'codex-cli',
      eventCount: providerEvents.length,
      eventDigestSha256: eventDigest,
      ...(usage ? { usage } : {}),
      ...details,
    },
    createdAt: new Date().toISOString(),
  };
  try {
    continuity.entityStore.saveProviderReceipt(receipt);
    return receiptId;
  } finally {
    continuity.close();
  }
}

function persistCodexModelReceipt(
  runId: RunId,
  segment: number,
  response: ProviderResponseEnvelope,
): string | undefined {
  if (runningUnderNodeTest()) return undefined;
  const continuity = openSqliteProductBuilderContinuity(defaultRuntimeDatabasePath());
  if (!continuity) return undefined;
  const receiptId = `${runId}:codex:model:${segment}`;
  const outputTextSha256 = response.outputText
    ? createHash('sha256').update(response.outputText).digest('hex')
    : undefined;
  const safeResponse: JsonObject = {
    ...response,
    ...(response.outputText ? {
      outputText: undefined,
      providerFields: {
        ...(response.providerFields ?? {}),
        outputTextSha256: `sha256:${outputTextSha256}`,
        outputTextRedacted: true,
      },
    } : {}),
  } as unknown as JsonObject;
  try {
    continuity.entityStore.saveProviderReceipt({
      id: receiptId,
      runId,
      segment,
      provider: response.provider,
      receipt: safeResponse,
      createdAt: new Date().toISOString(),
    });
    return receiptId;
  } finally {
    continuity.close();
  }
}

const defaultContextPolicy: ContextPolicy = {
  softThresholdTokens: 6_000,
  hardThresholdTokens: 8_000,
  reserveOutputTokens: 1_000,
  maxSummaryTokens: 2_000,
  maxTailEvents: 12,
};

function defaultContextSnapshotStore(): ContextSnapshotStore {
  const databasePath = process.env.AGENT_WORKSPACE_DATA_DIR
    ? path.join(process.env.AGENT_WORKSPACE_DATA_DIR, 'workspace.db')
    : path.join(process.cwd(), 'data', 'workspace.db');
  mkdirSync(path.dirname(databasePath), { recursive: true });
  return openContextSnapshotStore(databasePath).store;
}

async function appendRuntimeEvent(runId: RunId, type: RunEvent['type'], data: JsonObject, actor: RunEvent['actor'] = { type: 'system' }, scope?: string) {
  const current = await runtimeStore.listEvents(runId);
  const enriched = addSemanticEventData(runId, type, data, current, scope);
  const incomingSemanticKey = semanticEventKey({ type, data: enriched, actor });
  const replay = incomingSemanticKey ? current.find((existing) => semanticEventKey(existing) === incomingSemanticKey) : undefined;
  if (replay) return replay;
  const event = createRunEvent(runId, type, enriched, current.length + 1, actor);
  await runtimeStore.appendEvent(event);
  return event;
}

async function createRecoverySnapshot(run: Run, events: RunEvent[], store: ContextSnapshotStore, policy: ContextPolicy, trigger: 'provider_limit' | 'interrupt'): Promise<{ snapshot: Awaited<ReturnType<typeof buildContextSnapshot>>; packet: ContextPacket }> {
  const ledger: ContextLedger = {
    projectId: run.projectId,
    runId: run.id,
    objective: run.request.objective,
    constraints: [...(run.request.constraints ?? [])],
    durableFacts: [],
    decisions: [],
    unknowns: ['上一个 provider segment 未完成，需在恢复后确认是否产生了外部副作用。'],
    pendingApprovalRefs: [],
    activeHandoffRefs: [],
    artifactRefs: [],
    sourceRefs: [...(run.request.inputRefs ?? [])],
    nextAction: '使用已保存上下文继续同一逻辑 Run，并避免重复已完成的工具或产物工作。',
    items: [],
    events,
  };
  const snapshot = buildContextSnapshot(ledger, policy, {
    id: createOpaqueId('snapshot') as ContextSnapshotId,
    createdAt: new Date().toISOString(),
    trigger,
  });
  await store.append(snapshot);
  const packet = buildContextPacket(snapshot, events);
  return { snapshot, packet };
}

export async function ensureSeeded() {
  if (seededRun) return seededRun;
  const existing = await runtimeStore.getRun('run-core-fixture-001' as Run['id']);
  if (existing) {
    seededRun = existing;
    return seededRun;
  }
  seededRun = await runtimeStore.createRun({
    id: 'run-core-fixture-001' as Run['id'],
    projectId,
    botId: productBuilderId,
    now: '2026-09-26T10:00:00.000Z',
    request: {
      objective: '设计一个面向独立开发者的 AI 视频产品',
      input: { idea: 'AI 视频生成平台' },
      constraints: ['外部事实必须带来源', '需要用户确认 MVP'],
      outputSchema: { type: 'object', required: ['productBrief', 'executionPlan'] } as JsonObject,
    },
  });
  await runtimeStore.transition(seededRun.id, 'start', { now: '2026-09-26T10:00:00.100Z' });
  await runtimeStore.transition(seededRun.id, 'wait_user', { now: '2026-09-26T10:00:03.000Z', reason: '等待用户确认 MVP 范围' });
  await runtimeStore.transition(seededRun.id, 'resume', { now: '2026-09-26T10:00:04.000Z' });
  await runtimeStore.transition(seededRun.id, 'succeed', { now: '2026-09-26T10:00:05.000Z', result: { artifactIds: ['artifact-brief', 'artifact-plan'] } });
  seededRun = (await runtimeStore.getRun(seededRun.id))!;
  return seededRun;
}

export async function createRuntimeRun(objective: string, scope?: RuntimeScope) {
  const resolved = resolveRuntimeScope(scope);
  projectWorkspaceRoot(resolved.projectId);
  const run = await runtimeStore.createRun({ projectId: resolved.projectId, botId: resolved.botId, request: { objective, input: { idea: objective } } });
  const started = await runtimeStore.transition(run.id, 'start');
  return { run: started.run, event: started.event };
}

async function persistFixtureResponse(input: Parameters<NonNullable<Parameters<typeof runToolLoop>[0]['responseReceiptWriter']>>[0]): Promise<void> {
  if (runningUnderNodeTest()) return;
  const continuity = openSqliteProductBuilderContinuity(defaultRuntimeDatabasePath());
  if (!continuity) throw new Error('SQLite continuity store unavailable for provider response receipt');
  try {
    continuity.entityStore.saveProviderReceipt({
      id: `${input.runId}:fixture:model:${input.segment}`,
      runId: input.runId,
      segment: input.segment,
      provider: input.response.provider,
      receipt: input.response as unknown as JsonObject,
      createdAt: new Date().toISOString(),
    });
  } finally {
    continuity.close();
  }
}

async function persistDeepSeekToolLoopResponse(input: Parameters<NonNullable<Parameters<typeof runToolLoop>[0]['responseReceiptWriter']>>[0]): Promise<void> {
  if (runningUnderNodeTest()) return;
  const continuity = openSqliteProductBuilderContinuity(defaultRuntimeDatabasePath());
  if (!continuity) throw new Error('SQLite continuity store unavailable for DeepSeek provider response receipt');
  try {
    continuity.entityStore.saveProviderReceipt({
      id: `${input.runId}:deepseek-tool-loop:model:${input.segment}`,
      runId: input.runId,
      segment: input.segment,
      provider: input.response.provider,
      receipt: input.response as unknown as JsonObject,
      createdAt: new Date().toISOString(),
    });
  } finally {
    continuity.close();
  }
}

async function persistDeepSeekProductBuilderDraftResponse(runId: RunId, response: ProviderResponseEnvelope, outputReceipt?: JsonObject): Promise<void> {
  if (runningUnderNodeTest()) return;
  const continuity = openSqliteProductBuilderContinuity(defaultRuntimeDatabasePath());
  if (!continuity) throw new Error('SQLite continuity store unavailable for DeepSeek Product Builder draft receipt');
  try {
    continuity.entityStore.saveProviderReceipt({
      id: `${runId}:deepseek-product-builder-draft:model:1`,
      runId,
      segment: 1,
      provider: response.provider,
      receipt: { ...response as unknown as JsonObject, ...(outputReceipt ? { outputReceipt } : {}) },
      createdAt: new Date().toISOString(),
    });
  } finally {
    continuity.close();
  }
}

async function persistFixtureApproval(approval: import('../../../packages/core/src/types.ts').ApprovalRequest): Promise<void> {
  if (runningUnderNodeTest()) return;
  const continuity = openSqliteProductBuilderContinuity(defaultRuntimeDatabasePath());
  if (!continuity) throw new Error('SQLite continuity store unavailable for approval request');
  try {
    continuity.entityStore.saveApprovalRequest(approval);
  } finally {
    continuity.close();
  }
}

/**
 * Re-read approval state immediately before a tool side effect. A cancelled
 * or expired approval is never treated as an old successful decision. The
 * verifier is intentionally fail-closed when an approval reference cannot be
 * found; read-only calls without an approval reference remain unaffected.
 */
export async function verifyToolAuthorization(input: ToolAuthorizationVerificationInput): Promise<ToolAuthorizationDecision> {
  const policyVersion = input.authorization.policyVersion;
  if (!input.authorization.approvalId) return { allowed: true, policyVersion };
  const continuity = openSqliteProductBuilderContinuity(defaultRuntimeDatabasePath());
  if (!continuity) return { allowed: false, policyVersion, reasonCode: 'verifier_failed', message: 'SQLite authorization store unavailable' };
  try {
    const approval = continuity.entityStore.getApproval(String(input.authorization.approvalId));
    if (!approval) return { allowed: false, policyVersion, reasonCode: 'approval_missing', message: 'Tool approval no longer exists' };
    if (String(approval.runId) !== String(input.run.id)) return { allowed: false, policyVersion, reasonCode: 'approval_missing', message: 'Tool approval belongs to another run' };
    if (approval.status === 'cancelled' || approval.status === 'expired' || approval.status === 'rejected') {
      return { allowed: false, policyVersion, reasonCode: 'authorization_revoked', message: `Tool approval is ${approval.status}` };
    }
    if (approval.status !== 'approved') return { allowed: false, policyVersion, reasonCode: 'approval_not_approved', message: 'Tool approval is not currently approved' };
    const metadataVersion = approval.metadata && typeof approval.metadata.policyVersion === 'number' ? approval.metadata.policyVersion : policyVersion;
    if (metadataVersion !== policyVersion) return { allowed: false, policyVersion: metadataVersion, reasonCode: 'policy_changed', message: 'Tool policy changed after approval' };
    return { allowed: true, policyVersion: metadataVersion };
  } finally {
    continuity.close();
  }
}

export async function executeFixtureToolLoop(
  objective: string,
  input: JsonValue = {},
  scenario: 'normal' | 'approval' | 'schema-error' | 'failure' | 'duplicate' | 'max-loop' = 'normal',
  scope?: RuntimeScope,
): Promise<ToolLoopResult> {
  const resolved = resolveRuntimeScope(scope);
  projectWorkspaceRoot(resolved.projectId);
  const created = await runtimeStore.createRun({
    projectId: resolved.projectId,
    botId: resolved.botId,
    request: {
      objective,
      input,
      ...(resolved.sessionId ? { sessionId: resolved.sessionId } : {}),
      metadata: {
        provider: 'fixture-tool-loop',
        scenario,
        ...(resolved.sessionId ? { sessionId: resolved.sessionId } : {}),
        ...(resolved.sessionMessageId ? { sessionMessageId: resolved.sessionMessageId } : {}),
        ...(resolved.skillIds?.length ? { skillIds: resolved.skillIds } : {}),
        ...(resolved.disabledSkillIds?.length ? { disabledSkillIds: resolved.disabledSkillIds } : {}),
      },
    },
  });
  const started = await runtimeStore.transition(created.id, 'start');
  return runToolLoop({
    store: runtimeStore,
    run: started.run,
    provider: new FixtureToolLoopProvider(scenario),
    workspaceRoot: projectWorkspaceRoot(resolved.projectId),
    responseReceiptWriter: persistFixtureResponse,
    approvalWriter: persistFixtureApproval,
    authorizationVerifier: verifyToolAuthorization,
  });
}

/** Run the loop with a deterministic model decision and the real local read-only runtime. */
export async function executeLocalToolLoopRun(objective: string, input: JsonValue = {}, scope?: RuntimeScope): Promise<ToolLoopResult> {
  const resolved = resolveRuntimeScope(scope);
  projectWorkspaceRoot(resolved.projectId);
  const inputObject = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, JsonValue> : {};
  const readPath = typeof inputObject.path === 'string' ? inputObject.path : 'fixtures/demo-project.json';
  const created = await runtimeStore.createRun({
    projectId: resolved.projectId,
    botId: resolved.botId,
    request: { objective, input, metadata: { provider: 'tool-loop-local', executionAgent: 'fixture-tool-loop', toolRuntime: 'local-read-only' } },
  });
  const started = await runtimeStore.transition(created.id, 'start');
  return runToolLoop({
    store: runtimeStore,
    run: started.run,
    provider: new FixtureToolLoopProvider('normal', readPath),
    toolRuntime: new LocalToolRuntime(),
    toolRuntimeMode: 'local',
    toolPolicy: { permissionTier: 'read_only', allowedTools: ['filesystem'], approvalRequiredActions: [] },
    workspaceRoot: projectWorkspaceRoot(resolved.projectId),
    responseReceiptWriter: persistFixtureResponse,
    approvalWriter: persistFixtureApproval,
    authorizationVerifier: verifyToolAuthorization,
  });
}

/** Run the real DeepSeek model through the read-only filesystem Tool Loop. */
export async function executeDeepSeekToolLoopRun(objective: string, input: JsonValue = {}, scope?: RuntimeScope): Promise<ToolLoopResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DeepSeek API key is not configured');
  const resolved = resolveRuntimeScope(scope);
  projectWorkspaceRoot(resolved.projectId);
  const inputObject = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, JsonValue> : {};
  const readPath = typeof inputObject.path === 'string' ? inputObject.path : 'fixtures/demo-project.json';
  const created = await runtimeStore.createRun({
    projectId: resolved.projectId,
    botId: resolved.botId,
    request: { objective, input: { ...inputObject, path: readPath }, metadata: { provider: 'deepseek-tool-loop', model: process.env.DEEPSEEK_MODEL ?? 'deepseek-chat', toolRuntime: 'local-read-only' } },
  });
  const started = await runtimeStore.transition(created.id, 'start');
  return runToolLoop({
    store: runtimeStore,
    run: started.run,
    provider: new DeepSeekToolLoopProvider({ apiKey, baseUrl: process.env.DEEPSEEK_BASE_URL, model: process.env.DEEPSEEK_MODEL }),
    toolRuntime: new LocalToolRuntime(),
    toolRuntimeMode: 'local',
    toolDefinitions: [{
      name: 'filesystem.read',
      description: 'Read one file inside the current project workspace.',
      inputSchema: { type: 'object', required: ['path'], properties: { path: { type: 'string' } }, additionalProperties: false },
      permissionTier: 'read_only',
    }],
    toolPolicy: { permissionTier: 'read_only', allowedTools: ['filesystem'], approvalRequiredActions: [] },
    workspaceRoot: projectWorkspaceRoot(resolved.projectId),
    maxIterations: 3,
    responseReceiptWriter: persistDeepSeekToolLoopResponse,
    approvalWriter: persistFixtureApproval,
    authorizationVerifier: verifyToolAuthorization,
  });
}

export type ProductBuilderDraftRunResult = {
  run: Run;
  events: RunEvent[];
  status: 'succeeded' | 'failed';
  provider: ProviderIdentity;
  draft?: ProductBuilderProviderDraft;
  artifact?: Artifact;
  providerReceipt?: JsonObject;
  outputReceipt?: JsonObject;
  error?: JsonObject;
};

function buildSafeProviderResponseReceipt(response: ProviderResponseEnvelope): JsonObject {
  const outputTextSha256 = response.outputText
    ? createHash('sha256').update(response.outputText).digest('hex')
    : undefined;
  const { outputText: _outputText, ...withoutOutput } = response;
  return {
    ...withoutOutput,
    ...(outputTextSha256 ? {
      providerFields: {
        ...(response.providerFields ?? {}),
        outputTextSha256: `sha256:${outputTextSha256}`,
        outputTextRedacted: true,
      },
    } : {}),
  } as unknown as JsonObject;
}

/**
 * Generate one real Provider Product Builder draft without replacing the
 * deterministic workflow. The draft must parse, validate and remain pending
 * approval before it can be promoted by a later reconcile step.
 */
export async function executeDeepSeekProductBuilderDraft(input: {
  idea: string;
  user?: string;
  constraints?: string[];
  projectId?: ProjectId;
  botId?: BotId;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}): Promise<ProductBuilderDraftRunResult> {
  const apiKey = input.apiKey ?? process.env.DEEPSEEK_API_KEY;
  const model = input.model ?? process.env.DEEPSEEK_MODEL;
  const resolved = resolveRuntimeScope({ projectId: input.projectId, botId: input.botId });
  projectWorkspaceRoot(resolved.projectId);
  const objective = `为 Product Builder 生成可审阅草稿：${input.idea}`;
  const created = await runtimeStore.createRun({
    projectId: resolved.projectId,
    botId: resolved.botId,
    request: {
      objective,
      input: { idea: input.idea, user: input.user ?? null, constraints: input.constraints ?? [] },
      inputRefs: ['workspace://user-input'],
      constraints: [
        '只生成 draft，不得宣称已批准或已发布。',
        '外部事实没有来源时必须放入 unknowns。',
        'source_refs 必须引用 workspace://user-input 或明确的已知来源。',
        'approval_required 必须为 true。',
        ...(input.constraints ?? []),
      ],
      outputSchema: PRODUCT_BUILDER_DRAFT_OUTPUT_SCHEMA,
      metadata: { provider: 'deepseek-product-builder-draft', model: model ?? 'deepseek-chat' },
    },
  });
  const started = await runtimeStore.transition(created.id, 'start');
  const adapter = new DeepSeekApiAdapter({ apiKey, baseUrl: input.baseUrl ?? process.env.DEEPSEEK_BASE_URL, model });
  let provider: ProviderIdentity = (await adapter.probeCapabilities()).identity;
  if (!apiKey) {
    const errorData: JsonObject = { code: 'deepseek_api_key_missing', message: 'DeepSeek API key is not configured for this local server.', retryable: false };
    const failed = await runtimeStore.transition(created.id, 'fail', { reason: String(errorData.message), error: errorData as any });
    return { run: failed.run, events: await runtimeStore.listEvents(created.id), status: 'failed', provider, error: errorData };
  }
  let response: ProviderResponseEnvelope | undefined;
  try {
    const handle = await adapter.startRun(started.run.request);
    provider = handle.provider;
    for await (const event of adapter.streamEvents(handle)) {
      const envelope = (event.data as any)?.envelope as ProviderResponseEnvelope | undefined;
      if (envelope) response = envelope;
      await appendRuntimeEvent(created.id, 'provider.event', event.data as JsonObject, { type: 'provider', provider: event.actor.type === 'provider' ? event.actor.provider : provider.provider });
    }
  } catch (error) {
    const errorData: JsonObject = { code: 'provider_draft_request_failed', message: error instanceof Error ? error.message : String(error), retryable: true };
    const failed = await runtimeStore.transition(created.id, 'fail', { reason: String(errorData.message), error: errorData as any });
    return { run: failed.run, events: await runtimeStore.listEvents(created.id), status: 'failed', provider, error: errorData };
  }
  if (!response) {
    const errorData: JsonObject = { code: 'provider_draft_response_missing', message: 'DeepSeek did not return a model response envelope.', retryable: true };
    const failed = await runtimeStore.transition(created.id, 'fail', { reason: String(errorData.message), error: errorData as any });
    return { run: failed.run, events: await runtimeStore.listEvents(created.id), status: 'failed', provider, error: errorData };
  }
  const outputText = response.outputText ?? '';
  const parsed = parseStructuredJsonObject(outputText);
  const outputReceipt = buildProviderOutputReceipt(outputText, parsed) as unknown as JsonObject;
  const providerReceipt = buildSafeProviderResponseReceipt(response);
  provider = response.provider;
  await persistDeepSeekProductBuilderDraftResponse(created.id, response, outputReceipt);
  if (parsed.status === 'rejected') {
    const errorData: JsonObject = { code: 'provider_draft_structured_output_rejected', message: `Structured draft output rejected: ${parsed.reason}`, retryable: false, outputReceipt };
    await appendRuntimeEvent(created.id, 'provider.event', { phase: 'provider.output-receipt', receipt: outputReceipt }, { type: 'provider', provider: provider.provider });
    const failed = await runtimeStore.transition(created.id, 'fail', { reason: String(errorData.message), error: errorData as any });
    return { run: failed.run, events: await runtimeStore.listEvents(created.id), status: 'failed', provider, providerReceipt, outputReceipt, error: errorData };
  }
  const validation = validateProductBuilderProviderDraft(parsed.value);
  await appendRuntimeEvent(created.id, 'provider.event', { phase: 'provider.output-receipt', receipt: outputReceipt, validation: { valid: validation.valid, errors: validation.errors } }, { type: 'provider', provider: provider.provider });
  if (!validation.valid || !validation.draft) {
    const errorData: JsonObject = { code: 'provider_draft_schema_invalid', message: `Provider draft schema invalid: ${validation.errors.join(',')}`, retryable: false, validation: { valid: false, errors: validation.errors }, outputReceipt };
    const failed = await runtimeStore.transition(created.id, 'fail', { reason: String(errorData.message), error: errorData as any });
    return { run: failed.run, events: await runtimeStore.listEvents(created.id), status: 'failed', provider, providerReceipt, outputReceipt, error: errorData };
  }
  const draft = validation.draft;
  const artifact: Artifact = {
    id: `${created.id}:artifact:provider-product-builder-draft` as Artifact['id'],
    projectId: resolved.projectId,
    runId: created.id,
    kind: 'product_builder_provider_draft',
    name: 'DeepSeek Product Builder Draft',
    contentType: 'application/json',
    content: JSON.stringify(draft),
    sourceRefs: draft.source_refs as Artifact['sourceRefs'],
    createdAt: new Date().toISOString(),
  };
  if (!runningUnderNodeTest()) {
    const continuity = openSqliteProductBuilderContinuity(defaultRuntimeDatabasePath());
    if (!continuity) throw new Error('SQLite continuity store unavailable for Product Builder draft artifact');
    try {
      continuity.entityStore.saveArtifact(artifact);
    } finally {
      continuity.close();
    }
  }
  await appendRuntimeEvent(created.id, 'artifact.created', artifact as unknown as JsonObject, { type: 'bot', botId: resolved.botId });
  const finished = await runtimeStore.transition(created.id, 'succeed', { result: { artifactId: artifact.id, draft: true, approvalRequired: true, provider: { ...provider } } });
  return { run: finished.run, events: await runtimeStore.listEvents(created.id), status: 'succeeded', provider, draft, artifact, providerReceipt, outputReceipt };
}

export async function resumeFixtureToolLoop(
  runId: string,
  options: { scenario?: 'normal' | 'approval' | 'schema-error' | 'failure' | 'duplicate' | 'max-loop'; approvalDecisions?: Record<string, 'approved' | 'rejected'> } = {},
): Promise<ToolLoopResult> {
  let run = await runtimeStore.getRun(runId as RunId);
  if (!run) throw new Error(`Unknown tool loop run: ${runId}`);
  if (run.status === 'failed') run = (await runtimeStore.transition(run.id, 'retry', { reason: 'resume fixture tool loop' })).run;
  if (run.status === 'queued') run = (await runtimeStore.transition(run.id, 'start')).run;
  return runToolLoop({
    store: runtimeStore,
    run,
    provider: new FixtureToolLoopProvider(options.scenario ?? String(run.request.metadata?.scenario ?? 'normal') as any),
    workspaceRoot: projectWorkspaceRoot(run.projectId),
    approvalDecisions: options.approvalDecisions,
    responseReceiptWriter: persistFixtureResponse,
    approvalWriter: persistFixtureApproval,
    authorizationVerifier: verifyToolAuthorization,
  });
}

export async function resumePersistedFixtureToolLoop(runId: string, approvalId: string): Promise<ToolLoopResult> {
  const run = await runtimeStore.getRun(runId as RunId);
  if (!run) throw new Error(`Unknown tool loop run: ${runId}`);
  const continuity = openSqliteProductBuilderContinuity(defaultRuntimeDatabasePath());
  if (!continuity) throw new Error('SQLite continuity store unavailable for fixture tool loop resume');
  let approval: import('../../../packages/core/src/types.ts').ApprovalRequest;
  let callId: string | undefined;
  let scenario: 'normal' | 'approval' | 'schema-error' | 'failure' | 'duplicate' | 'max-loop' = 'approval';
  try {
    const storedApproval = continuity.entityStore.getApproval(approvalId);
    if (!storedApproval) throw new Error(`Unknown approval: ${approvalId}`);
    approval = storedApproval;
    if (String(approval.runId) !== runId) throw new Error(`Approval ${approvalId} does not belong to run ${runId}`);
    callId = typeof approval.metadata?.callId === 'string'
      ? approval.metadata.callId
      : approvalId.split(':approval:')[1];
    if (!callId) throw new Error(`Approval ${approvalId} has no recoverable callId`);
    if (approval.status === 'pending' || run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled') {
      const events = await runtimeStore.listEvents(run.id);
      const status: ToolLoopResult['status'] = run.status === 'succeeded' ? 'succeeded' : run.status === 'failed' || run.status === 'cancelled' ? 'failed' : 'waiting_user';
      return { run, events, status, approval };
    }
    scenario = String(run.request.metadata?.scenario ?? 'approval') as typeof scenario;
  } finally {
    continuity.close();
  }
  return resumeFixtureToolLoop(runId, {
    scenario,
    approvalDecisions: { [callId!]: approval.status === 'approved' ? 'approved' : 'rejected' },
  });
}

/**
 * Run the first controlled ToolRuntime vertical slice. The fixture runtime
 * validates the request and emits auditable tool events, but never touches the
 * filesystem or starts a shell process.
 */
export async function executeFixtureToolRun(objective: string, input: JsonValue = {}, scope?: RuntimeScope) {
  const resolved = resolveRuntimeScope(scope);
  projectWorkspaceRoot(resolved.projectId);
  const created = await runtimeStore.createRun({
    projectId: resolved.projectId,
    botId: resolved.botId,
    request: { objective, input, metadata: { provider: 'tool-fixture', executionAgent: 'fixture-tool-runtime' } },
  });
  const started = await runtimeStore.transition(created.id, 'start');
  const inputObject = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, JsonValue> : {};
  const toolRuntime = new FixtureToolRuntime();
  const result = await toolRuntime.execute({
    requestId: `tool-request:${created.id}`,
    runId: String(created.id),
    mode: 'fixture',
    tool: 'filesystem',
    operation: 'read',
    workspaceRoot: projectWorkspaceRoot(resolved.projectId),
    path: typeof inputObject.path === 'string' ? inputObject.path : 'fixtures/demo-project.json',
    policy: { permissionTier: 'read_only', allowedTools: ['filesystem'], approvalRequiredActions: [] },
  });
  const invoked = await appendRuntimeEvent(created.id, 'tool.invoked', result.invoked, { type: 'bot', botId: resolved.botId });
  const completionType = result.failed ? 'tool.failed' : 'tool.completed';
  const completionData = result.failed ?? result.completed!;
  const completion = await appendRuntimeEvent(created.id, completionType, completionData, { type: 'bot', botId: resolved.botId });
  if (result.failed) {
    const failed = await runtimeStore.transition(created.id, 'fail', {
      reason: String(result.failed.message ?? 'ToolRuntime failed'),
      error: { code: String(result.receipt.errorCode ?? 'tool_runtime_failed'), message: String(result.failed.message ?? 'ToolRuntime failed'), retryable: false },
    });
    return { run: failed.run, startEvent: started.event, toolEvents: [invoked, completion], receipt: result.receipt, output: result.output };
  }
  const finished = await runtimeStore.transition(created.id, 'succeed', {
    result: { provider: 'tool-fixture', receiptId: result.receipt.requestId, eventCount: 5, output: result.output ?? null },
  });
  return { run: finished.run, startEvent: started.event, toolEvents: [invoked, completion], receipt: result.receipt, output: result.output };
}

/** Execute one real, read-only filesystem operation inside the current project. */
export async function executeLocalFileReadRun(objective: string, input: JsonValue = {}, scope?: RuntimeScope) {
  const resolved = resolveRuntimeScope(scope);
  projectWorkspaceRoot(resolved.projectId);
  const created = await runtimeStore.createRun({
    projectId: resolved.projectId,
    botId: resolved.botId,
    request: { objective, input, metadata: { provider: 'tool-local', executionAgent: 'local-tool-runtime' } },
  });
  const started = await runtimeStore.transition(created.id, 'start');
  const inputObject = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, JsonValue> : {};
  const toolRuntime = new LocalToolRuntime();
  const result = await toolRuntime.execute({
    requestId: `tool-request:${created.id}`,
    runId: String(created.id),
    mode: 'local',
    tool: 'filesystem',
    operation: 'read',
    workspaceRoot: projectWorkspaceRoot(resolved.projectId),
    path: typeof inputObject.path === 'string' ? inputObject.path : 'fixtures/demo-project.json',
    maxBytes: typeof inputObject.maxBytes === 'number' ? inputObject.maxBytes : 64_000,
    policy: { permissionTier: 'read_only', allowedTools: ['filesystem'], approvalRequiredActions: [] },
  });
  const invoked = await appendRuntimeEvent(created.id, 'tool.invoked', result.invoked, { type: 'bot', botId: resolved.botId });
  const completionType = result.failed ? 'tool.failed' : 'tool.completed';
  const completionData = result.failed ?? result.completed!;
  const completion = await appendRuntimeEvent(created.id, completionType, completionData, { type: 'bot', botId: resolved.botId });
  if (result.failed) {
    const failed = await runtimeStore.transition(created.id, 'fail', {
      reason: String(result.failed.message ?? 'Local ToolRuntime failed'),
      error: { code: String(result.receipt.errorCode ?? 'tool_runtime_failed'), message: String(result.failed.message ?? 'Local ToolRuntime failed'), retryable: false },
    });
    return { run: failed.run, startEvent: started.event, toolEvents: [invoked, completion], receipt: result.receipt, output: result.output };
  }
  const finished = await runtimeStore.transition(created.id, 'succeed', {
    result: { provider: 'tool-local', receiptId: result.receipt.requestId, eventCount: 5, output: result.output ?? null },
  });
  return { run: finished.run, startEvent: started.event, toolEvents: [invoked, completion], receipt: result.receipt, output: result.output };
}

/** Execute one of the explicitly allowlisted read-only Git commands. */
async function executeLocalGitRun(objective: string, argv: string[], provider: 'tool-git' | 'tool-git-diff', scope?: RuntimeScope) {
  const resolved = resolveRuntimeScope(scope);
  projectWorkspaceRoot(resolved.projectId);
  const created = await runtimeStore.createRun({
    projectId: resolved.projectId,
    botId: resolved.botId,
    request: { objective, input: { argv }, metadata: { provider, executionAgent: 'local-tool-runtime' } },
  });
  const started = await runtimeStore.transition(created.id, 'start');
  const toolRuntime = new LocalToolRuntime();
  const result = await toolRuntime.execute({
    requestId: `tool-request:${created.id}`,
    runId: String(created.id),
    mode: 'local',
    tool: 'shell',
    operation: 'shell',
    workspaceRoot: projectWorkspaceRoot(resolved.projectId),
    argv,
    timeoutMs: 10_000,
    policy: { permissionTier: 'read_only', allowedTools: ['shell'], allowedCommands: [argv.join(' ')], approvalRequiredActions: [] },
  });
  const invoked = await appendRuntimeEvent(created.id, 'tool.invoked', result.invoked, { type: 'bot', botId: resolved.botId });
  const completionType = result.failed ? 'tool.failed' : 'tool.completed';
  const completionData = result.failed ?? result.completed!;
  const completion = await appendRuntimeEvent(created.id, completionType, completionData, { type: 'bot', botId: resolved.botId });
  if (result.failed) {
    const failed = await runtimeStore.transition(created.id, 'fail', {
      reason: String(result.failed.message ?? 'Local Git ToolRuntime failed'),
      error: { code: String(result.receipt.errorCode ?? 'tool_runtime_failed'), message: String(result.failed.message ?? 'Local Git ToolRuntime failed'), retryable: result.receipt.errorCode === 'tool_timeout' },
    });
    return { run: failed.run, startEvent: started.event, toolEvents: [invoked, completion], receipt: result.receipt, output: result.output };
  }
  const finished = await runtimeStore.transition(created.id, 'succeed', {
    result: { provider, receiptId: result.receipt.requestId, eventCount: 5, output: result.output ?? null },
  });
  return { run: finished.run, startEvent: started.event, toolEvents: [invoked, completion], receipt: result.receipt, output: result.output };
}

export async function executeLocalGitStatusRun(objective: string, scope?: RuntimeScope) {
  return executeLocalGitRun(objective, ['git', 'status', '--short'], 'tool-git', scope);
}

export async function executeLocalGitDiffStatRun(objective: string, scope?: RuntimeScope) {
  return executeLocalGitRun(objective, ['git', 'diff', '--stat'], 'tool-git-diff', scope);
}

/**
 * Execute one Codex CLI run while keeping the project's Run/Event store as the
 * source of truth. The adapter only supplies provider events; state transitions
 * remain owned by the control plane.
 */
export async function executeCodexRun(objective: string, input: JsonValue = {}, options: CodexExecutionOptions = {}, scope?: RuntimeScope) {
  const resolved = resolveRuntimeScope(scope);
  projectWorkspaceRoot(resolved.projectId);
  const created = await runtimeStore.createRun({
    projectId: resolved.projectId,
    botId: resolved.botId,
    request: {
      objective,
      input,
      ...(resolved.sessionId ? { sessionId: resolved.sessionId } : {}),
      ...(options.constraints?.length ? { constraints: [...options.constraints] } : {}),
      ...(options.outputMode ? { outputMode: options.outputMode } : {}),
      ...(options.outputSchema ? { outputSchema: options.outputSchema } : {}),
      ...(options.outputMode === 'structured' ? { constraints: ['只返回一个 JSON 对象，不要在 JSON 前后添加说明文字。'] } : {}),
      metadata: {
        provider: 'openai-codex',
        executionAgent: 'codex-cli',
        ...(resolved.sessionMessageId ? { sessionMessageId: resolved.sessionMessageId } : {}),
      },
    },
  });
  const started = await runtimeStore.transition(created.id, 'start');
  const maxSegments = Math.max(1, Math.floor(options.maxSegments ?? 1));
  const ownsContextSnapshotStore = !options.contextSnapshotStore;
  const snapshotStore = options.contextSnapshotStore ?? defaultContextSnapshotStore();
  const contextPolicy = options.contextPolicy ?? defaultContextPolicy;
  const adapterFactory = options.adapterFactory ?? (() => new CodexExternalAdapter(process.env.CODEX_BIN ?? 'codex', {
    ...(options.model ? { model: options.model } : {}),
    ...(options.cwd ? { cwd: options.cwd } : {}),
  }));
  const active: ActiveCodexRun = { adapter: adapterFactory(1), cancellationRequested: false };
  activeCodexRuns.set(created.id, active);
  let handle: RunHandle | undefined;
  const providerEvents: RunEvent[] = [];
  let packet: ContextPacket | undefined;
  let lastProvider: RunHandle['provider'] | undefined;
  try {
    for (let segment = 1; segment <= maxSegments; segment += 1) {
      const adapter = segment === 1 ? active.adapter : adapterFactory(segment, packet);
      active.adapter = adapter;
      await appendRuntimeEvent(created.id, 'run.segment_started', {
        segment,
        contextSnapshotId: packet?.snapshot.id ?? null,
        provider: 'execution-adapter',
      });
      try {
        handle = await adapter.startRun({
          objective,
          input,
          ...(options.constraints?.length ? { constraints: [...options.constraints] } : {}),
          ...(options.outputMode ? { outputMode: options.outputMode } : {}),
          ...(options.outputSchema ? { outputSchema: options.outputSchema } : {}),
          ...(options.outputMode === 'structured' ? { constraints: ['只返回一个 JSON 对象，不要在 JSON 前后添加说明文字。'] } : {}),
          metadata: {
            runId: created.id,
            provider: 'openai-codex',
            segment,
            contextSnapshot: packet?.snapshot ?? null,
            contextTailEventIds: packet?.tailEvents.map((event) => String(event.id)) ?? [],
          } as JsonObject,
          ...(packet ? { context: packet } : {}),
        });
        lastProvider = handle.provider;
        active.handle = handle;
        if (active.cancellationRequested) {
          const receiptId = persistCodexReceipt(created.id, segment, handle.provider, [], 'cancelled');
          const events = await runtimeStore.listEvents(created.id);
          return { run: (await runtimeStore.getRun(created.id))!, startEvent: started.event, providerEvents, finalEvent: events.find((item) => item.type === 'run.cancelled'), provider: handle.provider, receiptId };
        }
        let completed = false;
        const segmentProviderEvents: RunEvent[] = [];
        for await (const providerEvent of adapter.streamEvents(handle)) {
          const stored = await appendRuntimeEvent(created.id, 'provider.event', providerEvent.data, providerEvent.actor, `segment:${segment}`);
          providerEvents.push(stored);
          segmentProviderEvents.push(stored);
          completed ||= providerEvent.data.status === 'completed';
        }
        const modelSegment = normalizeCodexExecutionSegment({
          requestId: `${created.id}:codex:${segment}`,
          provider: handle.provider,
          events: segmentProviderEvents.map((item) => item.data),
          bridgeCompleted: completed,
        });
        await appendRuntimeEvent(created.id, 'provider.event', {
          phase: 'model.response',
          segment,
          envelope: modelSegment.response as unknown as JsonObject,
          parseStatus: modelSegment.parseStatus,
        }, { type: 'provider', provider: handle.provider.provider });
        const modelReceiptId = persistCodexModelReceipt(created.id, segment, modelSegment.response);
        const segmentCompleted = modelSegment.completed;
        const outputValidation = options.outputMode === 'structured'
          ? !options.outputSchema
            ? { valid: false, errors: ['output_schema_required'] }
            : modelSegment.parseStatus !== 'structured'
              ? { valid: false, errors: [`parse_status:${modelSegment.parseStatus}`] }
              : validateStructuredOutput(modelSegment.response.structuredOutput, options.outputSchema)
          : { valid: true, errors: [] };
        if (options.outputMode === 'structured') {
          await appendRuntimeEvent(created.id, 'provider.event', {
            phase: 'provider.output-validation',
            mode: options.outputMode,
            valid: outputValidation.valid,
            errors: outputValidation.errors,
            normalizationMode: (modelSegment.response.providerFields as any)?.normalizationMode ?? null,
          }, { type: 'provider', provider: handle.provider.provider });
        }
        const current = await runtimeStore.getRun(created.id);
        if (active.cancellationRequested || current?.status === 'cancelled') {
          const receiptId = persistCodexReceipt(created.id, segment, handle.provider, segmentProviderEvents, 'cancelled');
          const events = await runtimeStore.listEvents(created.id);
          return { run: current!, startEvent: started.event, providerEvents, finalEvent: [...events].reverse().find((item) => item.type === 'run.cancelled') ?? events.at(-1), provider: handle.provider, receiptId, modelReceiptId };
        }
        if (segmentCompleted) {
          if (!outputValidation.valid) {
            const receiptId = persistCodexReceipt(created.id, segment, handle.provider, segmentProviderEvents, 'failed', { reason: 'provider_output_schema_invalid', errors: outputValidation.errors, modelReceiptId: modelReceiptId ?? null });
            await appendRuntimeEvent(created.id, 'run.segment_completed', { segment, status: 'failed', code: 'provider_output_schema_invalid', ...(receiptId ? { receiptId } : {}) });
            const final = await runtimeStore.transition(created.id, 'fail', { reason: 'Structured output did not satisfy the requested contract', error: { code: 'provider_output_schema_invalid', message: outputValidation.errors.join(', '), retryable: false } });
            return { run: final.run, startEvent: started.event, providerEvents, finalEvent: final.event, provider: handle.provider, receiptId, modelReceiptId };
          }
          const receiptId = persistCodexReceipt(created.id, segment, handle.provider, segmentProviderEvents, 'succeeded', { modelReceiptId: modelReceiptId ?? null });
          await appendRuntimeEvent(created.id, 'run.segment_completed', { segment, status: 'succeeded', contextSnapshotId: packet?.snapshot.id ?? null });
          const providerSummary: JsonObject = {
            harness: handle.provider.harness,
            provider: handle.provider.provider,
            model: handle.provider.model,
            authMode: handle.provider.authMode,
            billingSource: handle.provider.billingSource,
            isMock: handle.provider.isMock,
            ...(receiptId ? { receiptId } : {}),
          };
          const final = await runtimeStore.transition(created.id, 'succeed', { result: { provider: providerSummary, eventCount: providerEvents.length, segmentCount: segment, modelReceiptId: modelReceiptId ?? null } });
          return { run: final.run, startEvent: started.event, providerEvents, finalEvent: final.event, provider: handle.provider, receiptId, modelReceiptId };
        }
        const incompleteReceiptId = persistCodexReceipt(created.id, segment, handle.provider, segmentProviderEvents, 'failed', { reason: 'provider_incomplete' });
        await appendRuntimeEvent(created.id, 'run.segment_completed', { segment, status: 'failed', code: 'provider_incomplete', ...(incompleteReceiptId ? { receiptId: incompleteReceiptId } : {}) });
        if (segment < maxSegments) {
          const events = await runtimeStore.listEvents(created.id);
          const recovery = await createRecoverySnapshot((await runtimeStore.getRun(created.id))!, events, snapshotStore, contextPolicy, 'provider_limit');
          packet = recovery.packet;
          await appendRuntimeEvent(created.id, 'context.snapshot_created', { snapshotId: recovery.snapshot.id, contentSha256: recovery.snapshot.contentSha256, covers: recovery.snapshot.covers });
          await appendRuntimeEvent(created.id, 'run.resume_requested', { fromSegment: segment, toSegment: segment + 1, snapshotId: recovery.snapshot.id });
          continue;
        }
        const receiptId = persistCodexReceipt(created.id, segment, handle.provider, segmentProviderEvents, 'failed', { reason: 'provider_incomplete', modelReceiptId: modelReceiptId ?? null });
        const final = await runtimeStore.transition(created.id, 'fail', { reason: 'Codex execution did not complete', error: { code: 'provider_incomplete', message: 'Codex CLI did not emit a completed event.', retryable: true } });
        return { run: final.run, startEvent: started.event, providerEvents, finalEvent: final.event, provider: handle.provider, receiptId, modelReceiptId };
      } catch (error) {
        const current = await runtimeStore.getRun(created.id);
        if (active.cancellationRequested || current?.status === 'cancelled') {
          const provider = handle?.provider ?? (await adapter.probeCapabilities()).identity;
          const receiptId = persistCodexReceipt(created.id, segment, provider, providerEvents, 'cancelled');
          const events = await runtimeStore.listEvents(created.id);
          return { run: current!, startEvent: started.event, providerEvents, finalEvent: [...events].reverse().find((item) => item.type === 'run.cancelled') ?? events.at(-1), provider, receiptId };
        }
        const provider = handle?.provider ?? (await adapter.probeCapabilities()).identity;
        const receiptId = persistCodexReceipt(created.id, segment, provider, providerEvents, 'failed', { reason: error instanceof Error ? error.message : String(error) });
        await appendRuntimeEvent(created.id, 'run.segment_completed', { segment, status: 'failed', code: 'provider_error', message: error instanceof Error ? error.message : String(error) });
        if (segment < maxSegments) {
          const events = await runtimeStore.listEvents(created.id);
          const recovery = await createRecoverySnapshot((await runtimeStore.getRun(created.id))!, events, snapshotStore, contextPolicy, 'interrupt');
          packet = recovery.packet;
          await appendRuntimeEvent(created.id, 'context.snapshot_created', { snapshotId: recovery.snapshot.id, contentSha256: recovery.snapshot.contentSha256, covers: recovery.snapshot.covers });
          await appendRuntimeEvent(created.id, 'run.resume_requested', { fromSegment: segment, toSegment: segment + 1, snapshotId: recovery.snapshot.id });
          continue;
        }
        const final = await runtimeStore.transition(created.id, 'fail', { reason: 'Codex execution failed', error: { code: 'provider_error', message: error instanceof Error ? error.message : String(error), retryable: true } });
        return { run: final.run, startEvent: started.event, providerEvents, finalEvent: final.event, provider, receiptId };
      }
    }
    throw new Error('Execution loop ended without a terminal result');
  } catch (error) {
    const current = await runtimeStore.getRun(created.id);
    if (active.cancellationRequested || current?.status === 'cancelled') {
      const events = await runtimeStore.listEvents(created.id);
      return { run: current!, startEvent: started.event, providerEvents, finalEvent: [...events].reverse().find((item) => item.type === 'run.cancelled') ?? events.at(-1), provider: handle?.provider ?? (await active.adapter.probeCapabilities()).identity };
    }
    const final = await runtimeStore.transition(created.id, 'fail', { reason: 'Codex execution failed', error: { code: 'provider_error', message: error instanceof Error ? error.message : String(error), retryable: true } });
    return { run: final.run, startEvent: started.event, providerEvents, finalEvent: final.event, provider: handle?.provider ?? lastProvider };
  } finally {
    activeCodexRuns.delete(created.id);
    if (ownsContextSnapshotStore) snapshotStore.close?.();
  }
}

/** Cancel the provider process and then record the domain transition. */
export async function cancelCodexRun(runId: string) {
  const current = await runtimeStore.getRun(runId as RunId);
  if (!current) return undefined;
  if (current.status === 'cancelled') return { run: current, status: 'cancelled' as const, alreadyCancelled: true };
  if (current.status !== 'queued' && current.status !== 'running' && current.status !== 'waiting_user') {
    return { run: current, status: current.status };
  }
  const active = activeCodexRuns.get(runId as RunId);
  if (active) {
    active.cancellationRequested = true;
    if (active.handle) await active.adapter.cancel(active.handle);
  }
  const cancelled = await runtimeStore.transition(runId as RunId, 'cancel', {
    actor: { type: 'user' },
    reason: '用户取消运行',
    idempotencyKey: `cancel:${runId}`,
  });
  return { run: cancelled.run, status: 'cancelled' as const, event: cancelled.event };
}

export async function snapshot() {
  const run = await ensureSeeded();
  const events = await runtimeStore.listEvents(run.id);
  return { run, events };
}

export const demoProject = {
  id: projectId,
  name: 'AI Product Builder Demo',
  description: '用结构化 Bot 交接把一个产品想法推进为可执行方案。',
  status: 'active',
};
