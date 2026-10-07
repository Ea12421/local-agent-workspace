import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { createRunEventId, currentAttemptTerminalEvent, prepareRetryTransition, semanticEventKey, transitionRun } from '../../../packages/core/src/index.ts';
import type { RunStore } from '../../../packages/core/src/run-store.ts';
import { validateExecutionPlan } from '../../../packages/core/src/orchestrator.ts';
import type { ExecutionPlan, ExecutionPlanStep } from '../../../packages/core/src/orchestrator.ts';
import type { ApprovalRequest, Artifact, BotProfile, ContextSnapshot, CreateRunInput, HandoffEnvelope, JsonObject, MemoryItem, Project, ProviderConnection, ProviderIdentity, ProjectProviderBinding, Run, RunAction, RunEvent, RunId, RunSegment, RunTransitionOptions, RunTransitionResult, Session, SessionMessage, Skill, Source } from '../../../packages/core/src/types.ts';

export type PersistedEvent = Record<string, unknown>;

type SqliteStatement = {
  run(params?: Record<string, unknown>): unknown;
  all(params?: Record<string, unknown>): unknown[];
  get(params?: Record<string, unknown>): unknown;
};

export type SqliteDatabase = {
  exec(sql: string): void;
  pragma?(sql: string): unknown;
  prepare(sql: string): SqliteStatement;
  close(): void;
};

type SqliteDriver = new (filePath: string) => SqliteDatabase;
export type SqliteDriverName = 'better-sqlite3' | 'node:sqlite';

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

function openDriverWithRetry(filePath: string, driver: SqliteDriver, name: SqliteDriverName): { db?: SqliteDatabase; driver?: SqliteDriverName; reason?: string } {
  const maxAttempts = 8;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const db = new driver(filePath);
      configureSqliteDatabase(db);
      return { db, driver: name };
    } catch (error) {
      lastError = error;
      if (!sqliteBusy(error) || attempt === maxAttempts) break;
      sleepSync(attempt * 50);
    }
  }
  return { reason: `${name}: ${lastError instanceof Error ? lastError.message : String(lastError)}` };
}

function openSqliteDatabase(filePath: string): { db?: SqliteDatabase; driver?: SqliteDriverName; reason?: string } {
  const loaded = loadSqliteDriver();
  if (!loaded.driver || !loaded.name) return { reason: loaded.reason };
  const primary = openDriverWithRetry(filePath, loaded.driver, loaded.name);
  if (primary.db || loaded.name !== 'better-sqlite3') return primary;
  try {
    const require = createRequire(import.meta.url);
    const module = require('node:sqlite') as { DatabaseSync?: SqliteDriver };
    if (!module.DatabaseSync) return { reason: `${primary.reason}; node:sqlite: DatabaseSync is unavailable` };
    const fallback = openDriverWithRetry(filePath, module.DatabaseSync, 'node:sqlite');
    return fallback.db ? fallback : { reason: `${primary.reason}; ${fallback.reason}` };
  } catch (fallbackError) {
    return { reason: `${primary.reason}; node:sqlite: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}` };
  }
}

/** Shared SQLite connection boundary for maintenance tools such as export/import. */
export function openSqliteConnection(filePath: string): { db: SqliteDatabase; driver: SqliteDriverName; close: () => void } {
  const opened = openSqliteDatabase(filePath);
  if (!opened.db || !opened.driver) throw new Error(`SQLite driver unavailable: ${opened.reason ?? 'unknown reason'}`);
  runSqliteMigrations(opened.db);
  return { db: opened.db, driver: opened.driver, close: () => opened.db?.close() };
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
    const existing = await this.readAll();
    const incoming = event as unknown as RunEvent;
    const sameRun = existing.filter((item) => item.runId === event.runId);
    if (sameRun.some((item) => item.id === event.id)) return;
    const incomingKey = semanticEventKey(incoming);
    if (incomingKey && sameRun.some((item) => semanticEventKey(item as unknown as RunEvent) === incomingKey)) return;
    const existingTerminal = currentAttemptTerminalEvent(sameRun as unknown as RunEvent[]);
    if (existingTerminal && currentAttemptTerminalEvent([incoming])) {
      throw new Error(`Cannot append terminal event after ${String(existingTerminal.type)}`);
    }
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

export const SQLITE_SCHEMA_VERSION = 4;

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
  {
    version: 3,
    name: 'provider-bindings-sessions-policy-audit',
    sql: `
      CREATE TABLE IF NOT EXISTS provider_connections (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        provider TEXT NOT NULL,
        harness TEXT NOT NULL,
        auth_mode TEXT NOT NULL,
        billing_source TEXT NOT NULL,
        secret_ref_json TEXT,
        status TEXT NOT NULL,
        capabilities_json TEXT,
        last_probe_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_provider_connections_status_updated
        ON provider_connections(status, updated_at, id);

      CREATE TABLE IF NOT EXISTS project_provider_bindings (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        model TEXT NOT NULL,
        role TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL,
        fallback_policy TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, role, priority)
      );
      CREATE INDEX IF NOT EXISTS idx_project_provider_bindings_project_role
        ON project_provider_bindings(project_id, enabled, role, priority, id);
      CREATE INDEX IF NOT EXISTS idx_project_provider_bindings_connection
        ON project_provider_bindings(connection_id, updated_at, id);

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        bot_id TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        context_snapshot_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_project_updated
        ON sessions(project_id, updated_at, id);

      CREATE TABLE IF NOT EXISTS session_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        run_id TEXT,
        provider_json TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(session_id, sequence)
      );
      CREATE INDEX IF NOT EXISTS idx_session_messages_session_sequence
        ON session_messages(session_id, sequence, id);
      CREATE INDEX IF NOT EXISTS idx_session_messages_run
        ON session_messages(run_id, created_at, id);

      CREATE TABLE IF NOT EXISTS policy_audit (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        bot_id TEXT NOT NULL,
        run_id TEXT,
        approval_id TEXT,
        changed_fields_json TEXT NOT NULL,
        before_policy_json TEXT NOT NULL,
        after_policy_json TEXT NOT NULL,
        decision TEXT NOT NULL,
        actor TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_policy_audit_project_created
        ON policy_audit(project_id, created_at, id);
      CREATE INDEX IF NOT EXISTS idx_policy_audit_bot_created
        ON policy_audit(bot_id, created_at, id);
    `,
  },
  {
    version: 4,
    name: 'execution-plan-orchestrator-contract',
    sql: `
      CREATE TABLE IF NOT EXISTS execution_plans (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        session_id TEXT,
        run_id TEXT NOT NULL,
        objective TEXT NOT NULL,
        intent TEXT NOT NULL,
        status TEXT NOT NULL,
        max_steps INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        waiting_reason TEXT,
        error TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_execution_plans_project_updated
        ON execution_plans(project_id, updated_at, id);
      CREATE INDEX IF NOT EXISTS idx_execution_plans_run
        ON execution_plans(run_id, updated_at, id);

      CREATE TABLE IF NOT EXISTS execution_plan_steps (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        step_order INTEGER NOT NULL,
        objective TEXT NOT NULL,
        depends_on_json TEXT NOT NULL,
        skill_id TEXT,
        tool_id TEXT,
        bot_id TEXT,
        input_refs_json TEXT NOT NULL,
        output_refs_json TEXT NOT NULL,
        output_schema_json TEXT,
        status TEXT NOT NULL,
        approval_required INTEGER NOT NULL,
        attempt INTEGER NOT NULL,
        max_attempts INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        error TEXT,
        UNIQUE(plan_id, step_order)
      );
      CREATE INDEX IF NOT EXISTS idx_execution_plan_steps_plan_order
        ON execution_plan_steps(plan_id, step_order, id);
      CREATE INDEX IF NOT EXISTS idx_execution_plan_steps_project
        ON execution_plan_steps(project_id, updated_at, id);
    `,
  },
];

