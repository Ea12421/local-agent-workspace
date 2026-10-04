# 外部机制吸收与受控 RSI 执行阶段 v1

状态：`implementation-complete`

日期：2026-10-03（Asia/Shanghai）

本文件是 `SPEC/15-external-architecture-absorption-and-controlled-rsi-v1-2026-10-03.md`
从研究进入实现后的执行与收口记录。上一阶段的 P0 修正仍保持为历史完成证据；本文件不把
“研究完成”写成“全部机制已经接入”。本阶段的 RSI 核心、服务端 API、Web 入口和工程验证已经完成；Codex/Text 上下文验证已在 Codex CLI 0.160.0 上复测通过，Electron 新构建回归也已完成。

## 1. 本阶段一句话目标

把 Paperclip、Hindsight、Univer、StarNet 的可复用机制映射到本项目已有的
SQLite、`packages/core`、`RunEvent`、Artifact、Approval 和 ContextPacket 事实源，
并实现一个用户点击一次即可启动、有限次迭代、可审计、可回滚的受控 RSI 最小闭环。

上下文验证沿用已经冻结的决定：只用同一条 Codex/Text 执行通道读取完整账本和结构化
恢复包；不重新做模型或 Harness 横向比较，不把 Codex 内部压缩、prompt cache 命中或
账单成本收益写成已测事实。

## 2. 上一阶段与本阶段的边界

### 2.1 已完成、保留为历史证据

- project-scoped projection、bounded retry、semantic event idempotency、dynamic
  permission revoke 已有契约、代码和专项验证；详见 `SPEC/17`–`SPEC/20`。
- SQLite-first、append-only RunEvent、ContextSnapshot/ContextPacket、Codex/Text
  恢复验证已落盘；2026-10-02 的历史成功证据只证明结构化恢复包曾被同一执行通道读取，
  2026-10-03 早先复测曾在 Codex CLI 初始化 app-server 阶段收到 `Operation not permitted`；随后在受控主机权限下恢复并用 CLI 0.160.0 复测通过。
- 结构化三次压缩、深层 SQLite 恢复和公开检索基线已留有证据；本阶段不重跑这些测试。

### 2.2 本阶段要做

1. 为四个外部项目建立“具体机制 → 本项目模块 → 吸收状态 → 文件 → 验证证据”的执行清单。
2. 在不做数据库迁移、不引入第三方运行时的前提下，用现有 Run、RunEvent、Artifact 和
   Approval 组成一次 versioned improvement run。
3. 实现最小闭环：按钮/API 启动 → 限定证据读取 → proposal draft → 固定评测 →
   低风险候选的受控发布或高风险候选的待审批 → 结果投影 → 回滚。
4. 按当前缺口有界补充 3–5 个外部项目的源码机制和复用边界，最多选择 4 个进入清单。

### 2.3 明确不做

- 不做 DeepSeek/OpenRouter/GPT-4o 或不同 Harness 的质量横评。
- 不把 Codex 原生压缩或 prompt cache 语义当作本项目可控制的实现。
- 不做数据库迁移；如果现有表和 RunEvent 无法表达某项契约，只写完整接口、阻断原因和验收清单。
- 不复制第三方代码、品牌、UI 或私有实现，不安装 LangGraph、Hindsight、Univer、Paperclip、
  StarNet、Langfuse、Inspect AI、OpenHands 等作为运行时依赖。
- 不自动修改权限、Provider、状态机、生产代码、正式 Bot 注册或后台 Routine。
- 不做无限 RSI、无限递归、无人审批发布、自动外发、支付或发布。

## 3. 完成定义与停止条件

### 3.1 本阶段完成定义

- [x] `SPEC/21` 与本阶段吸收矩阵完成；每个机制均有源码位置、吸收状态、文件范围和验证方式。
- [x] 额外研究最多 4 个项目，许可证、维护信号、具体代码机制和不吸收边界有公开来源记录。
- [x] `ImprovementProposal`、固定评测结果和版本 hash 能由现有 RunEvent/Artifact/Approval
  重建，不新增事实源。
- [x] 一次默认 `prompt` 低风险候选可以被用户按钮/API 启动、生成、固定评测、投影和回滚。
- [x] `tool_policy`、`provider`、`code`、`bot`、`routine` 候选会停在待审批或硬阻断，不能自动发布。
- [x] 重启后能从 SQLite/RunEvent 回放 RSI 运行、提案、评测、发布/回滚结果；同一请求重放不重复副作用。
- [x] 定向测试、typecheck、Web build、`validate:state`、`git diff --check` 通过；没有把 Fixture
  或规则得分写成真实模型质量证明。
