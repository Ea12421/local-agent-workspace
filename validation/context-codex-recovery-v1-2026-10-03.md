# Context + Codex 恢复验证 v1（2026-10-03）

> 只用同一个 Codex 执行器检查本项目自己的上下文压缩包能否恢复关键状态；没有做不同模型或 Harness 的横向比较。

- 完整状态估算：4195 tokens
- 恢复包估算：774 tokens
- 估算缩减：81.5%
- 完整状态读取：PASS
- 压缩包恢复读取：PASS
- Codex Provider：codex-managed-session；CLI 运行完成：是

## 结论

本次固定任务中，ContextSnapshot/ContextPacket 交给同一个 Codex 后，目标、约束、事实、决定、未知项、审批、交接、Artifact 和下一步都能被读回。

## 边界

Codex 内部是否自动压缩、是否命中提示词缓存，当前公开 CLI 回执没有稳定指标；本结果只证明本项目的结构化恢复包可被读取，不把它写成 Codex 原生 resume 或真实成本收益证明。

机器证据：context-codex-recovery-v1-2026-10-03.json
