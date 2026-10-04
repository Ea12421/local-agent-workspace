# M8-21 Computer Use 与本地接口观察记录

## 测试对象

- 安装版：`/Applications/Local Agent Workspace.app`
- Bundle ID：`com.localagentworkspace.desktop.v1`
- 本地服务：`http://127.0.0.1:4310/`
- 时间：2026-09-28，Asia/Shanghai
- Provider：`Fixture Adapter / deterministic-demo`

## Computer Use 观察

1. 安装版窗口标题为 `Agent Workspace · 项目工作台`，概览显示本地服务正常。
2. 概览显示项目、已完成 Run、`Fixture Adapter`、`本地 Fixture`、`本次延迟 确定性`，没有把 Fixture 显示成 DeepSeek 或 API 额度。
3. 点击 `确认并继续` 后，界面显示“已确认，Architecture Bot 将继续工作”。
4. 切换到运行记录后，能看到：创建 Product Builder 运行、Research Bot 交付 3 条带来源事实、Architecture Bot 交付技术选择与风险、等待用户确认 MVP 范围、用户确认生成执行计划、生成 Product Brief 与执行计划。
5. Bots 页面显示 Product Builder、Research、Architecture、Evaluation；之前创建并停用的 Bot 在刷新后仍能回读停用状态。
6. Artifacts 页面显示 `Product Brief.md` 和 `Execution Plan.md`。打开 `Product Brief.md` 后能看到标题、正文、`状态：最终产物`、Run 和来源区域；此前的无限加载问题已消失。
7. 页面刷新后，运行记录和审批后的两条事件仍然可见。
8. 点击 `新建一次运行`，保持 `Fixture 本地演示（无 Key）`，输入“为独立开发者做一个本地 AI 项目规划工具”并开始运行；返回概览后显示“Fixture 演示运行已完成，可查看执行回执”，运行记录仍可回读 6 个主事件。

## 本地接口回读

### `/api/health`

- HTTP 200
- `{"ok":true,"service":"local-agent-workspace","mode":"fixture-first"}`

### `POST /api/product-builder/preview`

输入：

```json
{"idea":"为独立开发者做一个本地 AI 项目规划工具"}
```

回读到：

- `status=waiting_user`
- 4 个 `handoff`
- 5 个 `artifact`
- 1 个 `approval`，状态 `pending`
- `receipt.harness=fixture`
- `receipt.provider=fixture`
- `receipt.model=deterministic-product-builder`
- `receipt.isMock=true`
- `artifactRelease=blocked`
- `releaseBlockers=["approval_pending"]`

### `/api/persistence/entities`

- `artifacts=5`
- `handoffs=4`
- `approvals=1`
- `receipts=1`
- receipt ID：`run-fixture-001:product-builder:receipt`
- receipt run ID：`run-fixture-001`
- `productBuilderStates=1`

### SQLite 核心运行回读

`/api/core/runs/run-core-fixture-001` 返回：

- 状态 `succeeded`
- 5 个 append-only RunEvent：created、started、waiting_user、resumed、succeeded
- `result.artifactIds=["artifact-brief","artifact-plan"]`

当前展示层 Fixture Run（`run-fixture-001`）和核心 runtime seed Run（`run-core-fixture-001`）仍是两个 ID 命名空间；这不是本轮 Alpha 使用阻断，但列为下一阶段统一映射项。

## Codex 订阅只读入口

通过安装版 `新建一次运行` 选择 `Codex 订阅执行桥（只读）`，本机探针显示：

- `codex-cli 0.155.1`
- 状态：可用

实际输入为：

> 只读验证：请输出一个本地 AI 产品的三条产品风险，每条不超过 20 个字，不调用工具，不修改文件。

Computer Use 回读：

- `Codex 订阅执行桥`
- 状态：已完成
- Run：`run_mul8tcoe`
- 事件：5
- 回执：`run_mul8tcoe:codex:segment:1`
- `真实执行`
- 输出：数据隐私泄露风险、模型输出不稳定、用户需求匹配不足

SQLite receipt 回读：

- `harness=codex-cli`
- `provider=openai-codex`
- `model=codex-managed-session`
- `authMode=subscription`
- `billingSource=unknown`
- `isMock=false`
- `status=succeeded`
- `eventCount=5`
- `input_tokens=22440`
- `output_tokens=77`

本轮没有读取凭据、调用工具、修改文件或外发消息。

## 审批状态重开回归

- 初始 SQLite approval：`pending`；安装版显示“确认目标用户”审批卡。
- Computer Use 点击“确认并继续”后，界面显示“已确认，Architecture Bot 将继续工作”。
- SQLite 回读：approval=`approved`，同一 Run 的 `artifactRelease=released`，`finalArtifactIds` 包含 5 个 Artifact，`releaseBlockers=[]`。
- 关闭并重新打开安装版后，审批卡不再出现；最近一次 Codex receipt 仍显示在概览。

## 静态验证

