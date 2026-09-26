# Local Agent Workspace / Project Bot OS

## 0. 文档状态

- 版本：v1.0-detailed
- 文档性质：可执行产品与工程说明书
- 当前日期：2026-09-26
- 当前总体状态：`implementation-complete-verification-blocked`
- 事实源：本文件、`IMPLEMENTATION-BACKLOG.md`、`TRACEABILITY.md`、根目录 `RUN_STATE.json`
- 旧聊天结论：只作为候选假设，不能作为“技术已验证”证据

本文回答四个问题：

1. 这个项目具体给谁解决什么问题？
2. 系统由哪些模块组成，模块之间怎么传数据？
3. 每个模块要写哪些代码，使用哪些技术，完成的标准是什么？
4. 如何知道它真的完成，而不是只有页面或模型输出？

---

## 1. 产品定义

### 1.1 一句话

Local Agent Workspace 是一个本地优先的 Agent 工作空间。用户按项目管理 Bot；每个 Bot 有职责、输入输出格式、工具、权限、Provider、Memory 和停止条件。系统把一次复杂任务拆成可追踪的 Run、结构化 Handoff、Approval 和 Artifact。

### 1.2 首个可交付场景

用户输入：

> 我想做一个面向独立开发者的 AI 视频产品。

系统必须能记录并展示：

1. 用户原始输入和未知项；
2. Product Builder 的任务计划；
3. Research、Product、Architecture、Evaluation 的结构化交接；
4. 每个交接读了什么、产出什么、是否失败；
5. 外部事实的 Source；
6. 需要用户决定的 Approval；
7. 最终 Product Brief、Technical Proposal、Evaluation Plan 和 Execution Plan；
8. Provider、模型、认证方式、计费来源和是否为 Fixture；
9. 中断后从哪个状态恢复。

### 1.3 目标用户

首个用户是单人 AI Builder / AI 产品经理 / 独立开发者。首版不解决企业多租户和团队协作权限，避免把核心问题扩大成 SaaS 平台。

### 1.4 真实问题

当前工作通常是：

```text
ChatGPT 长对话
→ 人工复制和整理
→ 自己判断方案
→ 再交给 Codex
→ 上下文、来源和决策容易丢失
```

本项目要解决的是可追踪的任务推进和决策交接，不是单纯再做一个聊天框。

### 1.5 首版不做什么

- 云端多用户和团队权限；
- 全局后台监听；
- 默认控制桌面和浏览器；
- 自动发消息、发布、支付；
- 读取或逆向 Cookie、Token、凭据文件；
- Bot 自动提升权限或无限创建 Bot；
- 把 ChatGPT 订阅伪装成公开 API；
- 把模型自评当作产品效果；
- Computer Use 作为首版硬验收；
- 自动安装未知依赖。

---

## 2. 用户旅程和可观察行为

### 2.1 创建项目

输入：项目名称、描述、工作区路径。

结果：生成 `Project`，绑定默认 Product Builder Bot，默认权限为 `workspace_write` 但工具白名单为空。

验收：重启 Server 后项目仍可读取；项目之间的 Run、Artifact 和 Memory 不串线。

### 2.2 创建或复制 Bot

输入：名称、职责、输入 Schema、输出 Schema、工具白名单、权限档位、Provider 策略、审批规则。

结果：Bot 处于 `enabled`，但任何高风险能力必须通过 Approval 开启。

验收：复制 Bot 后 ID、运行记录和 Memory 不共享；停用 Bot 后不能新建 Run。

### 2.3 启动 Product Builder

输入：自然语言想法、可选用户、约束、项目引用。

结果：创建一个 `Run(status=queued)` 和第一个 `run.created` 事件。

### 2.4 运行和交接

Run 进入 `running`。Product Builder 依次创建 Handoff：

```text
Planner → Research Bot
Planner → Product Bot
Planner → Architecture Bot
Planner → Evaluation Bot
```

每个 Handoff 必须带 `inputRefs` 和 `outputSchema`，不能只写一段无结构文本。

### 2.5 等待用户决定

当用户、场景、MVP 或权限存在关键不确定性时，Run 进入 `waiting_user`，创建 `ApprovalRequest`。未审批不得继续下一步，也不得自动选择一个答案冒充用户决定。

### 2.6 生成 Artifact

