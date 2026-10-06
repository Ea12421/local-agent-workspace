import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const inputPath = process.env.LONGMEMEVAL_INPUT ?? '/private/tmp/longmemeval_s_cleaned.json';
const evidencePath = 'validation/longmemeval-retrieval-v1-2026-10-03.json';
const reportPath = 'validation/longmemeval-retrieval-v1-2026-10-03.md';
const chartPath = 'validation/longmemeval-retrieval-v1-2026-10-03.svg';
const ks = [1, 3, 5, 10, 30, 50];
const bm25Config = { k1: 1.5, b: 0.75, epsilon: 0.25, tokenization: 'official flat-bm25 compatible whitespace split' };

function officialTokens(text) {
  // LongMemEval's official flat-bm25 path uses doc.split(" ") and query.split(" ").
  return String(text).split(' ');
}

function sessionText(session) {
  return session.filter((turn) => turn.role === 'user').map((turn) => turn.content).join(' ');
}

function bm25Rank(query, corpus) {
  const docs = corpus.map((text) => officialTokens(text));
  const queryTokens = officialTokens(query);
  const docCount = docs.length;
  const avgdl = docs.reduce((sum, doc) => sum + doc.length, 0) / Math.max(1, docCount);
  const documentFrequency = new Map();
  for (const doc of docs) {
    for (const token of new Set(doc)) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
  }
  const rawIdfs = [...documentFrequency.values()].map((df) => Math.log(docCount - df + 0.5) - Math.log(df + 0.5));
  const averageIdf = rawIdfs.length ? rawIdfs.reduce((sum, value) => sum + value, 0) / rawIdfs.length : 0;
  const scores = docs.map((doc, index) => {
    const counts = new Map();
    for (const token of doc) counts.set(token, (counts.get(token) ?? 0) + 1);
    return queryTokens.reduce((score, token) => {
      const df = documentFrequency.get(token) ?? 0;
      if (df === 0) return score;
      const idf = Math.max(Math.log(docCount - df + 0.5) - Math.log(df + 0.5), bm25Config.epsilon * averageIdf);
      const frequency = counts.get(token) ?? 0;
      if (frequency === 0) return score;
      const denominator = frequency + bm25Config.k1 * (1 - bm25Config.b + bm25Config.b * (doc.length / Math.max(1, avgdl)));
      return score + idf * ((frequency * (bm25Config.k1 + 1)) / denominator);
    }, 0);
  });
  // numpy.argsort(scores)[::-1] (the official implementation) reverses ties too.
  return scores.map((score, index) => ({ score, index })).sort((a, b) => b.score - a.score || b.index - a.index).map(({ index }) => index);
}

function dcg(relevances, k) {
  return relevances.slice(0, k).reduce((sum, relevance, index) => sum + (index === 0 ? relevance : relevance / Math.log2(index + 2)), 0);
}

function metrics(rankings, correctIds, corpusIds, k) {
  const recalled = new Set(rankings.slice(0, k).map((index) => corpusIds[index]));
  const recallAny = correctIds.some((id) => recalled.has(id)) ? 1 : 0;
  const recallAll = correctIds.every((id) => recalled.has(id)) ? 1 : 0;
  const relevances = rankings.map((index) => correctIds.includes(corpusIds[index]) ? 1 : 0);
  const ideal = dcg([...correctIds.map(() => 1), ...corpusIds.filter((id) => !correctIds.includes(id)).map(() => 0)], k);
  const ndcg = ideal === 0 ? 0 : dcg(relevances, k) / ideal;
  return { recallAny, recallAll, ndcg };
}

function tokenEstimate(text) {
  return Math.ceil(Buffer.byteLength(text, 'utf8') / 4);
}