- [x] `RUN_STATE.json`、`DEVLOG.md`、`HANDOFF.md` 的阶段、证据和唯一下一步一致。

### 3.2 停止条件

遇到以下任一情况，保持本阶段 `blocked_environment` 或 `paused`，只落证据，不偷偷扩大范围：

- 必须新增数据库迁移才能表达提案/评测状态；
- 需要真实外部模型、外发数据、凭据读取、生产写入或新增高风险权限；
- 既有 RunEvent/Approval 不能在不破坏历史回放的前提下表达候选版本；
- 同一错误完成“一次有界定位 → 一个最小修正 → 专项验证 → 一次重试”后仍失败；
- 评测只有模型自评或 Fixture 机械 PASS，没有独立规则/安全扫描/人工证据可供发布门使用。

### 3.3 本阶段实际结果（2026-10-03）

- **已实现**：RSI `Run → proposal → fixed evaluation → publish/approval → projection → rollback`；
  使用现有 SQLite/RunEvent/Artifact/Approval，不新增数据库迁移。
- **已验证**：低风险 `prompt` 候选的幂等、SQLite 重启回放、回滚、HTTP 项目隔离；高风险
  `provider` 候选停在审批；`npm run test:all` 96/96、typecheck、Web build、Desktop entry
  build、state validation 和 diff check 通过。
- **已落盘**：`validation/rsi-controlled-loop-v1-2026-10-03.json/.md`、
  `validation/context-codex-recovery-v1-2026-10-03.json/.md`。
- **环境阻塞已解除**：此前 Codex CLI 0.155.1 的 app-server 初始化权限错误已定位并在受控主机权限下解决；升级到 CLI 0.160.0 后，`npm run context:codex` 的两种输入均完成，12/12 关键字段恢复。
- **已收口的回归**：旧 60630 Node 服务在打包重建后仍保留旧内存 handler，导致 RSI POST 路由返回通用
  `not_found`。清理旧 Electron/Node 实例并从当前 `release/mac-arm64` 包全新启动后，60631 的直 POST 返回
  `201 Created`，新 Electron 65498 经 Computer Use 点击按钮显示固定检查通过、候选版本和回滚按钮。
- **不宣称**：Codex 原生压缩、prompt cache 命中、账单成本下降、真实模型质量提升或真人提效。

## 4. 四个已有项目的执行吸收清单

状态含义：`已吸收` 表示本项目已有可核对代码和证据；`本阶段实现` 表示本阶段要做；
`只设计` 表示有契约但暂不写代码；`不吸收` 表示明确排除。

| 来源机制（具体代码） | 对应本项目模块 | 状态 | 本阶段文件范围 | 验证证据 |
|---|---|---|---|---|
| Paperclip `heartbeat-run-events`：事务内锁定 Run、source event id/hash 去重、序号冲突 | `packages/core` RunEvent、`apps/server/src/semantic-idempotency.ts` | 已吸收 | 仅补 RSI 事件使用说明 | 现有 semantic-idempotency 专项 JSON |
| Paperclip `approvals`：pending/revision 条件迁移、重复决定幂等、reconcile 分离 | ApprovalRequest、Artifact release | 已吸收/本阶段复用 | `apps/server/src/index.ts`、RSI 路由 | RSI approval/reconcile 事件回放 |
| Paperclip budgets/heartbeat：预算硬停止、lease、唤醒 | future Routine | 只设计 | `SPEC/21`、不改运行时 | 后续 Routine 专项，不进入本阶段 |
| Hindsight `retain/recall/reflect`：事实拆分、来源 hash、混合召回、派生模型可撤回 | `MemoryItem`、ContextAssembler、ContextPacket | 只设计 | `packages/core` 类型草案或 SPEC 接口 | 范围隔离、sourceRefs、撤回契约；本阶段不引入 Postgres |
| Hindsight memory bank：按项目隔离、过期/来源/版本 | MemoryItem、project-scoped projection | 已部分吸收 | RSI 证据读取只允许当前 project/run | 跨项目读取拒绝、重启回放 |
| Univer `plugin.service`：依赖拓扑与生命周期 | Provider/Tool adapter registry | 只设计 | `SPEC/21` 接口边界 | 未来 adapter registry 专项 |
| Univer `f-univer` facade + workbook snapshot/revision | Artifact workspace | 只设计 | `SPEC/21` facade 草案 | 未来 revision/undo 专项 |
| StarNet `runstore.js`：append-only 日志、Artifact/工具轨迹/恢复链 | SQLite Run/RunEvent/Artifact | 已吸收/本阶段复用 | RSI projection 只读回放 | SQLite 重启、event replay、幂等 |
| StarNet `permissions.js`：硬拒绝、逐次 consent、撤销状态重读 | ToolPolicy、Approval、ToolRuntime | 已吸收 | RSI 高风险 target 硬阻断 | dynamic revoke 专项 + RSI target scan |
| StarNet `recovery.js`：只重试明确瞬时读失败，mutation 不猜测 | retry policy、RSI rollback | 已吸收/本阶段复用 | 回滚和失败事件 | bounded retry + rollback 专项 |
| StarNet `memory-store.js`：pending proposal 与 accepted memory 分离、runId+proposalId 去重 | ImprovementProposal、MemoryItem | 已吸收（首版） | `packages/core`、`apps/server` | `validation/local-eval-memory-rsi-v1-2026-10-04.json`：restart、dedupe、project scope |

