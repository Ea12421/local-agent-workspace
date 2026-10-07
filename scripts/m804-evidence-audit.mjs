import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultTasksPath = path.join(root, 'validation/m8-04-tasks.json');
const defaultResultsPath = path.join(root, 'validation/m8-04-results.jsonl');
const defaultArtifactDir = path.join(root, 'evidence/artifacts/m8-04');
const defaultReceiptDir = path.join(root, 'evidence/receipts');
const defaultAuditPath = path.join(root, 'validation/m8-04-quality-evidence-audit.json');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseStrictObject(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  try {
    const value = JSON.parse(text.trim());
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function missingKeys(output, requiredKeys) {
  return requiredKeys.filter((key) => {
    const value = output?.[key];
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '') || (Array.isArray(value) && value.length === 0);
  });
}

function missing(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function blockerReasons(record, artifact, task) {
  const reasons = [];
  if (!artifact.valid) reasons.push('artifact_not_strict_json_object');
  if (artifact.missing_schema_keys.length > 0) reasons.push('schema_keys_missing');
  if (record.execution_status !== 'provider_completed_pending_review') reasons.push('provider_not_completed');
  if (missing(record.manual_edits?.steps) || missing(record.manual_edits?.chars)) reasons.push('manual_edits_unrecorded');
  if (missing(record.reviewer?.rubric_1_5) || missing(record.reviewer?.notes) || record.reviewer.notes === 'pending_manual_review') reasons.push('reviewer_rubric_unrecorded');
  const usage = record.usage ?? {};
  if ([usage.input_tokens, usage.output_tokens, usage.total_tokens, usage.cost_minor].every((value) => value === null || value === undefined)) reasons.push('usage_cost_undecidable');
  if (!task) reasons.push('task_definition_missing');
  return reasons;
}

/**
 * Convert provider receipts into independently inspectable, strictly replayable evidence.
 * This never promotes quality_eligible: manual review, usage/cost and real-user
 * gates remain explicit blockers.
 */
export async function auditRecords({ tasks, records, artifactDir, receiptDir = defaultReceiptDir }) {
  const taskMap = new Map(tasks.tasks.map((task) => [task.task_id, task]));
  await mkdir(artifactDir, { recursive: true });
  const audited = [];
  for (const record of records) {
    if (!record.receipt_id || record.attempt === 0) continue;
    const output = typeof record.output_excerpt === 'string' ? record.output_excerpt : '';
    const outputSha256 = sha256(output);
    const parsed = parseStrictObject(output);
    const task = taskMap.get(record.task_id);
    const missing = missingKeys(parsed, task?.required_schema ?? []);
    const artifactId = `m804-artifact-${sha256(`${record.receipt_id}\n${outputSha256}`).slice(0, 24)}`;
    const artifactFile = `${artifactId}.json`;
    const artifactPath = path.join(artifactDir, artifactFile);
    const artifact = {
      artifact_version: 'm8-04.derived-artifact.v1',
      artifact_id: artifactId,
      source_receipt_id: record.receipt_id,
      task_id: record.task_id,
      path: record.path,
      input_hash: record.input_hash,
      output_sha256: outputSha256,
      output_bytes: Buffer.byteLength(output),
      output,
    };
    const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
    let artifactReadbackText = artifactText;
    try {
      artifactReadbackText = await readFile(artifactPath, 'utf8');
      if (artifactReadbackText !== artifactText) throw new Error(`immutable artifact mismatch: ${artifactFile}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await writeFile(artifactPath, artifactText, 'utf8');
    }
    const artifactReadback = JSON.parse(artifactReadbackText);
    const receiptPath = path.join(receiptDir, `${record.receipt_id}.json`);
    let sourceReceipt = { path: path.relative(root, receiptPath), exists: false, sha256: null, receipt_id_match: false, output_matches: false };
    try {
      const sourceText = await readFile(receiptPath, 'utf8');
      const source = JSON.parse(sourceText);
      sourceReceipt = { path: path.relative(root, receiptPath), exists: true, sha256: sha256(sourceText), receipt_id_match: source.receipt_id === record.receipt_id, output_matches: source.output_excerpt === output };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const replayOutput = typeof artifactReadback.output === 'string' ? artifactReadback.output : '';
    const replayParsed = parseStrictObject(replayOutput);
    const replayPayload = JSON.stringify({ input_hash: record.input_hash, output_sha256: sha256(replayOutput), output: replayOutput });
    const replay = {
      method: 'strict-json-parse-v1',
      replay_input_hash: record.input_hash,
      replay_result_sha256: sha256(replayPayload),
      parsed_object: replayParsed !== null,
      schema_keys_missing: missingKeys(replayParsed, task?.required_schema ?? []),
      result_matches_artifact: sha256(replayOutput) === artifactReadback.output_sha256 && replayOutput === output,
    };
    const auditedArtifact = {
      artifact_id: artifactId,
      artifact_path: path.relative(root, artifactPath),
      id_source: 'derived_from_receipt_and_output_hash',
      sha256: outputSha256,
      bytes: Buffer.byteLength(output),
      valid: replayParsed !== null && sha256(replayOutput) === artifactReadback.output_sha256 && replayOutput === output,
      missing_schema_keys: missing,
    };
    const reasons = blockerReasons(record, auditedArtifact, task);
    if (!sourceReceipt.exists || !sourceReceipt.receipt_id_match || !sourceReceipt.output_matches) reasons.push('source_receipt_unverified');
    audited.push({
      receipt_id: record.receipt_id,
      task_id: record.task_id,
      path: record.path,
      attempt: record.attempt,
      provider: record.provider,
      execution_status: record.execution_status,
      artifact: auditedArtifact,
      source_receipt: sourceReceipt,
      replay,
      manual_edits: record.manual_edits ?? null,
      reviewer: record.reviewer ?? null,
      usage: record.usage ?? null,
      quality_eligible: false,
      blocker_reasons: reasons,
    });
  }
  return audited;
}

export function buildAudit({ tasks, records, audited, sourceResults = 'validation/m8-04-results.jsonl', generatedAt = new Date().toISOString() }) {
  const blockerCounts = {};
  for (const record of audited) for (const reason of record.blocker_reasons) blockerCounts[reason] = (blockerCounts[reason] ?? 0) + 1;
  const replayPass = audited.filter((record) => record.replay.parsed_object && record.replay.result_matches_artifact).length;
  const artifactPass = audited.filter((record) => record.artifact.valid).length;
  const sourceReceiptPass = audited.filter((record) => record.source_receipt.exists && record.source_receipt.receipt_id_match && record.source_receipt.output_matches).length;
  return {
    audit_version: 'm8-04.quality-evidence-audit.v1',
    generated_at: generatedAt,
    suite_version: tasks.version,
    source_results: sourceResults,
    source_record_count: records.filter((record) => record.receipt_id && record.attempt !== 0 && record.attempt !== '0').length,
    audited_record_count: audited.length,
    unique_task_path_count: new Set(audited.map((record) => `${record.task_id}:${record.path}`)).size,
    artifact_replay: { artifact_valid_count: artifactPass, replay_pass_count: replayPass, source_receipt_verified_count: sourceReceiptPass },
    quality_eligible_records: 0,
    status: 'MECHANICAL_EVIDENCE_AUDITED_QUALITY_BLOCKED',
    blocker_counts: blockerCounts,
    decision: 'Do not promote any path or claim multi_bot quality/efficiency. Collect manual edit counts, independent reviewer rubric, usage/cost where available, then run the three-task real-user gate.',
    records: audited,
  };
}

export async function runAudit({ tasksPath = defaultTasksPath, resultsPath = defaultResultsPath, artifactDir = defaultArtifactDir, receiptDir = defaultReceiptDir, auditPath = defaultAuditPath } = {}) {
  const tasks = JSON.parse(await readFile(tasksPath, 'utf8'));
  const records = (await readFile(resultsPath, 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const audited = await auditRecords({ tasks, records, artifactDir, receiptDir });
  const audit = buildAudit({ tasks, records, audited, sourceResults: path.relative(root, resultsPath) });
  await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  return audit;
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] ?? '')) {
  const audit = await runAudit();
  console.log(JSON.stringify({ status: audit.status, audited_record_count: audit.audited_record_count, artifact_valid_count: audit.artifact_replay.artifact_valid_count, replay_pass_count: audit.artifact_replay.replay_pass_count, quality_eligible_records: audit.quality_eligible_records }));
}
