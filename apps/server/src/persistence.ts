import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { ContextSnapshot } from '../../../packages/core/src/types.ts';

export type PersistedEvent = Record<string, unknown>;

type SqliteStatement = {
  run(params?: Record<string, unknown>): unknown;
  all(params?: Record<string, unknown>): unknown[];
  get(params?: Record<string, unknown>): unknown;
};

type SqliteDatabase = {
  exec(sql: string): void;
  pragma?(sql: string): unknown;
  prepare(sql: string): SqliteStatement;
  close(): void;
};

type SqliteDriver = new (filePath: string) => SqliteDatabase;
type SqliteDriverName = 'better-sqlite3' | 'node:sqlite';

function loadSqliteDriver(): { driver?: SqliteDriver; name?: SqliteDriverName; reason?: string } {
  const reasons: string[] = [];
  try {
    const require = createRequire(import.meta.url);
    const module = require('better-sqlite3') as { default?: SqliteDriver } | SqliteDriver;
    return { driver: (module as { default?: SqliteDriver }).default ?? module as SqliteDriver, name: 'better-sqlite3' };
  } catch (error) {
    reasons.push(`better-sqlite3: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    const require = createRequire(import.meta.url);
    const module = require('node:sqlite') as { DatabaseSync?: SqliteDriver };
    if (module.DatabaseSync) return { driver: module.DatabaseSync, name: 'node:sqlite' };
    reasons.push('node:sqlite: DatabaseSync is unavailable');
  } catch (error) {
    reasons.push(`node:sqlite: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { reason: reasons.join('; ') };
}

function configureSqliteDatabase(db: SqliteDatabase): void {
  if (db.pragma) {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    return;
  }
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
}

function openSqliteDatabase(filePath: string): { db?: SqliteDatabase; driver?: SqliteDriverName; reason?: string } {
  const loaded = loadSqliteDriver();
  if (!loaded.driver || !loaded.name) return { reason: loaded.reason };
  try {
    const db = new loaded.driver(filePath);
    configureSqliteDatabase(db);
    return { db, driver: loaded.name };
  } catch (error) {
    const primaryReason = `${loaded.name}: ${error instanceof Error ? error.message : String(error)}`;
    if (loaded.name === 'better-sqlite3') {
      try {
        const require = createRequire(import.meta.url);
        const module = require('node:sqlite') as { DatabaseSync?: SqliteDriver };
        if (module.DatabaseSync) {
          const db = new module.DatabaseSync(filePath);
          configureSqliteDatabase(db);
          return { db, driver: 'node:sqlite' };
        }
      } catch (fallbackError) {
        return { reason: `${primaryReason}; node:sqlite: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}` };
      }
    }
    return { reason: primaryReason };
  }
}

function portablePath(filePath: string): string {
  return filePath.endsWith('.jsonl') ? filePath : `${filePath}.jsonl`;
}

/**
 * Append-only event log used when the optional SQLite native module is not
 * installed. The public API is intentionally storage-neutral so the server
 * can run from a clean checkout and upgrade to SQLite without changing the
 * domain or HTTP contract.
 */
export class JsonlEventLog {
  readonly backend = 'jsonl' as const;
  private readonly filePath: string;
  constructor(filePath: string) { this.filePath = filePath; }

  async append(event: PersistedEvent): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await appendFile(this.filePath, `${JSON.stringify(event)}\n`, 'utf8');
  }

  async readAll(): Promise<PersistedEvent[]> {
    try {
      const text = await readFile(this.filePath, 'utf8');
      return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as PersistedEvent);
    } catch (error: any) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }
}

export interface ContextSnapshotStore {
  append(snapshot: ContextSnapshot): Promise<void>;
  readAll(): Promise<ContextSnapshot[]>;
  latest(projectId: string, runId: string): Promise<ContextSnapshot | undefined>;
  close?(): void;
}

export type ContextSnapshotStoreBackend = 'sqlite' | 'jsonl';

export type ContextSnapshotStoreHandle = {
  backend: ContextSnapshotStoreBackend;
  mode: 'full' | 'portable';
  driver?: SqliteDriverName;
  store: ContextSnapshotStore;
  reason?: string;
  close?: () => void;
};

/**
 * Append-only ContextSnapshot storage for clean checkouts and crash recovery.
 *
 * Snapshots are immutable records. The store rejects duplicate snapshot ids
 * before appending, while keeping the original RunEvent log untouched.
 */
