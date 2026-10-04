# M8-17 Persisted Run Replay Validation v1

日期：2026-09-28（Asia/Shanghai）

## 目标

验证 Web 刷新或重新打开后，最近一次已结束的真实 Codex Run 可以从 SQLite 恢复，而不是只存在 React 内存中。

## 实现

- Server 新增 `GET /api/core/runs/:runId`，返回 `run`、`events`、`receipts`。
- Web 启动时调用 `GET /api/core/runs`，选择最近一次已结束 Run，再回读详情。
- 执行回执卡从持久化 `run.result.provider`、RunEvent 和 ProviderReceipt 重建。
- 支持从 `RunEvent.data.stream` 提取 agent message 摘要；原始事件和 receipt 不被改写。

## 验证结果

HTTP 回读：

- Run：`run_mukr3edw`
- 状态：`succeeded`
- 事件总数：10（其中 5 个 Provider events）
- Provider receipts：1
- Receipt：`run_mukr3edw:codex:segment:1`

Computer Use：

重新打开 `http://localhost:5173/?v=persisted-run` 后，页面自动显示：

- Codex 订阅执行桥
- Run `run_mukr3edw`
- 事件 `5`
- receipt `run_mukr3edw:codex:segment:1`
- 真实执行
- 完整结构化 JSON 摘要

## 验证命令

- `node scripts/typecheck.mjs`：PASS
- HTTP smoke：PASS
- 全套 Core/adapter/workflow/server tests：29/29 PASS
- `git diff --check`：PASS

## 结论

`M8-17 persisted run replay`：PASS。

这解决了“刷新页面或上下文切换后运行记录丢失”的工程问题，但仍不等于现实提效验证。下一步仍是同一固定任务的真人基线 A/B。