- `node scripts/validate-state.mjs`：PASS
- `node scripts/typecheck.mjs`：PASS
- Node tests：38 passed / 0 failed
- Vite production build：PASS
- `git diff --check`：PASS
- `pnpm` wrapper：Corepack cache EPERM；等价本地 Node/Vite 检查已完成

## 异常记录

一次 Python `urllib` 请求在已有浏览器请求并发时收到 `RemoteDisconnected`；服务进程仍在监听，健康接口返回 200，随后使用单连接 `curl --http1.0` 读取接口成功。当前证据不足以判定产品服务崩溃，保留为测试客户端/并发观察项。

## 结论边界

本记录支持 `PASS_ALPHA_USABLE_STABLE`：本地 Alpha 可以继续开发、演示和受控测试。它不支持真实模型质量、真人提效、多 Bot 优势或公开分发资格结论。


## Artifacts SQLite-first 对齐

重新打包并启动安装版后，使用 Computer Use 进入 Artifacts 页面：

- 页面显示 5 个本地持久化 Artifact：`research-report.md`、`execution-plan.md`、`technical-proposal.md`、`evaluation-plan.md`、`product-brief.md`。
- 每一项显示 `SQLite`、来源数量和 `已生成` 状态；列表不再使用静态 Fixture 的 `Product Brief.md` / `Execution Plan.md` 作为主数据。
- 打开 `research-report.md` 后，详情显示正文、`状态：最终产物`、`Run：run-fixture-001`，并显示来源 `用户输入 · workspace://user-input`。
- 静态门：`node scripts/typecheck.mjs`、`node scripts/validate-state.mjs`、Vite production build、`git diff --check` 均通过。

这一步证明 Web Artifact 列表和详情已接到 SQLite 生成产物及 release/source 回读；仍不证明真实模型质量或真人提效。


## 运行记录 SQLite RunEvent/receipt 对齐

重新打包并启动安装版后，使用 Computer Use 进入运行记录：

- 页面显示 `run-fixture-001`，并显示 `SQLite receipt: run-fixture-001:product-builder:receipt · 6 事件 · 演示`。
- 时间线来自持久化事件投影，显示“创建运行”“Bot 交接完成”“等待用户确认”“用户确认继续”“生成 Artifact”，不再显示原始事件类型作为主要文案。
- 点击“刷新”后显示“已从本地 SQLite 刷新运行状态”，Run ID、receipt 和事件数量保持一致。
- `GET /api/runs/:runId/events` 现在优先回读 SQLite continuity event；没有 continuity event 时回读 SQLite RunStore event；未知 Run 返回可诊断 404。

这一步完成 M6-03：运行记录页已具备真实事件、回执和刷新回读。它仍不代表模型质量或真人提效。

## 审批/重试 SQLite 回读与 Electron 退出清理

- 重新打包并启动最新安装版后，先通过本机 retry route 对 `run-fixture-001` 写入一次 `run.retry_requested`；重复请求使用同一 `retry:<runId>` 幂等键，不重复追加。
- Computer Use 进入运行记录并点击“刷新”后，界面从 `11` 个事件回读为 `12` 个，时间线新增“已请求重试”，详情仍显示 `SQLite receipt`、真实 Run ID 和“演示”。
- 这证明 retry 事件从本地 SQLite 写入并回到 UI；本轮已批准 Run 没有可点击的 pending approval 卡，审批点击路径沿用本文件前面的安装版审批回归记录。
- 过程中发现旧 Electron 窗口退出后 Node 子服务会遗留在 `4310`；`apps/desktop/src/main.ts` 增加统一 `stopServer()`，挂接 `window-all-closed` 与 `before-quit`。重新打包后使用 Computer Use 退出 Alpha，确认 `4310` 端口释放，再次启动仍能读取同一 SQLite 数据。
- 本单元静态验证：`node scripts/typecheck.mjs`、`node scripts/validate-state.mjs`、`git diff --check`、Vite build、Electron arm64 目录打包、全套 Node tests `38/38` 均通过。

本单元完成 M5-04、M6-04 的回读闭环；不代表真实模型质量、多 Bot 优势或真人提效已经证明。

## M3-06 第一小单元：沙箱边界 guard

- `packages/adapters/src/sandbox.ts` 新增 `resolveSandboxPath`：拒绝绝对路径、`..` traversal、项目外路径；逐段检查 symlink，允许显式放开时仍要求最终 realpath 留在 workspace root 内。
- 新增 `isAllowedCommand`：按完整 argv 精确匹配白名单，拒绝 shell interpreter、`-c/--command`、shell metacharacter 和未列出的参数组合；绝对可执行路径不会自动归一化，必须显式列入白名单。
- 新增 `canUseSandboxOperation`：明确 filesystem/shell allowlist，并阻止 read_only 执行写操作。
- 验证：适配器专项 `9/9`、typecheck、git diff check 通过；尚未执行任何真实 Shell 或项目外文件操作。

本小单元只完成安全边界函数，受控 ToolRuntime 的 dry-run/fixture receipt、超时、错误分类和 secret 脱敏留到下一单元。
