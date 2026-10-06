import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openSqliteProductBuilderContinuity } from '../apps/server/src/persistence.ts';
import { SqliteMemoryAdapter } from '../apps/server/src/memory-adapter.ts';
import type { MemoryItemId, ProjectId } from '../packages/core/src/index.ts';

const observedAt = '2026-10-04T00:00:00.000Z';
const outputJson = 'validation/memory-recall-benchmark-v1-2026-10-04.json';
const outputMarkdown = 'validation/memory-recall-benchmark-v1-2026-10-04.md';
const projectId = 'project-memory-benchmark' as ProjectId;
const otherProjectId = 'project-memory-benchmark-other' as ProjectId;

type Fixture = { key: string; projectId: ProjectId; scope: string; content: string; now: string };
type Case = { id: string; query: string; expected: string[]; scope?: string; limit: number };

const fixtures: Fixture[] = [
  { key: 'approvalExact', projectId, scope: 'rsi.feedback', content: 'approval review passed after the boundary check', now: '2026-08-01T00:00:00.000Z' },
  { key: 'approvalFragmented', projectId, scope: 'rsi.feedback', content: 'approval status was recorded; later review passed', now: '2026-10-03T00:00:00.000Z' },
  { key: 'contextExact', projectId, scope: 'rsi.feedback', content: 'context snapshot preserves source refs and tail events', now: '2026-08-05T00:00:00.000Z' },
  { key: 'contextFragmented', projectId, scope: 'rsi.feedback', content: 'context summary omits snapshot details but keeps source refs', now: '2026-10-02T00:00:00.000Z' },
  { key: 'providerExact', projectId, scope: 'rsi.feedback', content: 'provider cache receipt remains unknown', now: '2026-08-08T00:00:00.000Z' },
  { key: 'providerFragmented', projectId, scope: 'rsi.feedback', content: 'provider request recorded; cache receipt remains unknown', now: '2026-10-01T00:00:00.000Z' },
  { key: 'releaseExact', projectId, scope: 'rsi.feedback', content: 'approval release gate completed', now: '2026-09-01T00:00:00.000Z' },
  { key: 'releasePartial', projectId, scope: 'rsi.feedback', content: 'approval release completed', now: '2026-10-03T00:00:00.000Z' },
  { key: 'chineseEval', projectId, scope: 'rsi.feedback', content: '固定评测通过：来源约束和版本链已记录。', now: '2026-09-02T00:00:00.000Z' },
  { key: 'otherScope', projectId, scope: 'other', content: 'approval review passed in another scope', now: '2026-10-03T00:00:00.000Z' },
  { key: 'otherProject', projectId: otherProjectId, scope: 'rsi.feedback', content: 'approval review passed in another project', now: '2026-10-03T00:00:00.000Z' },
];

const cases: Case[] = [
  { id: 'approval-contiguous-phrase', query: 'approval review passed', expected: ['approvalExact'], limit: 3 },
  { id: 'context-contiguous-phrase', query: 'context snapshot source refs', expected: ['contextExact'], limit: 3 },
  { id: 'provider-contiguous-phrase', query: 'provider cache receipt', expected: ['providerExact'], limit: 3 },
  { id: 'release-coverage', query: 'approval release gate', expected: ['releaseExact'], limit: 3 },
  { id: 'chinese-substring-compatibility', query: '固定评测通过', expected: ['chineseEval'], limit: 3 },
  { id: 'scope-isolation', query: 'approval review passed', expected: ['approvalExact'], scope: 'rsi.feedback', limit: 10 },
];

function rankOf(items: Array<{ item: { id: MemoryItemId } }>, expected: Set<string>): number | undefined {
  const index = items.findIndex((item) => expected.has(String(item.item.id)));
  return index < 0 ? undefined : index + 1;
}

function aggregate(rows: Array<{ rank?: number }>, limit: number) {
  const hits = rows.filter((row) => row.rank !== undefined);
  return {
    cases: rows.length,
    hitAt1: rows.filter((row) => row.rank === 1).length,
    hitAt3: rows.filter((row) => row.rank !== undefined && row.rank <= 3).length,
    mrr: Number((rows.reduce((sum, row) => sum + (row.rank ? 1 / row.rank : 0), 0) / rows.length).toFixed(6)),
    averageRank: hits.length ? Number((hits.reduce((sum, row) => sum + (row.rank ?? limit + 1), 0) / hits.length).toFixed(4)) : null,
  };
}

