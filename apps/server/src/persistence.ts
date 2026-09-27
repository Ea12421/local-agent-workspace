import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createRunEventId, transitionRun } from '../../../packages/core/src/index.ts';
import type { RunStore } from '../../../packages/core/src/run-store.ts';
import type { ApprovalRequest, Artifact, BotProfile, ContextSnapshot, CreateRunInput, HandoffEnvelope, JsonObject, MemoryItem, Project, ProviderIdentity, Run, RunAction, RunEvent, RunId, RunSegment, RunTransitionOptions, RunTransitionResult, Skill, Source } from '../../../packages/core/src/types.ts';

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

export type AtomicProductBuilderCheckpoint = {
  event: PersistedEvent;
  snapshot: ContextSnapshot;
  snapshotEvent: PersistedEvent;
  idempotencyKey: string;
};

export type EventLog = JsonlEventLog | {
  backend: 'sqlite';
  append(event: PersistedEvent): Promise<void>;
  readAll(): Promise<PersistedEvent[]>;
  checkpoint?(input: AtomicProductBuilderCheckpoint): Promise<void>;
};

export type EventLogHandle = {
  backend: 'sqlite' | 'jsonl';
  mode: 'full' | 'portable';
  driver?: SqliteDriverName;
  reason?: string;
  log: EventLog;
  close?: () => void;
};

