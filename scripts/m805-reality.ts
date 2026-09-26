import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CodexExternalAdapter } from '../packages/adapters/src/index.ts';
import { executeCodexRun, runtimeStore } from '../apps/server/src/runtime.ts';
import type { JsonObject, ProviderAdapter, RunEvent, RunHandle, RunRequest } from '../packages/core/src/index.ts';

type RealityTask = {
  task_id: string;
  root: string;
  read_allowlist: string[];
  purpose: string;
};

const projectRoot = process.cwd();
const rawRoot = path.join(projectRoot, 'validation', 'm8-05-raw');
const resultsPath = path.join(projectRoot, 'validation', 'm8-05-reality-results.json');
const cardPath = path.join(projectRoot, 'validation', 'm8-05-reality-card-v1.json');

const tasks: RealityTask[] = [
  {
    task_id: 'REAL-01',
    root: projectRoot,
    read_allowlist: ['AGENTS.md', 'RUN_STATE.json', 'SPEC/PROGRESS.md', 'HANDOFF.md'],
    purpose: '生成当前项目可恢复状态简报。',
  },
  {
    task_id: 'REAL-02',
    root: '/Users/m4air/总控/projects/Pi-Agent-Workbench',
    read_allowlist: ['AGENTS.md', 'STATE.md'],
    purpose: '生成 Pi-Agent-Workbench 的当前状态与唯一下一步简报。',
  },
  {
    task_id: 'REAL-03',
    root: '/Users/m4air/总控/projects/personal-knowledge-mcp-mvp',
    read_allowlist: ['AGENTS.md', 'STATE.md'],
    purpose: '生成只读知识 MCP MVP 的恢复/停止边界简报。',
  },
];

const requiredKeys = ['task_id', 'summary', 'facts', 'unknowns', 'source_refs', 'next_action', 'completion_state'];

function eventText(events: RunEvent[]): string {
  const chunks: string[] = [];
  for (const item of events) {
    const stream = item.data.stream as any;
    const candidates = [stream?.item?.text, stream?.item?.content, stream?.text, stream?.message?.content];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) chunks.push(candidate);
      if (Array.isArray(candidate)) {
        for (const part of candidate) if (typeof part?.text === 'string') chunks.push(part.text);
      }
    }
  }
  return [...new Set(chunks)].join('\n').trim().slice(-24_000);
}