function aggregate(values) {
  return Number((values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(4));
}

function methodRanking(method, question, ids, texts) {
  if (method === 'oracle') {
    const answerIds = new Set(question.answer_session_ids);
    return ids.map((id, index) => ({ index, answer: answerIds.has(id) })).sort((a, b) => Number(b.answer) - Number(a.answer) || a.index - b.index).map(({ index }) => index);
  }
  if (method === 'recency') return ids.map((_, index) => index).reverse();
  if (method === 'bm25') return bm25Rank(question.question, texts);
  throw new Error(`unknown method: ${method}`);
}

function summarizeMethod(entries, method, abstentionCount) {
  const valid = entries.filter((entry) => entry.method === method);
  const result = { method, questionCount: valid.length, excludedAbstentionCount: abstentionCount, session: {}, context: {} };
  for (const k of ks) {
    result.session[`recall_any@${k}`] = aggregate(valid.map((entry) => entry.metrics[`recall_any@${k}`]));
    result.session[`recall_all@${k}`] = aggregate(valid.map((entry) => entry.metrics[`recall_all@${k}`]));
    result.session[`ndcg_any@${k}`] = aggregate(valid.map((entry) => entry.metrics[`ndcg_any@${k}`]));
  }
  result.context = {
    fullTokensMean: aggregate(valid.map((entry) => entry.fullTokens)),
    selectedTokensMeanAt5: aggregate(valid.map((entry) => entry.selectedTokensAt5)),
    selectedTokensMeanAt10: aggregate(valid.map((entry) => entry.selectedTokensAt10)),
    reductionAt5: aggregate(valid.map((entry) => entry.reductionAt5)),
    reductionAt10: aggregate(valid.map((entry) => entry.reductionAt10)),
  };
  const categories = [...new Set(valid.map((entry) => entry.questionType))].sort();
  result.byQuestionType = Object.fromEntries(categories.map((category) => {
    const rows = valid.filter((entry) => entry.questionType === category);
    return [category, { count: rows.length, recallAllAt5: aggregate(rows.map((entry) => entry.metrics['recall_all@5'])), recallAnyAt5: aggregate(rows.map((entry) => entry.metrics['recall_any@5'])) }];
  }));
  return result;
}

const raw = await readFile(inputPath, 'utf8');
const dataset = JSON.parse(raw);
assert.equal(Array.isArray(dataset), true);
assert.equal(dataset.length, 500);
const datasetSha256 = createHash('sha256').update(raw).digest('hex');
const methods = ['bm25', 'recency', 'oracle'];
const entries = [];

for (const question of dataset) {
  if (question.question_id.endsWith('_abs')) continue;
  const corpusIds = question.haystack_session_ids;
  const corpusTexts = question.haystack_sessions.map(sessionText);
  const answerIds = question.answer_session_ids;
  assert.ok(answerIds.every((id) => corpusIds.includes(id)), `${question.question_id} has an answer session outside corpus`);
  const fullTokens = tokenEstimate(corpusTexts.join('\n'));
  for (const method of methods) {
    const rankings = methodRanking(method, question, corpusIds, corpusTexts);
    const metricsByK = Object.fromEntries(ks.flatMap((k) => {
      const result = metrics(rankings, answerIds, corpusIds, k);
      return [[`recall_any@${k}`, result.recallAny], [`recall_all@${k}`, result.recallAll], [`ndcg_any@${k}`, Number(result.ndcg.toFixed(4))]];
    }));
    const selectedAt5 = rankings.slice(0, 5).map((index) => corpusTexts[index]).join('\n');
    const selectedAt10 = rankings.slice(0, 10).map((index) => corpusTexts[index]).join('\n');
    entries.push({
      questionId: question.question_id,
      questionType: question.question_type,
      method,
      answerSessionCount: answerIds.length,
      fullTokens,
      selectedTokensAt5: tokenEstimate(selectedAt5),
      selectedTokensAt10: tokenEstimate(selectedAt10),
      reductionAt5: 1 - (tokenEstimate(selectedAt5) / Math.max(1, fullTokens)),
      reductionAt10: 1 - (tokenEstimate(selectedAt10) / Math.max(1, fullTokens)),
      metrics: metricsByK,
    });
  }
}

const abstentionCount = dataset.filter((question) => question.question_id.endsWith('_abs')).length;
const summaries = Object.fromEntries(methods.map((method) => [method, summarizeMethod(entries, method, abstentionCount)]));
const summaryRows = methods.map((method) => summaries[method]);

const evidence = {
  validation: 'longmemeval_retrieval_v1',
  observedAt: '2026-10-03T00:00:00+08:00',
  source: {
    dataset: 'LongMemEval_S cleaned',
    officialRepository: 'https://github.com/xiaowu0162/LongMemEval',
    inputPath,
    sha256: datasetSha256,
    questionCount: dataset.length,
    evaluatedQuestionCount: dataset.length - abstentionCount,
    excludedAbstentionCount: abstentionCount,
  },
  protocol: {
    granularity: 'session',
    metrics: 'official metric names recall_any, recall_all, ndcg_any at k=1,3,5,10,30,50',
    methods: {
      bm25: 'reimplementation of official flat-bm25 session retrieval with whitespace-compatible tokenization',
      recency: 'most recent sessions first, deterministic baseline',
      oracle: 'answer sessions first, upper bound only; not a deployable method',
    },
    modelCalls: 0,
    answerGeneration: 'not run; this is the official retrieval layer only',
  },
  summaries: summaryRows,
  samples: entries.filter((entry) => entry.method === 'bm25').slice(0, 12),
  boundary: '结果是公开 LongMemEval_S 的 session retrieval/上下文缩减结果，不是最终问答准确率，不是 Harness 总分，也不能与不同模型、不同 judge 或不同 k 的公开成绩直接排名。',
  result: 'passed',
};

const maxRecall = Math.max(...summaryRows.map((row) => row.session['recall_all@10']));
const svgWidth = 920;
const svgHeight = 410;
const chartRows = methods.map((method, index) => ({ method, value: summaries[method].session['recall_all@10'], y: 80 + index * 90 }));
const chart = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">`,
  '<style>text{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;fill:#172033} .muted{fill:#5a667a;font-size:13px} .bar{fill:#4f7cff} .bar.oracle{fill:#9a6bff} .bar.recency{fill:#8b98aa}</style>',
  '<rect width="100%" height="100%" fill="#f7f9fc"/>',
  '<text x="32" y="34" font-size="22" font-weight="700">LongMemEval-S session retrieval</text>',
  '<text x="32" y="58" class="muted">我们的可复现 BM25 / 近期窗口 / Oracle 对照；指标：recall_all@10；不含模型回答。</text>',
  '<line x1="190" y1="90" x2="850" y2="90" stroke="#ccd5e2"/>',
  ...chartRows.map((row) => [`<text x="32" y="${row.y + 26}" font-size="16" font-weight="600">${row.method}</text>`, `<rect x="190" y="${row.y}" width="${Math.max(2, 660 * row.value)}" height="36" rx="6" class="bar ${row.method}"/>`, `<text x="${205 + 660 * row.value}" y="${row.y + 25}" font-size="16" font-weight="700">${(row.value * 100).toFixed(1)}%</text>`].join('')),
  '<text x="32" y="370" class="muted">数据：LongMemEval_S cleaned；问题：470（排除官方 abstention 题）；完整协议与哈希见 JSON。</text>',
  '</svg>',
].join('');

