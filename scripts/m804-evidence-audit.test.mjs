import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { auditRecords, buildAudit } from './m804-evidence-audit.mjs';

test('M8-04 evidence audit derives replayable artifacts without promoting quality', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-m8-04-audit-'));
  const tasks = { version: 'test.v1', tasks: [{ task_id: 'T-01', required_schema: ['answer'] }] };
  const records = [{
    receipt_id: 'receipt-1', attempt: 1, task_id: 'T-01', path: 'single_call', input_hash: 'input-hash',
    provider: { isMock: false }, execution_status: 'provider_completed_pending_review', output_excerpt: '{"answer":"ok"}',
    manual_edits: { steps: null, chars: null }, reviewer: { rubric_1_5: null, notes: 'pending_manual_review' },
    usage: { input_tokens: null, output_tokens: null, total_tokens: null, cost_minor: null },
  }];
  await mkdir(path.join(dir, 'receipts'), { recursive: true });
  await writeFile(path.join(dir, 'receipts/receipt-1.json'), `${JSON.stringify(records[0])}\n`);
  const audited = await auditRecords({ tasks, records, artifactDir: path.join(dir, 'artifacts'), receiptDir: path.join(dir, 'receipts') });
  assert.equal(audited.length, 1);
  assert.equal(audited[0].artifact.valid, true);
  assert.equal(audited[0].replay.parsed_object, true);
  assert.equal(audited[0].quality_eligible, false);
  assert.deepEqual(audited[0].blocker_reasons, ['manual_edits_unrecorded', 'reviewer_rubric_unrecorded', 'usage_cost_undecidable']);
  assert.equal(audited[0].source_receipt.output_matches, true);
  const artifactText = await readFile(path.join(dir, 'artifacts', audited[0].artifact.artifact_id + '.json'), 'utf8');
  assert.match(artifactText, /"source_receipt_id": "receipt-1"/);
  await writeFile(path.join(dir, 'artifacts', audited[0].artifact.artifact_id + '.json'), `${artifactText}tampered`);
  await assert.rejects(() => auditRecords({ tasks, records, artifactDir: path.join(dir, 'artifacts'), receiptDir: path.join(dir, 'receipts') }), /immutable artifact mismatch/);
  await writeFile(path.join(dir, 'artifacts', audited[0].artifact.artifact_id + '.json'), artifactText);
  const audit = buildAudit({ tasks, records, audited, generatedAt: '2026-09-27T00:00:00.000Z' });
  assert.equal(audit.status, 'MECHANICAL_EVIDENCE_AUDITED_QUALITY_BLOCKED');
  assert.equal(audit.quality_eligible_records, 0);
  await rm(dir, { recursive: true, force: true });
});
