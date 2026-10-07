/**
 * Stable domain contracts for the local Agent Workspace.
 *
 * This package intentionally contains no provider, database, UI, or framework
 * imports.  The server and adapters can depend on these contracts while the
 * domain remains deterministic and easy to test in isolation.
 */

export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type ProjectId = Brand<string, "ProjectId">;
export type BotId = Brand<string, "BotId">;
export type SkillId = Brand<string, "SkillId">;
export type RunId = Brand<string, "RunId">;
export type RunEventId = Brand<string, "RunEventId">;
export type HandoffId = Brand<string, "HandoffId">;
export type ApprovalRequestId = Brand<string, "ApprovalRequestId">;
export type ArtifactId = Brand<string, "ArtifactId">;
export type SourceId = Brand<string, "SourceId">;
export type MemoryItemId = Brand<string, "MemoryItemId">;
export type ContextSnapshotId = Brand<string, "ContextSnapshotId">;
export type ProviderConnectionId = Brand<string, "ProviderConnectionId">;
export type ModelProfileId = Brand<string, "ModelProfileId">;
export type ProjectProviderBindingId = Brand<string, "ProjectProviderBindingId">;
export type SessionId = Brand<string, "SessionId">;
export type MessageId = Brand<string, "MessageId">;
export type ExecutionPlanId = Brand<string, "ExecutionPlanId">;
export type ExecutionPlanStepId = Brand<string, "ExecutionPlanStepId">;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ProviderOutputNormalizationMode = "exact" | "fenced" | "embedded";
export type ProviderOutputRejectionReason = "empty" | "invalid_json" | "multiple_objects";
export type ProviderOutputReceiptStatus = "parsed" | "rejected";
/** Whether a Run result is intended for a person or for a machine handoff. */
export type OutputContractMode = "text" | "structured";

/** Versioned metadata stored inside a ProviderReceipt without losing raw output. */
export interface ProviderOutputReceipt {
  schemaVersion: "provider.output-receipt.v1";
  status: ProviderOutputReceiptStatus;
  mode?: ProviderOutputNormalizationMode;
  rejectionReason?: ProviderOutputRejectionReason;
  rawOutputSha256: string;
  extractedOutputSha256?: string;
}

export type PermissionTier = "read_only" | "workspace_write" | "full_access";
export type AuthMode = "api_key" | "subscription" | "cli" | "local" | "unknown";
export type BillingSource = "api" | "subscription" | "local" | "unknown";

export type RunStatus =
  | "queued"
  | "running"
  | "waiting_user"
  | "succeeded"
  | "failed"
  | "cancelled";

export type RunAction =
  | "start"
  | "wait_user"
  | "resume"
  | "succeed"
  | "fail"
  | "cancel"
  | "retry";

export type RunEventType =
  | "run.created"
  | "run.started"
  | "run.waiting_user"
  | "run.resumed"
  | "run.succeeded"
  | "run.failed"
  | "run.cancelled"
  | "run.retry_requested"
  | "provider.event"
  | "tool.invoked"
  | "tool.completed"
  | "tool.failed"
  | "tool.authorization_revoked"
  | "approval.requested"
  | "approval.resolved"
  | "bot.policy.updated"
  | "handoff.created"
  | "handoff.completed"
  | "handoff.failed"
  | "plan.created"
  | "plan.started"
  | "plan.waiting_user"
  | "plan.resumed"
  | "plan.step_started"
  | "plan.step_completed"
  | "plan.step_blocked"
  | "plan.succeeded"
  | "plan.failed"
  | "plan.cancelled"
  | "plan.answer_created"
  | "artifact.created"
  | "product_builder.state_checkpoint"
  | "context.compaction_started"
  | "context.snapshot_created"
  | "context.compaction_failed"
  | "run.segment_started"
  | "run.segment_completed"
  | "run.resume_requested"
  | "run.resume_failed"
  | "improvement.run_started"
  | "improvement.proposal_created"
  | "improvement.evaluation_completed"
  | "improvement.approval_requested"
  | "improvement.published"
  | "improvement.rolled_back"
  | "improvement.failed";

export type EventActor =
  | { type: "system" }
  | { type: "user"; userId?: string }
  | { type: "bot"; botId: BotId }
  | { type: "provider"; provider: string };