审批后，系统将已确认的结构化结果生成 Markdown/JSON Artifact，并记录 Source 引用、Run ID、Provider receipt 和生成时间。

### 2.7 中断和恢复

如果进程崩溃、模型限额中断或用户关闭页面：

1. 不删除已有事件；
2. 读取最后一个事件和 Run 状态；
3. 使用 `idempotencyKey` 重放未完成动作；
4. 不重复生成同一个 Artifact；
5. 继续 `RUN_STATE.json` 的唯一 `next_action`。

---

## 3. 系统架构

### 3.1 总体结构

```text
┌───────────────────────────────────────────────┐
│ React/Vite Web UI                             │
│ Electron thin shell                           │
└──────────────┬────────────────────────────────┘
               │ HTTP/JSON（未来可加 WebSocket）
┌──────────────▼────────────────────────────────┐
│ Local Control Plane / Node Server             │
│ Project API · Run API · Approval API          │
│ Workflow Orchestrator · Receipt Builder       │
└───────┬─────────────┬───────────────┬─────────┘
        │             │               │
┌───────▼──────┐ ┌────▼────────┐ ┌────▼─────────┐
│ Core Domain  │ │ Adapters    │ │ Persistence  │
│ State machine│ │ DeepSeek    │ │ SQLite       │
│ Schemas      │ │ Codex CLI   │ │ JSONL fallback│
│ Event rules  │ │ Fixture     │ │ Recovery     │
└──────────────┘ └─────────────┘ └──────────────┘
```

### 3.2 事实源原则

`packages/core` 的类型、状态机和事件规则是业务事实源。LangGraph、OpenAI Agents SDK、Pi、Hermes、OpenHands 如果未来接入，只能实现一个执行节点或 Provider Adapter，不能直接拥有 Project、Run、Approval 或 Artifact 的最终状态。

### 3.3 技术栈

| 层 | 技术 | 作用 | 当前状态 |
|---|---|---|---|
| 语言 | TypeScript | 共享类型和业务逻辑 | 已使用 |
| 运行时 | Node.js >= 22 | Server、脚本、测试 | 已验证 Node 22.23.1 |
| 包管理 | pnpm 9.15 | workspace 管理 | 目标版本，当前被 registry 阻塞 |
| Web | React 19 + Vite 6 | 本地 Web UI | 代码已写，真实构建待依赖 |
| Server | Node 原生 HTTP | 本地 control plane | 代码已写 |
| 数据库 | SQLite + better-sqlite3 | 本地持久化 | schema/边界已写，真实 native 模块待安装 |
| 回退存储 | JSONL | clean checkout 和无依赖演示 | 已测试 |
| Desktop | Electron 34 + electron-builder | macOS `.dmg` | 壳已写，打包待依赖 |
| 模型 | DeepSeek API | 第一条真实 Model Provider，对比通道 | Adapter 已写，未实跑 |
| 执行 Agent | 官方 Codex CLI/SDK | 当前优先的本地执行桥 | CLI 0.155.1 真实最小调用已通过；Product Builder 接入待验证 |
| 演示 | Fixture Adapter | 无 Key 确定性演示 | 已测试 |

### 3.4 仓库结构

```text
.
├── SPEC/
│   ├── README.md
│   ├── MASTER-SPEC.md
│   ├── IMPLEMENTATION-BACKLOG.md
│   ├── TRACEABILITY.md
│   └── PROGRESS.md
├── packages/
│   ├── core/          # 类型、状态机、RunStore
│   ├── adapters/      # DeepSeek、Codex、Fixture、权限
│   └── workflow/      # Product Builder 编排
├── apps/
│   ├── server/        # 本地 control plane
│   ├── web/           # React/Vite UI
│   └── desktop/       # Electron thin shell
├── scripts/           # setup、demo、诊断、checkpoint、恢复
├── fixtures/          # 无 Key 可运行样例
├── data/              # 本地事件/数据库目录
├── artifacts/         # 生成产物目录
├── RUN_STATE.json     # AI 续接状态
└── HANDOFF.md         # 人类恢复摘要
```

---

## 4. 领域模型与数据契约

### 4.1 Project

```ts
interface Project {
  id: ProjectId;
  name: string;
  description?: string;
  workspacePath: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}
```

约束：`id` 全局唯一；归档项目不能新建 Run；workspacePath 必须经过路径边界检查。

### 4.2 BotProfile

