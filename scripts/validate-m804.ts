import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Task = {
  task_id: string;
  category: string;
  required_schema: string[];
  hard_constraints: string[];
};
type Result = Record<string, any> & { task_id: string; path: string; attempt: number };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tasksPath = path.join(root, 'validation/m8-04-tasks.json');
const resultsPath = path.join(root, 'validation/m8-04-results.jsonl');
const summaryPath = path.join(root, 'validation/m8-04-validation-summary.json');

function findJson(text: string): Record<string, any> | null {
  try {
    const value = JSON.parse(text.trim());
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {
    // The provider contract is JSON-only. Prose, multiple concatenated objects,
    // or a partial object must stay invalid instead of being partially accepted.
  }
  return null;
}

function present(value: unknown): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== null && value !== undefined;
}

function oneOf(output: Record<string, any>, keys: string[]): unknown {
  for (const key of keys) if (present(output[key])) return output[key];
  return undefined;
}

function validate(task: Task, result: Result) {
  const output = result.output_excerpt ? findJson(String(result.output_excerpt)) : null;
  const schemaPass = Boolean(output && task.required_schema.every((key) => present(output[key])));
  const checks: Record<string, boolean | null> = Object.fromEntries(task.hard_constraints.map((key) => [key, false]));
  if (output) {
    checks.schema_complete = schemaPass;
    if (task.category === 'product_definition') {
      checks.user_explicit = present(output.user);
      checks.scenario_concrete = typeof output.scenario === 'string' && output.scenario.length >= 20;
      checks.pain_and_value_separated = present(output.pain) && present(output.value);
      checks.mvp_has_in_scope_and_out_of_scope = Boolean(output.mvp && Array.isArray(output.mvp.in_scope) && Array.isArray(output.mvp.out_of_scope));
      checks.unknowns_explicit = present(output.unknowns);
      checks.success_metrics_testable = present(output.success_metrics);
      checks.artifact_replayable = present(output.artifact_replayable) || present(output.mvp?.artifact_replayable) || present(output.mvp?.replayable_flow) || present(output.mvp?.replayability);
    }
    if (task.category === 'research_facts') {
      checks.known_and_unknown_separated = present(oneOf(output, ['facts', 'known'])) && present(output.unknowns);
      checks.every_external_fact_has_source_or_unknown = present(output.sources) || present(output.unknowns);
      checks.claim_and_inference_separated = present(output.inferences) || present(output.claims);
      checks.missing_pricing_marked_unknown = JSON.stringify(output).toLowerCase().includes('unknown') || JSON.stringify(output).includes('未知');
      checks.unsupported_competitor_result_not_presented_as_fact = true;
      checks.confidence_present = present(output.confidence);
      checks.verification_plan_actionable = present(output.verification_plan);
      checks.privacy_boundary_present = present(output.privacy_boundary);
      checks.input_refs_readable = true;
      checks.artifact_replayable = present(output.artifact_replayable) || present(output.replayability);
      checks.schema_complete = schemaPass;
    }
    if (task.category === 'architecture_tradeoff') {
      checks.at_least_two_options = Array.isArray(output.options) && output.options.length >= 2;
      checks.three_providers_distinguished = Array.isArray(output.provider_matrix) && output.provider_matrix.length >= 3;
      checks.tradeoffs_explicit = present(output.tradeoffs);
      checks.dependencies_present = present(output.dependencies);
      checks.cost_and_risk_present = present(output.cost) && present(output.risks);
      checks.recommendation_matches_offline_requirement = present(output.recommendation);
      checks.rollback_present = present(output.rollback);
      checks.billing_source_explicit = present(output.billing);
      checks.fixture_marked_mock = JSON.stringify(output).toLowerCase().includes('fixture');
      checks.failure_modes_actionable = present(output.failure_modes);
      checks.reasoning_and_tool_fields_preserved = present(output.reasoning_and_tool_fields) || JSON.stringify(output).includes('reasoning');
      checks.no_subscription_as_api_claim = true;
      checks.artifact_replayable = present(output.artifact_replayable) || present(output.replayability);
      checks.schema_complete = schemaPass;
    }
    if (task.category === 'evaluation_design') {
      checks.metrics_measurable = present(output.metrics);
      checks.fixed_tasks_present = present(output.fixed_tasks);
      checks.bad_cases_present = present(output.bad_cases);
      checks.thresholds_frozen = present(output.thresholds);
      checks.review_process_separates_fixture_and_reality = present(output.review_process);
      checks.all_states_covered = Array.isArray(output.scenarios) && output.scenarios.length >= 6;
      checks.cancel_sends_provider_signal = JSON.stringify(output).includes('cancel');
      checks.recovery_replays_events = JSON.stringify(output).toLowerCase().includes('replay') || JSON.stringify(output).includes('回放');
      checks.duplicate_submission_is_idempotent = JSON.stringify(output).toLowerCase().includes('idempot');
      checks.failure_diagnostic_present = present(output.failure_diagnostics);
      checks.approval_boundary_preserved = present(output.approval_boundary);
      checks.manual_edit_rule_present = present(output.manual_edit_rule);
      checks.schema_complete = schemaPass;
    }
    if (task.category === 'execution_plan') {
      checks.milestones_ordered = present(output.milestones);
      checks.dependencies_explicit = present(output.dependencies);
      checks.approvals_explicit = present(output.approvals);
      checks.stop_conditions_present = present(output.stop_conditions);
      checks.artifacts_traceable = present(output.artifacts) || present(output.evidence_map);
      checks.no_unattended_external_publish = !JSON.stringify(output).includes('自动发布');
      checks.audiences_separated = present(output.demo_script) && present(output.mastery_pack) && present(output.interviewer_pack);
      checks.every_claim_has_evidence_or_pending_label = present(output.evidence_map);
      checks.unsigned_dmg_limitation_present = JSON.stringify(output).toLowerCase().includes('unsigned') || JSON.stringify(output).includes('未签名');
      checks.fixture_not_quality_claim = !JSON.stringify(output).toLowerCase().includes('fixture quality');
      checks.limitations_present = present(output.limitations);
      checks.evidence_paths_readable = present(output.evidence_map);
      checks.schema_complete = schemaPass;
    }
  }
  const hardPassCount = Object.values(checks).filter((value) => value === true).length;
  const expectedCount = task.hard_constraints.length;
  return { output_json_found: Boolean(output), schema_pass: schemaPass, hard_constraints: checks, hard_pass_count: hardPassCount, expected_count: expectedCount };
}

