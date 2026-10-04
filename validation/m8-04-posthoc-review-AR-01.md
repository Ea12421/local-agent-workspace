# M8-04 AR-01 事后只读复核

## 结论

AR-01 三条路径都能绑定 source receipt、派生 artifact，并通过严格回放，因此这组证据达到 `EVIDENCE_PARTIAL`。它没有证明多 Bot 质量更高，也没有证明真人提效。

## 评分

| 路径 | 结构契约 | 可追溯/可回放 | 决策有用性 | 机器耗时 |
|---|---:|---:|---:|---:|
| single_call | 5/5 | 4/5 | 5/5 | 36,092 ms |
| single_bot | 4/5 | 4/5 | 4/5 | 37,531 ms |
| multi_bot | 5/5 | 4/5 | 4/5 | 148,964 ms |

评分是事后只读复核，不是原始运行时评分。人工编辑步骤、人工编辑字符数、token、费用、真人耗时和再次使用意愿都不可观察或未测量。

## 可支持的判断

- 三条路径的输出均可追溯到 source receipt，并完成严格回放。
- 三条路径都推荐 SQLite + JSONL fallback，方向符合当前本地优先约束。
- multi_bot 在 AR-01 上约为 single_bot 的 3.97 倍机器耗时，超过默认 2 倍延迟上限。

## 当前决策

保持结构化 `single_bot` 为默认候选；不把 `multi_bot` 设为默认。下一次若继续验证，应新增一个固定任务，在运行前后保存 artifact diff 并记录人工编辑量。成本若仍不可得，继续标记为 `undecidable`。

完整结构化记录见 `validation/m8-04-posthoc-review-AR-01.json`。