```ts
interface BotProfile {
  id: BotId;
  projectId: ProjectId;
  name: string;
  description: string;
  responsibility: string;
  inputSchema: JsonObject;
  outputSchema: JsonObject;
  skillIds: SkillId[];
  toolPolicy: ToolPolicy;
  providerPolicy: ProviderPolicy;
  memoryPolicy: MemoryPolicy;
  approvalPolicy: ApprovalPolicy;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

约束：必须有 responsibility、inputSchema、outputSchema；disabled Bot 不能启动新 Run；权限升级需要 Approval。

### 4.3 ToolPolicy

```ts
interface ToolPolicy {
  permissionTier: 'read_only' | 'workspace_write' | 'full_access';
  allowedTools: string[];
  allowedCommands?: string[];
  allowedPaths?: string[];
  approvalRequiredActions: string[];
}
```

三档人话：

- **只读**：读取、分析、生成草稿；
- **工作区写入**：只能写当前项目目录和运行白名单命令；
- **完全访问**：更广本机/网络能力，必须显式开启并保留强警告。

无论档位，外发、删除重要数据、敏感路径、生产配置、支付、发布、凭据读取都必须逐次审批。

### 4.4 Run

```ts
interface Run {
  id: RunId;
  projectId: ProjectId;
  botId: BotId;
  request: RunRequest;
  status: 'queued' | 'running' | 'waiting_user' |
          'succeeded' | 'failed' | 'cancelled';
  version: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  waitingReason?: string;
  result?: JsonValue;
  error?: RunError;
}
```

### 4.5 RunEvent

```ts
interface RunEvent {
  id: RunEventId;
  runId: RunId;
  sequence: number;
  type: RunEventType;
  occurredAt: string;
  actor: EventActor;
  data: JsonObject;
  correlationId?: string;
}
```

事件必须 append-only。`sequence` 从 1 开始，重复 sequence、重复 event id 和跨 Run 写入都必须失败。

### 4.6 HandoffEnvelope

```ts
interface HandoffEnvelope {
  id: HandoffId;
  fromBotId: BotId;
  toBotId: BotId;
  objective: string;
  inputRefs: string[];
  outputSchema: string;
  constraints: string[];
  approvalRequired: boolean;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  depth: number;
  parentHandoffId?: HandoffId;
  resultRefs?: string[];
  error?: RunError;
}
```

约束：最大深度默认 8；检测重复 Bot 对和 parent 链；没有 inputRefs 的研究型交接不能进入正式 Artifact。

### 4.7 ApprovalRequest

```ts
interface ApprovalRequest {
  id: ApprovalRequestId;
  projectId: ProjectId;
  runId: RunId;
  action: string;
  description: string;
  permissionTier: PermissionTier;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  decisionReason?: string;
}
```

### 4.8 Source、Artifact、MemoryItem

- `Source`：外部 URI、标题、摘录、抓取时间和元数据；外部事实没有 Source 必须标为未知。
- `Artifact`：项目、Run、类型、名称、内容、Source 引用和创建时间；正式 Artifact 不能只有模型自由文本。
- `MemoryItem`：项目范围、内容、Source 引用和更新时间；首版不做全局自动记忆。

---

## 5. 状态机、事件和恢复

### 5.1 Run 状态迁移

| 当前 | 动作 | 下一状态 | 必须事件 |
|---|---|---|---|
| queued | start | running | `run.started` |
| running | wait_user | waiting_user | `run.waiting_user` |
| waiting_user | resume | running | `run.resumed` |
| running | succeed | succeeded | `run.succeeded` |
| queued/running/waiting_user | cancel | cancelled | `run.cancelled` |
| running | fail | failed | `run.failed` |
| failed | retry | queued | `run.retry_requested` |

非法迁移必须抛出 `InvalidRunTransitionError`，不能静默修正。

### 5.2 幂等

每个外部动作带 `idempotencyKey`。同一个 Run、同一个 key、同一个 action 重放时返回第一次结果，不追加新事件；同 key 执行不同 action 必须报冲突。

### 5.3 崩溃恢复

恢复顺序：

```text
读取最后一个 RunEvent
→ 检查 Run 当前状态
→ 找到未完成 Handoff
→ 检查 idempotencyKey
→ 继续或创建 Approval
→ 追加新的事件
```

不能通过“再问一次模型”恢复，因为那可能产生不同结果和重复 Artifact。

### 5.4 模型限额中断

模型限额只影响当前助手回合或当前 Provider 调用，不应成为项目状态源。项目状态必须已经写到磁盘；如果 Provider 在调用中失败，Run 标记为 `failed(retryable=true)` 或回到 `waiting_user`，不能标记 `succeeded`。

---

## 6. Provider、工具和安全边界

### 6.1 Provider 分层

```ts
interface ModelProviderAdapter {
  probeCapabilities(): Promise<ProviderCapabilities>;
  startRun(request: RunRequest): Promise<RunHandle>;
  streamEvents(handle: RunHandle): AsyncIterable<RunEvent>;
  cancel(handle: RunHandle): Promise<void>;
  resume(handle: RunHandle): Promise<void>;
}
```

#### DeepSeekApiAdapter

- 请求地址默认 `https://api.deepseek.com`；
- API Key 只从环境变量读取；
- 记录 model、usage、tool calls 和 provider-specific reasoning fields；
- Thinking + Tool Calling 不丢弃 `reasoning_content`；
- API 失败必须返回 HTTP 状态、错误类别和是否可重试。

