import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildProviderOutputReceipt, CodexExternalAdapter, parseStructuredJsonObject } from '../packages/adapters/src/index.ts';
import type { RunEvent, RunRequest } from '../packages/core/src/index.ts';

const workspaceRoot = process.cwd();
const projectRoot = '/Users/m4air/总控/projects/personal-knowledge-mcp-mvp';
const allowlist = ['AGENTS.md', 'STATE.md', 'PROJECT_DOCS_INDEX.md'];
const resultPath = path.join(workspaceRoot, 'validation/m8-08-real-project-knowledge-mcp.json');
const artifactPath = path.join(workspaceRoot, 'validation/m8-08-real-project-knowledge-mcp-artifact.json');
const requiredKeys = ['project_id', 'current_state', 'user_problem', 'proposed_increment', 'scope_in', 'scope_out', 'acceptance_checks', 'privacy_boundary', 'risks', 'next_action', 'evidence_refs'];

function sha256(value: string): string { return createHash('sha256').update(value).digest('hex'); }

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

function prompt(): string {
  return [
    'M8-08 real local Product Builder task. Return exactly one JSON object and no markdown.',
    'Project: Personal Knowledge MCP MVP (personal-knowledge-mcp-mvp).',
    'Goal: propose the next safe product increment that makes this fixture-only, read-only MCP MVP easier to verify locally and repeatedly, without connecting real knowledge data or exposing a public service.',
    `Read only these exact files relative to the project root: ${allowlist.join(', ')}.`,
    'Do not read fixtures, source code, package files, credentials, cookies, tokens, other projects, or any path outside the allowlist. Do not write, run commands, install, start a server, send, publish, or change external state.',
    `Required JSON keys: ${requiredKeys.join(', ')}.`,
    'scope_in, scope_out, acceptance_checks, risks, evidence_refs must be non-empty arrays. privacy_boundary must explicitly preserve fixture-only, read-only, localhost-only, no-real-data and no-public-service constraints. evidence_refs must contain only exact relative paths from the allowlist.',
    'Separate current evidence from proposed work. Mark real data access, public deployment, GPT-Live direct MCP, and user acceptance as unknown/pending; do not call a plan completed.',
  ].join('\n\n');
}

async function main() {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const adapter = new CodexExternalAdapter(process.env.CODEX_BIN ?? 'codex', { cwd: projectRoot, sandbox: 'read-only', timeoutMs: 180_000 });
  const request: RunRequest = {
    objective: prompt(),
    input: { projectId: 'personal-knowledge-mcp-mvp', allowlist },
    constraints: ['read-only', 'declared-file-allowlist', 'fixture-only', 'localhost-only', 'no-external-side-effects'],
    outputSchema: { type: 'object', required: requiredKeys },
    metadata: { validation: 'm8-08', projectId: 'personal-knowledge-mcp-mvp' },
  };
  const handle = await adapter.startRun(request);
  const events: RunEvent[] = [];
  for await (const event of adapter.streamEvents(handle)) events.push(event);
  const output = eventText(events);
  const parsedResult = parseStructuredJsonObject(output);
  const parsed = parsedResult.status === 'parsed' ? parsedResult.value : null;
  const providerOutputReceipt = buildProviderOutputReceipt(output, parsedResult);
  const missingKeys = requiredKeys.filter((key) => {
    const value = parsed?.[key];
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);
  });
  const evidenceRefs = Array.isArray(parsed?.evidence_refs) ? parsed.evidence_refs.map(String) : [];
  const undeclaredRefs = evidenceRefs.filter((ref) => !allowlist.includes(ref));
  const providerCompleted = events.some((event) => event.data.status === 'completed');
  const artifact = { artifact_version: 'm8-08.real-project-artifact.v1', artifact_id: `m8-08-knowledge-mcp-${sha256(output).slice(0, 24)}`, source_run_id: handle.id, project_id: 'personal-knowledge-mcp-mvp', output_sha256: sha256(output), provider_output_receipt: providerOutputReceipt, output };
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  const result = {
    record_version: 'm8-08.real-project-result.v1',
    executed_at: new Date().toISOString(),
    project_root: projectRoot,
    read_allowlist: allowlist,
    objective: 'fixture-only MCP 本地验证包下一步计划',
    started_at: startedAt,
    elapsed_ms: Date.now() - startedMs,
    provider: handle.provider,
    run_id: handle.id,
    event_count: events.length,
    provider_completed: providerCompleted,
    output_sha256: sha256(output),
    artifact_path: path.relative(workspaceRoot, artifactPath),
    provider_output_receipt: providerOutputReceipt,
    parsed_output: parsed,
    structural_check: {
      json_object: parsed !== null,
      missing_required_keys: missingKeys,
      evidence_refs_declared: evidenceRefs,
      undeclared_evidence_refs: undeclaredRefs,
      normalization: parsedResult.status === 'parsed' ? parsedResult.mode : null,
      normalization_rejection: parsedResult.status === 'rejected' ? parsedResult.reason : null,
      wire_json_exact: parsedResult.status === 'parsed' && parsedResult.mode === 'exact',
      traceability_pass: providerCompleted && parsed !== null && missingKeys.length === 0 && undeclaredRefs.length === 0,
    },
    approval_boundary: 'No real knowledge data, public service, install, or external send is performed. Any boundary expansion requires a new explicit authorization and pre-registered card.',
    provider_events: events,
  };
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: result.structural_check.traceability_pass ? 'PASS_TRACEABLE_REAL_PROJECT_PLAN' : 'PARTIAL', run_id: handle.id, elapsed_ms: result.elapsed_ms, artifact: result.artifact_path }));
}

await main();
