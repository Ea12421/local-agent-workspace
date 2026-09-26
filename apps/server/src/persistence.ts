import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ContextSnapshot } from '../../../packages/core/src/types.ts';

export type PersistedEvent = Record<string, unknown>;

/**
 * Append-only event log used when the optional SQLite native module is not
 * installed. The public API is intentionally storage-neutral so the server
 * can run from a clean checkout and upgrade to SQLite without changing the
 * domain or HTTP contract.
 */
export class JsonlEventLog {
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
}

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

/** Uses SQLite when the optional native dependency is present, otherwise keeps the clean-checkout JSONL path usable. */
export async function openEventLog(filePath: string): Promise<{ backend: 'sqlite' | 'jsonl'; log: EventLog }> {
  try {
    const module = await import('better-sqlite3');
    const Database = (module as any).default ?? module;
    const db = new Database(filePath);
    db.exec(SQLITE_SCHEMA);
    const insert = db.prepare('INSERT INTO run_events (id, run_id, sequence, type, occurred_at, actor_json, data_json, correlation_id) VALUES (@id, @run_id, @sequence, @type, @occurred_at, @actor_json, @data_json, @correlation_id)');
    const list = db.prepare('SELECT * FROM run_events ORDER BY run_id, sequence');
    return {
      backend: 'sqlite',
      log: {
        backend: 'sqlite',
        async append(event) {
          insert.run({ id: event.id, run_id: event.runId, sequence: event.sequence, type: event.type, occurred_at: event.occurredAt, actor_json: JSON.stringify(event.actor), data_json: JSON.stringify(event.data), correlation_id: event.correlationId ?? null });
        },
        async readAll() { return list.all().map((row: any) => ({ ...row, actor: JSON.parse(row.actor_json), data: JSON.parse(row.data_json) })); },
      },
    };
  } catch {
    return { backend: 'jsonl', log: new JsonlEventLog(`${filePath}.jsonl`) };
  }
}