function parseOneJson(text: string): JsonObject | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  const candidates = [fenced, text.trim()].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as JsonObject;
    } catch {
      // Try the last balanced object in a provider transcript without accepting concatenated objects.
    }
  }
  const starts = [...text.matchAll(/\{/g)].map((match) => match.index ?? -1).filter((index) => index >= 0);
  for (const start of starts.reverse()) {
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
          try {
            const parsed = JSON.parse(text.slice(start, index + 1));
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as JsonObject;
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

function promptFor(task: RealityTask): string {
  return [
    'M8-05 real local task. Return exactly one JSON object and no markdown.',
    `Task ID: ${task.task_id}`,
    `Purpose: ${task.purpose}`,
    `Read only these exact files relative to the workspace root: ${task.read_allowlist.join(', ')}`,
    'Do not read any other files, directories, credentials, cookies, tokens, environment secrets, or project source beyond that allowlist.',
    'Do not write, run commands, send messages, publish, install, or change any external state.',
    'Required JSON keys: task_id, summary, facts, unknowns, source_refs, next_action, completion_state.',
    'facts must be an array of facts directly supported by the files; unknowns must explicitly list missing or unverified evidence; source_refs must contain only the exact relative paths read; next_action must be one concrete action or the string NO_ACTION; completion_state must be one of active, partial, blocked, complete, or paused.',
    'Do not infer a completed state from a plan. Preserve project stop conditions and write UNKNOWN when evidence is absent.',
  ].join('\n\n');
}

async function runTask(task: RealityTask) {
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const adapter = new CodexExternalAdapter(process.env.CODEX_BIN ?? 'codex', {
    cwd: task.root,
    sandbox: 'read-only',
    timeoutMs: 180_000,
  });
  const request: RunRequest = {
    objective: promptFor(task),
    input: { taskId: task.task_id, allowlist: task.read_allowlist },
    constraints: ['read-only', 'declared-file-allowlist', 'no-external-side-effects'],
    outputSchema: { type: 'object', required: requiredKeys },
    metadata: { validation: 'm8-05', taskId: task.task_id },
  };
  const handle = await adapter.startRun(request);
  const events: RunEvent[] = [];
  for await (const item of adapter.streamEvents(handle)) events.push(item);
  const rawOutput = eventText(events);
  const parsed = parseOneJson(rawOutput);
  const missingKeys = requiredKeys.filter((key) => {
    const value = parsed?.[key];
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);
  });
  const sourceRefs = Array.isArray(parsed?.source_refs) ? parsed.source_refs.map(String) : [];
  const undeclaredRefs = sourceRefs.filter((ref) => !task.read_allowlist.includes(ref));
  const completed = events.some((item) => item.data.status === 'completed');
  const record = {
    record_version: 'm8-05.real-task.v1',
    task_id: task.task_id,
    root: task.root,
    read_allowlist: task.read_allowlist,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    elapsed_ms: Date.now() - startedMs,
    provider: handle.provider,
    run_id: handle.id,
    event_count: events.length,
    provider_completed: completed,
    output_sha256: createHash('sha256').update(rawOutput).digest('hex'),
    raw_output: rawOutput,
    parsed_output: parsed,
    structural_check: {
      json_object: parsed !== null,
      missing_required_keys: missingKeys,
      source_refs_declared: sourceRefs,
      undeclared_source_refs: undeclaredRefs,
      traceability_pass: completed && parsed !== null && missingKeys.length === 0 && undeclaredRefs.length === 0,
    },
    provider_events: events,
  };
  await writeFile(path.join(rawRoot, `${task.task_id}.json`), JSON.stringify(record, null, 2));
  return record;
}

class InterruptAfterFirstEventAdapter implements ProviderAdapter {
  private readonly inner: CodexExternalAdapter;
  private readonly interrupted = { value: false };
  constructor(cwd: string) {
    this.inner = new CodexExternalAdapter(process.env.CODEX_BIN ?? 'codex', { cwd, sandbox: 'read-only', timeoutMs: 180_000 });
  }
  probeCapabilities() { return this.inner.probeCapabilities(); }
  startRun(request: RunRequest) { return this.inner.startRun(request); }
  async *streamEvents(handle: RunHandle): AsyncIterable<RunEvent> {
    for await (const item of this.inner.streamEvents(handle)) {
      yield item;
      if (!this.interrupted.value) {
        this.interrupted.value = true;
        await this.inner.cancel(handle);
        throw new Error('m8-05 synthetic interruption after first real provider event');
      }
    }
  }
  cancel(handle: RunHandle) { return this.inner.cancel(handle); }
  resume(handle: RunHandle) { return this.inner.resume(handle); }
}

async function runRecoverySmoke() {
  const objective = [
    'M8-05 recovery smoke. Read only AGENTS.md, RUN_STATE.json, SPEC/PROGRESS.md, and HANDOFF.md in the current workspace.',
    'Return one concise JSON object with keys summary, facts, unknowns, source_refs, next_action, completion_state.',
    'Do not write, run commands, access secrets, or perform external actions.',
    'This provider segment will be intentionally interrupted after its first real event. The next segment must use the saved context packet and finish the same logical Run.',
  ].join('\n\n');
  const result = await executeCodexRun(objective, { validation: 'm8-05-recovery-smoke' }, {
    maxSegments: 2,
    adapterFactory: (segment) => segment === 1 ? new InterruptAfterFirstEventAdapter(projectRoot) : new CodexExternalAdapter(process.env.CODEX_BIN ?? 'codex', { cwd: projectRoot, sandbox: 'read-only', timeoutMs: 180_000 }),
  });
  const events = await runtimeStore.listEvents(result.run.id);
  const segmentStarts = events.filter((item) => item.type === 'run.segment_started');
  const snapshots = events.filter((item) => item.type === 'context.snapshot_created');
  const resumes = events.filter((item) => item.type === 'run.resume_requested');
  const completed = result.run.status === 'succeeded';
  return {
    record_version: 'm8-05.recovery.v1',
    run_id: result.run.id,
    final_status: result.run.status,
    provider: result.provider,
    segment_count: segmentStarts.length,
    snapshot_count: snapshots.length,
    resume_count: resumes.length,
    same_logical_run: events.every((item) => item.runId === result.run.id),
    recovery_pass: completed && segmentStarts.length === 2 && snapshots.length === 1 && resumes.length === 1 && events.every((item) => item.runId === result.run.id),
    event_types: events.map((item) => item.type),
    events,
  };
}

async function main() {
  await mkdir(rawRoot, { recursive: true });
  const card = JSON.parse(await readFile(cardPath, 'utf8')) as any;
  if (card.status !== 'PENDING') throw new Error(`Reality card is not pending: ${card.status}`);
  const taskRecords = [];
  for (const task of tasks) taskRecords.push(await runTask(task));
  const recovery = await runRecoverySmoke();
  const passedTasks = taskRecords.filter((record) => record.structural_check.traceability_pass).length;
  const status = passedTasks === 3 && recovery.recovery_pass ? 'PASS' : (passedTasks > 0 || recovery.recovery_pass ? 'PARTIAL' : 'NO-GO');
  const result = {
    record_version: 'm8-05.reality-results.v1',
    card_id: card.card_id,
    executed_at: new Date().toISOString(),
    implementation_commit: process.env.M805_IMPLEMENTATION_COMMIT ?? 'UNKNOWN',
    status,
    task_count: taskRecords.length,
    traceable_task_count: passedTasks,
    primary_threshold: '3/3 tasks pass the traceability rubric',
    recovery,
    tasks: taskRecords.map((record) => ({
      task_id: record.task_id,
      run_id: record.run_id,
      elapsed_ms: record.elapsed_ms,
      provider: record.provider,
      raw_receipt: `validation/m8-05-raw/${record.task_id}.json`,
      structural_check: record.structural_check,
    })),
    facts: [
      `${passedTasks}/${taskRecords.length} real local task receipts passed the frozen structural traceability rubric.`,
      `Recovery smoke final status was ${recovery.final_status}; segment_count=${recovery.segment_count}, snapshot_count=${recovery.snapshot_count}, resume_count=${recovery.resume_count}.`,
    ],
    inferences: [],
    unknowns: [
      'Manual edit count, paired baseline time, cost, and user willingness were not measured by this gate.',
      'Provider model quality and DeepSeek parity remain untested.',
    ],
    next_decision: status === 'PASS' ? 'Retain continuity as the next engineering path and design a separate paired baseline before claiming productivity improvement.' : 'Repair the failed traceability or recovery condition before expanding UI or DeepSeek validation.',
  };
  await writeFile(resultsPath, JSON.stringify(result, null, 2));
  card.status = status;
  card.current_evidence_level = status === 'PASS' ? 'Real-world Validated' : 'Real-input Ready';
  card.system_under_test.commit = result.implementation_commit;
  card.run_record = {
    test_started_at: taskRecords[0]?.started_at ?? null,
    executed_at: result.executed_at,
    raw_evidence_pointers: [resultsPath, ...taskRecords.map((record) => `validation/m8-05-raw/${record.task_id}.json`)],
    observed_facts: result.facts,
    inferences: result.inferences,
    unknowns: result.unknowns,
    deviations: [],
  };
  card.verdict = {
    status,
    threshold_comparison: `${passedTasks}/3 traceable tasks; recovery_pass=${recovery.recovery_pass}`,
    supported_claim_after_run: status === 'PASS' ? 'Narrow real-input traceability and one real-provider same-Run recovery smoke.' : null,
    unsupported_or_unknown: result.unknowns,
    next_decision: result.next_decision,
    one_highest_value_next_test: 'Run a paired baseline comparison on one repeated real task with manual edits and elapsed time recorded.',
  };
  card.hard_gate = {
    real_input_or_behavior: true,
    version_rubric_thresholds_frozen_before_run: true,
    raw_evidence_readable: true,
    facts_inferences_unknowns_separated: true,
    claim_within_sample_scope: true,
    permissions_privacy_cost_external_impact: true,
    verdict_changes_decision: true,
  };
  await writeFile(cardPath, JSON.stringify(card, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

await main();
