import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSqliteConnection } from '../../apps/server/src/persistence.ts';

export const EXPORT_FORMAT = 'local-agent-workspace.export.v1';
export const EXPORT_SCHEMA_VERSION = 2;
export const EXPORT_TABLES = [
  'projects', 'skills', 'bot_profiles', 'runs', 'run_events', 'run_segments',
  'context_snapshots', 'idempotency_keys', 'handoffs', 'approval_requests',
  'sources', 'artifacts', 'memory_items', 'provider_receipts',
];

const JSON_COLUMNS = new Set([
  'request_json', 'result_json', 'error_json', 'actor_json', 'data_json',
  'provider_json', 'summary_json', 'tail_event_ids_json', 'result_refs_json',
  'metadata_json', 'input_schema_json', 'output_schema_json', 'skill_ids_json',
  'tool_policy_json', 'provider_policy_json', 'memory_policy_json',
  'approval_policy_json', 'constraints_json', 'source_refs_json',
]);

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  return JSON.stringify(value);
}

function primaryKey(table, row) {
  if (table === 'run_events') return `${row.run_id}:${row.sequence}`;
  if (table === 'run_segments') return `${row.run_id}:${row.segment}`;
  if (table === 'idempotency_keys') return String(row.key);
  return String(row.id);
}

function assertJsonColumns(table, row, errors) {
  for (const [key, value] of Object.entries(row)) {
    if (!JSON_COLUMNS.has(key) || value === null || value === undefined) continue;
    try { JSON.parse(String(value)); } catch { errors.push(`${table}.${key} is not valid JSON`); }
  }
}

function validateRows(rows) {
  const errors = [];
  const seen = new Set();
  const eventsByRun = new Map();
  for (const record of rows) {
    if (!record || typeof record !== 'object' || typeof record.table !== 'string' || !record.row || typeof record.row !== 'object') {
      errors.push('row record must contain table and row');
      continue;
    }
    if (!EXPORT_TABLES.includes(record.table)) errors.push(`unsupported table: ${record.table}`);
    const key = `${record.table}:${primaryKey(record.table, record.row)}`;
    if (seen.has(key)) errors.push(`duplicate row: ${key}`);
    seen.add(key);
    assertJsonColumns(record.table, record.row, errors);
    if (record.table === 'run_events') {
      const sequence = Number(record.row.sequence);
      if (!Number.isInteger(sequence) || sequence < 1) errors.push(`invalid event sequence: ${key}`);
      const list = eventsByRun.get(String(record.row.run_id)) ?? [];
      list.push(sequence);
      eventsByRun.set(String(record.row.run_id), list);
    }
    if (record.table === 'context_snapshots' && !/^[a-f0-9]{64}$/i.test(String(record.row.content_sha256 ?? ''))) {
      errors.push(`invalid snapshot hash: ${key}`);
    }
  }
  for (const [runId, sequences] of eventsByRun) {
    sequences.sort((a, b) => a - b);
    sequences.forEach((sequence, index) => {
      if (sequence !== index + 1) errors.push(`event sequence gap for ${runId}: expected ${index + 1}, received ${sequence}`);
    });
  }
  return errors;
}

export function parseExport(text) {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length < 1) throw new Error('export is empty');
  let manifest;
  try { manifest = JSON.parse(lines[0]); } catch { throw new Error('manifest is not valid JSON'); }
  if (manifest.format !== EXPORT_FORMAT) throw new Error(`unsupported export format: ${manifest.format ?? 'missing'}`);
  if (manifest.schemaVersion !== EXPORT_SCHEMA_VERSION) throw new Error(`unsupported export schema: ${manifest.schemaVersion ?? 'missing'}`);
  const payload = lines.slice(1).join('\n') + (lines.length > 1 ? '\n' : '');
  if (manifest.payloadSha256 !== sha256(payload)) throw new Error('payload sha256 mismatch');
  const rows = lines.slice(1).map((line, index) => {
    try { return JSON.parse(line); } catch { throw new Error(`record ${index + 1} is not valid JSON`); }
  });
  const errors = validateRows(rows);
  if (errors.length) throw new Error(`export validation failed: ${errors.join('; ')}`);
  return { manifest, rows };
}

export async function validateExport(inputPath) {
  const text = await readFile(inputPath, 'utf8');
  const parsed = parseExport(text);
  return { format: parsed.manifest.format, schemaVersion: parsed.manifest.schemaVersion, rowCount: parsed.rows.length, tables: parsed.manifest.tables };
}

export async function exportWorkspace(dbPath, outputPath) {
  const connection = openSqliteConnection(dbPath);
  try {
    const rows = [];
    const tables = [];
    for (const table of EXPORT_TABLES) {
      const tableRows = connection.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
      tables.push({ name: table, rowCount: tableRows.length });
      for (const row of tableRows) rows.push({ table, row });
    }
    const payload = rows.map(canonical).join('\n') + (rows.length ? '\n' : '');
    const manifest = {
      format: EXPORT_FORMAT,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      driver: connection.driver,
      tables,
      payloadSha256: sha256(payload),
    };
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${canonical(manifest)}\n${payload}`, 'utf8');
    return { ...manifest, rowCount: rows.length, outputPath };
  } finally {
    connection.close();
  }
}

function tableColumns(db, table) {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => String(row.name)));
}

export async function importWorkspace(inputPath, dbPath) {
  const parsed = parseExport(await readFile(inputPath, 'utf8'));
  const connection = openSqliteConnection(dbPath);
  try {
    connection.db.exec('BEGIN IMMEDIATE');
    try {
      for (const table of EXPORT_TABLES) {
        const count = Number(connection.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
        if (count > 0) throw new Error(`target table is not empty: ${table}`);
      }
      for (const record of parsed.rows) {
        const columns = tableColumns(connection.db, record.table);
        const keys = Object.keys(record.row);
        if (keys.some((key) => !columns.has(key))) throw new Error(`unknown column in ${record.table}: ${keys.find((key) => !columns.has(key))}`);
        const columnList = keys.join(', ');
        const params = Object.fromEntries(keys.map((key) => [`p_${key}`, record.row[key]]));
        const placeholders = keys.map((key) => `@p_${key}`).join(', ');
        connection.db.prepare(`INSERT INTO ${record.table} (${columnList}) VALUES (${placeholders})`).run(params);
      }
      connection.db.exec('COMMIT');
    } catch (error) {
      try { connection.db.exec('ROLLBACK'); } catch { /* preserve import failure */ }
      throw error;
    }
    return { inputPath, dbPath, importedRows: parsed.rows.length };
  } finally {
    connection.close();
  }
}

export const rebuildWorkspace = importWorkspace;

function argValue(args, flag) {
  const index = args.indexOf(flag);
  if (index < 0 || !args[index + 1]) throw new Error(`missing ${flag}`);
  return args[index + 1];
}

async function main(argv) {
  const [command, ...args] = argv;
  if (command === 'export') return console.log(JSON.stringify(await exportWorkspace(argValue(args, '--db'), argValue(args, '--out')), null, 2));
  if (command === 'validate') return console.log(JSON.stringify(await validateExport(argValue(args, '--input')), null, 2));
  if (command === 'import' || command === 'rebuild') return console.log(JSON.stringify(await importWorkspace(argValue(args, '--input'), argValue(args, '--db')), null, 2));
  throw new Error('usage: export|validate|import|rebuild --db <sqlite> --out|--input <jsonl>');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
