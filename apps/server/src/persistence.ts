import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createRunEventId, transitionRun } from '../../../packages/core/src/index.ts';
import type { RunStore } from '../../../packages/core/src/run-store.ts';
import type { ContextSnapshot, CreateRunInput, ProviderIdentity, Run, RunAction, RunEvent, RunId, RunSegment, RunTransitionOptions, RunTransitionResult } from '../../../packages/core/src/types.ts';

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

export const SQLITE_SCHEMA_VERSION = 2;

type SqliteMigration = { version: number; name: string; sql: string };

export const SQLITE_MIGRATIONS: SqliteMigration[] = [
  {
    version: 1,
    name: 'initial-operational-schema',
    sql: `
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
      CREATE INDEX IF NOT EXISTS idx_run_events_run_sequence
        ON run_events(run_id, sequence);

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

      CREATE TABLE IF NOT EXISTS run_segments (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        segment INTEGER NOT NULL,
        status TEXT NOT NULL,
        context_snapshot_id TEXT,
        provider_json TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        UNIQUE(run_id, segment)
      );
      CREATE INDEX IF NOT EXISTS idx_run_segments_run_segment
        ON run_segments(run_id, segment);

      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        result_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_idempotency_scope_resource
        ON idempotency_keys(scope, resource_id);
    `,
  },
  {
    version: 2,
    name: 'domain-entity-tables-and-run-store',
    sql: `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        workspace_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        archived_at TEXT
      );
      CREATE TABLE IF NOT EXISTS skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        version TEXT NOT NULL,
        instructions TEXT NOT NULL,
        input_schema_json TEXT,
        output_schema_json TEXT,
        enabled INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS bot_profiles (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        responsibility TEXT NOT NULL,
        input_schema_json TEXT NOT NULL,
        output_schema_json TEXT NOT NULL,
        skill_ids_json TEXT NOT NULL,
        tool_policy_json TEXT NOT NULL,
        provider_policy_json TEXT NOT NULL,
        memory_policy_json TEXT NOT NULL,
        approval_policy_json TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        disabled_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_bot_profiles_project ON bot_profiles(project_id, updated_at);

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        bot_id TEXT NOT NULL,
        request_json TEXT NOT NULL,
        status TEXT NOT NULL,
        version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        waiting_reason TEXT,
        result_json TEXT,
        error_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_runs_project_updated ON runs(project_id, updated_at, id);

      CREATE TABLE IF NOT EXISTS handoffs (
        id TEXT PRIMARY KEY,
        from_bot_id TEXT NOT NULL,
        to_bot_id TEXT NOT NULL,
        objective TEXT NOT NULL,
        input_refs_json TEXT NOT NULL,
        output_schema TEXT NOT NULL,
        constraints_json TEXT NOT NULL,
        approval_required INTEGER NOT NULL,
        status TEXT NOT NULL,
        depth INTEGER NOT NULL,
        parent_handoff_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        result_refs_json TEXT,
        error_json TEXT
      );
      CREATE TABLE IF NOT EXISTS approval_requests (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        action TEXT NOT NULL,
        description TEXT NOT NULL,
        permission_tier TEXT NOT NULL,
        status TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        resolved_at TEXT,
        resolved_by TEXT,
        decision_reason TEXT,
        metadata_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_approval_requests_run_status ON approval_requests(run_id, status, requested_at);

      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        uri TEXT NOT NULL,
        title TEXT,
        excerpt TEXT,
        retrieved_at TEXT NOT NULL,
        metadata_json TEXT
      );
      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        content_type TEXT NOT NULL,
        content TEXT NOT NULL,
        source_refs_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_artifacts_project_created ON artifacts(project_id, created_at, id);

      CREATE TABLE IF NOT EXISTS memory_items (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        content TEXT NOT NULL,
        source_refs_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_memory_items_project_scope ON memory_items(project_id, scope, updated_at);

      CREATE TABLE IF NOT EXISTS provider_receipts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        segment INTEGER,
        provider_json TEXT NOT NULL,
        receipt_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_provider_receipts_run_created ON provider_receipts(run_id, created_at, id);
    `,
  },
];

