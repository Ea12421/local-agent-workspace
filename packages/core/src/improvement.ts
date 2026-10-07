import type {
  ApprovalStatus,
  JsonObject,
  JsonValue,
  ProjectId,
  RunEvent,
  RunId,
} from "./types.ts";
import type { RecallStrategy } from "./memory.ts";

export const IMPROVEMENT_TARGETS = [
  "prompt",
  "skill",
  "memory_policy",
  "tool_policy",
  "provider",
  "code",
  "bot",
  "routine",
] as const;

export type ImprovementTarget = (typeof IMPROVEMENT_TARGETS)[number];

export type ImprovementProposalStatus =
  | "draft"
  | "testing"
  | "pending_approval"
  | "published"
  | "rejected"
  | "rolled_back";

export type ImprovementEvaluationStatus = "passed" | "failed" | "unscored";
export type ImprovementScorer = "rule" | "scanner" | "human" | "model_judge";

export interface ImprovementProposalRecord {
  proposalId: string;
  projectId: ProjectId;
  runId: RunId;
  target: ImprovementTarget;
  baseVersion: string;
  candidateVersion: string;
  candidateHash: string;
  evidenceRefs: string[];
  evalRefs: string[];
  status: ImprovementProposalStatus;
  changedRefs: string[];
  hypothesis: string;
  memoryRefs?: string[];
  memoryStrategy?: RecallStrategy;
}

export interface ImprovementAssertionResult {
  id: string;
  passed: boolean;
  evidenceRefs: string[];
}

export interface ImprovementEvaluationRecord {
  evaluationId: string;
  taskId: string;
  taskVersion: string;
  evaluatorVersion: string;
  scorer: ImprovementScorer;
  status: ImprovementEvaluationStatus;
  baselineScore: number;
  candidateScore: number;
  assertions: ImprovementAssertionResult[];
  evidenceRefs: string[];
  createdAt: string;
}

export interface ImprovementApprovalRecord {
  approvalId: string;
  status: ApprovalStatus;
  action: string;
  reason?: string;
}

export interface ImprovementReleaseRecord {
  releasedVersion: string;
  candidateHash: string;
  publishedAt: string;
  automatic: boolean;
}

export interface ImprovementRollbackRecord {
  restoredVersion: string;
  rolledBackVersion: string;
  reason: string;
  rolledBackAt: string;
  evidenceRefs: string[];
}

export type ImprovementProjectionStatus =
  | "not_started"
  | "running"
  | "waiting_user"
  | "published"
  | "rolled_back"
  | "rejected"
  | "failed";

export interface ImprovementProjection {
  runId: RunId;
  projectId?: ProjectId;
  target?: ImprovementTarget;
  status: ImprovementProjectionStatus;
  proposal?: ImprovementProposalRecord;
  evaluation?: ImprovementEvaluationRecord;
  approval?: ImprovementApprovalRecord;
  release?: ImprovementReleaseRecord;
  rollback?: ImprovementRollbackRecord;
  error?: { code: string; message: string };
  eventIds: string[];
  latestSequence: number;
}

export interface ImprovementRunStartedData extends JsonObject {
  semanticKey: string;
  projectId: ProjectId;
  target: ImprovementTarget;
  baseVersion: string;
  evidenceRefs: string[];
  memoryRefs: string[];
  memoryStrategy: RecallStrategy;
}

export interface ImprovementProposalCreatedData extends JsonObject {
  semanticKey: string;
  proposal: JsonObject;
}

export interface ImprovementEvaluationCompletedData extends JsonObject {
  semanticKey: string;
  evaluation: JsonObject;
}

export interface ImprovementApprovalRequestedData extends JsonObject {
  semanticKey: string;
  approval: JsonObject;
}

export interface ImprovementPublishedData extends JsonObject {
  semanticKey: string;
  release: JsonObject;
}

export interface ImprovementRolledBackData extends JsonObject {
  semanticKey: string;
  rollback: JsonObject;
}

export interface ImprovementFailedData extends JsonObject {
  semanticKey: string;
  code: string;
  message: string;
}

function recordValue(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : undefined;
}

function stringValue(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value: JsonValue | undefined): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return undefined;
  return value as string[];
}

function targetValue(value: JsonValue | undefined): ImprovementTarget | undefined {
  return typeof value === "string" && (IMPROVEMENT_TARGETS as readonly string[]).includes(value)
    ? value as ImprovementTarget
    : undefined;
}

