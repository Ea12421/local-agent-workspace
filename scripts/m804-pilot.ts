import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CodexExternalAdapter } from '../packages/adapters/src/index.ts';
import type { JsonValue, RunEvent, RunRequest } from '../packages/core/src/index.ts';

type PathName = 'single_call' | 'single_bot' | 'multi_bot';
type Task = {
  task_id: string;
  category: string;
  objective: string;
  input: Record<string, unknown>;
  required_schema: string[];
  hard_constraints: string[];
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tasksPath = path.join(root, 'validation/m8-04-tasks.json');
const resultsPath = path.join(root, 'validation/m8-04-results.jsonl');
const receiptsDir = path.join(root, 'evidence/receipts');
const args = process.argv.slice(2);
const valueAfter = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const taskId = valueAfter('--task');
const requestedPath = valueAfter('--path') as PathName | 'all' | undefined;
const dryRun = args.includes('--dry-run');
const pathNames: PathName[] = requestedPath === 'all' || !requestedPath
  ? ['single_call', 'single_bot', 'multi_bot']
  : [requestedPath];

function hashInput(task: Task): string {
  return createHash('sha256').update(JSON.stringify({ objective: task.objective, input: task.input })).digest('hex');
}

function extractText(events: RunEvent[]): string {
  const chunks: string[] = [];
  for (const item of events) {
    const stream = item.data.stream as any;
    if (typeof stream === 'string') chunks.push(stream);
    const candidates = [stream?.item?.text, stream?.item?.content, stream?.text, stream?.message?.content];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) chunks.push(candidate);
      if (Array.isArray(candidate)) {
        for (const part of candidate) if (typeof part?.text === 'string') chunks.push(part.text);
      }
    }
  }
  return [...new Set(chunks)].join('\n').slice(-20_000);
}

function promptFor(task: Task, pathName: PathName, previous = ''): string {
  const schema = JSON.stringify(Object.fromEntries(task.required_schema.map((key) => [key, 'required'])), null, 2);
  const constraints = task.hard_constraints.map((item) => `- ${item}`).join('\n');
  const base = [
    `M8-04 fixed task ${task.task_id} (${task.category})`,
    `Objective: ${task.objective}`,
    `Input JSON: ${JSON.stringify(task.input)}`,
    `Required output keys: ${schema}`,
    `Hard constraints to satisfy:\n${constraints}`,
    'Return a concise JSON object only. Do not claim an external fact without a source; use unknown when evidence is absent.',
    'This is an evaluation run. Do not read credentials, cookies, tokens, or paths outside the workspace. Do not send or publish anything.',
  ];
  if (pathName === 'single_call') return [...base, 'Path: single_call. Solve the task in one structured model call with no handoff.'].join('\n\n');
  if (pathName === 'single_bot') return [...base, 'Path: single_bot. Act as one Product Builder Bot with a fixed schema, approval boundary, and traceable output.'].join('\n\n');
  return [...base, 'Path: multi_bot. Act as the coordinator for four explicit stages: Research → Product → Architecture → Evaluation. Preserve each stage output and identify any conflict before the final JSON.', previous ? `Previous stage output:\n${previous.slice(-8_000)}` : ''].filter(Boolean).join('\n\n');
}

async function runOne(adapter: CodexExternalAdapter, task: Task, pathName: PathName, previous = '') {
  const objective = promptFor(task, pathName, previous);
  const request: RunRequest = {
    objective,
    input: task.input as JsonValue,
    constraints: task.hard_constraints,
    outputSchema: Object.fromEntries(task.required_schema.map((key) => [key, 'required'])),
    metadata: { m804TaskId: task.task_id, path: pathName },
  };
  const handle = await adapter.startRun(request);
  const events: RunEvent[] = [];
  for await (const item of adapter.streamEvents(handle)) events.push(item);
  return { handle, events, output: extractText(events), completed: events.some((item) => item.data.status === 'completed') };
}

function emptyChecks(task: Task) {
  return Object.fromEntries(task.hard_constraints.map((constraint) => [constraint, null]));
}