## 5. RSI 最小纵向闭环

### 5.1 事实源选择

不新增 `improvement_proposals` 或 `eval_runs` 表。一次 RSI 运行使用现有 `Run`；以下内容
以 append-only `RunEvent` 保存，完整报告以 Artifact 保存，需人工决定的候选使用现有
ApprovalRequest：

```text
Run(metadata.improvement)
  ├─ improvement.run_started
  ├─ improvement.proposal_created
  ├─ improvement.evaluation_completed
  ├─ improvement.approval_requested   (高风险或策略不允许自动启用时)
  ├─ improvement.published             (仅低风险、明确策略、通过固定门)
  ├─ improvement.rolled_back
  └─ improvement.failed
```

每个 proposal 必须带：

```ts
type ImprovementProposalRecord = {
  proposalId: string;
  projectId: string;
  runId: string;
  target: "prompt" | "skill" | "memory_policy" | "tool_policy" | "provider" | "code" | "bot" | "routine";
  baseVersion: string;
  candidateVersion: string;
  candidateHash: string;
  evidenceRefs: string[];
  evalRefs: string[];
  status: "draft" | "testing" | "pending_approval" | "published" | "rejected" | "rolled_back";
  changedRefs: string[];
};
```

### 5.2 默认安全策略

- 默认 target 为 `prompt`，候选只写入版本化 Artifact/RunEvent，不悄悄覆盖现有 Bot prompt。
- `skill`/`memory_policy` 只有在候选没有扩大工具、网络、路径或记忆范围且固定评测通过时，
  才能进入受控 staged/published 记录；本阶段不自动改变正式 Skill/MemoryItem。
- `tool_policy`、`provider`、`code`、`bot`、`routine` 永远停在 `pending_approval` 或
  `blocked`，并写明原因。
- 候选不通过 schema、来源、项目隔离、权限扫描或回滚可行性检查时不能发布。
- 只允许固定最大迭代次数（首版为 1 次候选生成）；不递归产生新候选。

### 5.3 API/UI 最小契约

若现有公共契约足以表达，则实现：

```text
POST /api/improvements/run
  body: { projectId, target?: ImprovementTarget, reason?: string, idempotencyKey?: string }
  -> { runId, run, projection, artifacts, approvals, idempotent }

GET /api/improvements/:runId?projectId=...
  -> { run, proposal?, evaluation?, approval?, events, artifacts }

POST /api/improvements/:runId/rollback?projectId=...
  -> { projection }
```

Web 只显示用户可理解的“开始自动更新”、固定评测结果、是否发布、回滚按钮和阻断原因；
不展示内部实现术语作为可操作权限。按钮调用的事实必须来自 API 回读，不由组件本地状态冒充。
首版 Web 只暴露低风险 `prompt` 候选；高风险 target 由服务端契约和 HTTP 测试覆盖，暂不提供普通用户按钮。

## 6. 额外研究的有界缺口（已完成）

本项目已有 Hindsight（记忆）、Paperclip（治理）、Univer（工作台边界）、StarNet（权限/恢复）
研究。本轮按当前缺口核对四个项目。维护信号只表示截至 2026-10-03 的公开仓库活跃度，不代表依赖已经锁定或适合直接引入。

### 6.1 Inspect AI