#### CodexExternalAdapter

- 只通过官方 `codex` CLI/SDK 执行；当前优先使用已安装 CLI 的 `codex exec --json`；
- 记录 CLI 版本、harness、authMode 和 billingSource；
- 不读取登录文件、Cookie 或 Token；
- 不是 DeepSeek 的替代模型 Provider；
- 不能把 ChatGPT 订阅额度写成 API 额度。

#### FixtureAdapter

- 无 Key 可运行；
- 输出固定、可复现、明确 `isMock=true`；
- 不得用于宣称模型质量。

### 6.2 ToolRuntime

首版工具清单：

| 工具 | 默认权限 | 主要检查 |
|---|---|---|
| 文件读取 | 只读 | 项目路径边界、符号链接 |
| 文件写入 | 工作区写入 | 目标路径、覆盖确认 |
| Git 状态/差异 | 只读 | 当前仓库边界 |
| 测试/构建 | 工作区写入 | 命令白名单、超时 |
| Shell | 工作区写入 | 命令和参数白名单 |
| 公开搜索 | 只读 | 来源记录、失败标未知 |
| Artifact 生成 | 工作区写入 | Schema、来源、Run 关联 |

---

## 7. Product Builder 节点规格

| 节点 | 输入 | 输出 | 是否需要用户 | 当前状态 |
|---|---|---|---|---|
| Clarify | idea、constraints | user/scenario/unknowns | 可能 | Fixture 中简化 |
| Planner | 已确认目标 | task graph | 否 | 已有基础 |
| Research | task + sources | research report + Source[] | 否 | Fixture 已实现 |
| Product | research refs | product brief | 目标不清时需要 | Fixture 已实现 |
| Architecture | product brief | technical proposal | 通常不需要 | Fixture 已实现 |
| Evaluation | proposal | evaluation plan | 否 | Fixture 已实现 |
| Conflict Check | 全部输出 | conflicts[] | 有冲突时需要 | 待增强 |
| Approval | conflicts/关键决策 | approved/rejected | 是 | Fixture 已实现 pending |
| Synthesis | confirmed outputs | execution plan | 否 | Fixture 已实现 |
| Artifact Writer | typed outputs | Markdown/JSON | 否 | Fixture 已实现 |

首版真实模型接入时，必须保留这些节点边界，不能让一个大 Prompt 绕过所有 Schema。

---

## 8. HTTP API 契约

### 已写入的端点

| 方法 | 路径 | 作用 | 当前验证 |
|---|---|---|---|
| GET | `/api/health` | 服务状态 | 代码存在，监听受环境限制 |
| GET | `/api/workspace` | Fixture workspace | 代码存在 |
| GET | `/api/ui-snapshot` | Web 所需快照 | 代码存在 |
| GET | `/api/provider/codex-probe` | Codex 版本探针 | CLI 版本已验证 |
| GET | `/api/core/snapshot` | Core Run + events | 原生测试验证 |
| GET | `/api/core/runs` | Run 列表 | 原生测试验证 |
| POST | `/api/runs` | 创建 Run | 代码存在 |
| POST | `/api/runs/:id/cancel` | 取消 Run | 代码存在 |
| POST | `/api/runs/:id/approve` | 解决审批 | 代码存在 |
| POST | `/api/runs/:id/retry` | 请求重试 | 代码存在 |
| POST | `/api/product-builder/preview` | 生成结构化 Fixture workflow | 原生测试验证 |

