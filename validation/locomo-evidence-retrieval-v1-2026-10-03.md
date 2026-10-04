# LoCoMo evidence-recall 公开数据诊断（2026-10-03）

数据集：LoCoMo 官方 locomo10.json，10 段对话、1982 道带 evidence 标签的 QA；另有 4 道无 evidence 题；8 个 evidence ID 在语料中不存在，保留在分母中。数据 SHA-256：79fa87e90f04081343b8c8debecb80a9a6842b76a7aa537dc9fdf651ea698ff4。

## 本次实际跑的内容

- 按对话 turn 的官方 `dia_id` 建立检索语料；文档内容为 speaker + dialog text。
- 使用确定性的 lexical BM25，检查官方 evidence ID 是否被前 k 个 turn 找回。
- 记录 `evidence_any`、`evidence_all` 和上下文缩减；没有调用模型。

## 结果

| 指标 | 结果 |
|---|---:|
| Evidence any@5 | 49.9% |
| Evidence all@5 | 42.8% |
| Evidence any@10 | 57.6% |
| Evidence all@10 | 49.2% |
| 前 5 turn 平均上下文缩减 | 99.1% |

图表：`validation/locomo-evidence-retrieval-v1-2026-10-03.svg`。

## 解释边界

- 这是一份使用 LoCoMo 官方 evidence 标签的检索诊断，便于观察上下文选择是否覆盖标注证据。
- 数据标注中有 8 个 evidence ID 不在对应对话语料中；本报告不修正、不删除，召回无法命中它们。
- LoCoMo 官方 QA 评测还需要模型生成答案并按官方 F1/类别规则评分；本轮没有模型调用，因此不报告官方 QA/F1。
- 它不能和 LongMemEval 的分数直接排名，也不能证明 Harness 或多 Bot 的整体质量。

## 复现

```text
LOCOMO_INPUT=/path/to/locomo10.json npm run benchmark:locomo
```

官方协议与数据：<https://github.com/snap-research/LoCoMo>；机器证据：`validation/locomo-evidence-retrieval-v1-2026-10-03.json`。