function insertSnapshotRow(db: SqliteDatabase, snapshot: ContextSnapshot): void {
  db.prepare(`
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
  `).run({
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

function createSqliteEventLog(db: SqliteDatabase): EventLog {
  runSqliteMigrations(db);
  const insert = db.prepare('INSERT INTO run_events (id, run_id, sequence, type, occurred_at, actor_json, data_json, correlation_id) VALUES (@id, @run_id, @sequence, @type, @occurred_at, @actor_json, @data_json, @correlation_id)');
  const list = db.prepare('SELECT * FROM run_events ORDER BY run_id, sequence');
  const readAll = async (): Promise<PersistedEvent[]> => list.all().map((row: any) => ({
    id: row.id,
    runId: row.run_id,
    sequence: row.sequence,
    type: row.type,
    occurredAt: row.occurred_at,
    actor: JSON.parse(row.actor_json),
    data: JSON.parse(row.data_json),
    ...(row.correlation_id ? { correlationId: row.correlation_id } : {}),
  }));
  return {
    backend: 'sqlite',
    async append(event) {
      insert.run({ id: event.id, run_id: event.runId, sequence: event.sequence, type: event.type, occurred_at: event.occurredAt, actor_json: JSON.stringify(event.actor), data_json: JSON.stringify(event.data), correlation_id: event.correlationId ?? null });
    },
    readAll,
    async checkpoint(input) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const existingKey = db.prepare('SELECT key FROM idempotency_keys WHERE key = @key').get({ key: input.idempotencyKey });
        if (existingKey) throw new Error(`Product Builder checkpoint already exists: ${input.idempotencyKey}`);
        const last = db.prepare('SELECT MAX(sequence) AS sequence FROM run_events WHERE run_id = @run_id').get({ run_id: input.event.runId }) as { sequence?: unknown } | undefined;
        const expected = Number(last?.sequence ?? 0) + 1;
        if (Number(input.event.sequence) !== expected || Number(input.snapshotEvent.sequence) !== expected + 1) {
          throw new Error(`Product Builder checkpoint sequence must continue at ${expected}`);
        }
        insert.run({ id: input.event.id, run_id: input.event.runId, sequence: input.event.sequence, type: input.event.type, occurred_at: input.event.occurredAt, actor_json: JSON.stringify(input.event.actor), data_json: JSON.stringify(input.event.data), correlation_id: input.event.correlationId ?? null });
        insertSnapshotRow(db, input.snapshot);
        insert.run({ id: input.snapshotEvent.id, run_id: input.snapshotEvent.runId, sequence: input.snapshotEvent.sequence, type: input.snapshotEvent.type, occurred_at: input.snapshotEvent.occurredAt, actor_json: JSON.stringify(input.snapshotEvent.actor), data_json: JSON.stringify(input.snapshotEvent.data), correlation_id: input.snapshotEvent.correlationId ?? null });
        db.prepare('INSERT INTO idempotency_keys (key, scope, resource_id, created_at, result_json) VALUES (@key, @scope, @resource_id, @created_at, @result_json)').run({
          key: input.idempotencyKey,
          scope: 'product_builder.checkpoint',
          resource_id: String(input.event.runId),
          created_at: input.event.occurredAt,
          result_json: JSON.stringify({ eventId: input.event.id, snapshotId: input.snapshot.id, snapshotEventId: input.snapshotEvent.id }),
        });
        db.exec('COMMIT');
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch { /* preserve the checkpoint error */ }
        throw error;
      }
    },
  };
}

export type SqliteProductBuilderContinuityHandle = {
  backend: 'sqlite';
  mode: 'full';
  driver?: SqliteDriverName;
  eventLog: EventLog;
  snapshotStore: ContextSnapshotStore;
  entityStore: SqliteEntityStore;
  close: () => void;
};

export function openSqliteProductBuilderContinuity(filePath: string): SqliteProductBuilderContinuityHandle | undefined {
  const opened = openSqliteDatabase(filePath);
  if (!opened.db || !opened.driver) return undefined;
  const eventLog = createSqliteEventLog(opened.db);
  const snapshotStore = new SqliteContextSnapshotStore(filePath, opened.db);
  const entityStore = new SqliteEntityStore(opened.db);
  return { backend: 'sqlite', mode: 'full', driver: opened.driver, eventLog, snapshotStore, entityStore, close: () => opened.db?.close() };
}

/** Uses SQLite when the optional native dependency is present, otherwise keeps the clean-checkout JSONL path usable. */
export async function openEventLog(filePath: string): Promise<EventLogHandle> {
  const opened = openSqliteDatabase(filePath);
  if (opened.db) {
    const db = opened.db;
    return {
      backend: 'sqlite',
      mode: 'full',
      driver: opened.driver,
      close: () => db.close(),
      log: createSqliteEventLog(db),
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
  private readonly failureInjector?: (phase: 'after_run_update' | 'after_event_insert' | 'after_idempotency_insert') => void;

  constructor(filePath: string, database?: SqliteDatabase, options: { failureInjector?: (phase: 'after_run_update' | 'after_event_insert' | 'after_idempotency_insert') => void } = {}) {
    const opened = database ? { db: database } : openSqliteDatabase(filePath);
    if (!opened.db) throw new Error('SQLite driver unavailable; use openEventLog() for explicit portable fallback');
    this.db = opened.db;
    this.failureInjector = options.failureInjector;
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
      this.failureInjector?.('after_run_update');
      this.insertEvent(result.event);
      this.failureInjector?.('after_event_insert');
      if (storageKey) {
        this.db.prepare(`
          INSERT INTO idempotency_keys (key, scope, resource_id, created_at, result_json)
          VALUES (@key, @scope, @resource_id, @created_at, @result_json)
        `).run({ key: storageKey, scope: 'run.transition', resource_id: String(runId), created_at: result.event.occurredAt, result_json: JSON.stringify({ action, result }) });
        this.failureInjector?.('after_idempotency_insert');
      }
      return result;
    });
  }

  /** Create a consistent SQLite backup using SQLite's own online backup primitive. */
  backupTo(filePath: string): void {
    const escaped = filePath.replaceAll("'", "''");
    this.db.exec(`VACUUM INTO '${escaped}'`);
  }

  close(): void { this.db.close(); }
}

export type ProviderReceipt = {
  id: string;
  runId: RunId;
  segment?: number;
  provider: ProviderIdentity;
  receipt: JsonObject;
  createdAt: string;
};

export type ProductBuilderEntityBundle = {
  handoffs: HandoffEnvelope[];
  approval: ApprovalRequest;
  sources: Source[];
  artifacts: Artifact[];
  memories?: MemoryItem[];
  receipts?: ProviderReceipt[];
};

/** Typed persistence for Product Builder entities on the shared SQLite connection. */
export class SqliteEntityStore {
  private readonly db: SqliteDatabase;

  constructor(database: SqliteDatabase) {
    this.db = database;
    runSqliteMigrations(this.db);
  }

  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch { /* preserve entity persistence error */ }
      throw error;
    }
  }

  private saveHandoffRow(item: HandoffEnvelope): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO handoffs (
        id, from_bot_id, to_bot_id, objective, input_refs_json, output_schema,
        constraints_json, approval_required, status, depth, parent_handoff_id,
        created_at, updated_at, result_refs_json, error_json
      ) VALUES (@id, @from_bot_id, @to_bot_id, @objective, @input_refs_json, @output_schema,
        @constraints_json, @approval_required, @status, @depth, @parent_handoff_id,
        @created_at, @updated_at, @result_refs_json, @error_json)
    `).run({
      id: item.id,
      from_bot_id: item.fromBotId,
      to_bot_id: item.toBotId,
      objective: item.objective,
      input_refs_json: JSON.stringify(item.inputRefs),
      output_schema: item.outputSchema,
      constraints_json: JSON.stringify(item.constraints),
      approval_required: item.approvalRequired ? 1 : 0,
      status: item.status,
      depth: item.depth,
      parent_handoff_id: item.parentHandoffId ?? null,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      result_refs_json: item.resultRefs ? JSON.stringify(item.resultRefs) : null,
      error_json: item.error ? JSON.stringify(item.error) : null,
    });
  }

  private saveApprovalRow(item: ApprovalRequest): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO approval_requests (
        id, project_id, run_id, action, description, permission_tier, status,
        requested_at, resolved_at, resolved_by, decision_reason, metadata_json
      ) VALUES (@id, @project_id, @run_id, @action, @description, @permission_tier, @status,
        @requested_at, @resolved_at, @resolved_by, @decision_reason, @metadata_json)
    `).run({
      id: item.id,
      project_id: item.projectId,
      run_id: item.runId,
      action: item.action,
      description: item.description,
      permission_tier: item.permissionTier,
      status: item.status,
      requested_at: item.requestedAt,
      resolved_at: item.resolvedAt ?? null,
      resolved_by: item.resolvedBy ?? null,
      decision_reason: item.decisionReason ?? null,
      metadata_json: item.metadata ? JSON.stringify(item.metadata) : null,
    });
  }

  private saveSourceRow(item: Source): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO sources (id, project_id, uri, title, excerpt, retrieved_at, metadata_json)
      VALUES (@id, @project_id, @uri, @title, @excerpt, @retrieved_at, @metadata_json)
    `).run({
      id: item.id,
      project_id: item.projectId,
      uri: item.uri,
      title: item.title ?? null,
      excerpt: item.excerpt ?? null,
      retrieved_at: item.retrievedAt,
      metadata_json: item.metadata ? JSON.stringify(item.metadata) : null,
    });
  }

  private saveArtifactRow(item: Artifact): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO artifacts (
        id, project_id, run_id, kind, name, content_type, content, source_refs_json, created_at
      ) VALUES (@id, @project_id, @run_id, @kind, @name, @content_type, @content, @source_refs_json, @created_at)
    `).run({
      id: item.id,
      project_id: item.projectId,
      run_id: item.runId,
      kind: item.kind,
      name: item.name,
      content_type: item.contentType,
      content: item.content,
      source_refs_json: JSON.stringify(item.sourceRefs),
      created_at: item.createdAt,
    });
  }

  private saveMemoryRow(item: MemoryItem): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO memory_items (
        id, project_id, scope, content, source_refs_json, created_at, updated_at
      ) VALUES (@id, @project_id, @scope, @content, @source_refs_json, @created_at, @updated_at)
    `).run({
      id: item.id,
      project_id: item.projectId,
      scope: item.scope,
      content: item.content,
      source_refs_json: JSON.stringify(item.sourceRefs),
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    });
  }

  private saveReceiptRow(item: ProviderReceipt): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO provider_receipts (id, run_id, segment, provider_json, receipt_json, created_at)
      VALUES (@id, @run_id, @segment, @provider_json, @receipt_json, @created_at)
    `).run({
      id: item.id,
      run_id: item.runId,
      segment: item.segment ?? null,
      provider_json: JSON.stringify(item.provider),
      receipt_json: JSON.stringify(item.receipt),
      created_at: item.createdAt,
    });
  }

  saveProject(item: Project): void {
    this.transaction(() => {
      this.db.prepare(`
        INSERT OR REPLACE INTO projects (id, name, description, workspace_path, created_at, updated_at, archived_at)
        VALUES (@id, @name, @description, @workspace_path, @created_at, @updated_at, @archived_at)
      `).run({
        id: item.id,
        name: item.name,
        description: item.description ?? null,
        workspace_path: item.workspacePath,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
        archived_at: item.archivedAt ?? null,
      });
    });
  }

  saveSkill(item: Skill): void {
    this.transaction(() => {
      this.db.prepare(`
        INSERT OR REPLACE INTO skills (id, name, description, version, instructions, input_schema_json, output_schema_json, enabled)
        VALUES (@id, @name, @description, @version, @instructions, @input_schema_json, @output_schema_json, @enabled)
      `).run({
        id: item.id,
        name: item.name,
        description: item.description,
        version: item.version,
        instructions: item.instructions,
        input_schema_json: item.inputSchema ? JSON.stringify(item.inputSchema) : null,
        output_schema_json: item.outputSchema ? JSON.stringify(item.outputSchema) : null,
        enabled: item.enabled ? 1 : 0,
      });
    });
  }

  saveBotProfile(item: BotProfile): void {
    this.transaction(() => {
      this.db.prepare(`
        INSERT OR REPLACE INTO bot_profiles (
          id, project_id, name, description, responsibility, input_schema_json,
          output_schema_json, skill_ids_json, tool_policy_json, provider_policy_json,
          memory_policy_json, approval_policy_json, enabled, created_at, updated_at, disabled_at
        ) VALUES (@id, @project_id, @name, @description, @responsibility, @input_schema_json,
          @output_schema_json, @skill_ids_json, @tool_policy_json, @provider_policy_json,
          @memory_policy_json, @approval_policy_json, @enabled, @created_at, @updated_at, @disabled_at)
      `).run({
        id: item.id,
        project_id: item.projectId,
        name: item.name,
        description: item.description,
        responsibility: item.responsibility,
        input_schema_json: JSON.stringify(item.inputSchema),
        output_schema_json: JSON.stringify(item.outputSchema),
        skill_ids_json: JSON.stringify(item.skillIds),
        tool_policy_json: JSON.stringify(item.toolPolicy),
        provider_policy_json: JSON.stringify(item.providerPolicy),
        memory_policy_json: JSON.stringify(item.memoryPolicy),
        approval_policy_json: JSON.stringify(item.approvalPolicy),
        enabled: item.enabled ? 1 : 0,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
        disabled_at: item.disabledAt ?? null,
      });
    });
  }

  listProjects(): Project[] {
    return this.db.prepare('SELECT * FROM projects ORDER BY updated_at, id').all().map((row: any) => ({
      id: row.id,
      name: row.name,
      ...(row.description ? { description: row.description } : {}),
      workspacePath: row.workspace_path,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.archived_at ? { archivedAt: row.archived_at } : {}),
    }));
  }

  listSkills(): Skill[] {
    return this.db.prepare('SELECT * FROM skills ORDER BY name, version, id').all().map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      version: row.version,
      instructions: row.instructions,
      ...(row.input_schema_json ? { inputSchema: JSON.parse(row.input_schema_json) } : {}),
      ...(row.output_schema_json ? { outputSchema: JSON.parse(row.output_schema_json) } : {}),
      enabled: Boolean(row.enabled),
    }));
  }

  listBotProfiles(projectId?: string): BotProfile[] {
    const rows = projectId
      ? this.db.prepare('SELECT * FROM bot_profiles WHERE project_id = @project_id ORDER BY updated_at, id').all({ project_id: projectId })
      : this.db.prepare('SELECT * FROM bot_profiles ORDER BY updated_at, id').all();
    return rows.map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      description: row.description,
      responsibility: row.responsibility,
      inputSchema: JSON.parse(row.input_schema_json),
      outputSchema: JSON.parse(row.output_schema_json),
      skillIds: JSON.parse(row.skill_ids_json),
      toolPolicy: JSON.parse(row.tool_policy_json),
      providerPolicy: JSON.parse(row.provider_policy_json),
      memoryPolicy: JSON.parse(row.memory_policy_json),
      approvalPolicy: JSON.parse(row.approval_policy_json),
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.disabled_at ? { disabledAt: row.disabled_at } : {}),
    }));
  }

  resolveApproval(runId: string, status: ApprovalRequest['status'], resolvedBy = 'user', decisionReason?: string): number {
    const result = this.db.prepare(`
      UPDATE approval_requests
      SET status = @status, resolved_at = @resolved_at, resolved_by = @resolved_by, decision_reason = @decision_reason
      WHERE run_id = @run_id AND status = 'pending'
    `).run({ status, resolved_at: new Date().toISOString(), resolved_by: resolvedBy, decision_reason: decisionReason ?? null, run_id: runId }) as { changes?: unknown };
    return Number(result?.changes ?? 0);
  }

  saveProductBuilderEntities(bundle: ProductBuilderEntityBundle): void {
    this.transaction(() => {
      for (const item of bundle.handoffs) this.saveHandoffRow(item);
      this.saveApprovalRow(bundle.approval);
      for (const item of bundle.sources) this.saveSourceRow(item);
      for (const item of bundle.artifacts) this.saveArtifactRow(item);
      for (const item of bundle.memories ?? []) this.saveMemoryRow(item);
      for (const item of bundle.receipts ?? []) this.saveReceiptRow(item);
    });
  }

  listHandoffs(): HandoffEnvelope[] {
    return this.db.prepare('SELECT * FROM handoffs ORDER BY created_at, id').all().map((row: any) => ({
      id: row.id,
      fromBotId: row.from_bot_id,
      toBotId: row.to_bot_id,
      objective: row.objective,
      inputRefs: JSON.parse(row.input_refs_json),
      outputSchema: row.output_schema,
      constraints: JSON.parse(row.constraints_json),
      approvalRequired: Boolean(row.approval_required),
      status: row.status,
      depth: Number(row.depth),
      ...(row.parent_handoff_id ? { parentHandoffId: row.parent_handoff_id } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(row.result_refs_json ? { resultRefs: JSON.parse(row.result_refs_json) } : {}),
      ...(row.error_json ? { error: JSON.parse(row.error_json) } : {}),
    }));
  }

  listApprovals(projectId?: string): ApprovalRequest[] {
    const rows = projectId
      ? this.db.prepare('SELECT * FROM approval_requests WHERE project_id = @project_id ORDER BY requested_at, id').all({ project_id: projectId })
      : this.db.prepare('SELECT * FROM approval_requests ORDER BY requested_at, id').all();
    return rows.map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      runId: row.run_id,
      action: row.action,
      description: row.description,
      permissionTier: row.permission_tier,
      status: row.status,
      requestedAt: row.requested_at,
      ...(row.resolved_at ? { resolvedAt: row.resolved_at } : {}),
      ...(row.resolved_by ? { resolvedBy: row.resolved_by } : {}),
      ...(row.decision_reason ? { decisionReason: row.decision_reason } : {}),
      ...(row.metadata_json ? { metadata: JSON.parse(row.metadata_json) } : {}),
    }));
  }

  listSources(projectId?: string): Source[] {
    const rows = projectId
      ? this.db.prepare('SELECT * FROM sources WHERE project_id = @project_id ORDER BY retrieved_at, id').all({ project_id: projectId })
      : this.db.prepare('SELECT * FROM sources ORDER BY retrieved_at, id').all();
    return rows.map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      uri: row.uri,
      ...(row.title ? { title: row.title } : {}),
      ...(row.excerpt ? { excerpt: row.excerpt } : {}),
      retrievedAt: row.retrieved_at,
      ...(row.metadata_json ? { metadata: JSON.parse(row.metadata_json) } : {}),
    }));
  }

  listArtifacts(projectId?: string): Artifact[] {
    const rows = projectId
      ? this.db.prepare('SELECT * FROM artifacts WHERE project_id = @project_id ORDER BY created_at, id').all({ project_id: projectId })
      : this.db.prepare('SELECT * FROM artifacts ORDER BY created_at, id').all();
    return rows.map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      runId: row.run_id,
      kind: row.kind,
      name: row.name,
      contentType: row.content_type,
      content: row.content,
      sourceRefs: JSON.parse(row.source_refs_json),
      createdAt: row.created_at,
    }));
  }

  listMemories(projectId?: string): MemoryItem[] {
    const rows = projectId
      ? this.db.prepare('SELECT * FROM memory_items WHERE project_id = @project_id ORDER BY updated_at, id').all({ project_id: projectId })
      : this.db.prepare('SELECT * FROM memory_items ORDER BY updated_at, id').all();
    return rows.map((row: any) => ({
      id: row.id,
      projectId: row.project_id,
      scope: row.scope,
      content: row.content,
      sourceRefs: JSON.parse(row.source_refs_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  listReceipts(runId?: string): ProviderReceipt[] {
    const rows = runId
      ? this.db.prepare('SELECT * FROM provider_receipts WHERE run_id = @run_id ORDER BY created_at, id').all({ run_id: runId })
      : this.db.prepare('SELECT * FROM provider_receipts ORDER BY created_at, id').all();
    return rows.map((row: any) => ({
      id: row.id,
      runId: row.run_id,
      ...(row.segment === null ? {} : { segment: Number(row.segment) }),
      provider: JSON.parse(row.provider_json),
      receipt: JSON.parse(row.receipt_json),
      createdAt: row.created_at,
    }));
  }
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
