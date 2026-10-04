import { createHash } from 'node:crypto';
import {
  type MemoryAdapter,
  type MemoryReflection,
  type RecallMemoryInput,
  type RecallMemoryResult,
  type RecallScoreBreakdown,
  type RecallStrategy,
  type ReflectMemoryInput,
  type RetainMemoryInput,
  type RecalledMemory,
  type MemoryItem,
  type MemoryItemId,
  type SourceId,
} from '../../../packages/core/src/index.ts';
import type { SqliteEntityStore } from './persistence.ts';

function tokens(value: string): string[] {
  const matches = value.toLocaleLowerCase().match(/[\p{L}\p{N}\u4e00-\u9fff]+/gu) ?? [];
  return matches.filter((item) => item.length > 1 || /[\u4e00-\u9fff]/u.test(item));
}

function terms(value: string): string[] {
  return [...new Set(tokens(value))];
}

function phraseScore(queryTokens: string[], contentTokens: string[]): number {
  if (queryTokens.length === 0 || queryTokens.length > contentTokens.length) return 0;
  for (let index = 0; index <= contentTokens.length - queryTokens.length; index += 1) {
    if (queryTokens.every((token, offset) => contentTokens[index + offset] === token)) return 1;
  }
  return 0;
}

function recencyScore(updatedAt: string, now: string): number {
  const nowMs = Date.parse(now);
  const updatedMs = Date.parse(updatedAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(updatedMs)) return 0;
  const ageMs = Math.max(0, nowMs - updatedMs);
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  return 1 / (1 + ageDays / 30);
}

function scoreMemory(input: RecallMemoryInput, queryTerms: string[], queryTokens: string[], content: string, updatedAt: string): { relevance: number; matchedTerms: string[]; scoreBreakdown: RecallScoreBreakdown } {
  const contentTokens = tokens(content);
  const haystack = content.toLocaleLowerCase();
  // Keep the original substring behavior for Chinese text without spaces.
  const matchedTerms = queryTerms.filter((term) => haystack.includes(term));
  const lexicalScore = queryTerms.length === 0 ? 0 : matchedTerms.length / queryTerms.length;
  const breakdown: RecallScoreBreakdown = {
    lexicalScore,
    phraseScore: phraseScore(queryTokens, contentTokens),
    recencyScore: recencyScore(updatedAt, input.now ?? new Date().toISOString()),
  };
  const strategy: RecallStrategy = input.strategy ?? 'lexical';
  const relevance = strategy === 'hybrid'
    ? (0.7 * breakdown.lexicalScore) + (0.2 * breakdown.phraseScore) + (0.1 * breakdown.recencyScore)
    : breakdown.lexicalScore;
  return { relevance, matchedTerms, scoreBreakdown: breakdown };
}

function memoryId(input: RetainMemoryInput): MemoryItemId {
  const digest = createHash('sha256')
    .update(JSON.stringify({ projectId: input.projectId, scope: input.scope, content: input.content, sourceRefs: input.sourceRefs ?? [] }), 'utf8')
    .digest('hex');
  return `memory:${digest}` as MemoryItemId;
}

function clampLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(20, Math.floor(value as number)));
}

/** SQLite-backed local memory with deterministic ids and bounded lexical recall. */
export class SqliteMemoryAdapter implements MemoryAdapter {
  private readonly store: SqliteEntityStore;
  private readonly now: () => string;

  constructor(store: SqliteEntityStore, now: () => string = () => new Date().toISOString()) {
    this.store = store;
    this.now = now;
  }

  async retain(input: RetainMemoryInput): Promise<MemoryItem> {
    const content = input.content.trim();
    if (!content) throw new Error('memory_content_required');
    const id = memoryId({ ...input, content });
    const existing = this.store.getMemory(String(id), String(input.projectId));
    if (existing) return existing;
    const now = input.now ?? this.now();
    const item: MemoryItem = {
      id,
      projectId: input.projectId,
      scope: input.scope.trim() || 'project',
      content,
      sourceRefs: [...(input.sourceRefs ?? [])],
      createdAt: now,
      updatedAt: now,
    };
    this.store.saveMemory(item);
    return item;
  }

  async recall(input: RecallMemoryInput): Promise<RecallMemoryResult> {
    const queryTokens = tokens(input.query);
    const queryTerms = [...new Set(queryTokens)];
    const memories = this.store.listMemories(String(input.projectId));
    const ranked: RecalledMemory[] = memories
      .filter((item) => !input.scope || item.scope === input.scope)
      .map((item) => {
        const scored = scoreMemory(input, queryTerms, queryTokens, item.content, item.updatedAt);
        return { item, ...scored };
      })
      .filter((item) => item.relevance > 0)
      .sort((left, right) => right.relevance - left.relevance || right.item.updatedAt.localeCompare(left.item.updatedAt) || String(left.item.id).localeCompare(String(right.item.id)))
      .slice(0, clampLimit(input.limit));
    return { query: input.query, strategy: input.strategy ?? 'lexical', items: ranked };
  }

  async reflect(input: ReflectMemoryInput): Promise<MemoryReflection> {
    const query = input.cues.filter((item) => item.trim()).join(' ');
    const result = await this.recall({ projectId: input.projectId, query, scope: input.scope, limit: input.limit, strategy: input.strategy });
    const memoryRefs = result.items.map((item) => item.item.id);
    const sourceRefs = [...new Set(result.items.flatMap((item) => item.item.sourceRefs))] as SourceId[];
    const summary = result.items.length === 0
      ? '没有找到与当前问题匹配的历史记忆。'
      : result.items.map((item) => `- ${item.item.content}`).join('\n');
    return { projectId: input.projectId, summary, memoryRefs, sourceRefs };
  }
}
