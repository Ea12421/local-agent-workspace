import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const inputPath = process.env.LOCOMO_INPUT ?? '/private/tmp/LoCoMo-official/data/locomo10.json';
const evidencePath = 'validation/locomo-evidence-retrieval-v1-2026-10-03.json';
const reportPath = 'validation/locomo-evidence-retrieval-v1-2026-10-03.md';
const chartPath = 'validation/locomo-evidence-retrieval-v1-2026-10-03.svg';
const ks = [1, 3, 5, 10, 20];

function tokenize(text) {
  return String(text).toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
}

function bm25Rank(query, corpus) {
  const docs = corpus.map(tokenize);
  const queryTokens = tokenize(query);
  const n = docs.length;
  const avgdl = docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, n);
  const df = new Map();
  for (const doc of docs) for (const token of new Set(doc)) df.set(token, (df.get(token) ?? 0) + 1);
  const idfValues = [...df.values()].map((value) => Math.log(1 + (n - value + 0.5) / (value + 0.5)));
  const avgIdf = idfValues.length ? idfValues.reduce((sum, value) => sum + value, 0) / idfValues.length : 0;
  const scores = docs.map((doc) => {
    const counts = new Map();
    for (const token of doc) counts.set(token, (counts.get(token) ?? 0) + 1);
    return queryTokens.reduce((score, token) => {
      const frequency = counts.get(token) ?? 0;
      const docFrequency = df.get(token) ?? 0;
      if (!frequency || !docFrequency) return score;
      const idf = Math.max(Math.log(1 + (n - docFrequency + 0.5) / (docFrequency + 0.5)), 0.25 * avgIdf);
      const denominator = frequency + 1.5 * (1 - 0.75 + 0.75 * (doc.length / Math.max(1, avgdl)));
      return score + idf * ((frequency * 2.5) / denominator);
    }, 0);
  });
  return scores.map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .map(({ index }) => index);
}

function mean(values) {
  return Number((values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(4));
}

function tokenEstimate(text) {
  return Math.ceil(Buffer.byteLength(text, 'utf8') / 4);
}

const raw = await readFile(inputPath, 'utf8');
const dataset = JSON.parse(raw);
assert.equal(Array.isArray(dataset), true);
assert.equal(dataset.length, 10);
const datasetSha256 = createHash('sha256').update(raw).digest('hex');
const entries = [];
let unknownEvidenceIdCount = 0;
for (const sample of dataset) {
  const sessionKeys = Object.keys(sample.conversation)
    .filter((key) => /^session_\d+$/.test(key))
    .sort((a, b) => Number(a.split('_')[1]) - Number(b.split('_')[1]));
  const corpus = sessionKeys.flatMap((sessionKey) => sample.conversation[sessionKey].map((turn) => ({
    id: turn.dia_id,
    date: sample.conversation[`${sessionKey}_date_time`],
    text: `${turn.speaker} said ${turn.text}`,
  })));
  const ids = corpus.map((turn) => turn.id);
  const texts = corpus.map((turn) => turn.text);
  for (const [qaIndex, qa] of sample.qa.entries()) {
    const evidenceIds = (qa.evidence ?? []).flatMap((value) => String(value).split(';').map((id) => id.trim())).filter(Boolean);
    if (evidenceIds.length === 0) continue;
    unknownEvidenceIdCount += evidenceIds.filter((id) => !ids.includes(id)).length;
    const ranking = bm25Rank(qa.question, texts);
    const fullTokens = tokenEstimate(texts.join('\n'));
    const row = {
      sampleId: sample.sample_id,
      qaIndex,
      category: qa.category,
      question: qa.question,
      evidenceCount: evidenceIds.length,
      fullTokens,
      metrics: {},
    };
    for (const k of ks) {
      const selected = new Set(ranking.slice(0, k).map((index) => ids[index]));
      const any = evidenceIds.some((id) => selected.has(id));
      const all = evidenceIds.every((id) => selected.has(id));
      row.metrics[`evidence_any@${k}`] = any ? 1 : 0;
      row.metrics[`evidence_all@${k}`] = all ? 1 : 0;
    }
    row.selectedTokensAt5 = tokenEstimate(ranking.slice(0, 5).map((index) => texts[index]).join('\n'));
    row.selectedTokensAt10 = tokenEstimate(ranking.slice(0, 10).map((index) => texts[index]).join('\n'));
    row.reductionAt5 = 1 - (row.selectedTokensAt5 / Math.max(1, fullTokens));
    row.reductionAt10 = 1 - (row.selectedTokensAt10 / Math.max(1, fullTokens));
    entries.push(row);
  }
}

const summary = {
  questionCount: entries.length,
  excludedNoEvidenceCount: dataset.reduce((sum, sample) => sum + sample.qa.filter((qa) => !qa.evidence?.length).length, 0),
  unknownEvidenceIdCount,
  evidence: Object.fromEntries(ks.flatMap((k) => [[`evidence_any@${k}`, mean(entries.map((entry) => entry.metrics[`evidence_any@${k}`]))], [`evidence_all@${k}`, mean(entries.map((entry) => entry.metrics[`evidence_all@${k}`]))]])),
  context: {
    fullTokensMean: mean(entries.map((entry) => entry.fullTokens)),
    reductionAt5: mean(entries.map((entry) => entry.reductionAt5)),
    reductionAt10: mean(entries.map((entry) => entry.reductionAt10)),
  },
  byCategory: Object.fromEntries([...new Set(entries.map((entry) => entry.category))].sort((a, b) => a - b).map((category) => {
    const rows = entries.filter((entry) => entry.category === category);
    return [String(category), { questionCount: rows.length, evidenceAllAt5: mean(rows.map((entry) => entry.metrics['evidence_all@5'])), evidenceAnyAt5: mean(rows.map((entry) => entry.metrics['evidence_any@5'])) }];
  })),
};

const evidence = {
  validation: 'locomo_evidence_retrieval_v1',
  observedAt: '2026-10-03T04:55:00+08:00',
  source: {
    dataset: 'LoCoMo locomo10.json',
    officialRepository: 'https://github.com/snap-research/LoCoMo',
    inputPath,
    sha256: datasetSha256,
    officialRepositoryCommit: '3eb6f2c585f5e1699204e3c3bdf7adc5c28cb376',
    conversationCount: dataset.length,
    qaCount: dataset.reduce((sum, sample) => sum + sample.qa.length, 0),
  },
  protocol: {
    granularity: 'dialog-turn',
    metric: 'official evidence IDs used as labels; evidence_any/evidence_all at k',
    method: 'lexical BM25 diagnostic over speaker plus dialog text',
    modelCalls: 0,
    answerGeneration: 'not run',
    unknownEvidenceHandling: 'retain unknown labels in denominator and report count; they cannot be retrieved',
  },
  summary,
  samples: entries.slice(0, 20),
  boundary: '这是使用 LoCoMo 官方 evidence 标签的检索诊断，不是 LoCoMo 官方模型 QA/F1 结果；没有模型调用，不能代表 reader 质量或 Harness 排名。',
  result: 'passed',
};

const chartRows = [5, 10].map((k, index) => ({ k, value: summary.evidence[`evidence_all@${k}`], y: 90 + index * 90 }));
const chart = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="920" height="330" viewBox="0 0 920 330">',
  '<style>text{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;fill:#172033}.muted{fill:#5a667a;font-size:13px}.bar{fill:#1e9b83}</style>',
  '<rect width="100%" height="100%" fill="#f7f9fc"/>',
  '<text x="32" y="34" font-size="22" font-weight="700">LoCoMo evidence retrieval diagnostic</text>',
  '<text x="32" y="58" class="muted">10 conversations / 1,982 labeled QA；BM25 evidence_all；不是官方 QA/F1。</text>',
  ...chartRows.map((row) => [`<text x="32" y="${row.y + 26}" font-size="16" font-weight="600">evidence_all@${row.k}</text>`, `<rect x="190" y="${row.y}" width="${Math.max(2, 660 * row.value)}" height="36" rx="6" class="bar"/>`, `<text x="${205 + 660 * row.value}" y="${row.y + 25}" font-size="16" font-weight="700">${(row.value * 100).toFixed(1)}%</text>`].join('')),
  '<text x="32" y="290" class="muted">数据：LoCoMo locomo10.json；evidence 为空的 4 道题未进入检索召回统计。</text>',
  '</svg>',
].join('');