function memoryStrategyValue(value: JsonValue | undefined): RecallStrategy | undefined {
  return value === "lexical" || value === "hybrid" ? value : undefined;
}

function numberValue(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: JsonValue | undefined): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function parseProposal(value: JsonValue | undefined): ImprovementProposalRecord | undefined {
  const record = recordValue(value);
  if (!record) return undefined;
  const proposalId = stringValue(record.proposalId);
  const projectId = stringValue(record.projectId) as ProjectId | undefined;
  const runId = stringValue(record.runId) as RunId | undefined;
  const target = targetValue(record.target);
  const baseVersion = stringValue(record.baseVersion);
  const candidateVersion = stringValue(record.candidateVersion);
  const candidateHash = stringValue(record.candidateHash);
  const evidenceRefs = stringArray(record.evidenceRefs);
  const evalRefs = stringArray(record.evalRefs);
  const changedRefs = stringArray(record.changedRefs);
  const status = stringValue(record.status) as ImprovementProposalStatus | undefined;
  const hypothesis = stringValue(record.hypothesis);
  const memoryRefs = stringArray(record.memoryRefs);
  const memoryStrategy = memoryStrategyValue(record.memoryStrategy);
  if (!proposalId || !projectId || !runId || !target || !baseVersion || !candidateVersion || !candidateHash || !evidenceRefs || !evalRefs || !changedRefs || !status || !hypothesis) return undefined;
  if (!("draft testing pending_approval published rejected rolled_back".split(" ") as string[]).includes(status)) return undefined;
  return { proposalId, projectId, runId, target, baseVersion, candidateVersion, candidateHash, evidenceRefs, evalRefs, status, changedRefs, hypothesis, ...(memoryRefs ? { memoryRefs } : {}), ...(memoryStrategy ? { memoryStrategy } : {}) };
}

function parseAssertions(value: JsonValue | undefined): ImprovementAssertionResult[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const assertions: ImprovementAssertionResult[] = [];
  for (const item of value) {
    const record = recordValue(item);
    if (!record) return undefined;
    const id = stringValue(record.id);
    const passed = booleanValue(record.passed);
    const evidenceRefs = stringArray(record.evidenceRefs);
    if (!id || passed === undefined || !evidenceRefs) return undefined;
    assertions.push({ id, passed, evidenceRefs });
  }
  return assertions;
}

function parseEvaluation(value: JsonValue | undefined): ImprovementEvaluationRecord | undefined {
  const record = recordValue(value);
  if (!record) return undefined;
  const evaluationId = stringValue(record.evaluationId);
  const taskId = stringValue(record.taskId);
  const taskVersion = stringValue(record.taskVersion);
  const evaluatorVersion = stringValue(record.evaluatorVersion);
  const scorer = stringValue(record.scorer) as ImprovementScorer | undefined;
  const status = stringValue(record.status) as ImprovementEvaluationStatus | undefined;
  const baselineScore = numberValue(record.baselineScore);
  const candidateScore = numberValue(record.candidateScore);
  const assertions = parseAssertions(record.assertions);
  const evidenceRefs = stringArray(record.evidenceRefs);
  const createdAt = stringValue(record.createdAt);
  if (!evaluationId || !taskId || !taskVersion || !evaluatorVersion || !scorer || !status || baselineScore === undefined || candidateScore === undefined || !assertions || !evidenceRefs || !createdAt) return undefined;
  if (!("rule scanner human model_judge".split(" ") as string[]).includes(scorer)) return undefined;
  if (!("passed failed unscored".split(" ") as string[]).includes(status)) return undefined;
  return { evaluationId, taskId, taskVersion, evaluatorVersion, scorer, status, baselineScore, candidateScore, assertions, evidenceRefs, createdAt };
}

function parseApproval(value: JsonValue | undefined): ImprovementApprovalRecord | undefined {
  const record = recordValue(value);
  if (!record) return undefined;
  const approvalId = stringValue(record.approvalId);
  const status = stringValue(record.status) as ApprovalStatus | undefined;
  const action = stringValue(record.action);
  const reason = stringValue(record.reason);
  if (!approvalId || !status || !action) return undefined;
  if (!("pending approved rejected expired cancelled".split(" ") as string[]).includes(status)) return undefined;
  return { approvalId, status, action, ...(reason ? { reason } : {}) };
}

