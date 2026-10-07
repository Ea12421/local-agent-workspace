import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openSqliteProductBuilderContinuity } from './persistence.ts';
import { SqliteMemoryAdapter } from './memory-adapter.ts';
import type { ProjectId, SourceId } from '../../../packages/core/src/index.ts';

test('SQLite memory adapter retains idempotently, recalls by project and reflects evidence', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-memory-'));
  const filePath = path.join(dir, 'workspace.db');
  const first = openSqliteProductBuilderContinuity(filePath);
  assert.ok(first);
  const projectId = 'project-memory-test' as ProjectId;
  try {
    const adapter = new SqliteMemoryAdapter(first.entityStore, () => '2026-10-04T01:00:00.000Z');
    const retained = await adapter.retain({
      projectId,
      scope: 'rsi.feedback',
      content: '固定评测通过：来源约束和版本链已记录。',
      sourceRefs: ['source-eval-1' as SourceId],
    });
    const replay = await adapter.retain({
      projectId,
      scope: 'rsi.feedback',
      content: '固定评测通过：来源约束和版本链已记录。',
      sourceRefs: ['source-eval-1' as SourceId],
      now: '2026-10-04T01:01:00.000Z',
    });
    assert.equal(replay.id, retained.id);
    assert.equal(first.entityStore.listMemories(String(projectId)).length, 1);

    const recalled = await adapter.recall({ projectId, query: '版本链 来源约束', limit: 3 });
    assert.equal(recalled.items.length, 1);
    assert.equal(recalled.strategy, 'lexical');
    assert.deepEqual(recalled.items[0]?.matchedTerms.sort(), ['来源约束', '版本链'].sort());
    assert.equal(recalled.items[0]?.scoreBreakdown.phraseScore, 0);

    const reflection = await adapter.reflect({ projectId, cues: ['RSI', '版本链'], scope: 'rsi.feedback' });
    assert.deepEqual(reflection.memoryRefs, [retained.id]);
    assert.deepEqual(reflection.sourceRefs, ['source-eval-1']);
    assert.match(reflection.summary, /版本链/);
  } finally {
    first.close();
    const reopened = openSqliteProductBuilderContinuity(filePath);
    assert.ok(reopened);
    assert.equal(reopened.entityStore.listMemories(String(projectId)).length, 1);
    reopened.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('hybrid recall favors a contiguous phrase while retaining lexical coverage and freshness signals', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-memory-hybrid-'));
  const filePath = path.join(dir, 'workspace.db');
  const stores = openSqliteProductBuilderContinuity(filePath);
  assert.ok(stores);
  const projectId = 'project-memory-hybrid-test' as ProjectId;
  try {
    const adapter = new SqliteMemoryAdapter(stores.entityStore);
    const fragmented = await adapter.retain({
      projectId,
      scope: 'rsi.feedback',
      content: 'approval status was recorded; later review passed',
      now: '2026-10-03T00:00:00.000Z',
    });
    const contiguous = await adapter.retain({
      projectId,
      scope: 'rsi.feedback',
      content: 'approval review passed after the boundary check',
      now: '2026-08-01T00:00:00.000Z',
    });

    const lexical = await adapter.recall({
      projectId,
      query: 'approval review passed',
      strategy: 'lexical',
      now: '2026-10-04T00:00:00.000Z',
      limit: 2,
    });
    assert.equal(lexical.items[0]?.item.id, fragmented.id, 'lexical baseline prefers the newer tie');

    const hybrid = await adapter.recall({
      projectId,
      query: 'approval review passed',
      strategy: 'hybrid',
      now: '2026-10-04T00:00:00.000Z',
      limit: 2,
    });
    assert.equal(hybrid.strategy, 'hybrid');
    assert.equal(hybrid.items[0]?.item.id, contiguous.id);
    assert.equal(hybrid.items[0]?.scoreBreakdown.phraseScore, 1);
    assert.ok((hybrid.items[0]?.relevance ?? 0) > (hybrid.items[1]?.relevance ?? 0));
  } finally {
    stores.close?.();
    await rm(dir, { recursive: true, force: true });
  }
});