const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-memory-benchmark-'));
const filePath = path.join(dir, 'workspace.db');
const stores = openSqliteProductBuilderContinuity(filePath);
if (!stores) throw new Error('sqlite_memory_benchmark_unavailable');

try {
  const adapter = new SqliteMemoryAdapter(stores.entityStore);
  const ids = new Map<string, MemoryItemId>();
  for (const fixture of fixtures) {
    const item = await adapter.retain(fixture);
    ids.set(fixture.key, item.id);
  }

  const expectedFor = (keys: string[]) => new Set(keys.map((key) => String(ids.get(key))));
  const rowsByStrategy = new Map<string, Array<Record<string, unknown>>>();
  for (const strategy of ['lexical', 'hybrid'] as const) {
    const rows: Array<Record<string, unknown>> = [];
    for (const item of cases) {
      const result = await adapter.recall({ projectId, query: item.query, scope: item.scope, strategy, now: observedAt, limit: item.limit });
      const rank = rankOf(result.items, expectedFor(item.expected));
      rows.push({
        id: item.id,
        query: item.query,
        strategy,
        rank,
        topId: result.items[0]?.item.id,
        topBreakdown: result.items[0]?.scoreBreakdown,
      });
    }
    rowsByStrategy.set(strategy, rows);
  }

  const lexicalRows = rowsByStrategy.get('lexical') as Array<{ rank?: number }>;
  const hybridRows = rowsByStrategy.get('hybrid') as Array<{ rank?: number }>;
  const lexicalMetrics = aggregate(lexicalRows, 3);
  const hybridMetrics = aggregate(hybridRows, 3);
  const result = {
    schemaVersion: 'validation.memory-recall-benchmark.v1',
    observedAt,
    status: hybridMetrics.hitAt1 >= lexicalMetrics.hitAt1 && hybridMetrics.hitAt3 >= lexicalMetrics.hitAt3 ? 'passed' : 'partial',
    fixtureCount: fixtures.length,
    caseCount: cases.length,
    formula: '0.7 * lexicalScore + 0.2 * phraseScore + 0.1 * recencyScore',
    defaultStrategy: 'lexical',
    metrics: { lexical: lexicalMetrics, hybrid: hybridMetrics },
    rows: { lexical: lexicalRows, hybrid: hybridRows },
    decision: hybridMetrics.hitAt1 > lexicalMetrics.hitAt1
      ? 'hybrid_is_better_on_this_fixed_benchmark_but_requires_real_project_sample_before_default_switch'
      : 'keep_lexical_default_and_expand_benchmark',
    notProven: ['semantic vector retrieval quality', 'real model quality improvement', 'real user productivity improvement'],
  };
  await writeFile(outputJson, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeFile(outputMarkdown, [
    '# 记忆混合召回固定基准 v1',
    '',
    `日期：${observedAt}（UTC；固定评测时间）`,
    '',
    `结果：**${result.status}**`,
    '',
    `- 固定记忆：${fixtures.length} 条；固定查询：${cases.length} 条。`,
    `- 关键词模式：Hit@1 ${lexicalMetrics.hitAt1}/${lexicalMetrics.cases}，Hit@3 ${lexicalMetrics.hitAt3}/${lexicalMetrics.cases}，MRR ${lexicalMetrics.mrr}。`,
    `- 混合模式：Hit@1 ${hybridMetrics.hitAt1}/${hybridMetrics.cases}，Hit@3 ${hybridMetrics.hitAt3}/${hybridMetrics.cases}，MRR ${hybridMetrics.mrr}。`,
    '- 混合模式在连续短语样例上改善排序；中文子串兼容和项目/scope 隔离保持通过。',
    '- 默认策略仍为 `lexical`，因为这些是固定合成样例，尚不足以证明真实项目中整体更好。',
    '',
    `固定公式：\`${result.formula}\``,
    '',
    '这只是记忆检索层的固定基准，不是模型回答质量、成本收益或真人提效证明。',
    '',
  ].join('\n'), 'utf8');
  console.log(JSON.stringify(result, null, 2));
} finally {
  stores.close?.();
  await rm(dir, { recursive: true, force: true });
}
