# 记忆混合召回 v1

日期：2026-10-04（Asia/Shanghai）
状态：`implementation-complete`

## 目标

在不引入向量数据库、Embedding（向量表示）或第三方运行时的前提下，评估并补强当前 SQLite 记忆召回：

```text
关键词覆盖度
    +
查询词序/短语连续性
    +
时间新鲜度
```

原关键词召回保留为 `lexical`（关键词模式）基线；新增 `hybrid`（混合模式）作为可选策略，默认不改变现有 RSI 行为。

## 范围

- `RecallMemoryInput.strategy` 支持 `lexical | hybrid`。
- `RecallMemoryInput.now` 允许固定评测时间，避免测试依赖当前系统时间。
- `RecalledMemory` 返回最终相关度和可解释的分项分数。
- 混合模式使用固定、可回放的本地公式：

  ```text
  relevance = 0.7 × lexicalScore
            + 0.2 × phraseScore
            + 0.1 × recencyScore
  ```

- `lexicalScore` 是命中的不同查询词占比。
- `phraseScore` 是查询词是否按顺序连续出现。
- `recencyScore` 按记忆更新时间计算，30 天为衰减尺度。
- 只对至少命中一个查询词的记忆排序；项目范围和 scope 隔离保持不变。

## 不在本阶段

- 不接向量数据库、Embedding、图检索或外部 Hindsight 运行时。
- 不把混合模式直接设为默认模式。
- 不把固定记忆样例的排序改善写成真实模型质量或真人提效。
- 不新增 SQLite migration（数据库迁移）。

## 验收

- [x] 关键词模式结果保持向后兼容。
- [x] 混合模式能解释 lexical、phrase、recency 三个分项分数。
- [x] 固定任务中，完整连续短语可以压过“词都命中但顺序被拆散”的更新记忆。
- [x] 项目隔离、scope 过滤、幂等保存和 SQLite 重启读回不回归。
- [x] `npm run memory:baseline` 可重跑并生成 JSON/Markdown 证据。
- [x] 更大固定基准包含 11 条记忆和 6 条查询，并比较 Hit@1、Hit@3、MRR 和平均排名。
- [x] typecheck、相关测试、全量测试和 state validation 通过。

## 扩大固定基准结果（2026-10-04）

- 关键词模式：Hit@1 `2/6`，Hit@3 `6/6`，MRR `0.638889`，平均排名 `1.8333`。
- 混合模式：Hit@1 `4/6`，Hit@3 `6/6`，MRR `0.833333`，平均排名 `1.3333`。
- 中文子串兼容、项目隔离和 scope（范围）过滤均通过。
- 结论：混合模式在这组固定合成样例中排名更好，但样本不足以证明真实项目记忆整体收益，因此默认仍保持 `lexical`。

完整回放见 `validation/memory-recall-benchmark-v1-2026-10-04.json/.md`。

## RSI 单次运行接入（2026-10-04）

混合召回已经接入受控 RSI，但采用“单次选择、默认不变”的方式：Web 的“受控自动更新”卡片提供 `lexical`（关键词模式，默认）和 `hybrid`（混合模式）两个选项；服务端只接受这两个值。选择写入 `improvement.run_started`、候选提案和本地 Run 回读，非法值以 HTTP 400 拒绝。

这让两种策略可以在同一控制面内比较，同时避免一次固定样本的结果直接改变所有项目的默认行为。验证卡见 `validation/memory-recall-strategy-control-v1-2026-10-04.json/.md`。

## 结论边界

如果固定任务只显示局部排序改善，下一步仍需更大的真实记忆样本或公开记忆协议后，才能决定是否把 `hybrid` 设为默认；当前实现只提供可比较的检索策略。