export interface Project {
  id: ProjectId;
  name: string;
  description?: string;
  workspacePath: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface Skill {
  id: SkillId;
  name: string;
  description: string;
  version: string;
  instructions: string;
  inputSchema?: JsonObject;
  outputSchema?: JsonObject;
  enabled: boolean;
}

export interface ToolPolicy {
  permissionTier: PermissionTier;
  allowedTools: string[];
  allowedCommands?: string[];
  allowedPaths?: string[];
  /** Monotonic control-plane revision. A stale tool call must be rechecked. */
  policyVersion?: number;
  /** Actions that always require a one-off user approval. */
  approvalRequiredActions: string[];
}

export interface ProviderPolicy {
  providerPreference?: string[];
  model?: string;
  fallbackEnabled: boolean;
  maxCostCents?: number;
  maxDurationMs?: number;
}

export interface MemoryPolicy {
  readScopes: string[];
  writeScopes: string[];
  requireUserApprovalForWrites: boolean;
}

export interface ApprovalPolicy {
  approvalRequiredActions: string[];
  autoApproveReadOnly: boolean;
}

export interface BotProfile {
  id: BotId;
  projectId: ProjectId;
  name: string;
  description: string;
  responsibility: string;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  skillIds: SkillId[];
  toolPolicy: ToolPolicy;
  providerPolicy: ProviderPolicy;
  memoryPolicy: MemoryPolicy;
  approvalPolicy: ApprovalPolicy;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  disabledAt?: string;
}

export interface RunRequest {
  objective: string;
  input: JsonValue;
  /** Session that owns this execution; required for session-driven runs. */
  sessionId?: SessionId;
  inputRefs?: string[];
  constraints?: string[];
  outputSchema?: JsonObject;
  /** Structured mode is opt-in; human-facing runs remain natural language. */
  outputMode?: OutputContractMode;
  /** Optional bounded retry policy. The runtime applies a hard safety cap. */
  retryPolicy?: RetryPolicy;
  /** Verified local recovery context; adapters must explicitly inject it into their request. */
  context?: ContextPacket;
  metadata?: JsonObject;
}

export interface RetryPolicy {
  /** Number of additional attempts allowed after the initial attempt. */
  maxRetries: number;
}

export interface Run {
  id: RunId;
  projectId: ProjectId;
  botId: BotId;
  request: RunRequest;
  status: RunStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  waitingReason?: string;
  result?: JsonValue;
  error?: RunError;
}

export type RunSegmentStatus = "queued" | "running" | "succeeded" | "failed";

export interface RunSegment {
  id: string;
  runId: RunId;
  sequence: number;
  status: RunSegmentStatus;
  provider: ProviderIdentity;
  contextSnapshotId?: ContextSnapshotId;
  startedAt: string;
  completedAt?: string;
  failureCode?: string;
}

export interface RunError {
  code: string;
  message: string;
  retryable: boolean;
  details?: JsonObject;
}

export interface RunEvent {
  id: RunEventId;
  runId: RunId;
  sequence: number;
  type: RunEventType;
  occurredAt: string;
  actor: EventActor;
  data: JsonObject;
  correlationId?: string;
}

export interface RunTransitionOptions {
  now?: string;
  actor?: EventActor;
  reason?: string;
  result?: JsonValue;
  error?: RunError;
  correlationId?: string;
  /** Replaying the same key must return the original transition without a second event. */
  idempotencyKey?: string;
  /** Explicit audit metadata for a bounded retry attempt. */
  retry?: RetryAttemptMetadata;
}

export type RetryMode = "manual" | "automatic";
export type RetryReasonClass = "manual" | "provider_transient" | "provider_limit" | "tool_transient" | "unknown";

export interface RetryAttemptMetadata {
  attempt: number;
  maxRetries: number;
  mode: RetryMode;
  reasonClass: RetryReasonClass;
  previousFailureCode?: string;
}

export interface RunTransitionResult {
  run: Run;
  event: RunEvent;
}

export interface ProviderIdentity {
  harness: string;
  provider: string;
  model: string;
  authMode: AuthMode;
  billingSource: BillingSource;
  isMock: boolean;
}

export type ProviderConnectionProvider = "codex" | "deepseek" | "fixture";
export type ProviderConnectionHarness = "codex-cli" | "deepseek-api" | "fixture";
export type ProviderConnectionStatus = "unconfigured" | "available" | "blocked" | "error";

/** Persisted provider metadata. Secret values never belong in this contract. */
export interface ProviderConnection {
  id: ProviderConnectionId;
  label: string;
  provider: ProviderConnectionProvider;
  harness: ProviderConnectionHarness;
  authMode: AuthMode;
  billingSource: BillingSource;
  secretRef?: { kind: "env"; name: string } | { kind: "cli"; profile: string };
  status: ProviderConnectionStatus;
  capabilities?: JsonObject;
  lastProbeAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ModelProfile {
  id: ModelProfileId;
  connectionId: ProviderConnectionId;
  model: string;
  label: string;
  capabilities?: JsonObject;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type ProviderBindingRole = "primary" | "fallback";
export type ProviderFallbackPolicy = "never" | "on_retryable_failure";

export interface ProjectProviderBinding {
  id: ProjectProviderBindingId;
  projectId: ProjectId;
  connectionId: ProviderConnectionId;
  model: string;
  role: ProviderBindingRole;
  /** Ordering within a project/provider role; primary is normally 0. */
  priority: number;
  enabled: boolean;
  fallbackPolicy: ProviderFallbackPolicy;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type SessionStatus = "active" | "archived";
export type SessionMessageRole = "user" | "assistant" | "system" | "tool";

export interface Session {
  id: SessionId;
  projectId: ProjectId;
  botId: BotId;
  title: string;
  status: SessionStatus;
  contextSnapshotId?: ContextSnapshotId;
  createdAt: string;
  updatedAt: string;
}

export interface SessionMessage {
  id: MessageId;
  sessionId: SessionId;
  sequence: number;
  role: SessionMessageRole;
  content: string;
  runId?: RunId;
  provider?: ProviderIdentity;
  createdAt: string;
}

export interface ProviderCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  /** Concrete structured-output modes the adapter has actually implemented. */
  structuredOutputModes?: Array<"json_object" | "json_schema">;
  /** Prompt caching is optional and provider-reported; unknown is different from unsupported. */
  promptCaching?: "unsupported" | "unknown" | "reported";
  cancellation: boolean;
  resume: boolean;
  reasoningContentPassthrough?: boolean;
  identity: ProviderIdentity;
}

export interface ProviderRunRequest {
  run: Run;
  identity?: ProviderIdentity;
}

export interface RunHandle {
  id: string;
  provider: ProviderIdentity;
}

/** Provider adapters implement execution; they do not own domain state. */
export interface ProviderAdapter {
  probeCapabilities(): Promise<ProviderCapabilities>;
  startRun(request: RunRequest): Promise<RunHandle>;
  streamEvents(handle: RunHandle): AsyncIterable<RunEvent>;
  cancel(handle: RunHandle): Promise<void>;
  resume(handle: RunHandle): Promise<void>;
}

/**
 * Provider-neutral message and tool contracts.
 *
 * These types are the seam between the control plane and a model/API adapter.
 * They are intentionally additive: the current Run-based adapters are still
 * the production path until each adapter consumes this envelope.
 */
export type ProviderMessageRole = "system" | "developer" | "user" | "assistant" | "tool";

export interface ProviderMessage {
  role: ProviderMessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  /** Assistant tool proposals are kept separate from the textual content. */
  toolCalls?: ToolCallEnvelope[];
  /** Provider-specific replay fields (for example DeepSeek reasoning_content). */
  providerFields?: JsonObject;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonObject;
  permissionTier: PermissionTier;
}

export type ToolCallStatus = "requested" | "approved" | "running" | "succeeded" | "failed" | "denied";

export interface ToolCallEnvelope {
  callId: string;
  name: string;
  arguments: JsonObject;
  status: ToolCallStatus;
  approvalRequestId?: ApprovalRequestId;
  resultRef?: string;
  errorCode?: string;
}

export interface UsageSummary {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  estimatedCostCents?: number;
  source: "provider" | "estimated" | "unknown";
}

export type PromptCacheMode = "disabled" | "opportunistic" | "required";

export interface PromptCachePolicy {
  mode: PromptCacheMode;
  /** Hash of the stable prefix only; never store the prompt text in this receipt. */
  stablePrefixSha256?: string;
  maxAgeMs?: number;
}

export type PromptCacheStatus = "not_requested" | "unknown" | "unsupported" | "miss" | "hit" | "written";

export interface PromptCacheReceipt {
  schemaVersion: "provider.prompt-cache-receipt.v1";
  status: PromptCacheStatus;
  providerReported: boolean;
  stablePrefixSha256?: string;
  cachedInputTokens?: number;
}

export interface ModelRequestEnvelope {
  schemaVersion: "provider.model-request.v1";
  requestId: string;
  runId: RunId;
  objective: string;
  messages: ProviderMessage[];
  input?: JsonValue;
  inputRefs?: string[];
  constraints?: string[];
  outputSchema?: JsonObject;
  tools: ToolDefinition[];
  context?: ContextPacket;
  cachePolicy: PromptCachePolicy;
  metadata?: JsonObject;
}

export interface ProviderResponseEnvelope {
  schemaVersion: "provider.model-response.v1";
  requestId: string;
  provider: ProviderIdentity;
  /** Stable hash reference for the raw provider payload; raw text is not stored here. */
  rawResponseRef?: string;
  outputText?: string;
  structuredOutput?: JsonValue;
  toolCalls: ToolCallEnvelope[];
  usage: UsageSummary;
  promptCache: PromptCacheReceipt;
  finishReason?: string;
  error?: RunError;
  /** Provider-specific fields are preserved for audit, not interpreted by the control plane. */
  providerFields?: JsonObject;
}

export type HandoffStatus = "queued" | "running" | "succeeded" | "failed";

export interface HandoffEnvelope {
  id: HandoffId;
  fromBotId: BotId;
  toBotId: BotId;
  objective: string;
  inputRefs: string[];
  outputSchema: string;
  constraints: string[];
  approvalRequired: boolean;
  status: HandoffStatus;
  depth: number;
  parentHandoffId?: HandoffId;
  createdAt: string;
  updatedAt: string;
  resultRefs?: string[];
  error?: RunError;
}

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "cancelled";

export type ToolAuthorizationStatus = "not_required" | "approved" | "revoked" | "expired" | "cancelled";

export interface ToolAuthorizationSnapshot {
  policyVersion: number;
  status: ToolAuthorizationStatus;
  approvalId?: ApprovalRequestId;
}

export interface ApprovalRequest {
  id: ApprovalRequestId;
  projectId: ProjectId;
  runId: RunId;
  action: string;
  description: string;
  permissionTier: PermissionTier;
  status: ApprovalStatus;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  decisionReason?: string;
  metadata?: JsonObject;
}

export interface Source {
  id: SourceId;
  projectId: ProjectId;
  uri: string;
  title?: string;
  excerpt?: string;
  retrievedAt: string;
  metadata?: JsonObject;
}

export interface Artifact {
  id: ArtifactId;
  projectId: ProjectId;
  runId: RunId;
  kind: string;
  name: string;
  contentType: string;
  content: string;
  sourceRefs: SourceId[];
  createdAt: string;
}

export interface MemoryItem {
  id: MemoryItemId;
  projectId: ProjectId;
  scope: string;
  content: string;
  sourceRefs: SourceId[];
  createdAt: string;
  updatedAt: string;
}

export type ContextTrigger =
  | "threshold"
  | "handoff"
  | "approval"
  | "interrupt"
  | "provider_limit"
  | "manual";

export type ContextPriority = "critical" | "important" | "normal";

export interface ContextFact {
  id: string;
  text: string;
  eventRefs: string[];
  sourceRefs: string[];
  priority: ContextPriority;
}

export interface ContextDecision {
  id: string;
  text: string;
  status: "proposed" | "accepted" | "rejected" | "superseded";
  actor: "user" | "bot" | "system";
  eventRefs: string[];
}

export interface ContextItem {
  id: string;
  kind: "conversation" | "tool_result" | "handoff" | "artifact" | "source" | "memory";
  content: string;
  eventRefs: string[];
  sourceRefs: string[];
  priority: ContextPriority;
  createdAt: string;
}

export interface ContextLedger {
  projectId: ProjectId;
  runId: RunId;
  objective: string;
  constraints: string[];
  durableFacts: ContextFact[];
  decisions: ContextDecision[];
  unknowns: string[];
  pendingApprovalRefs: string[];
  activeHandoffRefs: string[];
  artifactRefs: string[];
  sourceRefs: string[];
  nextAction: string;
  items: ContextItem[];
  events: RunEvent[];
}

export interface ContextPolicy {
  softThresholdTokens: number;
  hardThresholdTokens: number;
  reserveOutputTokens: number;
  maxSummaryTokens: number;
  maxTailEvents: number;
}

export interface ContextSnapshot {
  id: ContextSnapshotId;
  schemaVersion: "context.snapshot.v1";
  projectId: ProjectId;
  runId: RunId;
  parentSnapshotId?: ContextSnapshotId;
  covers: { fromSequence: number; toSequence: number };
  trigger: ContextTrigger;
  summary: {
    objective: string;
    durableFacts: ContextFact[];
    decisions: ContextDecision[];
    constraints: string[];
    unknowns: string[];
    pendingApprovalRefs: string[];
    activeHandoffRefs: string[];
    artifactRefs: string[];
    sourceRefs: string[];
    nextAction: string;
  };
  tailEventIds: string[];
  tokenEstimate: number;
  summaryTokenEstimate: number;
  contentSha256: string;
  createdAt: string;
  createdBy: "system" | "user" | "bot";
}

export interface ContextPacket {
  snapshot: ContextSnapshot;
  tailEvents: RunEvent[];
  continuationInstruction: string;
}

export interface CreateRunInput {
  id?: RunId;
  projectId: ProjectId;
  botId: BotId;
  request: RunRequest;
  now?: string;
}
