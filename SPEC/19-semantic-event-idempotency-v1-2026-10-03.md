# Provider / RunEvent 语义幂等 v1

更新时间：2026-10-03（Asia/Shanghai）
状态：**已实现并通过专项与全量回归**

## 1. 解决的问题

Provider 断线重连或进程恢复时，可能再次收到同一条 Provider 事件。随机的 `RunEvent.id` 只能识别“同一条存储记录”，识别不了“同一件业务事实”。如果直接追加，时间线、工具审计、Artifact 计数和 Provider receipt 都会重复。

本版本把随机事件 ID 保留为存储身份，再为能确定身份的事件增加稳定 `semanticKey`。同一语义事件重放只保留第一份；不同 attempt、不同阶段或不同 Artifact 仍然可以落盘。

## 2. 语义键规则

| 事件 | 去重依据 | 不同尝试如何区分 |
|---|---|---|
| `provider.event` | 显式 `semanticKey`、Provider source event ID、stream item/event ID；没有 source ID 时使用稳定内容 hash | `attemptId`，由运行段/重试段加入 |
| `tool.invoked/completed/failed` | 事件类型 + `attemptId` + `callId` | 每次 retry/运行段生成新的 attempt |
| `artifact.created` | 事件类型 + Artifact `id` | Artifact ID 本身必须稳定 |
| `approval.requested/resolved` | 事件类型 + approval ID | 请求与决议是两个不同事件类型 |
| `run.retry_requested` | retry attempt | attempt 编号由状态机计算 |
| segment 事件 | 事件类型 + segment | segment 编号 |

没有足够稳定身份的普通事件不强行生成键，仍按连续 `sequence` 追加。这样不会把两个内容相同但语义不同的普通事件误合并。

## 3. 存储行为

三条存储路径采用同一语义：

- **InMemoryRunStore / SQLite RunStore**：先检查事件 ID，再检查语义键，再检查当前 attempt 的终态保护，最后校验连续 sequence。
- **JSONL / SQLite continuity event log**：重放直接返回，不追加第二行；不同内容的终态不会覆盖原终态。
- **当前 attempt 的终态保护**：`run.succeeded/failed/cancelled` 之后不能再写另一个终态；历史 attempt 的 `run.failed` 不会阻塞 bounded retry 创建的新 attempt。
- **append-only**：第一份事件和第一份 receipt 永远保留，不通过 `INSERT OR REPLACE` 覆盖审计事实。

语义重放使用旧事件作为返回值，避免调用方拿着一个没有真正落盘的“幽灵事件”继续构造 receipt 或 Artifact 计数。

## 4. Provider receipt 规则

同一 receipt ID：

1. Provider 与 receipt 内容相同：静默幂等，不增加记录；
2. 内容不同：保留原 ID 的第一份，再写入 `:variant:<sha256-prefix>` 变体；
3. 变体 ID 稳定，重试相同变体不会无限增长。

这保留了“第一次看到的事实”和“后来收到的冲突证据”，不会用新回执覆盖旧回执。

## 5. 验证范围

专项测试覆盖：

- 同一 Provider 事件换随机 ID 的重放；
- 同一 source 在不同 attempt 中再次出现；
- Provider source 到达顺序与本地 `sequence` 分离；
- 同一终态重放、不同终态冲突、retry 后新终态；
- `tool.invoked` 与 `tool.completed` 不被误合并；
- 同一 Artifact 重放不增加产物；
- SQLite 关闭/重开后的事件重放；
- 同一 receipt 的完全重复与内容冲突；
- JSONL continuity fallback 的重复写入。

命令结果：

- `apps/server/src/semantic-idempotency.test.ts`：5/5；
- 相关 persistence、HTTP smoke、runtime、Tool Loop：通过；
- `npm run test:all`：87/87；
- `npm run typecheck`：通过；
- `npm run build:web`：通过；
- `npm run validate:state`：通过；
- `git diff --check`：通过。

## 6. 明确边界

- 这是本地事件/回执控制面的幂等，不等于 Provider 本身支持 exactly-once delivery。
- 跨进程并发仍依赖 SQLite 事务；没有数据库迁移，也没有把语义键物理化成新的唯一列。
- 动态撤销已在 `SPEC/20-dynamic-permission-revoke-v1-2026-10-03.md` 实现；当前仍不负责杀掉已经启动的操作系统进程。
- 没有做不同模型/Harness 的上下文压缩横向比较；当前验证继续固定同一个 Codex/Text 执行通道。

下一工程单元：补齐仍保留兼容全局路径的项目范围投影；自动后台 retry 仍需另行设计，不在本单元隐式开启。
