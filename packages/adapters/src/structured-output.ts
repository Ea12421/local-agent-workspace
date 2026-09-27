import type { JsonObject } from '../../core/src/index.ts';

export type StructuredOutputMode = 'exact' | 'fenced' | 'embedded';

export type StructuredOutputParseResult =
  | {
      status: 'parsed';
      value: JsonObject;
      mode: StructuredOutputMode;
      extractedText: string;
    }
  | {
      status: 'rejected';
      reason: 'empty' | 'invalid_json' | 'multiple_objects';
      candidateCount: number;
    };

type Candidate = { start: number; end: number; value: JsonObject };

function asObject(text: string): JsonObject | null {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
  } catch {
    return null;
  }
}

function balancedCandidates(text: string): Candidate[] {
  const candidates: Candidate[] = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          const extractedText = text.slice(start, index + 1);
          const value = asObject(extractedText);
          if (value) candidates.push({ start, end: index + 1, value });
          break;
        }
        if (depth < 0) break;
      }
    }
  }
  return candidates.filter((candidate) => !candidates.some((other) =>
    other !== candidate && other.start <= candidate.start && other.end >= candidate.end &&
    (other.start < candidate.start || other.end > candidate.end)));
}

export function parseStructuredJsonObject(text: string): StructuredOutputParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { status: 'rejected', reason: 'empty', candidateCount: 0 };

  const exact = asObject(trimmed);
  if (exact) return { status: 'parsed', value: exact, mode: 'exact', extractedText: trimmed };

  const fencedMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
  if (fencedMatches.length > 1) return { status: 'rejected', reason: 'multiple_objects', candidateCount: fencedMatches.length };
  if (fencedMatches.length === 1) {
    const fencedText = fencedMatches[0][1]?.trim() ?? '';
    const fenced = asObject(fencedText);
    if (fenced) return { status: 'parsed', value: fenced, mode: 'fenced', extractedText: fencedText };
  }

  const candidates = balancedCandidates(trimmed);
  if (candidates.length > 1) return { status: 'rejected', reason: 'multiple_objects', candidateCount: candidates.length };
  if (candidates.length === 1) {
    return { status: 'parsed', value: candidates[0].value, mode: 'embedded', extractedText: trimmed.slice(candidates[0].start, candidates[0].end) };
  }
  return { status: 'rejected', reason: 'invalid_json', candidateCount: 0 };
}
