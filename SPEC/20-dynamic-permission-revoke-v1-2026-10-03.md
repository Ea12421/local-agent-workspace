# 动态权限撤销 v1

更新时间：2026-10-03（Asia/Shanghai）  
状态：**已实现并通过专项、HTTP 与全量回归**

## 1. 要解决的问题

工具调用不能只相信模型生成请求时拿到的 `approvalGranted=true`。用户可能在等待恢复、重试或排队期间撤销授权；如果调用方继续使用旧快照，工具就可能在用户已经收回权限后产生副作用。

本版本把授权变成“调用前重新核对”的控制面事实：

```text
模型提出工具调用
→ 读取当前 policyVersion 和 approval 状态
→ 校验 run、approval、策略版本
→ 允许：进入 ToolRuntime
→ 拒绝：写入撤销事件和失败回执，不调用 ToolRuntime
```

## 2. 公共契约

### 2.1 策略版本

`ToolPolicy.policyVersion` 是单调的控制面版本号，缺省值为 `1`。每个需要审批的调用都会把版本号写进：

- `approval.requested` 的 metadata；
- `approval.resolved` 的 metadata；
- ToolRuntime 的 authorization receipt；
- `tool.authorization_revoked` 事件。

批准记录中的版本与当前调用版本不一致时，调用失败并返回 `tool_policy_changed`，不得继续执行。

### 2.2 授权快照

```ts
type ToolAuthorizationSnapshot = {
  policyVersion: number;
  status: "not_required" | "approved" | "revoked" | "expired" | "cancelled";
  approvalId?: string;
};
```

只读、无需逐次批准的调用使用 `not_required`。工作区写入等需要批准的调用只有在当前审批为 `approved` 时使用 `approved`。

### 2.3 撤销 API

```text
POST /api/runs/:runId/approvals/:approvalId/revoke
body: { reason?: string }
```

行为：

- `pending` 或 `approved` → `cancelled`，保留原请求和决策元数据；
- 已经 `cancelled`：返回 200、`changed=false`、`idempotent=true`；
- `rejected`、`expired` 等不可撤销状态：返回 409；
- 找不到审批：返回 404；审批不属于该 Run：返回 409；
- 已存在运行时 Run：追加一条 `tool.authorization_revoked`；只有连续性存储时，写入 SQLite continuity event log。

撤销接口不负责杀掉已经启动的操作系统进程。它保证下一次授权检查失败；进程中止仍由现有 Run cancel/Provider cancel 契约处理。

## 3. 调用前校验顺序

`Tool Loop` 在任何 `ToolRuntime.execute()` 之前：

1. 校验工具定义、参数 schema 和工具策略；
2. 生成带 `policyVersion`、`status`、`approvalId` 的授权快照；
3. 调用 `authorizationVerifier` 重新打开 SQLite 控制面；
4. 核对 approval 存在、属于同一 Run、状态仍为 `approved`；
5. 核对 approval metadata 的 `policyVersion` 与当前版本一致；
6. 任一检查失败时 fail closed，追加 `tool.authorization_revoked` 和 `tool.failed`，Run 进入不可重试失败；
7. 只有全部通过，才调用 Fixture/Local ToolRuntime。

Verifier 发生异常或 SQLite 控制面不可用也会拒绝调用。读操作若没有 approval reference，不会被无谓地阻塞。

## 4. 幂等与审计

- 撤销事件使用审批 ID 与 Run 作为稳定语义边界，重复请求不重复写入；
- 工具调用的 `requestId`、`callId` 和授权状态都进入可诊断 receipt；
- ToolRuntime 自身也 fail closed，即使上层错误地传入 revoked/expired/cancelled 快照，也不执行文件操作；
- 失败不会创建 Artifact，也不会把撤销写成成功；
- SQLite 关闭、重开后审批状态仍为 `cancelled`。

## 5. 验证证据

专项与回归覆盖：

- Tool Loop 中 verifier 在批准后返回拒绝，ToolRuntime 执行次数为 0；
- Fixture ToolRuntime 收到 revoked 快照时直接返回 `tool_authorization_revoked`；
- SQLite approved → cancelled、重复撤销幂等、关闭/重开状态保持；
- HTTP revoke 路由、重复请求和 `tool.authorization_revoked` RunEvent；
- `npm run typecheck`、`npm run test:all`、Web build、state validation 和 diff check。

机器证据：`validation/dynamic-permission-revoke-v1-2026-10-03.json`。

## 6. 明确边界

- 这是“调用前动态授权撤销”，不是全局后台监听；
- 不会自动发送消息、发布、支付或提升权限；
- 不取消已经发生的外部副作用；调用前通过是唯一可保证的安全门；
- 不证明真实模型质量，不比较不同模型/Harness，也不把 Codex 内部压缩或缓存命中写成可观测事实；
- 自动后台 retry 和完整 project-scoped projection 仍是后续工程单元。

