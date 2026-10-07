import type { MemoryItem, MemoryItemId, ProjectId, SourceId } from "./types.ts";

export interface RetainMemoryInput {
  projectId: ProjectId;
  scope: string;
  content: string;
  sourceRefs?: SourceId[];
  now?: string;
}

export interface RecallMemoryInput {
  projectId: ProjectId;
  query: string;
  scope?: string;
  limit?: number;
  strategy?: RecallStrategy;
  now?: string;
}

export type RecallStrategy = "lexical" | "hybrid";

export interface RecallScoreBreakdown {
  lexicalScore: number;
  phraseScore: number;
  recencyScore: number;
}

export interface RecalledMemory {
  item: MemoryItem;
  relevance: number;
  matchedTerms: string[];
  scoreBreakdown: RecallScoreBreakdown;
}

export interface RecallMemoryResult {
  query: string;
  strategy: RecallStrategy;
  items: RecalledMemory[];
}

export interface ReflectMemoryInput {
  projectId: ProjectId;
  cues: string[];
  scope?: string;
  limit?: number;
  strategy?: RecallStrategy;
}

export interface MemoryReflection {
  projectId: ProjectId;
  summary: string;
  memoryRefs: MemoryItemId[];
  sourceRefs: SourceId[];
}

/** Hindsight-inspired seam. The runtime owns persistence and can replace recall later. */
export interface MemoryAdapter {
  retain(input: RetainMemoryInput): Promise<MemoryItem>;
  recall(input: RecallMemoryInput): Promise<RecallMemoryResult>;
  reflect(input: ReflectMemoryInput): Promise<MemoryReflection>;
}
