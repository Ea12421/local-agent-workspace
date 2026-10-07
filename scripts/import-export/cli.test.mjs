import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { exportWorkspace, importWorkspace, parseExport, validateExport } from './cli.mjs';
import { openSqliteConnection } from '../../apps/server/src/persistence.ts';

test('SQLite workspace exports, validates, imports and reopens from JSONL', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-m10-04-'));
  const source = path.join(dir, 'source.db');
  const exportPath = path.join(dir, 'workspace.jsonl');
  const target = path.join(dir, 'target.db');
  const sourceConnection = openSqliteConnection(source);
  sourceConnection.db.prepare('INSERT INTO projects (id, name, workspace_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('project-export', '导出项目', dir, '2026-09-27T00:00:00.000Z', '2026-09-27T00:00:00.000Z');
  sourceConnection.db.prepare('INSERT INTO runs (id, project_id, bot_id, request_json, status, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('run-export', 'project-export', 'bot-export', '{"objective":"export","input":{}}', 'queued', 0, '2026-09-27T00:00:00.000Z', '2026-09-27T00:00:00.000Z');
  sourceConnection.db.prepare('INSERT INTO run_events (id, run_id, sequence, type, occurred_at, actor_json, data_json) VALUES (?, ?, ?, ?, ?, ?, ?)').run('event-export-1', 'run-export', 1, 'run.created', '2026-09-27T00:00:00.000Z', '{"type":"system"}', '{"status":"queued"}');
  sourceConnection.db.prepare('INSERT INTO idempotency_keys (key, scope, resource_id, created_at, result_json) VALUES (?, ?, ?, ?, ?)').run('export-key', 'test', 'run-export', '2026-09-27T00:00:00.000Z', '{"ok":true}');
  sourceConnection.close();

  const exported = await exportWorkspace(source, exportPath);
  assert.equal(exported.rowCount, 4);
  const checked = await validateExport(exportPath);
  assert.equal(checked.rowCount, 4);
  const imported = await importWorkspace(exportPath, target);
  assert.equal(imported.importedRows, 4);
  const reopened = openSqliteConnection(target);
  assert.equal(reopened.db.prepare('SELECT COUNT(*) AS count FROM projects').get().count, 1);
  assert.equal(reopened.db.prepare('SELECT COUNT(*) AS count FROM run_events').get().count, 1);
  assert.equal(reopened.db.prepare('SELECT COUNT(*) AS count FROM idempotency_keys').get().count, 1);
  reopened.close();
  await rm(dir, { recursive: true, force: true });
});

test('JSONL export rejects tampering, event gaps and non-empty targets', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-m10-04-invalid-'));
  const source = path.join(dir, 'source.db');
  const exportPath = path.join(dir, 'workspace.jsonl');
  const target = path.join(dir, 'target.db');
  const connection = openSqliteConnection(source);
  connection.db.prepare('INSERT INTO projects (id, name, workspace_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('project-invalid', '项目', dir, '2026-09-27T00:00:00.000Z', '2026-09-27T00:00:00.000Z');
  connection.close();
  await exportWorkspace(source, exportPath);
  const original = await readFile(exportPath, 'utf8');
  await writeFile(exportPath, `${original}{"table":"projects","row":{"id":"tampered"}}\n`, 'utf8');
  await assert.rejects(() => validateExport(exportPath), /payload sha256 mismatch/);
  await writeFile(exportPath, original, 'utf8');
  await importWorkspace(exportPath, target);
  await assert.rejects(() => importWorkspace(exportPath, target), /target table is not empty: projects/);
  assert.equal(parseExport(original).rows.length, 1);
  const gapConnection = openSqliteConnection(source);
  gapConnection.db.prepare('INSERT INTO run_events (id, run_id, sequence, type, occurred_at, actor_json, data_json) VALUES (?, ?, ?, ?, ?, ?, ?)').run('gap-event', 'gap-run', 2, 'run.created', '2026-09-27T00:00:00.000Z', '{"type":"system"}', '{}');
  gapConnection.close();
  const gapExport = path.join(dir, 'gap.jsonl');
  await exportWorkspace(source, gapExport);
  await assert.rejects(() => validateExport(gapExport), /event sequence gap/);
  await rm(dir, { recursive: true, force: true });
});