export class JsonlContextSnapshotStore implements ContextSnapshotStore {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) { this.filePath = filePath; }

  async append(snapshot: ContextSnapshot): Promise<void> {
    const operation = this.writeQueue.then(async () => {
      const existing = await this.readAll();
      if (existing.some((item) => item.id === snapshot.id)) {
        throw new Error(`Context snapshot already exists: ${snapshot.id}`);
      }
      await mkdir(path.dirname(this.filePath), { recursive: true });
      await appendFile(this.filePath, `${JSON.stringify(snapshot)}\n`, 'utf8');
    });
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  async readAll(): Promise<ContextSnapshot[]> {
    try {
      const text = await readFile(this.filePath, 'utf8');
      return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as ContextSnapshot);
    } catch (error: any) {
      if (error?.code === 'ENOENT') return [];
      throw error;
    }
  }

  async latest(projectId: string, runId: string): Promise<ContextSnapshot | undefined> {
    const matching = (await this.readAll())
      .filter((snapshot) => snapshot.projectId === projectId && snapshot.runId === runId)
      .sort((a, b) => {
        const createdAt = a.createdAt.localeCompare(b.createdAt);
        if (createdAt !== 0) return createdAt;
        return a.covers.toSequence - b.covers.toSequence;
      });
    return matching.at(-1);
  }
}

const CONTEXT_SNAPSHOT_SCHEMA = `
CREATE TABLE IF NOT EXISTS context_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  parent_snapshot_id TEXT,
  covers_from_sequence INTEGER NOT NULL,
  covers_to_sequence INTEGER NOT NULL,
  trigger TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  tail_event_ids_json TEXT NOT NULL,
  token_estimate INTEGER NOT NULL,
  summary_token_estimate INTEGER NOT NULL,
  content_sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_context_snapshots_project_run_created
  ON context_snapshots(project_id, run_id, created_at, covers_to_sequence);
`;

function snapshotFromRow(row: Record<string, unknown>): ContextSnapshot {
  return {
    id: row.id as ContextSnapshot['id'],
    schemaVersion: row.schema_version as ContextSnapshot['schemaVersion'],
    projectId: row.project_id as ContextSnapshot['projectId'],
    runId: row.run_id as ContextSnapshot['runId'],
    ...(row.parent_snapshot_id ? { parentSnapshotId: row.parent_snapshot_id as ContextSnapshot['parentSnapshotId'] } : {}),
    covers: { fromSequence: Number(row.covers_from_sequence), toSequence: Number(row.covers_to_sequence) },
    trigger: row.trigger as ContextSnapshot['trigger'],
    summary: JSON.parse(String(row.summary_json)),
    tailEventIds: JSON.parse(String(row.tail_event_ids_json)),
    tokenEstimate: Number(row.token_estimate),
    summaryTokenEstimate: Number(row.summary_token_estimate),
    contentSha256: String(row.content_sha256),
    createdAt: String(row.created_at),
    createdBy: row.created_by as ContextSnapshot['createdBy'],
  };
}

/** SQLite is the operational store. JSONL remains an explicit portable fallback. */
export class SqliteContextSnapshotStore implements ContextSnapshotStore {
  readonly backend = 'sqlite' as const;
  private readonly db: SqliteDatabase;
  private readonly findById: SqliteStatement;
  private readonly insert: SqliteStatement;
  private readonly list: SqliteStatement;
  private readonly latestForRun: SqliteStatement;

  constructor(filePath: string, database?: SqliteDatabase) {
    const opened = database ? { db: database } : openSqliteDatabase(filePath);
    if (!opened.db) throw new Error('SQLite driver unavailable; use openContextSnapshotStore() for explicit portable fallback');
    this.db = opened.db;
    this.db.exec(CONTEXT_SNAPSHOT_SCHEMA);
    this.findById = this.db.prepare('SELECT id FROM context_snapshots WHERE id = @id');
    this.insert = this.db.prepare(`
      INSERT INTO context_snapshots (
        id, project_id, run_id, schema_version, parent_snapshot_id,
        covers_from_sequence, covers_to_sequence, trigger, summary_json,
        tail_event_ids_json, token_estimate, summary_token_estimate,
        content_sha256, created_at, created_by
      ) VALUES (
        @id, @project_id, @run_id, @schema_version, @parent_snapshot_id,
        @covers_from_sequence, @covers_to_sequence, @trigger, @summary_json,
        @tail_event_ids_json, @token_estimate, @summary_token_estimate,
        @content_sha256, @created_at, @created_by
      )
    `);
    this.list = this.db.prepare('SELECT * FROM context_snapshots ORDER BY created_at, covers_to_sequence, id');
    this.latestForRun = this.db.prepare(`
      SELECT * FROM context_snapshots
      WHERE project_id = @project_id AND run_id = @run_id
      ORDER BY created_at DESC, covers_to_sequence DESC, id DESC
      LIMIT 1
    `);
  }