const markdown = [
  '# LongMemEval-S 公开协议检索基准（2026-10-03）',
  '',
  `数据集：LongMemEval_S cleaned，500 题；按官方检索评测规则排除 ${abstentionCount} 道 abstention 题，实际评测 ${dataset.length - abstentionCount} 题。数据 SHA-256：\`${datasetSha256}\`。`,
  '',
  '## 本次实际跑的内容',
  '',
  '- session-level retrieval；指标名与官方脚本一致：`recall_any`、`recall_all`、`ndcg_any`。',
  '- `bm25`：按官方 `flat-bm25` 的 session 粒度规则重实现，未调用模型。',
  '- `recency`：最近 session 优先的简单基线。',
  '- `oracle`：答案 session 优先，只是上界，不是可部署方案。',
  '',
  '## 结果',
  '',
  '| 方法 | Recall any@5 | Recall all@5 | NDCG@5 | Recall any@10 | Recall all@10 | NDCG@10 | 取前 5 的平均缩减 |',
  '|---|---:|---:|---:|---:|---:|---:|---:|',
  ...summaryRows.map((row) => `| ${row.method} | ${(row.session['recall_any@5'] * 100).toFixed(1)}% | ${(row.session['recall_all@5'] * 100).toFixed(1)}% | ${(row.session['ndcg_any@5'] * 100).toFixed(1)}% | ${(row.session['recall_any@10'] * 100).toFixed(1)}% | ${(row.session['recall_all@10'] * 100).toFixed(1)}% | ${(row.session['ndcg_any@10'] * 100).toFixed(1)}% | ${(row.context.reductionAt5 * 100).toFixed(1)}% |`),
  '',
  `图表：\`${chartPath}\`。`,
  '',
  '## 这份结果能说明什么',
  '',
  '- 它是公开 LongMemEval 协议下的“把长历史缩小到若干 session”检索结果。',
  '- 它可以直接观察上下文缩减和证据 session 是否被保留。',
  '- 它还没有运行模型回答，所以不能把 Recall 当作最终问答准确率。',
  '- Oracle 只用来表示上限，不能当成 Harness 成绩。',
  '',
  '## 复现',
  '',
  '```text',
  'LONGMEMEVAL_INPUT=/path/to/longmemeval_s_cleaned.json npm run benchmark:longmemeval',
  '```',
  '',
  `官方协议：<https://github.com/xiaowu0162/LongMemEval>；机器证据：\`${evidencePath}\`。`,
].join('\n');

await mkdir('validation', { recursive: true });
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
await writeFile(reportPath, `${markdown}\n`, 'utf8');
await writeFile(chartPath, `${chart}\n`, 'utf8');
console.log(`LongMemEval retrieval benchmark passed: ${evidencePath}`);
console.log(`report: ${reportPath}`);
console.log(`chart: ${chartPath}`);