function sqliteBusy(error: unknown): boolean {
  return /database is locked|database table is locked|SQLITE_BUSY|SQLITE_LOCKED/i.test(error instanceof Error ? error.message : String(error));
}

function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function runSqliteMigrationsOnce(db: SqliteDatabase): number {
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

/**
 * Multiple local processes can open a clean database at the same time. SQLite
 * serializes the first DDL transaction, so retry only the bounded migration
 * boundary when the driver reports a transient lock.
 */
export function runSqliteMigrations(db: SqliteDatabase): number {
  const maxAttempts = 8;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return runSqliteMigrationsOnce(db);
    } catch (error) {
      if (!sqliteBusy(error) || attempt === maxAttempts) throw error;
      sleepSync(attempt * 50);
    }
  }
  throw new Error('SQLite migration retry loop ended unexpectedly');
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
      db.exec('BEGIN IMMEDIATE');
      try {
        const existing = db.prepare('SELECT * FROM run_events WHERE run_id = @run_id ORDER BY sequence').all({ run_id: event.runId }).map((row) => eventFromRow(row as Record<string, unknown>));
        const incoming = event as unknown as RunEvent;
        if (existing.some((item) => item.id === event.id)) {
          db.exec('COMMIT');
          return;
        }
        const incomingKey = semanticEventKey(incoming);
        if (incomingKey && existing.some((item) => semanticEventKey(item) === incomingKey)) {
          db.exec('COMMIT');
          return;
        }
        const existingTerminal = currentAttemptTerminalEvent(existing);
        if (existingTerminal && currentAttemptTerminalEvent([incoming])) throw new Error(`Cannot append terminal event after ${existingTerminal.type}`);
        insert.run({ id: event.id, run_id: event.runId, sequence: event.sequence, type: event.type, occurred_at: event.occurredAt, actor_json: JSON.stringify(event.actor), data_json: JSON.stringify(event.data), correlation_id: event.correlationId ?? null });
        db.exec('COMMIT');
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch { /* preserve the append error */ }
        throw error;
      }
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

function executionPlanStepFromRow(row: Record<string, unknown>): ExecutionPlanStep {
  return {
    id: String(row.id) as ExecutionPlanStep['id'],
    planId: String(row.plan_id) as ExecutionPlanStep['planId'],
    order: Number(row.step_order),
    objective: String(row.objective),
    dependsOn: (optionalJson<string[]>(row.depends_on_json) ?? []) as ExecutionPlanStep['dependsOn'],
    ...(row.skill_id ? { skillId: String(row.skill_id) as ExecutionPlanStep['skillId'] } : {}),
    ...(row.tool_id ? { toolId: String(row.tool_id) } : {}),
    ...(row.bot_id ? { botId: String(row.bot_id) as ExecutionPlanStep['botId'] } : {}),
    inputRefs: optionalJson<string[]>(row.input_refs_json) ?? [],
    outputRefs: optionalJson<string[]>(row.output_refs_json) ?? [],
    ...(optionalJson<JsonObject>(row.output_schema_json) ? { outputSchema: optionalJson<JsonObject>(row.output_schema_json) } : {}),
    status: row.status as ExecutionPlanStep['status'],
    approvalRequired: Boolean(Number(row.approval_required)),
    attempt: Number(row.attempt),
    maxAttempts: Number(row.max_attempts),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ...(row.error ? { error: String(row.error) } : {}),
  };
}

function executionPlanFromRows(row: Record<string, unknown>, steps: Record<string, unknown>[]): ExecutionPlan {
  return {
    id: String(row.id) as ExecutionPlan['id'],
    projectId: String(row.project_id) as ExecutionPlan['projectId'],
    ...(row.session_id ? { sessionId: String(row.session_id) as ExecutionPlan['sessionId'] } : {}),
    runId: String(row.run_id) as ExecutionPlan['runId'],
    objective: String(row.objective),
    intent: row.intent as ExecutionPlan['intent'],
    status: row.status as ExecutionPlan['status'],
    steps: steps.map(executionPlanStepFromRow),
    maxSteps: Number(row.max_steps),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    ...(row.waiting_reason ? { waitingReason: String(row.waiting_reason) } : {}),
    ...(row.error ? { error: String(row.error) } : {}),
  };
}