  async append(snapshot: ContextSnapshot): Promise<void> {
    if (this.findById.get({ id: snapshot.id })) throw new Error(`Context snapshot already exists: ${snapshot.id}`);
    this.insert.run({
      id: snapshot.id,
      project_id: snapshot.projectId,
      run_id: snapshot.runId,
      schema_version: snapshot.schemaVersion,
      parent_snapshot_id: snapshot.parentSnapshotId ?? null,
      covers_from_sequence: snapshot.covers.fromSequence,
      covers_to_sequence: snapshot.covers.toSequence,
      trigger: snapshot.trigger,
      summary_json: JSON.stringify(snapshot.summary),
      tail_event_ids_json: JSON.stringify(snapshot.tailEventIds),
      token_estimate: snapshot.tokenEstimate,
      summary_token_estimate: snapshot.summaryTokenEstimate,
      content_sha256: snapshot.contentSha256,
      created_at: snapshot.createdAt,
      created_by: snapshot.createdBy,
    });
  }

  async readAll(): Promise<ContextSnapshot[]> {
    return this.list.all().map((row) => snapshotFromRow(row as Record<string, unknown>));
  }

  async latest(projectId: string, runId: string): Promise<ContextSnapshot | undefined> {
    const row = this.latestForRun.get({ project_id: projectId, run_id: runId });
    return row ? snapshotFromRow(row as Record<string, unknown>) : undefined;
  }

  close(): void { this.db.close(); }
}

export function openContextSnapshotStore(filePath: string): ContextSnapshotStoreHandle {
  const opened = openSqliteDatabase(filePath);
  if (opened.db && opened.driver) {
    const store = new SqliteContextSnapshotStore(filePath, opened.db);
    return { backend: 'sqlite', mode: 'full', driver: opened.driver, store, close: () => store.close() };
  }
  return {
    backend: 'jsonl',
    mode: 'portable',
    store: new JsonlContextSnapshotStore(portablePath(filePath)),
    reason: opened.reason ?? 'SQLite driver unavailable',
  };
}

export const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  actor_json TEXT NOT NULL,
  data_json TEXT NOT NULL,
  correlation_id TEXT,
  UNIQUE(run_id, sequence)
);
`;

export type EventLog = JsonlEventLog | { backend: 'sqlite'; append(event: PersistedEvent): Promise<void>; readAll(): Promise<PersistedEvent[]> };

export type EventLogHandle = {
  backend: 'sqlite' | 'jsonl';
  mode: 'full' | 'portable';
  driver?: SqliteDriverName;
  reason?: string;
  log: EventLog;
  close?: () => void;
};

/** Uses SQLite when the optional native dependency is present, otherwise keeps the clean-checkout JSONL path usable. */
export async function openEventLog(filePath: string): Promise<EventLogHandle> {
  const opened = openSqliteDatabase(filePath);
  if (opened.db) {
    const db = opened.db;
    db.exec(SQLITE_SCHEMA);
    const insert = db.prepare('INSERT INTO run_events (id, run_id, sequence, type, occurred_at, actor_json, data_json, correlation_id) VALUES (@id, @run_id, @sequence, @type, @occurred_at, @actor_json, @data_json, @correlation_id)');
    const list = db.prepare('SELECT * FROM run_events ORDER BY run_id, sequence');
    return {
      backend: 'sqlite',
      mode: 'full',
      driver: opened.driver,
      close: () => db.close(),
      log: {
        backend: 'sqlite',
        async append(event) {
          insert.run({ id: event.id, run_id: event.runId, sequence: event.sequence, type: event.type, occurred_at: event.occurredAt, actor_json: JSON.stringify(event.actor), data_json: JSON.stringify(event.data), correlation_id: event.correlationId ?? null });
        },
        async readAll() {
          return list.all().map((row: any) => ({
            id: row.id,
            runId: row.run_id,
            sequence: row.sequence,
            type: row.type,
            occurredAt: row.occurred_at,
            actor: JSON.parse(row.actor_json),
            data: JSON.parse(row.data_json),
            ...(row.correlation_id ? { correlationId: row.correlation_id } : {}),
          }));
        },
      },
    };
  }
  return { backend: 'jsonl', mode: 'portable', reason: opened.reason, log: new JsonlEventLog(portablePath(filePath)) };
}