- **公开来源与许可**：[官方仓库](https://github.com/UKGovernmentBEIS/inspect_ai)、[MIT LICENSE](https://github.com/UKGovernmentBEIS/inspect_ai/blob/main/LICENSE)。仓库主页显示约 7,883 次提交、250 个 issue、121 个 PR，并由 UK AI Security Institute 创建；这作为维护信号。
- **具体机制**：`src/inspect_ai/scorer/_scorer.py` 定义 `Scorer` 协议，输入 `TaskState` 和 `Target`，输出结构化 `Score`；`@scorer` 注册器保存 scorer 名称、参数、metadata 和 metrics，之后可从日志重建。`src/inspect_ai/solver/_basic_agent.py` 把 `Solver`、工具、`max_attempts`、`message_limit`、`token_limit` 和 scorer 组合为可终止的评测任务。官方 `score.py` 支持从已保存的 eval log 重新解析样本并追加或覆盖评分。
- **对应本项目**：`EvalTask = 数据集 + SolverPath + Scorer`；把“失败”与“没有评分”分开，固定任务版本和 scorer 版本；把 score evidenceRefs 写进 RSI evaluation Artifact，而不是让生产 Agent 自评。
- **吸收状态**：`本阶段实现`（只吸收任务/评分/未评分分层，不引入 Python 运行时）。
- **文件与验证**：`packages/core` 的 Eval/Proposal 记录、`apps/server` 的 deterministic evaluator；验证 schema、hard assertions、unscored/failed 分离、重启回放。
- **不吸收**：执行不可信 task/solver/scorer 的 Python 代码；Inspect 的安全说明明确指出加载不可信评测文件等同运行不可信代码，因此不把它作为本地首版插件机制。

### 6.2 Langfuse

- **公开来源与许可**：[官方仓库](https://github.com/langfuse/langfuse)、[LICENSE](https://github.com/langfuse/langfuse/blob/main/LICENSE)、[官方评测概念文档](https://github.com/langfuse/langfuse-docs/blob/main/content/docs/evaluation/core-concepts.mdx)。仓库主页截至本轮显示约 9,739 次提交、1,003 个 open issue、678 个 PR，`pushed_at` 为 2026-10-02；这是维护信号。
- **许可边界**：仓库 README/许可证说明仓库主体为 MIT，但 `ee/`、`web/src/ee/` 和 `worker/src/ee/` 目录受 `ee/LICENSE` 约束；本项目只借鉴公开数据模型，不复制 Enterprise 代码。
- **具体机制**：Trace/Observation 记录一次应用运行及中间步骤；Dataset/Item/Task/Score 组成实验链；Score 可以是 numeric、categorical、boolean 或 text，并可附着到 trace、observation、session 或 dataset run。官方文档同时支持 code evaluator、人工反馈、LLM judge 和自定义 evaluator。
- **对应本项目**：把现有 RunEvent/receipt 作为本地 trace，把 fixed eval task 和 proposal version/hash 作为 dataset/experiment 关联；把规则扫描、人工标签和模型评分区分为不同 scorer，所有 score 都必须有 evidenceRefs。
- **吸收状态**：`本阶段实现`（只吸收 trace→dataset/eval→score 的关联契约；不做云端观测）。
- **文件与验证**：`apps/server` RSI projection、`validation/` 报告和 `SPEC/21`；验证同一 run 的事件、提案、评测和 rollback 可追溯，原始 prompt/数据不外发。
- **不吸收**：Langfuse 服务、ClickHouse、云端 telemetry、prompt cache 或其 UI；本地 SQLite 仍是唯一事实源。

### 6.3 LangGraph

- **公开来源与许可**：[官方仓库](https://github.com/langchain-ai/langgraph)、[MIT LICENSE](https://github.com/langchain-ai/langgraph/blob/main/LICENSE)、[checkpoint 文档](https://github.com/langchain-ai/docs/blob/main/src/oss/langgraph/checkpointers.mdx)、[interrupt 类型与源码](https://github.com/langchain-ai/langgraph/blob/main/libs/langgraph/langgraph/types.py)。仓库主页截至本轮显示约 7,124 次提交、816 个 open issue、235 个 PR，`pushed_at` 为 2026-10-02；这是维护信号。
- **具体机制**：`types.py` 将 durability 定义为 `sync/async/exit`，checkpoint stream 记录 state、next、parent checkpoint 和 task；`interrupt()` 通过 checkpointer 保存状态并向调用方暴露等待值，恢复会从节点开头重新执行；官方文档明确要求恢复时把副作用放在幂等边界之外，time travel/replay 会重新触发节点后的 API/LLM 调用。
- **对应本项目**：吸收“checkpoint 是恢复游标、恢复从节点边界重放、不可逆副作用必须幂等”的语义；映射到现有 RunEvent sequence、callId/requestId、Approval 和 retry 分类。
- **吸收状态**：`已吸收/本阶段复用`（只把语义落实到 RSI 运行的事件与回滚，不接管 `packages/core` 状态机）。
- **文件与验证**：`packages/core/src/types.ts`、`apps/server/src/runtime.ts`、RSI 事件 projection；验证 interrupt/approval 前后不重复发布，rollback 后历史候选不被覆盖。
- **不吸收**：LangGraph 的 Pregel runtime、外部 checkpointer、LangSmith 服务和 Python/JS 框架依赖。

### 6.4 OpenHands Software Agent SDK

- **公开来源与许可**：[SDK 官方仓库](https://github.com/OpenHands/software-agent-sdk)、[MIT LICENSE](https://github.com/OpenHands/software-agent-sdk/blob/main/LICENSE)。OpenHands 主仓库 README 明确把 Agent Canvas 与 SDK/Agent Server 分开：Canvas 负责控制面，SDK 负责 agents、tools、conversations、workspaces、events 和 REST/WebSocket API；SDK 仓库主页截至本轮显示约 2,483 次提交、243 个 issue、268 个 PR。
- **具体机制**：SDK README 给出 `Agent + Tool + Conversation(workspace)` 的可组合入口，并把 Python SDK、TypeScript client、Agent Server、workspace 和 tools 分层；OpenHands 的事件循环以 action/observation 配对驱动工具执行，控制面与执行后端可以拆开；Agent Canvas 文档还明确警告“无 sandbox 运行时会拥有整台机器文件系统权限”，并提供 Docker workspace 隔离。
- **对应本项目**：吸收 action/observation/receipt 的成对记录、workspace 作为执行边界、控制面与执行器分离；把 RSI 的候选生成限制在当前 project/run 的证据范围，不把代码执行器当作提案发布器。
- **吸收状态**：`只设计`（本阶段只把事件配对、workspace scope 和高风险执行阻断写入 RSI 验收，不接 SDK）。
- **文件与验证**：现有 ToolRuntime、RunEvent、project-scoped projection；验证 action 未完成时可诊断、跨项目/敏感路径被拒绝、回滚不触发代码执行。
- **不吸收**：OpenHands Agent Canvas、自动化服务器、远程/云端后端、默认 full filesystem access、第三方 Agent backends；不安装其依赖。

### 6.5 研究结论

四个项目没有改变本项目的事实源选择。具体吸收结果是：

| 缺口 | 吸收机制 | 状态 |
|---|---|---|
| 评测不能只是一段文字 | Inspect 的 Task/Solver/Scorer/Score 分层 | 本阶段实现 |
| 运行、评测、版本无法串起来 | Langfuse 的 Trace→Dataset/Experiment→Score 关联 | 本阶段实现 |
| 中断恢复可能重复副作用 | LangGraph 的 checkpoint/interrupt/replay 幂等语义 | 现有底座复用 |
| 工具执行与控制面边界不清 | OpenHands 的 SDK/Server/Workspace/Action-Observation 分层 | 只设计，首版不接 SDK |

本轮研究完成后，下一步不再继续搜索同类项目；进入 RSI 事件/投影契约实现。

## 7. 本阶段执行顺序与唯一下一步

1. **计划冻结（本文件）**：完成目标、边界、吸收矩阵、RSI 契约和验收门。
2. **外部缺口研究**：按第 6 节最多核对 4 个项目并更新吸收清单。
3. **核心事件/投影契约**：加入 RSI 事件类型和纯投影类型；不迁移数据库。
4. **服务端最小闭环**：Fixture/deterministic evaluator 先跑通 Run → proposal → eval → publish/rollback。
5. **Web 按钮与回读**：已实现一次点击和结果投影；低风险候选显示固定检查/发布/回滚，高风险候选由服务端停在审批。
6. **定向验证与收口**：测试、typecheck、build、state、diff check；更新状态和交接文件。

当前阶段已收口。后续如果继续开发，应从 R9 真人现实验证或新的明确功能单元开始；不重复环境探针，不做 provider 或 Harness 横向比较。