const markdown = [
  '# LoCoMo evidence-recall 公开数据诊断（2026-10-03）',
  '',
  `数据集：LoCoMo 官方 locomo10.json，${dataset.length} 段对话、${summary.questionCount} 道带 evidence 标签的 QA；另有 ${summary.excludedNoEvidenceCount} 道无 evidence 题；${summary.unknownEvidenceIdCount} 个 evidence ID 在语料中不存在，保留在分母中。数据 SHA-256：${datasetSha256}。`,
  '',
  '## 本次实际跑的内容',
  '',
  '- 按对话 turn 的官方 `dia_id` 建立检索语料；文档内容为 speaker + dialog text。',
  '- 使用确定性的 lexical BM25，检查官方 evidence ID 是否被前 k 个 turn 找回。',
  '- 记录 `evidence_any`、`evidence_all` 和上下文缩减；没有调用模型。',
  '',
  '## 结果',
  '',
  '| 指标 | 结果 |',
  '|---|---:|',
  `| Evidence any@5 | ${(summary.evidence['evidence_any@5'] * 100).toFixed(1)}% |`,
  `| Evidence all@5 | ${(summary.evidence['evidence_all@5'] * 100).toFixed(1)}% |`,
  `| Evidence any@10 | ${(summary.evidence['evidence_any@10'] * 100).toFixed(1)}% |`,
  `| Evidence all@10 | ${(summary.evidence['evidence_all@10'] * 100).toFixed(1)}% |`,
  `| 前 5 turn 平均上下文缩减 | ${(summary.context.reductionAt5 * 100).toFixed(1)}% |`,
  '',
  `图表：\`${chartPath}\`。`,
  '',
  '## 解释边界',
  '',
  '- 这是一份使用 LoCoMo 官方 evidence 标签的检索诊断，便于观察上下文选择是否覆盖标注证据。',
  `- 数据标注中有 ${summary.unknownEvidenceIdCount} 个 evidence ID 不在对应对话语料中；本报告不修正、不删除，召回无法命中它们。`,
  '- LoCoMo 官方 QA 评测还需要模型生成答案并按官方 F1/类别规则评分；本轮没有模型调用，因此不报告官方 QA/F1。',
  '- 它不能和 LongMemEval 的分数直接排名，也不能证明 Harness 或多 Bot 的整体质量。',
  '',
  '## 复现',
  '',
  '```text',
  'LOCOMO_INPUT=/path/to/locomo10.json npm run benchmark:locomo',
  '```',
  '',
  '官方协议与数据：<https://github.com/snap-research/LoCoMo>；机器证据：`' + evidencePath + '`。',
].join('\n');

await mkdir('validation', { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
await writeFile(reportPath, `${markdown}\n`, 'utf8');
await writeFile(chartPath, `${chart}\n`, 'utf8');
console.log(`LoCoMo evidence retrieval diagnostic passed: ${evidencePath}`);
console.log(`report: ${reportPath}`);
console.log(`chart: ${chartPath}`);