function providerConnectionFromRow(row: Record<string, unknown>): ProviderConnection {
  return {
    id: row.id as ProviderConnection['id'],
    label: String(row.label),
    provider: row.provider as ProviderConnection['provider'],
    harness: row.harness as ProviderConnection['harness'],
    authMode: row.auth_mode as ProviderConnection['authMode'],
    billingSource: row.billing_source as ProviderConnection['billingSource'],
    ...(optionalJson<ProviderConnection['secretRef']>(row.secret_ref_json) ? { secretRef: optionalJson<ProviderConnection['secretRef']>(row.secret_ref_json) } : {}),
    status: row.status as ProviderConnection['status'],
    ...(optionalJson<JsonObject>(row.capabilities_json) ? { capabilities: optionalJson<JsonObject>(row.capabilities_json) } : {}),
    ...(row.last_probe_at ? { lastProbeAt: String(row.last_probe_at) } : {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function projectProviderBindingFromRow(row: Record<string, unknown>): ProjectProviderBinding {
  return {
    id: row.id as ProjectProviderBinding['id'],
    projectId: row.project_id as ProjectProviderBinding['projectId'],
    connectionId: row.connection_id as ProjectProviderBinding['connectionId'],
    model: String(row.model),
    role: row.role as ProjectProviderBinding['role'],
    priority: Number(row.priority ?? 0),
    enabled: Boolean(row.enabled),
    fallbackPolicy: row.fallback_policy as ProjectProviderBinding['fallbackPolicy'],
    revision: Number(row.revision),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function sessionFromRow(row: Record<string, unknown>): Session {
  return {
    id: row.id as Session['id'],
    projectId: row.project_id as Session['projectId'],
    botId: row.bot_id as Session['botId'],
    title: String(row.title),
    status: row.status as Session['status'],
    ...(row.context_snapshot_id ? { contextSnapshotId: row.context_snapshot_id as Session['contextSnapshotId'] } : {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function sessionMessageFromRow(row: Record<string, unknown>): SessionMessage {
  return {
    id: row.id as SessionMessage['id'],
    sessionId: row.session_id as SessionMessage['sessionId'],
    sequence: Number(row.sequence),
    role: row.role as SessionMessage['role'],
    content: String(row.content),
    ...(row.run_id ? { runId: row.run_id as SessionMessage['runId'] } : {}),
    ...(optionalJson<ProviderIdentity>(row.provider_json) ? { provider: optionalJson<ProviderIdentity>(row.provider_json) } : {}),
    createdAt: String(row.created_at),
  };
}

export type PolicyAuditRecord = {
  id: string;
  projectId: string;
  botId: string;
  runId?: string;
  approvalId?: string;
  changedFields: string[];
  beforePolicy: JsonObject;
  afterPolicy: JsonObject;
  decision: 'approved' | 'rejected' | 'pending';
  actor: string;
  reason?: string;
  createdAt: string;
};

function policyAuditFromRow(row: Record<string, unknown>): PolicyAuditRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    botId: String(row.bot_id),
    ...(row.run_id ? { runId: String(row.run_id) } : {}),
    ...(row.approval_id ? { approvalId: String(row.approval_id) } : {}),
    changedFields: JSON.parse(String(row.changed_fields_json)) as string[],
    beforePolicy: JSON.parse(String(row.before_policy_json)) as JsonObject,
    afterPolicy: JSON.parse(String(row.after_policy_json)) as JsonObject,
    decision: row.decision as PolicyAuditRecord['decision'],
    actor: String(row.actor),
    ...(row.reason ? { reason: String(row.reason) } : {}),
    createdAt: String(row.created_at),
  };
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
      const duplicate = this.db.prepare('SELECT id FROM run_events WHERE id = @id').get({ id: event.id });
      if (duplicate) return;
      const events = this.db.prepare('SELECT * FROM run_events WHERE run_id = @run_id ORDER BY sequence').all({ run_id: event.runId })
        .map((item) => eventFromRow(item as Record<string, unknown>));
      const incomingKey = semanticEventKey(event);
      if (incomingKey && events.some((existing) => semanticEventKey(existing) === incomingKey)) return;
      const existingTerminal = currentAttemptTerminalEvent(events);
      if (existingTerminal && currentAttemptTerminalEvent([event])) {
        throw new Error(`Cannot append terminal event after ${existingTerminal.type}`);
      }
      const row = this.db.prepare('SELECT MAX(sequence) AS sequence FROM run_events WHERE run_id = @run_id').get({ run_id: event.runId }) as { sequence?: unknown } | undefined;
      const expected = Number(row?.sequence ?? 0) + 1;
      if (event.sequence !== expected) throw new Error(`Event sequence must be ${expected}, received ${event.sequence}`);
      this.insertEvent(event);
    });
  }

  async transition(runId: RunId, action: RunAction, options: RunTransitionOptions = {}): Promise<RunTransitionResult> {
    return this.transaction(() => {
      const requestedStorageKey = options.idempotencyKey ? `${runId}:${options.idempotencyKey}` : undefined;
      if (requestedStorageKey) {
        const previous = this.db.prepare('SELECT result_json FROM idempotency_keys WHERE key = @key').get({ key: requestedStorageKey }) as { result_json?: unknown } | undefined;
        if (previous) {
          const stored = JSON.parse(String(previous.result_json)) as { action: RunAction; result: RunTransitionResult };
          if (stored.action !== action) throw new Error(`Idempotency key already used for action ${stored.action}: ${options.idempotencyKey}`);
          return stored.result;
        }
      }
      const row = this.db.prepare('SELECT * FROM runs WHERE id = @id').get({ id: runId });
      if (!row) throw new Error(`Unknown run: ${runId}`);
      const current = runFromRow(row as Record<string, unknown>);
      const sequenceRow = this.db.prepare('SELECT MAX(sequence) AS sequence FROM run_events WHERE run_id = @run_id').get({ run_id: runId }) as { sequence?: unknown } | undefined;
      const events = this.db.prepare('SELECT * FROM run_events WHERE run_id = @run_id ORDER BY sequence').all({ run_id: runId })
        .map((item) => eventFromRow(item as Record<string, unknown>));
      const transitionOptions = action === 'retry' && current.status === 'failed'
        ? prepareRetryTransition(current, events, options)
        : options;
      const idempotencyKey = transitionOptions.idempotencyKey;
      const storageKey = idempotencyKey ? `${runId}:${idempotencyKey}` : undefined;
      if (storageKey && storageKey !== requestedStorageKey) {
        const previous = this.db.prepare('SELECT result_json FROM idempotency_keys WHERE key = @key').get({ key: storageKey }) as { result_json?: unknown } | undefined;
        if (previous) {
          const stored = JSON.parse(String(previous.result_json)) as { action: RunAction; result: RunTransitionResult };
          if (stored.action !== action) throw new Error(`Idempotency key already used for action ${stored.action}: ${idempotencyKey}`);
          return stored.result;
        }
      }
      const result = transitionRun(current, action, transitionOptions, Number(sequenceRow?.sequence ?? 0) + 1);
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
  approval?: ApprovalRequest;
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

  saveExecutionPlan(plan: ExecutionPlan): void {
    validateExecutionPlan(plan);
    if (plan.steps.some((step) => String(step.planId) !== String(plan.id))) {
      throw new Error(`Execution plan step belongs to another plan: ${plan.id}`);
    }
    this.transaction(() => {
      this.db.prepare(`
        INSERT OR REPLACE INTO execution_plans (
          id, project_id, session_id, run_id, objective, intent, status, max_steps,
          created_at, updated_at, waiting_reason, error
        ) VALUES (@id, @project_id, @session_id, @run_id, @objective, @intent, @status, @max_steps,
          @created_at, @updated_at, @waiting_reason, @error)
      `).run({
        id: plan.id,
        project_id: plan.projectId,
        session_id: plan.sessionId ?? null,
        run_id: plan.runId,
        objective: plan.objective,
        intent: plan.intent,
        status: plan.status,
        max_steps: plan.maxSteps,
        created_at: plan.createdAt,
        updated_at: plan.updatedAt,
        waiting_reason: plan.waitingReason ?? null,
        error: plan.error ?? null,
      });
      this.db.prepare('DELETE FROM execution_plan_steps WHERE plan_id = @plan_id').run({ plan_id: plan.id });
      const insertStep = this.db.prepare(`
        INSERT INTO execution_plan_steps (
          id, plan_id, project_id, step_order, objective, depends_on_json, skill_id, tool_id, bot_id,
          input_refs_json, output_refs_json, output_schema_json, status, approval_required, attempt,
          max_attempts, created_at, updated_at, error
        ) VALUES (@id, @plan_id, @project_id, @step_order, @objective, @depends_on_json, @skill_id, @tool_id, @bot_id,
          @input_refs_json, @output_refs_json, @output_schema_json, @status, @approval_required, @attempt,
          @max_attempts, @created_at, @updated_at, @error)
      `);
      for (const step of plan.steps) {
        insertStep.run({
          id: step.id,
          plan_id: plan.id,
          project_id: plan.projectId,
          step_order: step.order,
          objective: step.objective,
          depends_on_json: JSON.stringify(step.dependsOn),
          skill_id: step.skillId ?? null,
          tool_id: step.toolId ?? null,
          bot_id: step.botId ?? null,
          input_refs_json: JSON.stringify(step.inputRefs),
          output_refs_json: JSON.stringify(step.outputRefs),
          output_schema_json: step.outputSchema ? JSON.stringify(step.outputSchema) : null,
          status: step.status,
          approval_required: step.approvalRequired ? 1 : 0,
          attempt: step.attempt,
          max_attempts: step.maxAttempts,
          created_at: step.createdAt,
          updated_at: step.updatedAt,
          error: step.error ?? null,
        });
      }
    });
  }

  getExecutionPlan(id: string, projectId?: string): ExecutionPlan | undefined {
    const row = projectId
      ? this.db.prepare('SELECT * FROM execution_plans WHERE id = @id AND project_id = @project_id').get({ id, project_id: projectId })
      : this.db.prepare('SELECT * FROM execution_plans WHERE id = @id').get({ id });
    if (!row) return undefined;
    const plan = row as Record<string, unknown>;
    const steps = this.db.prepare('SELECT * FROM execution_plan_steps WHERE plan_id = @plan_id ORDER BY step_order, id').all({ plan_id: id }) as Record<string, unknown>[];
    return executionPlanFromRows(plan, steps);
  }

  listExecutionPlans(projectId?: string): ExecutionPlan[] {
    const rows = projectId
      ? this.db.prepare('SELECT * FROM execution_plans WHERE project_id = @project_id ORDER BY updated_at, id').all({ project_id: projectId })
      : this.db.prepare('SELECT * FROM execution_plans ORDER BY project_id, updated_at, id').all();
    return (rows as Record<string, unknown>[]).map((row) => {
      const steps = this.db.prepare('SELECT * FROM execution_plan_steps WHERE plan_id = @plan_id ORDER BY step_order, id').all({ plan_id: row.id }) as Record<string, unknown>[];
      return executionPlanFromRows(row, steps);
    });
  }

  saveProviderConnection(item: ProviderConnection): void {
    this.transaction(() => {
      this.db.prepare(`
        INSERT OR REPLACE INTO provider_connections (
          id, label, provider, harness, auth_mode, billing_source, secret_ref_json,
          status, capabilities_json, last_probe_at, created_at, updated_at
        ) VALUES (@id, @label, @provider, @harness, @auth_mode, @billing_source, @secret_ref_json,
          @status, @capabilities_json, @last_probe_at, @created_at, @updated_at)
      `).run({
        id: item.id,
        label: item.label,
        provider: item.provider,
        harness: item.harness,
        auth_mode: item.authMode,
        billing_source: item.billingSource,
        secret_ref_json: item.secretRef ? JSON.stringify(item.secretRef) : null,
        status: item.status,
        capabilities_json: item.capabilities ? JSON.stringify(item.capabilities) : null,
        last_probe_at: item.lastProbeAt ?? null,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
      });
    });
  }

  getProviderConnection(id: string): ProviderConnection | undefined {
    const row = this.db.prepare('SELECT * FROM provider_connections WHERE id = @id').get({ id });
    return row ? providerConnectionFromRow(row as Record<string, unknown>) : undefined;
  }

  listProviderConnections(): ProviderConnection[] {
    return this.db.prepare('SELECT * FROM provider_connections ORDER BY updated_at, id')
      .all().map((row) => providerConnectionFromRow(row as Record<string, unknown>));
  }

  saveProjectProviderBinding(item: ProjectProviderBinding): void {
    this.transaction(() => {
      const existing = this.db.prepare('SELECT revision FROM project_provider_bindings WHERE id = @id').get({ id: item.id }) as { revision?: unknown } | undefined;
      if (existing && Number(existing.revision) > item.revision) {
        throw new Error(`Provider binding revision is stale: ${item.id}`);
      }
      this.db.prepare(`
        INSERT OR REPLACE INTO project_provider_bindings (
          id, project_id, connection_id, model, role, priority, enabled,
          fallback_policy, revision, created_at, updated_at
        ) VALUES (@id, @project_id, @connection_id, @model, @role, @priority, @enabled,
          @fallback_policy, @revision, @created_at, @updated_at)
      `).run({
        id: item.id,
        project_id: item.projectId,
        connection_id: item.connectionId,
        model: item.model,
        role: item.role,
        priority: item.priority,
        enabled: item.enabled ? 1 : 0,
        fallback_policy: item.fallbackPolicy,
        revision: item.revision,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
      });
    });
  }

  getProjectProviderBinding(id: string, projectId?: string): ProjectProviderBinding | undefined {
    const row = projectId
      ? this.db.prepare('SELECT * FROM project_provider_bindings WHERE id = @id AND project_id = @project_id').get({ id, project_id: projectId })
      : this.db.prepare('SELECT * FROM project_provider_bindings WHERE id = @id').get({ id });
    return row ? projectProviderBindingFromRow(row as Record<string, unknown>) : undefined;
  }

  listProjectProviderBindings(projectId?: string): ProjectProviderBinding[] {
    const rows = projectId
      ? this.db.prepare('SELECT * FROM project_provider_bindings WHERE project_id = @project_id ORDER BY role, priority, id').all({ project_id: projectId })
      : this.db.prepare('SELECT * FROM project_provider_bindings ORDER BY project_id, role, priority, id').all();
    return rows.map((row) => projectProviderBindingFromRow(row as Record<string, unknown>));
  }

  saveSession(item: Session): void {
    this.transaction(() => {
      this.db.prepare(`
        INSERT OR REPLACE INTO sessions (
          id, project_id, bot_id, title, status, context_snapshot_id, created_at, updated_at
        ) VALUES (@id, @project_id, @bot_id, @title, @status, @context_snapshot_id, @created_at, @updated_at)
      `).run({
        id: item.id,
        project_id: item.projectId,
        bot_id: item.botId,
        title: item.title,
        status: item.status,
        context_snapshot_id: item.contextSnapshotId ?? null,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
      });
    });
  }

  getSession(id: string, projectId?: string): Session | undefined {
    const row = projectId
      ? this.db.prepare('SELECT * FROM sessions WHERE id = @id AND project_id = @project_id').get({ id, project_id: projectId })
      : this.db.prepare('SELECT * FROM sessions WHERE id = @id').get({ id });
    return row ? sessionFromRow(row as Record<string, unknown>) : undefined;
  }

  listSessions(projectId?: string): Session[] {
    const rows = projectId
      ? this.db.prepare('SELECT * FROM sessions WHERE project_id = @project_id ORDER BY updated_at, id').all({ project_id: projectId })
      : this.db.prepare('SELECT * FROM sessions ORDER BY updated_at, id').all();
    return rows.map((row) => sessionFromRow(row as Record<string, unknown>));
  }

  appendSessionMessage(item: SessionMessage): void {
    this.transaction(() => {
      const session = this.db.prepare('SELECT project_id, status FROM sessions WHERE id = @id').get({ id: item.sessionId }) as { project_id?: unknown; status?: unknown } | undefined;
      if (!session) throw new Error(`Unknown session: ${item.sessionId}`);
      if (session.status === 'archived') throw new Error(`Cannot append message to archived session: ${item.sessionId}`);
      if (item.sequence < 1) throw new Error(`Session message sequence must be positive: ${item.sessionId}/${item.sequence}`);
      if (item.runId) {
        const run = this.db.prepare('SELECT project_id FROM runs WHERE id = @id').get({ id: item.runId }) as { project_id?: unknown } | undefined;
        if (!run || String(run.project_id) !== String(session.project_id)) throw new Error(`Session message run is outside the session project: ${item.runId}`);
      }
      const existingById = this.db.prepare('SELECT * FROM session_messages WHERE id = @id').get({ id: item.id });
      if (existingById) {
        const existing = sessionMessageFromRow(existingById as Record<string, unknown>);
        if (JSON.stringify(existing) !== JSON.stringify(item)) throw new Error(`Session message already exists with different content: ${item.id}`);
        return;
      }
      const existingBySequence = this.db.prepare('SELECT * FROM session_messages WHERE session_id = @session_id AND sequence = @sequence').get({ session_id: item.sessionId, sequence: item.sequence });
      if (existingBySequence) throw new Error(`Session message sequence already exists: ${item.sessionId}/${item.sequence}`);
      this.db.prepare(`
        INSERT INTO session_messages (
          id, session_id, sequence, role, content, run_id, provider_json, created_at
        ) VALUES (@id, @session_id, @sequence, @role, @content, @run_id, @provider_json, @created_at)
      `).run({
        id: item.id,
        session_id: item.sessionId,
        sequence: item.sequence,
        role: item.role,
        content: item.content,
        run_id: item.runId ?? null,
        provider_json: item.provider ? JSON.stringify(item.provider) : null,
        created_at: item.createdAt,
      });
      this.db.prepare('UPDATE sessions SET updated_at = @updated_at WHERE id = @id').run({ id: item.sessionId, updated_at: item.createdAt });
    });
  }

  linkSessionMessageRun(messageId: string, runId: string): void {
    this.transaction(() => {
      const row = this.db.prepare(`
        SELECT m.id, m.run_id, s.project_id
        FROM session_messages m
        JOIN sessions s ON s.id = m.session_id
        WHERE m.id = @message_id
      `).get({ message_id: messageId }) as { id?: unknown; run_id?: unknown; project_id?: unknown } | undefined;
      if (!row) throw new Error(`Unknown session message: ${messageId}`);
      const run = this.db.prepare('SELECT project_id FROM runs WHERE id = @run_id').get({ run_id: runId }) as { project_id?: unknown } | undefined;
      if (!run || String(run.project_id) !== String(row.project_id)) throw new Error(`Session message run is outside the session project: ${runId}`);
      if (row.run_id && String(row.run_id) !== runId) throw new Error(`Session message already linked to another run: ${messageId}`);
      this.db.prepare('UPDATE session_messages SET run_id = @run_id WHERE id = @message_id').run({ message_id: messageId, run_id: runId });
    });
  }

  /**
   * Repair the session side of a completed run after a process interruption.
   * The run/event store and entity store use separate connections, so this
   * transaction is the compensating boundary: it links the user message and
   * creates the assistant replay exactly once.
   */
  reconcileSessionRun(input: { sessionId: string; projectId: string; messageId: string; runId: string; assistantContent: string; provider?: ProviderIdentity }): SessionMessage[] {
    return this.transaction(() => {
      const session = this.db.prepare('SELECT project_id FROM sessions WHERE id = @session_id').get({ session_id: input.sessionId }) as { project_id?: unknown } | undefined;
      if (!session || String(session.project_id) !== input.projectId) throw new Error(`Unknown session: ${input.sessionId}`);
      const run = this.db.prepare('SELECT project_id FROM runs WHERE id = @run_id').get({ run_id: input.runId }) as { project_id?: unknown } | undefined;
      if (!run || String(run.project_id) !== input.projectId) throw new Error(`Session run is outside the session project: ${input.runId}`);
      const userRow = this.db.prepare('SELECT * FROM session_messages WHERE id = @message_id AND session_id = @session_id').get({ message_id: input.messageId, session_id: input.sessionId });
      if (!userRow) throw new Error(`Unknown session message: ${input.messageId}`);
      const userMessage = sessionMessageFromRow(userRow as Record<string, unknown>);
      if (userMessage.runId && String(userMessage.runId) !== input.runId) throw new Error(`Session message already linked to another run: ${input.messageId}`);
      this.db.prepare('UPDATE session_messages SET run_id = @run_id WHERE id = @message_id').run({ message_id: input.messageId, run_id: input.runId });
      const assistantId = `${input.messageId}:assistant`;
      const existingAssistant = this.db.prepare('SELECT * FROM session_messages WHERE id = @assistant_id').get({ assistant_id: assistantId });
      if (existingAssistant) {
        const assistant = sessionMessageFromRow(existingAssistant as Record<string, unknown>);
        if (String(assistant.runId ?? '') !== input.runId || assistant.role !== 'assistant') throw new Error(`Session assistant message conflicts with run: ${assistantId}`);
      } else {
        const maxSequence = this.db.prepare('SELECT MAX(sequence) AS sequence FROM session_messages WHERE session_id = @session_id').get({ session_id: input.sessionId }) as { sequence?: unknown } | undefined;
        this.db.prepare(`
          INSERT INTO session_messages (id, session_id, sequence, role, content, run_id, provider_json, created_at)
          VALUES (@id, @session_id, @sequence, 'assistant', @content, @run_id, @provider_json, @created_at)
        `).run({
          id: assistantId,
          session_id: input.sessionId,
          sequence: Number(maxSequence?.sequence ?? 0) + 1,
          content: input.assistantContent,
          run_id: input.runId,
          provider_json: input.provider ? JSON.stringify(input.provider) : null,
          created_at: new Date().toISOString(),
        });
      }
      this.db.prepare('UPDATE sessions SET updated_at = @updated_at WHERE id = @session_id').run({ session_id: input.sessionId, updated_at: new Date().toISOString() });
      return this.listSessionMessages(input.sessionId, input.projectId);
    });
  }

  listSessionMessages(sessionId: string, projectId?: string): SessionMessage[] {
    const rows = projectId
      ? this.db.prepare(`
        SELECT m.* FROM session_messages m
        JOIN sessions s ON s.id = m.session_id
        WHERE m.session_id = @session_id AND s.project_id = @project_id
        ORDER BY m.sequence, m.id
      `).all({ session_id: sessionId, project_id: projectId })
      : this.db.prepare('SELECT * FROM session_messages WHERE session_id = @session_id ORDER BY sequence, id').all({ session_id: sessionId });
    return rows.map((row) => sessionMessageFromRow(row as Record<string, unknown>));
  }

  appendPolicyAudit(item: PolicyAuditRecord): void {
    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO policy_audit (
          id, project_id, bot_id, run_id, approval_id, changed_fields_json,
          before_policy_json, after_policy_json, decision, actor, reason, created_at
        ) VALUES (@id, @project_id, @bot_id, @run_id, @approval_id, @changed_fields_json,
          @before_policy_json, @after_policy_json, @decision, @actor, @reason, @created_at)
      `).run({
        id: item.id,
        project_id: item.projectId,
        bot_id: item.botId,
        run_id: item.runId ?? null,
        approval_id: item.approvalId ?? null,
        changed_fields_json: JSON.stringify(item.changedFields),
        before_policy_json: JSON.stringify(item.beforePolicy),
        after_policy_json: JSON.stringify(item.afterPolicy),
        decision: item.decision,
        actor: item.actor,
        reason: item.reason ?? null,
        created_at: item.createdAt,
      });
    });
  }

  listPolicyAudit(projectId?: string, botId?: string): PolicyAuditRecord[] {
    const rows = projectId && botId
      ? this.db.prepare('SELECT * FROM policy_audit WHERE project_id = @project_id AND bot_id = @bot_id ORDER BY created_at, id').all({ project_id: projectId, bot_id: botId })
      : projectId
        ? this.db.prepare('SELECT * FROM policy_audit WHERE project_id = @project_id ORDER BY created_at, id').all({ project_id: projectId })
        : this.db.prepare('SELECT * FROM policy_audit ORDER BY created_at, id').all();
    return rows.map((row) => policyAuditFromRow(row as Record<string, unknown>));
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
    const providerJson = JSON.stringify(item.provider);
    const receiptJson = JSON.stringify(item.receipt);
    const original = this.db.prepare('SELECT id, provider_json, receipt_json, run_id, segment, created_at FROM provider_receipts WHERE id = @id').get({ id: item.id }) as { id?: unknown; provider_json?: unknown; receipt_json?: unknown } | undefined;
    if (original) {
      if (String(original.provider_json) === providerJson && String(original.receipt_json) === receiptJson) return;
      const digest = createHash('sha256').update(JSON.stringify({ provider: item.provider, receipt: item.receipt, segment: item.segment ?? null }), 'utf8').digest('hex').slice(0, 16);
      const variantId = `${item.id}:variant:${digest}`;
      const variant = this.db.prepare('SELECT id FROM provider_receipts WHERE id = @id').get({ id: variantId });
      if (variant) return;
      this.db.prepare(`
        INSERT INTO provider_receipts (id, run_id, segment, provider_json, receipt_json, created_at)
        VALUES (@id, @run_id, @segment, @provider_json, @receipt_json, @created_at)
      `).run({ id: variantId, run_id: item.runId, segment: item.segment ?? null, provider_json: providerJson, receipt_json: receiptJson, created_at: item.createdAt });
      return;
    }
    this.db.prepare(`
      INSERT INTO provider_receipts (id, run_id, segment, provider_json, receipt_json, created_at)
      VALUES (@id, @run_id, @segment, @provider_json, @receipt_json, @created_at)
    `).run({ id: item.id, run_id: item.runId, segment: item.segment ?? null, provider_json: providerJson, receipt_json: receiptJson, created_at: item.createdAt });
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

  getProject(id: string): Project | undefined {
    return this.listProjects().find((item) => item.id === id);
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

  getSkill(id: string): Skill | undefined {
    return this.listSkills().find((item) => item.id === id);
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

  getBotProfile(id: string, projectId?: string): BotProfile | undefined {
    return this.listBotProfiles(projectId).find((item) => item.id === id);
  }

  resolveApproval(runId: string, status: ApprovalRequest['status'], resolvedBy = 'user', decisionReason?: string): number {
    const result = this.db.prepare(`
      UPDATE approval_requests
      SET status = @status, resolved_at = @resolved_at, resolved_by = @resolved_by, decision_reason = @decision_reason
      WHERE run_id = @run_id AND status = 'pending'
    `).run({ status, resolved_at: new Date().toISOString(), resolved_by: resolvedBy, decision_reason: decisionReason ?? null, run_id: runId }) as { changes?: unknown };
    return Number(result?.changes ?? 0);
  }

  getApproval(id: string): ApprovalRequest | undefined {
    return this.listApprovals().find((item) => String(item.id) === id);
  }

  /** Resolve exactly one approval. Repeating the same decision is idempotent. */
  resolveApprovalById(
    id: string,
    status: Extract<ApprovalRequest['status'], 'approved' | 'rejected'>,
    resolvedBy = 'user',
    decisionReason?: string,
  ): { changed: boolean; approval?: ApprovalRequest; conflict?: 'already_resolved' } {
    return this.transaction(() => {
      const existing = this.getApproval(id);
      if (!existing) return { changed: false };
      if (existing.status !== 'pending') {
        return existing.status === status
          ? { changed: false, approval: existing }
          : { changed: false, approval: existing, conflict: 'already_resolved' as const };
      }
      const result = this.db.prepare(`
        UPDATE approval_requests
        SET status = @status, resolved_at = @resolved_at, resolved_by = @resolved_by, decision_reason = @decision_reason
        WHERE id = @id AND status = 'pending'
      `).run({ id, status, resolved_at: new Date().toISOString(), resolved_by: resolvedBy, decision_reason: decisionReason ?? null }) as { changes?: unknown };
      return { changed: Number(result?.changes ?? 0) > 0, approval: this.getApproval(id) };
    });
  }

  /** Revoke a pending or approved authorization without rewriting its history. */
  revokeApprovalById(
    id: string,
    revokedBy = 'user',
    decisionReason = 'Tool authorization revoked',
  ): { changed: boolean; approval?: ApprovalRequest; conflict?: 'already_revoked' | 'not_revocable' } {
    return this.transaction(() => {
      const existing = this.getApproval(id);
      if (!existing) return { changed: false };
      if (existing.status === 'cancelled') return { changed: false, approval: existing, conflict: 'already_revoked' as const };
      if (existing.status !== 'pending' && existing.status !== 'approved') return { changed: false, approval: existing, conflict: 'not_revocable' as const };
      const result = this.db.prepare(`
        UPDATE approval_requests
        SET status = 'cancelled', resolved_at = @resolved_at, resolved_by = @resolved_by, decision_reason = @decision_reason
        WHERE id = @id AND status IN ('pending', 'approved')
      `).run({ id, resolved_at: new Date().toISOString(), resolved_by: revokedBy, decision_reason: decisionReason }) as { changes?: unknown };
      return { changed: Number(result?.changes ?? 0) > 0, approval: this.getApproval(id) };
    });
  }

  /** Persist one approval request without requiring a full Product Builder bundle. */
  saveApprovalRequest(item: ApprovalRequest): void {
    this.transaction(() => this.saveApprovalRow(item));
  }

  /** Persist one draft or provider-produced artifact without releasing it. */
  saveArtifact(item: Artifact): void {
    this.transaction(() => this.saveArtifactRow(item));
  }

  /** Persist one project-scoped memory item. The caller supplies an idempotent id. */
  saveMemory(item: MemoryItem): void {
    this.transaction(() => this.saveMemoryRow(item));
  }

  saveProductBuilderEntities(bundle: ProductBuilderEntityBundle): void {
    this.transaction(() => {
      for (const item of bundle.handoffs) this.saveHandoffRow(item);
      if (bundle.approval) this.saveApprovalRow(bundle.approval);
      for (const item of bundle.sources) this.saveSourceRow(item);
      for (const item of bundle.artifacts) this.saveArtifactRow(item);
      for (const item of bundle.memories ?? []) this.saveMemoryRow(item);
      for (const item of bundle.receipts ?? []) this.saveReceiptRow(item);
    });
  }

  /**
   * Reconcile entity rows after a checkpoint event already exists. This is a
   * compensating path for a crash between the event-log commit and the entity
   * transaction; existing rows are never overwritten during recovery.
   */
  reconcileProductBuilderEntities(bundle: ProductBuilderEntityBundle): void {
    const existingHandoffIds = new Set(this.listHandoffs().map((item) => String(item.id)));
    const existingSourceIds = new Set(this.listSources().map((item) => String(item.id)));
    const existingArtifactIds = new Set(this.listArtifacts().map((item) => String(item.id)));
    const existingReceiptIds = new Set(this.listReceipts().map((item) => String(item.id)));
    const handoffs = bundle.handoffs.filter((item) => !existingHandoffIds.has(String(item.id)));
    const sources = bundle.sources.filter((item) => !existingSourceIds.has(String(item.id)));
    const artifacts = bundle.artifacts.filter((item) => !existingArtifactIds.has(String(item.id)));
    const receipts = (bundle.receipts ?? []).filter((item) => !existingReceiptIds.has(String(item.id)));
    const approval = bundle.approval && !this.getApproval(String(bundle.approval.id)) ? bundle.approval : undefined;
    if (!handoffs.length && !sources.length && !artifacts.length && !receipts.length && !approval) return;
    this.saveProductBuilderEntities({ handoffs, approval, sources, artifacts, receipts });
  }

  /** Persist one provider execution receipt without coupling it to Product Builder entities. */
  saveProviderReceipt(item: ProviderReceipt): void {
    this.transaction(() => this.saveReceiptRow(item));
  }

  listHandoffs(projectId?: string): HandoffEnvelope[] {
    const rows = projectId
      ? this.db.prepare(`
        SELECT h.* FROM handoffs h
        WHERE EXISTS (SELECT 1 FROM bot_profiles b WHERE b.id = h.from_bot_id AND b.project_id = @project_id)
           OR EXISTS (SELECT 1 FROM bot_profiles b WHERE b.id = h.to_bot_id AND b.project_id = @project_id)
        ORDER BY h.created_at, h.id
      `).all({ project_id: projectId })
      : this.db.prepare('SELECT * FROM handoffs ORDER BY created_at, id').all();
    return rows.map((row: any) => ({
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

  getSource(id: string, projectId?: string): Source | undefined {
    const row = projectId
      ? this.db.prepare('SELECT * FROM sources WHERE id = @id AND project_id = @project_id').get({ id, project_id: projectId })
      : this.db.prepare('SELECT * FROM sources WHERE id = @id').get({ id });
    if (!row) return undefined;
    const item = row as any;
    return {
      id: item.id,
      projectId: item.project_id,
      uri: item.uri,
      ...(item.title ? { title: item.title } : {}),
      ...(item.excerpt ? { excerpt: item.excerpt } : {}),
      retrievedAt: item.retrieved_at,
      ...(item.metadata_json ? { metadata: JSON.parse(item.metadata_json) } : {}),
    };
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

  getArtifact(id: string, projectId?: string): Artifact | undefined {
    const row = projectId
      ? this.db.prepare('SELECT * FROM artifacts WHERE id = @id AND project_id = @project_id').get({ id, project_id: projectId })
      : this.db.prepare('SELECT * FROM artifacts WHERE id = @id').get({ id });
    if (!row) return undefined;
    const item = row as any;
    return {
      id: item.id,
      projectId: item.project_id,
      runId: item.run_id,
      kind: item.kind,
      name: item.name,
      contentType: item.content_type,
      content: item.content,
      sourceRefs: JSON.parse(item.source_refs_json),
      createdAt: item.created_at,
    };
  }

  listArtifactsByRun(runId: string): Artifact[] {
    return this.db.prepare('SELECT * FROM artifacts WHERE run_id = @run_id ORDER BY created_at, id').all({ run_id: runId }).map((row: any) => ({
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

  getMemory(id: string, projectId?: string): MemoryItem | undefined {
    const row = projectId
      ? this.db.prepare('SELECT * FROM memory_items WHERE id = @id AND project_id = @project_id').get({ id, project_id: projectId })
      : this.db.prepare('SELECT * FROM memory_items WHERE id = @id').get({ id });
    if (!row) return undefined;
    const item = row as any;
    return {
      id: item.id,
      projectId: item.project_id,
      scope: item.scope,
      content: item.content,
      sourceRefs: JSON.parse(item.source_refs_json),
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
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

  /** Return receipts whose run or persisted Product Builder entities belong to one project. */
  listReceiptsByProject(projectId: string): ProviderReceipt[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT pr.*
      FROM provider_receipts pr
      LEFT JOIN runs r ON r.id = pr.run_id
      LEFT JOIN artifacts a ON a.run_id = pr.run_id
      LEFT JOIN approval_requests ar ON ar.run_id = pr.run_id
      WHERE r.project_id = @project_id
         OR a.project_id = @project_id
         OR ar.project_id = @project_id
      ORDER BY pr.created_at, pr.id
    `).all({ project_id: projectId });
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
