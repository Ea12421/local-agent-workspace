# 受控测试/构建命令适配器 v1

日期：2026-10-03（Asia/Shanghai）

状态：integrated-and-verified

## 1. 目的

为本地 Agent Workspace 提供一个可审计的真实命令执行入口，供固定测试和后续上下文恢复验证使用。
这个入口只执行项目预先登记的命令，不把本地 Shell 变成 Agent 的通用能力。

首批固定命令：

| ID | 实际 argv | 说明 | 声明的副作用 |
|---|---|---|---|
| project.test | npm run test | 运行核心测试 | 读取项目并在系统临时目录产生测试临时数据 |
| project.build_web | npm run build:web | 构建 Web | 读取项目并写入 Web 构建产物 |

project.build_web 会写构建产物，所以即使它不开放 workspace_write 权限，也必须逐次审批。
“只读权限档位”在这里表示适配器不提供任意文件写入 API；它不把构建过程可能生成的固定产物伪装成零副作用。

## 2. 不在本版本内

- 任意 Shell、sh -c、bash -c、PowerShell 或命令拼接；
- 调用方追加参数、替换可执行文件或改变工作目录；
- workspace_write / full_access 命令模式；
- 删除、发布、外发消息、支付、读取凭据；
- 数据库迁移；
- 自动执行或绕过用户审批。

## 3. 运行契约

实现文件：packages/adapters/src/command-runtime.ts

### 3.1 请求

请求只能选择 ControlledCommandProfile.id。如果传入 argv，必须与 profile 的完整 argv
逐项相同。运行前会依次检查：

1. authorization 没有被撤销、过期或取消；
2. permissionTier 必须是 read_only；
3. allowedTools 必须包含 command；
4. allowedPaths 必须为空，命令只能在项目根目录运行；
5. argv 必须通过现有 isAllowedCommand 的精确 token 白名单；
6. mode=local 必须有 approvalRequiredActions: ["command.run"] 且 approvalGranted=true。

缺少任意条件都不会启动子进程，并生成失败回执。

### 3.2 进程边界

- 使用 spawn(..., { shell: false })；
- 当前工作目录由 resolveSandboxPath(workspaceRoot, ".") 解析并限制在项目根；
- 超时上限由 profile 决定，首版为 120 秒；
- stdout/stderr 分别限长，输出总量由请求 maxBytes 再收窄；
- AbortSignal 触发后发送 SIGTERM，必要时发送 SIGKILL；
- 输出按现有本地工具规则脱敏 API key、token、password 和 secret；
- 相同 requestId 返回第一次结果，不重复执行。

### 3.3 回执

每次 dry-run 或 local 尝试都返回 controlled-command-receipt.v1，至少包含：

- requestId、commandId、完整执行模式；
- inputSha256、outputSha256、耗时；
- succeeded / failed / dry_run；
- 超时、取消、进程退出、审批缺失、路径/权限拒绝等明确错误码；
- redacted 标记。

上层 HTTP/API 已把 invoked、completed/failed 映射为既有 RunEvent；审批仍由 SQLite
`ApprovalRequest` 持久化，运行结果放在 Run 的结果与事件回放中，没有新增数据库迁移。

## 3.4 HTTP/UI 纵向闭环

实现位置：`apps/server/src/index.ts`、`apps/server/src/runtime.ts`、
`apps/web/src/lib/api.ts`、`apps/web/src/App.tsx`

固定入口如下：

    GET  /api/commands
    POST /api/commands/preview
    POST /api/commands/runs
    POST /api/runs/:runId/approvals/:approvalId/resolve
    POST /api/runs/:runId/cancel
    POST /api/commands/runs/:runId/replay

`POST /api/commands/runs` 只创建 `waiting_user` Run、保存 pending approval 并返回
准确 argv/副作用预览；它不会启动进程。批准后才恢复 Run、写入 `tool.invoked`，执行结束
写入 `tool.completed` 或 `tool.failed`，再进入 `succeeded`/`failed`。拒绝或取消会停止 Run
并撤销待处理审批。相同幂等键不会创建第二个 Run，相同审批响应不会再次执行；`replay`
是只读事件回放，不是无审批重跑。

## 4. 验证结果

- 适配器专项测试：6/6 通过。
- HTTP/UI 纵向专项测试：1/1 通过；覆盖 profile 目录、dry-run、待审批、重复提交、批准执行、
  重复审批、取消、拒绝和只读 replay。
- Computer Use 桌面回归：通过；从打包应用选择 `project.test`，看到一次性审批卡，批准后回读
  `run.resumed`、`tool.invoked`、`tool.completed` 和 `run.succeeded`；刷新“运行记录”后事件链仍在。
- 全量 `npm run test:all`：103/103 通过。
- `npm run typecheck`：通过；`npm run build:web`：通过。
- 真实受控执行 project.test：核心测试 7/7 通过，exitCode=0。
- 已验证：固定 profile、精确 argv、审批缺失、权限档位、工具白名单、范围边界、输出上限、
  脱敏、超时、取消、幂等和授权撤销。
- project.build_web：本模块已完成 dry-run/profile 验证；真实构建沿用已有
  npm run build:web 通过证据，未在本轮再次生成构建产物。

## 5. 当前边界

Web 和桌面应用现在可以运行两个固定命令，但仍不能运行任意测试、任意 Shell 或无人审批任务。
一次 `project.test` 通过只证明本地命令控制面和项目测试当时通过，不能写成模型质量、
上下文压缩效果或成本收益证明。`project.build_web` 的真实执行仍留在单独的后续验证，避免
把构建产物变化混入本单元的审批契约证据。