### `POST /api/product-builder/preview`

请求：

```json
{
  "idea": "做一个 AI 视频工具",
  "user": "独立开发者",
  "constraints": ["先验证 MVP"]
}
```

响应必须包含：

```json
{
  "status": "waiting_user",
  "handoffs": [],
  "sources": [],
  "artifacts": [],
  "approval": {"status": "pending"},
  "receipt": {"isMock": true}
}
```

### 错误格式

```json
{
  "error": "invalid_transition",
  "message": "human-readable explanation",
  "retryable": false,
  "correlationId": "..."
}
```

---

## 9. Web UI 和桌面端

### Web 页面区域

1. 项目侧栏：项目切换、新建项目入口；
2. 工作台概览：当前 Run、状态、进度、Provider；
3. Bot 管理：职责、技能、权限、状态；
4. Run 详情：事件时间线、Handoff、审批、失败原因；
5. Artifact：名称、类型、来源、状态、预览；
6. Provider 设置：DeepSeek 配置状态、Codex 探针状态；
7. 环境诊断：Node、pnpm、Codex、Fixture 和数据目录。

### UI 验收

- 页面不能把 Fixture 显示成真实 DeepSeek；
- `isMock=true` 必须能被用户看见；
- Web 顶部必须区分“本地服务正常”和“Fixture 演示模式”，不能让 HTTP fallback 冒充真实服务；
- 审批卡必须显示为什么需要决定；
- Run 时间线必须显示 Bot、输入引用、输出引用和失败原因；
- 重试不能只改变按钮状态，必须产生新的事件。

### Electron

Electron 不复制 Product Builder 和状态机，只负责：

```text
启动本地 Server
→ 等待 health
→ 打开 Web UI
→ 关闭时终止子进程
```

---

## 10. 持久化和目录

### 10.1 SQLite 表（目标）

- `projects`
- `bot_profiles`
- `skills`
- `runs`
- `run_events`
- `handoffs`
- `approval_requests`
- `sources`
- `artifacts`
- `memory_items`
- `provider_receipts`

`run_events` 必须有：

```sql
UNIQUE(run_id, sequence)
```

### 10.2 clean checkout

```bash
pnpm install
pnpm setup
pnpm demo
pnpm dev
pnpm dev:web
pnpm package:mac
```

无 Key 必须能完成 Fixture demo；真实 DeepSeek 只在用户主动配置 Key 后启用。

---

## 11. 验证体系

### 11.1 单元测试

- 状态迁移；
- 非法迁移；
- event sequence；
- idempotencyKey；
- Handoff depth/cycle；
- 权限 allowlist；
- Provider identity；
- Fixture 输出；
- Source/Artifact 引用。

当前已通过 6 个原生测试，详见 `TRACEABILITY.md`。

### 11.2 集成测试

依赖恢复后必须运行：

- Server 启动和 health；
- API 创建/审批/重试/取消；
- Web 调用本地 API；
- SQLite 重启恢复；
- Electron 启动和退出；
- clean-room 安装。

### 11.3 AI 对照实验

固定 10 个任务，每个任务比较：

1. 单次模型调用；
2. 单 Bot + 结构化 Workflow；
3. 多 Bot + Handoff。

记录：通过率、人工修改量、耗时、Token/成本、失败类型和可追溯性。

### 11.4 现实验证

使用 3 个非敏感真实任务：

- 一个产品想法；
- 一个技术路线判断；
- 一个面试/项目方案整理。

最低通过条件：至少 2/3 任务完成，人工整理步骤减少，且用户愿意再次使用；否则标记 `PARTIAL`，不宣称产品成立。

---

## 12. 完成定义

项目只有满足以下条件才能标记 `complete`：

- SPEC、代码、测试和状态文件一致；
- Fixture clean checkout 成功；
- Server、Web、Electron 至少各有一次真实启动/构建证据；
- Provider receipt 能区分 Fixture、DeepSeek、Codex；
- 权限和审批边界有测试；
- 至少 3 个现实任务完成验证；
- 未把模型自评、截图或静态页面当成真实效果。

当前只满足前两项中的大部分，尚未满足最终完成定义。
