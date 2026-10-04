import type { JsonObject, JsonValue, ProjectId, RunId } from "./types.ts";

/** A versioned, repeatable task used to judge a candidate change. */
export interface EvalTask {
  taskId: string;
  projectId: ProjectId;
  version: string;
  name: string;
  objective: string;
  input: JsonValue;
  evaluatorVersion: string;
  sourceRefs: string[];
  enabled: boolean;
}

export type ScoreStatus = "passed" | "failed" | "unscored";

export interface ScoreDimension {
  id: string;
  label: string;
  value: number;
  maxValue: number;
  passed: boolean;
  evidenceRefs: string[];
}

/** A score is evidence about one EvalTask, not a claim about general model quality. */
export interface Score {
  scoreId: string;
  projectId: ProjectId;
  taskId: string;
  taskVersion: string;
  runId?: RunId;
  evaluatorVersion: string;
  status: ScoreStatus;
  value: number;
  maxValue: number;
  dimensions: ScoreDimension[];
  evidenceRefs: string[];
  createdAt: string;
}

export type FeedbackKind = "observation" | "correction" | "decision";

/** Human or deterministic feedback attached to a score and its evidence. */
export interface FeedbackEvent {
  feedbackId: string;
  projectId: ProjectId;
  runId?: RunId;
  taskId?: string;
  scoreId?: string;
  kind: FeedbackKind;
  summary: string;
  details?: string;
  sourceRefs: string[];
  createdAt: string;
}

export interface EvaluationBundle {
  task: EvalTask;
  score: Score;
  feedback: FeedbackEvent;
}

export function evaluationBundleJson(bundle: EvaluationBundle): JsonObject {
  return {
    task: bundle.task as unknown as JsonObject,
    score: bundle.score as unknown as JsonObject,
    feedback: bundle.feedback as unknown as JsonObject,
  };
}