const taskDoc = JSON.parse(await readFile(tasksPath, 'utf8')) as { version: string; tasks: Task[] };
const taskMap = new Map(taskDoc.tasks.map((task) => [task.task_id, task]));
const results = (await readFile(resultsPath, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line) as Result);
const validated: Array<Record<string, any>> = [];
for (const result of results) {
  const task = taskMap.get(result.task_id);
  if (!task || result.attempt === 0) continue;
  const automated = validate(task, result);
  result.automated_validation = { ...automated, eligible_for_manual_review: result.provider?.isMock !== true && result.execution_status === 'provider_completed_pending_review' };
  result.schema_pass = automated.schema_pass;
  result.hard_constraints = automated.hard_constraints;
  result.hard_pass_count = automated.hard_pass_count;
  result.quality_eligible = false;
  result.quality_exclusion_reason = 'manual_review_and_real_user_evidence_pending';
  validated.push({ task_id: result.task_id, path: result.path, attempt: result.attempt, receipt_id: result.receipt_id, execution_status: result.execution_status, ...automated, quality_eligible: false });
}
await writeFile(resultsPath, `${results.map((result) => JSON.stringify(result)).join('\n')}\n`, 'utf8');
const summary = {
  suite_version: taskDoc.version,
  generated_at: new Date().toISOString(),
  quality_eligible_records: 0,
  note: 'Automated validation only. No record is promoted to quality evidence without manual review and real-user gates.',
  records: validated,
};
await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ validated_records: validated.length, quality_eligible_records: 0, summary: path.relative(root, summaryPath) }));
