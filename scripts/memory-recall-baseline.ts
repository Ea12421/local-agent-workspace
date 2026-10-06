import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openSqliteProductBuilderContinuity } from '../apps/server/src/persistence.ts';
import { SqliteMemoryAdapter } from '../apps/server/src/memory-adapter.ts';
import type { ProjectId } from '../packages/core/src/index.ts';

const observedAt = '2026-10-04T00:00:00.000Z';
const outputJson = 'validation/memory-recall-hybrid-v1-2026-10-04.json';
const outputMarkdown = 'validation/memory-recall-hybrid-v1-2026-10-04.md';

const dir = await mkdtemp(path.join(os.tmpdir(), 'agent-workspace-memory-baseline-'));
const filePath = path.join(dir, 'workspace.db');
const stores = openSqliteProductBuilderContinuity(filePath);
if (!stores) throw new Error('sqlite_memory_baseline_unavailable');

try {
  const adapter = new SqliteMemoryAdapter(stores.entityStore);
  const projectId = 'project-memory-baseline' as ProjectId;
  const otherProjectId = 'project-memory-baseline-other' as ProjectId;
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
  await adapter.retain({
    projectId: otherProjectId,
    scope: 'rsi.feedback',
    content: 'approval review passed in another project',
    now: '2026-10-03T00:00:00.000Z',
  });

  const query = 'approval review passed';
  const lexical = await adapter.recall({ projectId, query, strategy: 'lexical', now: observedAt, limit: 2 });
  const hybrid = await adapter.recall({ projectId, query, strategy: 'hybrid', now: observedAt, limit: 2 });
  const isolated = await adapter.recall({ projectId, query, strategy: 'hybrid', now: observedAt, limit: 5 });
  const result = {
    schemaVersion: 'validation.memory-recall-hybrid.v1',
    observedAt,
    status: lexical.items[0]?.item.id === fragmented.id
      && hybrid.items[0]?.item.id === contiguous.id
      && isolated.items.every((item) => item.item.projectId === projectId)
      ? 'passed'
      : 'failed',
    formula: '0.7 * lexicalScore + 0.2 * phraseScore + 0.1 * recencyScore',
    defaultStrategy: 'lexical',
    cases: [
      {
        id: 'contiguous-phrase',
        query,
        expected: `hybrid top=${contiguous.id}`,
        lexicalTop: lexical.items[0]?.item.id,
        hybridTop: hybrid.items[0]?.item.id,
        hybridBreakdown: hybrid.items[0]?.scoreBreakdown,
        status: lexical.items[0]?.item.id === fragmented.id && hybrid.items[0]?.item.id === contiguous.id ? 'passed' : 'failed',
      },
      {
        id: 'project-isolation',
        expected: 'no result from another project',
        returnedProjectIds: [...new Set(isolated.items.map((item) => String(item.item.projectId)))],
        status: isolated.items.every((item) => item.item.projectId === projectId) ? 'passed' : 'failed',
      },
    ],
    conclusion: 'hybrid improves phrase ordering on the fixed case; keep lexical as the default until a larger benchmark confirms the trade-off.',
    notProven: ['semantic vector retrieval quality', 'real model quality improvement', 'real user productivity improvement'],
  };
  await writeFile(outputJson, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeFile(outputMarkdown, [
    '# 记忆混合召回 v1 验证',
    '',
    `日期：${observedAt}（UTC；本地评测固定时间）`,
    '',
    `结果：**${result.status}**`,
    '',
    '- 关键词基线在固定样例中因新鲜度并列规则把较新的拆散词序记录排在前面。',
    '- 混合模式加入连续短语分数后，把完整短语记录排到第一位。',
    '- 项目隔离仍然生效，没有召回另一个项目的记忆。',
    '- 默认仍是 `lexical`，没有未经更大评测就改变 RSI 行为。',
    '',
    `固定公式：\`${result.formula}\``,
    '',
    '这只是固定本地样例的排序证据，不是语义检索、模型质量或真人提效证明。',
    '',
  ].join('\n'), 'utf8');
  console.log(JSON.stringify(result, null, 2));
} finally {
  stores.close?.();
  await rm(dir, { recursive: true, force: true });
}
