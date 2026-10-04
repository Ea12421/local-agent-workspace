# LongMemEval-S 公开协议检索基准（2026-10-03）

数据集：LongMemEval_S cleaned，500 题；按官方检索评测规则排除 30 道 abstention 题，实际评测 470 题。数据 SHA-256：`d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`。

## 本次实际跑的内容

- session-level retrieval；指标名与官方脚本一致：`recall_any`、`recall_all`、`ndcg_any`。
- `bm25`：按官方 `flat-bm25` 的 session 粒度规则重实现，未调用模型。
- `recency`：最近 session 优先的简单基线。
- `oracle`：答案 session 优先，只是上界，不是可部署方案。

## 结果

| 方法 | Recall any@5 | Recall all@5 | NDCG@5 | Recall any@10 | Recall all@10 | NDCG@10 | 取前 5 的平均缩减 |
|---|---:|---:|---:|---:|---:|---:|---:|
| bm25 | 89.4% | 74.7% | 77.0% | 92.5% | 81.3% | 79.1% | 87.3% |
| recency | 23.8% | 5.7% | 9.3% | 41.7% | 13.0% | 14.0% | 89.3% |
| oracle | 100.0% | 99.4% | 100.0% | 100.0% | 100.0% | 100.0% | 88.9% |

图表：`validation/longmemeval-retrieval-v1-2026-10-03.svg`。

## 这份结果能说明什么

- 它是公开 LongMemEval 协议下的“把长历史缩小到若干 session”检索结果。
- 它可以直接观察上下文缩减和证据 session 是否被保留。
- 它还没有运行模型回答，所以不能把 Recall 当作最终问答准确率。
- Oracle 只用来表示上限，不能当成 Harness 成绩。

## 复现

```text
LONGMEMEVAL_INPUT=/path/to/longmemeval_s_cleaned.json npm run benchmark:longmemeval
```

官方协议：<https://github.com/xiaowu0162/LongMemEval>；机器证据：`validation/longmemeval-retrieval-v1-2026-10-03.json`。
