import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openSqliteConnection } from '../apps/server/src/persistence.ts';

export async function runScale(dbPath, eventCount = 10_000) {
  if (!Number.isInteger(eventCount) || eventCount < 2) throw new Error('eventCount must be an integer >= 2');
  const startedAt = performance.now();
  const connection = openSqliteConnection(dbPath);
  try {
    connection.db.exec('BEGIN IMMEDIATE');
    try {
      connection.db.prepare('INSERT INTO runs (id, project_id, bot_id, request_json, status, version, created_at, updated_at) VALUES (@id, @project_id, @bot_id, @request_json, @status, @version, @created_at, @updated_at)').run({
        id: 'run-scale', project_id: 'project-scale', bot_id: 'bot-scale', request_json: JSON.stringify({ objective: 'scale validation', input: {} }), status: 'running', version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });
      const insert = connection.db.prepare('INSERT INTO run_events (id, run_id, sequence, type, occurred_at, actor_json, data_json) VALUES (@id, @run_id, @sequence, @type, @occurred_at, @actor_json, @data_json)');
      const now = new Date().toISOString();
      insert.run({ id: 'event-scale-1', run_id: 'run-scale', sequence: 1, type: 'run.created', occurred_at: now, actor_json: '{"type":"system"}', data_json: '{"status":"running"}' });
      for (let sequence = 2; sequence <= eventCount; sequence += 1) {
        insert.run({ id: `event-scale-${sequence}`, run_id: 'run-scale', sequence, type: 'provider.event', occurred_at: now, actor_json: '{"type":"provider","provider":"fixture"}', data_json: JSON.stringify({ sequence }) });
      }
      connection.db.exec('COMMIT');
    } catch (error) {
      try { connection.db.exec('ROLLBACK'); } catch { /* preserve scale failure */ }
      throw error;
    }
  } finally {
    connection.close();
  }
  const reopened = openSqliteConnection(dbPath);
  try {
    const count = Number(reopened.db.prepare("SELECT COUNT(*) AS count FROM run_events WHERE run_id = 'run-scale'").get().count);
    const range = reopened.db.prepare("SELECT MIN(sequence) AS first, MAX(sequence) AS last FROM run_events WHERE run_id = 'run-scale'").get();
    return { dbPath, driver: reopened.driver, eventCount: count, firstSequence: Number(range.first), lastSequence: Number(range.last), durationMs: Math.round(performance.now() - startedAt) };
  } finally {
    reopened.close();
  }
}

async function main(argv) {
  const eventsIndex = argv.indexOf('--events');
  const eventCount = eventsIndex >= 0 ? Number(argv[eventsIndex + 1]) : 10_000;
  const dbIndex = argv.indexOf('--db');
  const tempDir = dbIndex >= 0 ? undefined : await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-m10-06-'));
  const dbPath = dbIndex >= 0 ? argv[dbIndex + 1] : path.join(tempDir, 'scale.db');
  console.log(JSON.stringify(await runScale(dbPath, eventCount), null, 2));
}

if (process.argv[1]?.endsWith('m10-06-scale.mjs')) main(process.argv.slice(2)).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
