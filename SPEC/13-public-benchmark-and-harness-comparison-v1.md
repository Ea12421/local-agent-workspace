# 公开 Benchmark 与 Harness 对照规范 v1

更新时间：2026-10-03  
适用范围：Local Agent Workspace 的上下文检索、恢复和可接入 Harness 评测  
事实源：`RUN_STATE.json`、`validation/*.json`、`packages/core` 的 Run/Event 契约

## 1. 这份规范解决什么问题

本项目要回答两个不同问题，不能混成一个分数：

1. **长历史里能否找回正确证据**：检索、压缩和上下文恢复是否可靠。
2. **拿到相同证据后，模型能否正确回答**：模型、提示词和判分器的问答质量如何。

公开 Benchmark 负责提供可复核的题目、标签和指标；Local Agent Workspace 负责保留 Run、RunEvent、Provider receipt、恢复包和权限边界。任何一次结果都必须能追溯到数据版本、题目子集、模型配置、提示词、判分器和重试记录。

## 2. Benchmark 矩阵

| 协议 | 主要测什么 | 首选用途 | 当前状态 | 不能推导出的结论 |
|---|---|---|---|---|
| [LongMemEval](https://github.com/xiaowu0162/LongMemEval) | 跨多 session 的信息提取、推理、知识更新、时间推理和 abstention | 首个长期记忆主基准；先做官方 session retrieval，再做 reader/QA | **已下载并核验 LongMemEval-S cleaned；500 题中 470 题完成官方检索层基线** | 检索 Recall 不是最终答案准确率，也不代表多 Bot 优势 |
| [LoCoMo](https://github.com/snap-research/LoCoMo) | 长对话 QA、事件摘要和多 session 记忆 | 第二个现实对话风格的长期记忆基准 | **已读取官方 10 段对话并完成 evidence-recall 诊断；未运行官方模型 QA/F1** | 不能和 LongMemEval 分数直接排名 |
| [LongBench](https://github.com/THUDM/LongBench) | 多任务长上下文理解、检索、摘要和代码等 | 检查上下文压缩后多任务能力是否退化 | 已完成协议审计，尚未在本项目运行 | 不能把不同模型/语言/任务的总分当作单一产品分数 |
| [RULER](https://github.com/NVIDIA/RULER) | 可配置长度和难度的合成 needle/sequence stress test | 测有效上下文长度、长度退化和任务难度 | 已完成协议审计，尚未在本项目运行 | 合成任务通过不等于真实工作流提效 |
| [NoLiMa](https://arxiv.org/abs/2502.05167) | 超越字面匹配的关联检索与长上下文能力 | 检查“关键词命中”以外的记忆能力 | 已完成论文协议审计，尚未在本项目运行 | 不能用来替代长期记忆的完整 QA 评估 |

### 2.1 当前已执行的公开结果

证据文件：

- 机器结果：`validation/longmemeval-retrieval-v1-2026-10-03.json`
- 人类报告：`validation/longmemeval-retrieval-v1-2026-10-03.md`
- 图表：`validation/longmemeval-retrieval-v1-2026-10-03.svg`
- 数据：LongMemEval-S cleaned，500 题，SHA-256 `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`
- 官方仓库提交：`9e0b455f4ef0e2ab8f2e582289761153549043fc`

实际执行的是官方检索层的 session 粒度：

- `bm25`：按官方 `flat-bm25` 的 `doc.split(" ")` / `query.split(" ")` 规则重实现；
- `recency`：最近 session 优先，作为简单基线；
- `oracle`：答案 session 优先，只表示上界，不是可部署方法；
- 按官方规则排除 30 道 abstention 题，实际评测 470 题；
- 未调用模型、未使用模型自评、未把检索结果写成 QA 准确率。

当前公开结果的阅读方式：

| 方法 | Recall any@5 | Recall all@5 | NDCG@5 | Recall all@10 | 前 5 平均上下文缩减 |
|---|---:|---:|---:|---:|---:|
| BM25 | 88.5% | 73.8% | 76.2% | 80.4% | 87.3% |
| 最近优先 | 23.8% | 5.7% | 9.3% | 13.0% | 89.3% |
| Oracle 上界 | 100.0% | 99.4% | 100.0% | 100.0% | 88.9% |

结论只到这里：BM25 比“只拿最近对话”更能保留正确证据，同时显著缩小送入后续模型的上下文。它还没有证明模型读到这些证据后一定答对。

LoCoMo 的独立诊断见 `validation/locomo-evidence-retrieval-v1-2026-10-03.{json,md,svg}`：1,982 道带 evidence 标签的 QA 中，BM25 的 `evidence_any@5=49.9%`、`evidence_all@5=42.8%`，前 5 turn 平均上下文缩减 99.1%。LoCoMo 数据中有 8 个标注 evidence ID 不存在于对应语料；结果保留这些标签并单独报告，不能把它当作官方 QA/F1。

## 3. 同协议 Harness 比较规则

比较 Workspace、LangGraph、OpenAI Agents SDK、Pi 或其他 Harness 时，只有以下条件全部相同，结果才进入“同协议对照”：

1. 相同 Benchmark 数据文件及 SHA-256；
2. 相同题目子集、顺序和排除规则；
3. 相同 Provider、实际模型版本、认证/计费来源记录；
4. 相同 system/developer/user prompt、工具定义、输出 Schema 和上下文上限；
5. 相同 temperature、top-p、seed（若 Provider 支持）、超时和最大重试次数；
6. 相同 reader/judge、版本、评分 rubric 和 abstention 处理；
7. 相同工具权限、网络开关、文件输入和缓存策略；
8. 每个题目都保存原始输出 hash、解析结果、usage/cache receipt、耗时和失败原因。

若任一条件不同，结果只能放在“条件参考”中，不能画成同一排行榜。不同公开协议（例如 LongMemEval 与 RULER）也不能直接相加或比较高低。

## 4. 运行层与问答层必须分开

### 4.1 运行层

运行层只验证：

- Run 是否可创建、取消、重试和恢复；
- 事件是否 append-only，是否能回放；
- 正确 evidence session 是否进入上下文包；
- 压缩前后 token 估算和延迟；
- 工具调用、Artifact 和审批是否重复或越权；
- Provider receipt 是否记录实际 model、usage、cache 和失败原因。

### 4.2 问答层

问答层再验证：

- answer exact match / F1 / 官方指标；
- citation/source precision 与 recall；
- 不知道时是否 abstain；
- 知识更新和时间推理是否答对；
- 压缩次数增加后，和无压缩基线的 parity delta；
- 成本、延迟和失败率。

运行层通过，不能替代问答层通过；Fixture 通过，也不能替代真实 Provider 通过。

## 5. 执行顺序与停止条件

1. **已完成**：冻结公开矩阵和同协议字段；完成 LongMemEval-S 检索层全量基线。
2. **下一单元**：使用已冻结的 `validation/longmemeval-reader-subset-v1-2026-10-03.json`，实现 LongMemEval reader/QA 的 20 题固定子集，先记录完整 receipt，不直接跑 500 题付费评测。
3. **再下一单元**：在同一 reader、同一模型、同一题集下，对比 `no_compaction`、`one_compaction` 和 `multi_pass_compaction`。
4. **后续**：按相同字段接入 LoCoMo；再评估 LongBench/RULER/NoLiMa 是否值得运行，不为凑数量引入依赖。
5. **Harness 对照**：只有至少两个可运行 Harness 在同一协议完成同一子集，才生成对照图；否则只发布 Workspace 的协议内结果和公开参考边界。

停止条件：如果模型 Key、公开数据许可、运行成本、官方依赖或稳定输出契约无法满足，就保留已完成的检索证据，标记 reader/QA 为 `blocked_environment` 或 `not_run`，不伪造结果。

## 6. 对外展示文件约定

每个 Benchmark 至少产出：

- 一份带数据 hash 和协议字段的 JSON 机器证据；
- 一份人类可读 Markdown 报告；
- 一张 SVG/PNG 图，明确指标、题数、方法和边界；
- 一条 `DEVLOG.md` 记录实际命令、结果和未覆盖范围；
- `RUN_STATE.json` 的唯一下一步和可恢复路径。

这些文件可以展示“我们按公开协议测过什么、结果是什么、哪些还没有测”，不能把条件参考写成统一排行榜。
