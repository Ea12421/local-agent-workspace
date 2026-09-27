import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CodexExternalAdapter } from '../packages/adapters/src/index.ts';
import type { JsonObject, RunEvent, RunRequest } from '../packages/core/src/index.ts';

const workspaceRoot = process.cwd();
const projectRoot = '/Users/m4air/总控/projects/codex-pet-studio';
const allowlist = ['AGENTS.md', 'STATE.md'];
const resultPath = path.join(workspaceRoot, 'validation/m8-07-real-project-codex-pet.json');
const artifactPath = path.join(workspaceRoot, 'validation/m8-07-real-project-codex-pet-artifact.json');
const requiredKeys = [
  'project_id',
  'current_state',
  'user_problem',
  'proposed_increment',
  'scope_in',
  'scope_out',
  'acceptance_checks',
  'artifacts_to_create',
  'risks',
  'approval_required',
  'next_action',
  'evidence_refs',
];

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function eventText(events: RunEvent[]): string {
  const chunks: string[] = [];
  for (const event of events) {
    const stream = event.data.stream as any;
    const candidates = [stream?.item?.text, stream?.item?.content, stream?.text, stream?.message?.content];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) chunks.push(candidate);
      if (Array.isArray(candidate)) for (const part of candidate) if (typeof part?.text === 'string') chunks.push(part.text);
    }
  }
  return [...new Set(chunks)].join('\n').trim().slice(-24_000);
}

function parseStrictObject(text: string): JsonObject | null {
  try {
    const value = JSON.parse(text.trim());
    return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
  } catch {
    return null;
  }
}

function prompt(): string {
  return [
    'M8-07 real local Product Builder task. Return exactly one JSON object and no markdown.',
    'Project: Codex 像素宠物工作室 (codex-pet-studio).',
    'Goal: Based only on the declared project state, propose the next safe product increment that turns the existing 沙悟净 pixel-pet package into an installation-ready candidate without installing it into ~/.codex/pets.',
    `Read only these exact files relative to the project root: ${allowlist.join(', ')}.`,
    'Do not read source code, assets, credentials, cookies, tokens, other projects, or any path outside the allowlist. Do not write, run commands, install, publish, or modify external state.',
    `Required JSON keys: ${requiredKeys.join(', ')}.`,
    'scope_in and scope_out, acceptance_checks, artifacts_to_create, risks, and evidence_refs must be non-empty arrays. approval_required must explain any user approval needed before installation. evidence_refs must contain only the exact allowlisted relative paths read.',
    'Keep existing project claims separate from proposed work. Mark unverified installation or user acceptance as unknown/pending; do not call a plan completed.',
  ].join('\n\n');
}

async function main() {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const adapter = new CodexExternalAdapter(process.env.CODEX_BIN ?? 'codex', {
    cwd: projectRoot,
    sandbox: 'read-only',
    timeoutMs: 180_000,
  });
  const request: RunRequest = {
    objective: prompt(),
    input: { projectId: 'codex-pet-studio', allowlist },
    constraints: ['read-only', 'declared-file-allowlist', 'no-install', 'no-external-side-effects'],
    outputSchema: { type: 'object', required: requiredKeys },
    metadata: { validation: 'm8-07', projectId: 'codex-pet-studio' },
  };
  const handle = await adapter.startRun(request);
  const events: RunEvent[] = [];
  for await (const event of adapter.streamEvents(handle)) events.push(event);
  const output = eventText(events);
  const parsed = parseStrictObject(output);
  const missingKeys = requiredKeys.filter((key) => {
    const value = parsed?.[key];
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);
  });
  const evidenceRefs = Array.isArray(parsed?.evidence_refs) ? parsed.evidence_refs.map(String) : [];
  const undeclaredRefs = evidenceRefs.filter((ref) => !allowlist.includes(ref));
  const providerCompleted = events.some((event) => event.data.status === 'completed');
  const artifact = {
    artifact_version: 'm8-07.real-project-artifact.v1',
    artifact_id: `m8-07-codex-pet-${sha256(output).slice(0, 24)}`,
    source_run_id: handle.id,
    project_id: 'codex-pet-studio',
    output_sha256: sha256(output),
    output,
  };
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  const result = {
    record_version: 'm8-07.real-project-result.v1',
    executed_at: new Date().toISOString(),
    project_root: projectRoot,
    read_allowlist: allowlist,
    objective: '安装前产品化下一步计划',
    started_at: startedAt,
    elapsed_ms: Date.now() - startedMs,
    provider: handle.provider,
    run_id: handle.id,
    event_count: events.length,
    provider_completed: providerCompleted,
    output_sha256: sha256(output),
    artifact_path: path.relative(workspaceRoot, artifactPath),
    parsed_output: parsed,
    structural_check: {
      json_object: parsed !== null,
      missing_required_keys: missingKeys,
      evidence_refs_declared: evidenceRefs,
      undeclared_evidence_refs: undeclaredRefs,
      traceability_pass: providerCompleted && parsed !== null && missingKeys.length === 0 && undeclaredRefs.length === 0,
    },
    approval_boundary: 'No installation or ~/.codex/pets write is performed. User approval remains required before any installation step.',
    provider_events: events,
  };
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: result.structural_check.traceability_pass ? 'PASS_TRACEABLE_REAL_PROJECT_PLAN' : 'PARTIAL', run_id: handle.id, elapsed_ms: result.elapsed_ms, artifact: result.artifact_path }));
}

await main();
