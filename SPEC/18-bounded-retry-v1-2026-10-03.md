# Bounded Retry v1

日期：2026-10-03  
状态：implemented / verified  
范围：Runtime Run、Product Builder continuity event log、SQLite/InMemory RunStore

## 1. 这一步解决什么问题

此前 `failed → queued` 没有上限，HTTP retry 还使用固定的 `retry:<runId>` key。第二次请求可能只回放第一次结果，也可能让调用方误以为已经重新执行。这个版本把“重试”定义为一个可回读的尝试记录，并限制同一个 Run 的重试次数。

## 2. 固定规则

| 规则 | 实现 |
| --- | --- |
| 默认上限 | 初次执行之外最多 2 次 retry |
| 进程硬上限 | 请求中的 `retryPolicy.maxRetries` 会被限制在 0–5 |
| 计数事实源 | `run.retry_requested` append-only RunEvent 数量 |
| 每次尝试 | 事件 `data.retry.attempt` 从 1 开始递增，并记录 `maxRetries` |
| 手动/自动 | `data.retry.mode` 为 `manual` 或 `automatic` |
| 失败分类 | `manual`、`provider_transient`、`provider_limit`、`tool_transient`、`unknown` |
| 幂等 | 显式 `idempotencyKey` 可回放；未提供时生成 `retry:<runId>:attempt:<n>` |
| 取消 | `cancelled` 永远不能 retry，取消不会被当成失败重试 |
| 成功 | `succeeded` 永远不能 retry |

`RunRequest.retryPolicy.maxRetries` 是可选配置；没有配置时使用默认值 2。任何配置都不能绕过进程硬上限 5。没有数据库迁移，策略随已有 `request_json` 保存。

## 3. 哪些 Run 可以 retry

- Runtime Run：必须是 `failed`，且 `error.retryable === true`。
- `succeeded`、`cancelled`、`queued`、`running`、`waiting_user`：HTTP retry 返回 `409 retry_not_allowed`，不增加事件。
- Product Builder continuity：没有独立 Runtime Run 时，以持久化 Product Builder 状态为准；已 `released` 的状态不能 retry，仍阻塞或等待用户的草稿可以记录一次人工 retry。
- 达到上限时返回 `409 retry_limit_reached`，保留原失败状态，不创建新的 retry 事件。

## 4. 事件和收据边界

每次真正接受的 retry 都写入一条独立 `run.retry_requested`：

```json
{
  "idempotencyKey": "retry:run_x:attempt:1",
  "retry": {
    "attempt": 1,
    "maxRetries": 2,
    "mode": "manual",
    "reasonClass": "manual",
    "previousFailureCode": "provider_response_failed"
  }
}
```

该事件是“尝试记录”，不是虚构的 Provider 成功回执。Provider receipt 只有在下一次实际执行 Provider 后才写入。retry 路由本身只把 Run 放回 `queued`，不调用 Provider、不调用工具、不创建 Artifact，因此不会把排队动作冒充成执行完成。

Tool Loop 继续沿用已有 `callId` 和确定性 Artifact ID 回放规则；Provider 事件语义幂等已经在 `SPEC/19-semantic-event-idempotency-v1-2026-10-03.md` 补齐。

## 5. 恢复和诊断

SQLite transition 将 Run 更新、retry 事件和幂等键放在同一事务中。关闭并重开数据库后，可以从 RunEvent 重建已经用掉的 retry 次数、上限、模式、失败码和幂等键。预算耗尽时原始 `Run.error` 仍保留，便于判断为什么没有继续执行。

## 6. 验证证据

- `packages/core/src/core.test.ts`：默认/自定义上限、attempt 递增、预算耗尽。
- `apps/server/src/http-smoke.test.ts`：Product Builder continuity 记录、成功/取消/不可重试失败拒绝、两次可重试失败后上限、没有重复工具/Artifact 事件。
- `apps/server/src/persistence.test.ts`：SQLite 关闭并重开后仍能读取 retry attempt 记录。
- 本轮定向结果：HTTP smoke 2/2、persistence 13/13、Product Builder continuity 4/4、Tool Loop 9/9、Core 1/1、typecheck 通过。

## 7. 明确不属于本轮

- Provider 事件的语义去重与跨进程并发抢占；
- 动态撤销已经发出的 ToolPolicy；
- 自动后台 retry、无人值守调度；
- 不同模型或 Harness 的上下文压缩效果比较。

下一工程单元是动态权限撤销，仍需保持项目范围投影、有界重试和语义事件幂等不回归。
