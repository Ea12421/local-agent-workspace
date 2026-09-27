import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildProviderOutputReceipt, CodexExternalAdapter, parseStructuredJsonObject } from '../packages/adapters/src/index.ts';
import type { RunEvent, RunRequest } from '../packages/core/src/index.ts';

const workspaceRoot = process.cwd();
const allowlist = ['AGENTS.md', 'RUN_STATE.json', 'SPEC/PROGRESS.md', 'SPEC/08-persistence-architecture-decision.md'];
const resultPath = path.join(workspaceRoot, 'validation/m8-11-real-project-technical-route.json');
const artifactPath = path.join(workspaceRoot, 'validation/m8-11-real-project-technical-route-artifact.json');
const requiredKeys = ['project_id', 'current_state', 'decision_question', 'options', 'recommendation', 'tradeoffs', 'dependencies', 'risks', 'rollback', 'next_action', 'evidence_refs', 'unknowns'];

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
    'M8-11 real local Product Builder technical-route task. Return exactly one JSON object and no markdown.',
    'Project: local-agent-workspace. Decide the next bounded engineering step after SQLite-first persistence and provider output receipt integration.',
    `Read only these exact files relative to the workspace root: ${allowlist.join(', ')}.`,
    'Do not read source code, package files, validation artifacts, credentials, cookies, tokens, other projects, or any path outside the allowlist. Do not write, run commands, install, send, publish, or change external state.',
    `Required JSON keys: ${requiredKeys.join(', ')}.`,
    'options, tradeoffs, dependencies, risks, rollback, evidence_refs and unknowns must be non-empty arrays. evidence_refs must contain only exact relative paths from the allowlist.',
    'Separate facts from recommendations. Preserve current blockers and do not claim the overall project is complete. Return one concrete next_action only.',
  ].join('\n\n');
}

async function main() {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const adapter = new CodexExternalAdapter(process.env.CODEX_BIN ?? 'codex', { cwd: workspaceRoot, sandbox: 'read-only', timeoutMs: 180_000 });
  const request: RunRequest = {
    objective: prompt(),
    input: { projectId: 'local-agent-workspace', allowlist },
    constraints: ['read-only', 'declared-file-allowlist', 'no-commands', 'no-external-side-effects'],
    outputSchema: { type: 'object', required: requiredKeys },
    metadata: { validation: 'm8-11', projectId: 'local-agent-workspace' },
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
  const traceabilityPass = providerCompleted && parsed !== null && missingKeys.length === 0 && undeclaredRefs.length === 0;
  const artifact = {
    artifact_version: 'm8-11.real-project-artifact.v1',
    artifact_id: `m8-11-technical-route-${sha256(output).slice(0, 24)}`,
    source_run_id: handle.id,
    project_id: 'local-agent-workspace',
    output_sha256: sha256(output),
    provider_output_receipt: providerOutputReceipt,
    output,
  };
  await mkdir(path.dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  const result = {
    record_version: 'm8-11.real-project-result.v1',
    executed_at: new Date().toISOString(),
    project_root: workspaceRoot,
    read_allowlist: allowlist,
    objective: 'SQLite-first 之后的下一个技术路线判断',
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
    structural_check: { json_object: parsed !== null, missing_required_keys: missingKeys, evidence_refs_declared: evidenceRefs, undeclared_evidence_refs: undeclaredRefs, normalization: parsedResult.status === 'parsed' ? parsedResult.mode : null, normalization_rejection: parsedResult.status === 'rejected' ? parsedResult.reason : null, traceability_pass: traceabilityPass },
    approval_boundary: 'No code change, migration, credential access, external send or deployment is performed. Any implementation requires a separate reviewable step.',
    provider_events: events,
  };
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: traceabilityPass ? 'PASS_TRACEABLE_TECHNICAL_ROUTE' : 'PARTIAL', run_id: handle.id, elapsed_ms: result.elapsed_ms, artifact: result.artifact_path, normalization: result.structural_check.normalization }));
}

await main();