export function runSqliteMigrations(db: SqliteDatabase): number {
  db.exec('CREATE TABLE IF NOT EXISTS schema_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);');
  const currentRow = db.prepare("SELECT value FROM schema_meta WHERE key = 'schema_version'").get() as { value?: unknown } | undefined;
  let currentVersion = Number(currentRow?.value ?? 0);
  const recordVersion = db.prepare('INSERT OR REPLACE INTO schema_meta (key, value, updated_at) VALUES (@key, @value, @updated_at)');
  for (const migration of SQLITE_MIGRATIONS.filter((item) => item.version > currentVersion).sort((a, b) => a.version - b.version)) {
    db.exec('BEGIN');
    try {
      db.exec(migration.sql);
      recordVersion.run({ key: 'schema_version', value: String(migration.version), updated_at: new Date().toISOString() });
      db.exec('COMMIT');
      currentVersion = migration.version;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch { /* preserve the migration error */ }
      throw new Error(`SQLite migration ${migration.version} (${migration.name}) failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (currentVersion !== SQLITE_SCHEMA_VERSION) throw new Error(`Unsupported SQLite schema version: ${currentVersion}`);
  return currentVersion;
}

export type SqliteSchemaInspection =
  | { backend: 'sqlite'; mode: 'full'; driver: SqliteDriverName; version: number; tables: string[] }
  | { backend: 'jsonl'; mode: 'portable'; reason?: string };

export function inspectSqliteSchema(filePath: string): SqliteSchemaInspection {
  const opened = openSqliteDatabase(filePath);
  if (!opened.db || !opened.driver) return { backend: 'jsonl', mode: 'portable', reason: opened.reason };
  const version = runSqliteMigrations(opened.db);
  const tables = opened.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all()
    .map((row) => String((row as { name?: unknown }).name));
  opened.db.close();
  return { backend: 'sqlite', mode: 'full', driver: opened.driver, version, tables };
}

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
    runSqliteMigrations(this.db);
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

export const SQLITE_SCHEMA = SQLITE_MIGRATIONS[0].sql;

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
    runSqliteMigrations(db);
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

function optionalJson<T>(value: unknown): T | undefined {
  return value === null || value === undefined ? undefined : JSON.parse(String(value)) as T;
}

function runFromRow(row: Record<string, unknown>): Run {
  return {
    id: row.id as Run['id'],
    projectId: row.project_id as Run['projectId'],
    botId: row.bot_id as Run['botId'],
    request: JSON.parse(String(row.request_json)) as Run['request'],
    status: row.status as Run['status'],
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ...(row.started_at ? { startedAt: String(row.started_at) } : {}),
    ...(row.completed_at ? { completedAt: String(row.completed_at) } : {}),
    ...(row.waiting_reason ? { waitingReason: String(row.waiting_reason) } : {}),
    ...(optionalJson<Run['result']>(row.result_json) !== undefined ? { result: optionalJson<Run['result']>(row.result_json) } : {}),
    ...(optionalJson<Run['error']>(row.error_json) !== undefined ? { error: optionalJson<Run['error']>(row.error_json) } : {}),
  };
}

function eventFromRow(row: Record<string, unknown>): RunEvent {
  return {
    id: row.id as RunEvent['id'],
    runId: row.run_id as RunEvent['runId'],
    sequence: Number(row.sequence),
    type: row.type as RunEvent['type'],
    occurredAt: String(row.occurred_at),
    actor: JSON.parse(String(row.actor_json)),
    data: JSON.parse(String(row.data_json)),
    ...(row.correlation_id ? { correlationId: String(row.correlation_id) } : {}),
  } as RunEvent;
}

/**
 * SQLite RunStore used by the M10 transactional boundary. A single database
 * connection owns Run, RunEvent and idempotency writes so a replay cannot
 * leave a state row without its event (or the reverse).
 */
export class SqliteRunStore implements RunStore {
  readonly backend = 'sqlite' as const;
  private readonly db: SqliteDatabase;

  constructor(filePath: string, database?: SqliteDatabase) {
    const opened = database ? { db: database } : openSqliteDatabase(filePath);
    if (!opened.db) throw new Error('SQLite driver unavailable; use openEventLog() for explicit portable fallback');
    this.db = opened.db;
    runSqliteMigrations(this.db);
  }

  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch { /* preserve the transaction error */ }
      throw error;
    }
  }

  async createRun(input: CreateRunInput): Promise<Run> {
    return this.transaction(() => {
      const now = input.now ?? new Date().toISOString();
      const run: Run = {
        id: input.id ?? `run_${Date.now().toString(36)}` as Run['id'],
        projectId: input.projectId,
        botId: input.botId,
        request: JSON.parse(JSON.stringify(input.request)),
        status: 'queued',
        version: 0,
        createdAt: now,
        updatedAt: now,
      };
      const existing = this.db.prepare('SELECT id FROM runs WHERE id = @id').get({ id: run.id });
      if (existing) throw new Error(`Run already exists: ${run.id}`);
      this.db.prepare(`
        INSERT INTO runs (id, project_id, bot_id, request_json, status, version, created_at, updated_at)
        VALUES (@id, @project_id, @bot_id, @request_json, @status, @version, @created_at, @updated_at)
      `).run({
        id: run.id,
        project_id: run.projectId,
        bot_id: run.botId,
        request_json: JSON.stringify(run.request),
        status: run.status,
        version: run.version,
        created_at: run.createdAt,
        updated_at: run.updatedAt,
      });
      const event: RunEvent = {
        id: createRunEventId(),
        runId: run.id,
        sequence: 1,
        type: 'run.created',
        occurredAt: now,
        actor: { type: 'system' },
        data: { status: 'queued', projectId: run.projectId, botId: run.botId, objective: run.request.objective },
      };
      this.insertEvent(event);
      return JSON.parse(JSON.stringify(run)) as Run;
    });
  }

  async getRun(runId: RunId): Promise<Run | undefined> {
    const row = this.db.prepare('SELECT * FROM runs WHERE id = @id').get({ id: runId });
    return row ? runFromRow(row as Record<string, unknown>) : undefined;
  }

  async listRuns(projectId?: string): Promise<Run[]> {
    const rows = projectId
      ? this.db.prepare('SELECT * FROM runs WHERE project_id = @project_id ORDER BY created_at, id').all({ project_id: projectId })
      : this.db.prepare('SELECT * FROM runs ORDER BY created_at, id').all();
    return rows.map((row) => runFromRow(row as Record<string, unknown>));
  }

  async listEvents(runId: RunId): Promise<RunEvent[]> {
    return this.db.prepare('SELECT * FROM run_events WHERE run_id = @run_id ORDER BY sequence').all({ run_id: runId })
      .map((row) => eventFromRow(row as Record<string, unknown>));
  }

  appendSegment(segment: RunSegment): void {
    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO run_segments (id, run_id, segment, status, context_snapshot_id, provider_json, started_at, completed_at)
        VALUES (@id, @run_id, @segment, @status, @context_snapshot_id, @provider_json, @started_at, @completed_at)
      `).run({
        id: segment.id,
        run_id: segment.runId,
        segment: segment.sequence,
        status: segment.status,
        context_snapshot_id: segment.contextSnapshotId ?? null,
        provider_json: JSON.stringify(segment.provider),
        started_at: segment.startedAt,
        completed_at: segment.completedAt ?? null,
      });
    });
  }

  listSegments(runId: RunId): RunSegment[] {
    return this.db.prepare('SELECT * FROM run_segments WHERE run_id = @run_id ORDER BY segment').all({ run_id: runId })
      .map((row) => {
        const item = row as Record<string, unknown>;
        return {
          id: String(item.id),
          runId: item.run_id as RunId,
          sequence: Number(item.segment),
          status: item.status as RunSegment['status'],
          provider: JSON.parse(String(item.provider_json)) as ProviderIdentity,
          ...(item.context_snapshot_id ? { contextSnapshotId: String(item.context_snapshot_id) as RunSegment['contextSnapshotId'] } : {}),
          startedAt: String(item.started_at),
          ...(item.completed_at ? { completedAt: String(item.completed_at) } : {}),
        };
      });
  }

  private insertEvent(event: RunEvent): void {
    this.db.prepare(`
      INSERT INTO run_events (id, run_id, sequence, type, occurred_at, actor_json, data_json, correlation_id)
      VALUES (@id, @run_id, @sequence, @type, @occurred_at, @actor_json, @data_json, @correlation_id)
    `).run({
      id: event.id,
      run_id: event.runId,
      sequence: event.sequence,
      type: event.type,
      occurred_at: event.occurredAt,
      actor_json: JSON.stringify(event.actor),
      data_json: JSON.stringify(event.data),
      correlation_id: event.correlationId ?? null,
    });
  }

  async appendEvent(event: RunEvent): Promise<void> {
    this.transaction(() => {
      const run = this.db.prepare('SELECT id FROM runs WHERE id = @id').get({ id: event.runId });
      if (!run) throw new Error(`Cannot append event for unknown run: ${event.runId}`);
      const row = this.db.prepare('SELECT MAX(sequence) AS sequence FROM run_events WHERE run_id = @run_id').get({ run_id: event.runId }) as { sequence?: unknown } | undefined;
      const expected = Number(row?.sequence ?? 0) + 1;
      if (event.sequence !== expected) throw new Error(`Event sequence must be ${expected}, received ${event.sequence}`);
      const duplicate = this.db.prepare('SELECT id FROM run_events WHERE id = @id').get({ id: event.id });
      if (duplicate) throw new Error(`Duplicate event id: ${event.id}`);
      this.insertEvent(event);
    });
  }

  async transition(runId: RunId, action: RunAction, options: RunTransitionOptions = {}): Promise<RunTransitionResult> {
    return this.transaction(() => {
      const idempotencyKey = options.idempotencyKey;
      const storageKey = idempotencyKey ? `${runId}:${idempotencyKey}` : undefined;
      if (storageKey) {
        const previous = this.db.prepare('SELECT result_json FROM idempotency_keys WHERE key = @key').get({ key: storageKey }) as { result_json?: unknown } | undefined;
        if (previous) {
          const stored = JSON.parse(String(previous.result_json)) as { action: RunAction; result: RunTransitionResult };
          if (stored.action !== action) throw new Error(`Idempotency key already used for action ${stored.action}: ${idempotencyKey}`);
          return stored.result;
        }
      }
      const row = this.db.prepare('SELECT * FROM runs WHERE id = @id').get({ id: runId });
      if (!row) throw new Error(`Unknown run: ${runId}`);
      const current = runFromRow(row as Record<string, unknown>);
      const sequenceRow = this.db.prepare('SELECT MAX(sequence) AS sequence FROM run_events WHERE run_id = @run_id').get({ run_id: runId }) as { sequence?: unknown } | undefined;
      const result = transitionRun(current, action, options, Number(sequenceRow?.sequence ?? 0) + 1);
      this.db.prepare(`
        UPDATE runs SET status=@status, version=@version, updated_at=@updated_at,
          started_at=@started_at, completed_at=@completed_at, waiting_reason=@waiting_reason,
          result_json=@result_json, error_json=@error_json
        WHERE id=@id
      `).run({
        id: result.run.id,
        status: result.run.status,
        version: result.run.version,
        updated_at: result.run.updatedAt,
        started_at: result.run.startedAt ?? null,
        completed_at: result.run.completedAt ?? null,
        waiting_reason: result.run.waitingReason ?? null,
        result_json: result.run.result === undefined ? null : JSON.stringify(result.run.result),
        error_json: result.run.error === undefined ? null : JSON.stringify(result.run.error),
      });
      this.insertEvent(result.event);
      if (storageKey) {
        this.db.prepare(`
          INSERT INTO idempotency_keys (key, scope, resource_id, created_at, result_json)
          VALUES (@key, @scope, @resource_id, @created_at, @result_json)
        `).run({ key: storageKey, scope: 'run.transition', resource_id: String(runId), created_at: result.event.occurredAt, result_json: JSON.stringify({ action, result }) });
      }
      return result;
    });
  }

  close(): void { this.db.close(); }
}

export type SqliteRunStoreHandle = {
  backend: 'sqlite';
  driver?: SqliteDriverName;
  store: SqliteRunStore;
  close: () => void;
};

export function openSqliteRunStore(filePath: string): SqliteRunStoreHandle {
  const opened = openSqliteDatabase(filePath);
  if (!opened.db) throw new Error(`SQLite driver unavailable: ${opened.reason ?? 'unknown reason'}`);
  const store = new SqliteRunStore(filePath, opened.db);
  return { backend: 'sqlite', driver: opened.driver, store, close: () => store.close() };
}
