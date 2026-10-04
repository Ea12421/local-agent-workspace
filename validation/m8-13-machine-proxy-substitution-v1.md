# M8-13 机器代理对照收口

## 任务

两条路径使用同一份固定输入：为 `personal-knowledge-mcp-mvp` 设计 fixture-only、localhost-only、只读的可重复离线验证报告计划。

本报告由总控 Agent 代替用户完成机器可观察步骤，**不是用户体验证据**。

## 对照结果

| 维度 | A：直接 Codex CLI | B：Agent Workspace |
|---|---|---|
| 机器墙钟 | 103,033 ms | 83,194 ms |
| 模型/路由 | `gpt-5.6-luna`；默认路由容量失败后回退 | `openai-codex` subscription |
| 输出 | 自由 Markdown | 严格 JSON |
| 额外规范化 | 需要，记录为 4 个总控步骤 | 不需要，直接进入固定 Schema |
| Run/Event/receipt | CLI JSONL 和本地保存 | SQLite Run、5 个 Provider events、receipt |
| 刷新恢复 | 未提供项目 Run 恢复 | 已验证刷新后回读 Run、事件、Artifact 和 receipt |
| 可读性 | 更自然 | 更适合校验、审计和恢复 |

由于两条路径的模型/路由不同，墙钟和内容不能做公平的模型优劣比较。

## 结论

机器可观察层面，Workspace 更适合作为长期默认执行路径：它保留结构化输出、RunEvent、provider receipt、Artifact 和恢复状态。直接调用更轻量，但要额外整理并自行保存结果。

这次没有证明：

- Workspace 内容质量一定更好；
- 多 Bot 一定更好；
- 用户手工时间下降；
- 用户愿意长期使用。

因此当前默认候选是**结构化 single-Bot/Codex**，不是 multi-Bot。

## 当前状态

`MACHINE_PROXY_PARTIAL`

机器代理对照已完成；现实提效仍需要真实用户对产物的修改和复用反馈。完整结构化记录见 `validation/m8-13-machine-proxy-substitution-v1.json`。
