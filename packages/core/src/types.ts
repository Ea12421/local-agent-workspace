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

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ProviderOutputNormalizationMode = "exact" | "fenced" | "embedded";
export type ProviderOutputRejectionReason = "empty" | "invalid_json" | "multiple_objects";
export type ProviderOutputReceiptStatus = "parsed" | "rejected";

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
  | "approval.requested"
  | "approval.resolved"
  | "handoff.created"
  | "handoff.completed"
  | "handoff.failed"
  | "artifact.created"
  | "context.compaction_started"
  | "context.snapshot_created"
  | "context.compaction_failed"
  | "run.segment_started"
  | "run.segment_completed"
  | "run.resume_requested"
  | "run.resume_failed";

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
  inputRefs?: string[];
  constraints?: string[];
  outputSchema?: JsonObject;
  metadata?: JsonObject;
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

export interface ProviderCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
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
