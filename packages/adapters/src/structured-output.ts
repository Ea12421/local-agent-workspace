import { createHash } from 'node:crypto';
import type { JsonObject, ProviderOutputReceipt, ProviderOutputNormalizationMode } from '../../core/src/index.ts';

export type StructuredOutputMode = ProviderOutputNormalizationMode;

export type StructuredOutputValidationResult = {
  valid: boolean;
  errors: string[];
};

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

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

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

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateValue(value: unknown, schema: Record<string, unknown>, path: string, errors: string[]): void {
  const type = schema.type;
  if (typeof type === 'string') {
    const valid = type === 'object' ? isObject(value)
      : type === 'array' ? Array.isArray(value)
        : type === 'string' ? typeof value === 'string'
          : type === 'number' ? typeof value === 'number' && Number.isFinite(value)
            : type === 'integer' ? typeof value === 'number' && Number.isInteger(value)
              : type === 'boolean' ? typeof value === 'boolean'
                : type === 'null' ? value === null
                  : true;
    if (!valid) {
      errors.push(`${path}:expected_${type}`);
      return;
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => JSON.stringify(candidate) === JSON.stringify(value))) {
    errors.push(`${path}:invalid_enum`);
  }
  if (type === 'object' && isObject(value)) {
    const required = Array.isArray(schema.required) ? schema.required.filter((item): item is string => typeof item === 'string') : [];
    for (const key of required) if (!(key in value)) errors.push(`${path}.${key}:missing_required`);
    const properties = isObject(schema.properties) ? schema.properties : {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!(key in properties)) errors.push(`${path}.${key}:unknown_property`);
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (key in value && isObject(propertySchema)) validateValue(value[key], propertySchema, `${path}.${key}`, errors);
    }
  }
  if (type === 'array' && Array.isArray(value) && isObject(schema.items)) {
    value.forEach((item, index) => validateValue(item, schema.items as Record<string, unknown>, `${path}[${index}]`, errors));
  }
}

/** Validate the small JSON-Schema subset used by Bot and Skill contracts. */
export function validateStructuredOutput(value: unknown, schema: JsonObject): StructuredOutputValidationResult {
  const errors: string[] = [];
  validateValue(value, schema as Record<string, unknown>, '$', errors);
  return { valid: errors.length === 0, errors };
}

export function buildProviderOutputReceipt(text: string, parsed: StructuredOutputParseResult): ProviderOutputReceipt {
  const base = {
    schemaVersion: 'provider.output-receipt.v1' as const,
    rawOutputSha256: sha256(text),
  };
  if (parsed.status === 'parsed') {
    return {
      ...base,
      status: 'parsed',
      mode: parsed.mode,
      extractedOutputSha256: sha256(parsed.extractedText),
    };
  }
  return { ...base, status: 'rejected', rejectionReason: parsed.reason };
}