function parseRelease(value: JsonValue | undefined): ImprovementReleaseRecord | undefined {
  const record = recordValue(value);
  if (!record) return undefined;
  const releasedVersion = stringValue(record.releasedVersion);
  const candidateHash = stringValue(record.candidateHash);
  const publishedAt = stringValue(record.publishedAt);
  const automatic = booleanValue(record.automatic);
  if (!releasedVersion || !candidateHash || !publishedAt || automatic === undefined) return undefined;
  return { releasedVersion, candidateHash, publishedAt, automatic };
}

function parseRollback(value: JsonValue | undefined): ImprovementRollbackRecord | undefined {
  const record = recordValue(value);
  if (!record) return undefined;
  const restoredVersion = stringValue(record.restoredVersion);
  const rolledBackVersion = stringValue(record.rolledBackVersion);
  const reason = stringValue(record.reason);
  const rolledBackAt = stringValue(record.rolledBackAt);
  const evidenceRefs = stringArray(record.evidenceRefs);
  if (!restoredVersion || !rolledBackVersion || !reason || !rolledBackAt || !evidenceRefs) return undefined;
  return { restoredVersion, rolledBackVersion, reason, rolledBackAt, evidenceRefs };
}

function updateProject(projection: ImprovementProjection, event: RunEvent): void {
  const projectId = stringValue(event.data.projectId) as ProjectId | undefined;
  if (projectId && projection.projectId && projectId !== projection.projectId) {
    throw new Error(`Improvement event project mismatch for ${event.id}`);
  }
  if (projectId) projection.projectId = projectId;
}

/**
 * Rebuild the user-facing RSI projection from append-only events.
 * Unknown/non-improvement events are ignored so normal Run history can be fed
 * directly into this reducer.
 */
export function projectImprovement(runId: RunId, events: readonly RunEvent[]): ImprovementProjection {
  const projection: ImprovementProjection = {
    runId,
    status: "not_started",
    eventIds: [],
    latestSequence: 0,
  };
  const seen = new Set<string>();
  for (const event of events) {
    if (event.runId !== runId || seen.has(event.id)) continue;
    seen.add(event.id);
    projection.eventIds.push(event.id);
    projection.latestSequence = Math.max(projection.latestSequence, event.sequence);
    const data = event.data;
    if (event.type.startsWith("improvement.")) updateProject(projection, event);
    if (event.type === "improvement.run_started") {
      projection.target = targetValue(data.target);
      projection.status = "running";
      continue;
    }
    if (event.type === "improvement.proposal_created") {
      const proposal = parseProposal(data.proposal);
      if (proposal) {
        projection.proposal = proposal;
        projection.target = proposal.target;
        projection.status = proposal.status === "pending_approval" ? "waiting_user" : "running";
      }
      continue;
    }
    if (event.type === "improvement.evaluation_completed") {
      const evaluation = parseEvaluation(data.evaluation);
      if (evaluation) {
        projection.evaluation = evaluation;
        if (projection.proposal && evaluation.status === "failed") projection.proposal.status = "rejected";
      }
      continue;
    }
    if (event.type === "improvement.approval_requested") {
      const approval = parseApproval(data.approval);
      if (approval) {
        projection.approval = approval;
        projection.status = "waiting_user";
        if (projection.proposal) projection.proposal.status = "pending_approval";
      }
      continue;
    }
    if (event.type === "improvement.published") {
      const release = parseRelease(data.release);
      if (release) {
        projection.release = release;
        projection.status = "published";
        if (projection.proposal) projection.proposal.status = "published";
      }
      continue;
    }
    if (event.type === "improvement.rolled_back") {
      const rollback = parseRollback(data.rollback);
      if (rollback) {
        projection.rollback = rollback;
        projection.status = "rolled_back";
        if (projection.proposal) projection.proposal.status = "rolled_back";
      }
      continue;
    }
    if (event.type === "improvement.failed") {
      projection.status = "failed";
      const code = stringValue(data.code);
      const message = stringValue(data.message);
      if (code && message) projection.error = { code, message };
    }
  }
  return projection;
}

export function isHighRiskImprovementTarget(target: ImprovementTarget): boolean {
  return ["tool_policy", "provider", "code", "bot", "routine"].includes(target);
}
