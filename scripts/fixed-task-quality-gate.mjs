import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const defaultTasksPath = path.join(root, 'validation/fixed-task-quality-tasks-v1.json');
export const defaultResultsPath = path.join(root, 'validation/fixed-task-quality-results-v1.jsonl');
export const defaultSummaryPath = path.join(root, 'validation/fixed-task-quality-gate-v1.json');

function textOf(value) {
  return typeof value === 'string' ? value : JSON.stringify(value ?? '');
}

function lower(value) {
  return textOf(value).toLowerCase();
}

function eventTypes(record) {
  const events = record?.response?.events ?? record?.events ?? [];
  return Array.isArray(events) ? events.map((event) => event?.type).filter((type) => typeof type === 'string') : [];
}

function toolEvents(record) {
  const events = record?.response?.events ?? record?.events ?? [];
  return Array.isArray(events) ? events.filter((event) => event?.type === 'tool.invoked' || event?.type === 'tool.completed' || event?.type === 'tool.failed') : [];
}

function artifactContent(record) {
  const artifact = record?.response?.artifact ?? record?.artifact;
  return artifact?.content ?? '';
}

function providerIsMock(record) {
  const response = record?.response ?? record;
  return response?.isMock === true || response?.run?.result?.provider?.isMock === true;
}

function hasCompleteChain(types) {
  const required = ['run.created', 'run.started', 'provider.event', 'tool.invoked', 'tool.completed', 'artifact.created', 'run.succeeded'];
  return required.every((type) => types.includes(type));
}

function hasFailureChain(types) {
  return types.includes('tool.failed') && types.includes('run.failed');
}

function firstToolPath(record) {
  const event = toolEvents(record).find((item) => item.type === 'tool.invoked' || item.type === 'tool.failed');
  return event?.data?.path ?? event?.data?.arguments?.path ?? null;
}

function check(record, task) {
  const response = record?.response ?? record;
  const types = eventTypes(record);
  const output = artifactContent(record);
  const outputText = textOf(output);
  const status = response?.status ?? response?.run?.status ?? null;
  const checks = {};
  checks.real_provider = task.expectedRunStatus === 'failed'
    ? providerIsMock(record) === false
    : response?.isMock === false && providerIsMock(record) === false;
  checks.read_tool_only = toolEvents(record).every((event) => {
    const name = event?.data?.name ?? event?.data?.tool;
    return name === 'filesystem.read' || name === 'filesystem';
  });
  checks.expected_path_only = firstToolPath(record) === task.path;
  checks.tool_result_returned = types.includes('tool.completed') && outputText.length > 0;
  checks.artifact_present = Boolean(response?.artifact) && outputText.length > 0;
  checks.event_chain_complete = hasCompleteChain(types);
  checks.unknown_boundary_requested = ['unknown', '未知', '没有提供', '未提供'].some((term) => lower(outputText).includes(term));
  checks.path_traversal_rejected = status === 'failed' && (response?.error?.code === 'tool_path_traversal' || lower(response?.error).includes('traversal') || lower(response?.error).includes('越权'));
  checks.failure_event_present = hasFailureChain(types);
  checks.no_artifact_after_rejection = !response?.artifact && !types.includes('artifact.created');
  checks.structured_sections_requested = ['facts', 'source', 'unknowns', 'next_action'].every((term) => lower(outputText).includes(term));
  const softChecks = {};
  softChecks.answer_mentions_source_path = lower(outputText).includes('fixtures/demo-project.json');
  softChecks.answer_mentions_unknowns = ['unknown', '未知', '没有提供', '未提供'].some((term) => lower(outputText).includes(term));
  softChecks.answer_explains_boundary = ['只读', '工作区', '越权', 'outside', '不允许'].some((term) => lower(outputText).includes(term));
  softChecks.answer_mentions_facts = lower(outputText).includes('facts') || lower(outputText).includes('事实');
  softChecks.answer_mentions_source = lower(outputText).includes('source') || lower(outputText).includes('来源');
  softChecks.answer_mentions_next_action = lower(outputText).includes('next_action') || lower(outputText).includes('下一步');
  const hardConstraints = Object.fromEntries((task.hardConstraints ?? []).map((key) => [key, checks[key] === true]));
  const hardPassCount = Object.values(hardConstraints).filter(Boolean).length;
  const expectedCount = Object.keys(hardConstraints).length;
  return {
    task_id: task.task_id,
    kind: task.kind,
    provider: response?.run?.result?.provider ?? response?.provider ?? null,
    requested_path: task.path,
    observed_path: firstToolPath(record),
    http_status: record?.httpStatus ?? null,
    run_status: status,
    event_types: types,
    tool_event_count: toolEvents(record).length,
    hard_constraints: hardConstraints,
    hard_pass_count: hardPassCount,
    expected_count: expectedCount,
    hard_pass: hardPassCount === expectedCount,
    soft_observations: Object.fromEntries((task.softObservations ?? []).map((key) => [key, softChecks[key] === true])),
    quality_eligible: false,
    quality_exclusion_reason: 'mechanical_gate_only_manual_review_and_real_user_evidence_pending',
  };
}

export function buildSummary({ tasks, records, generatedAt = new Date().toISOString() }) {
  const taskMap = new Map(tasks.tasks.map((task) => [task.task_id, task]));
  const evaluations = records.map((record) => {
    const task = taskMap.get(record.task_id);
    if (!task) return { task_id: record.task_id ?? null, hard_pass: false, quality_eligible: false, error: 'task_definition_missing' };
    return check(record, task);
  });
  const hardPassCount = evaluations.filter((item) => item.hard_pass).length;
  const allHardPass = evaluations.length === tasks.tasks.length && hardPassCount === evaluations.length;
  return {
    schemaVersion: 'validation.fixed-task-quality-gate.v1',
    generatedAt,
    status: allHardPass ? 'MECHANICAL_PASS_QUALITY_BLOCKED' : 'MECHANICAL_FAIL',
    decision: allHardPass
      ? '固定任务硬约束通过；仍不能宣称模型质量、成本收益或多 Bot 优势，需独立人工复核和真人门。'
      : '固定任务至少有一个硬约束未通过；保持真实 Provider 不进入默认质量结论，先修复失败边界。',
    taskCount: tasks.tasks.length,
    evaluatedCount: evaluations.length,
    hardPassCount,
    qualityEligibleCount: 0,
    evaluations,
  };
}

export async function runGate({ tasksPath = defaultTasksPath, resultsPath = defaultResultsPath, summaryPath = defaultSummaryPath } = {}) {
  const tasks = JSON.parse(await readFile(tasksPath, 'utf8'));
  const records = (await readFile(resultsPath, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const summary = buildSummary({ tasks, records });
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  return summary;
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? '')) {
  try {
    const summary = await runGate();
    console.log(JSON.stringify({ status: summary.status, hardPassCount: summary.hardPassCount, taskCount: summary.taskCount, qualityEligibleCount: summary.qualityEligibleCount }));
    if (summary.status === 'MECHANICAL_FAIL') process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