async function main() {
  const document = JSON.parse(await readFile(tasksPath, 'utf8')) as { version: string; tasks: Task[] };
  const task = document.tasks.find((item) => item.task_id === (taskId ?? 'PB-01'));
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  if (!pathNames.every((item) => ['single_call', 'single_bot', 'multi_bot'].includes(item))) throw new Error(`Invalid path: ${requestedPath}`);
  await mkdir(receiptsDir, { recursive: true });
  const adapter = new CodexExternalAdapter(process.env.CODEX_BIN ?? 'codex', { sandbox: 'read-only' });
  const existingLines = await readFile(resultsPath, 'utf8').catch(() => '');
  const existingResults = existingLines.split('\n').filter(Boolean).map((line) => JSON.parse(line) as { task_id: string; path: string; quality_eligible?: boolean; is_mock?: boolean; attempt?: number });

  for (const pathName of pathNames) {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const attempts: Array<{ stage: string; output: string; eventCount: number; completed: boolean; identity: any; runId: string | null }> = [];
    let previous = '';
    if (dryRun) {
      const dryStages = pathName === 'multi_bot' ? ['Research', 'Product', 'Architecture', 'Evaluation'] : [pathName];
      for (const stage of dryStages) attempts.push({ stage, output: '[dry-run: provider not called]', eventCount: 0, completed: false, runId: null, identity: { harness: 'fixture', provider: 'dry-run', model: 'none', authMode: 'local', billingSource: 'local', isMock: true } });
    } else if (pathName === 'multi_bot') {
      for (const stage of ['Research', 'Product', 'Architecture', 'Evaluation']) {
        const result = await runOne(adapter, task, pathName, `${stage} stage required.\n${previous}`);
        previous = result.output;
        attempts.push({ stage, output: result.output, eventCount: result.events.length, completed: result.completed, runId: result.handle.id, identity: result.handle.provider });
      }
    } else {
      const result = await runOne(adapter, task, pathName);
      attempts.push({ stage: pathName, output: result.output, eventCount: result.events.length, completed: result.completed, runId: result.handle.id, identity: result.handle.provider });
    }
    const finishedAt = new Date().toISOString();
    const elapsedMs = Date.now() - startedMs;
    const identity = attempts[0].identity;
    // Handoffs keep every stage output in the receipt. The artifact itself must
    // be the final stage's single JSON object, otherwise concatenated stage
    // objects can look like a valid result to a permissive parser.
    const output = (pathName === 'multi_bot' ? attempts.at(-1)?.output ?? '' : attempts[0]?.output ?? '').slice(-20_000);
    const outputSha256 = createHash('sha256').update(output).digest('hex');
    const receiptId = `m804-${task.task_id}-${pathName}-${Date.now()}`;
    const attempt = dryRun ? 0 : existingResults.filter((item) => item.task_id === task.task_id && item.path === pathName && item.attempt !== 0).length + 1;
    const result = {
      record_version: 'm8-04.result.v1',
      receipt_id: receiptId,
      task_id: task.task_id,
      suite_version: document.version,
      attempt,
      category: task.category,
      path: pathName,
      input_hash: hashInput(task),
      run_ids: attempts.map((item) => item.runId),
      started_at: startedAt,
      finished_at: finishedAt,
      elapsed_ms: elapsedMs,
      provider: identity,
      artifact: { id: null, bytes: Buffer.byteLength(output), sha256: outputSha256, valid: null },
      schema_pass: null,
      hard_constraints: emptyChecks(task),
      hard_pass_count: null,
      quality_eligible: false,
      evidence_tier: dryRun ? 'harness_dry_run' : 'execution_pilot',
      quality_exclusion_reason: dryRun ? 'provider_not_called' : 'schema_and_manual_review_pending',
      manual_edits: { steps: null, chars: null, rule_version: 'm8-04.manual-edit.v1' },
      failure: attempts.every((item) => item.completed) ? null : { kind: 'provider_incomplete_or_dry_run', message: 'Provider completion or real execution was not established.', retryable: true },
      traceability_score: null,
      recovery: { attempted: false, result: null },
      approval_count: pathName === 'single_bot' || pathName === 'multi_bot' ? 1 : 0,
      event_count: attempts.reduce((sum, item) => sum + item.eventCount, 0),
      handoff_depth: pathName === 'multi_bot' ? attempts.length : 0,
      reviewer: { rubric_1_5: null, notes: 'pending_manual_review' },
      usage: { input_tokens: null, output_tokens: null, total_tokens: null, cost_minor: null },
      execution_status: dryRun ? 'dry_run' : (attempts.every((item) => item.completed) ? 'provider_completed_pending_review' : 'provider_incomplete'),
      structured_handoffs: pathName === 'multi_bot' ? attempts.map((item, index) => ({ stage: item.stage, depth: index + 1, input_ref: index === 0 ? task.task_id : `stage-${index}`, output_ref: `stage-${index + 1}`, event_count: item.eventCount })) : [],
      output_excerpt: output,
    };
    await appendFile(resultsPath, `${JSON.stringify(result)}\n`, 'utf8');
    await writeFile(path.join(receiptsDir, `${receiptId}.json`), `${JSON.stringify({ ...result, attempts: attempts.map(({ output: text, ...rest }) => ({ ...rest, output_bytes: Buffer.byteLength(text) })) }, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ receipt_id: receiptId, task_id: task.task_id, path: pathName, execution_status: result.execution_status, elapsed_ms: elapsedMs }));
  }
}

await main();
