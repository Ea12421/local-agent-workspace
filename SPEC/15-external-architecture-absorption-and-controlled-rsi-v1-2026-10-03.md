# 外部架构机制吸收与受控 RSI v1

状态：`research-complete / partial-implementation`

日期：2026-10-03（Asia/Shanghai）

本文件是 Local Agent Workspace / Project Bot OS 的研究和设计输入。它不替换
`SPEC/MASTER-SPEC.md`、`SPEC/12-evaluation-rsi-context-freshness-v1.md`、
`SPEC/14-context-codex-validation-v1.md` 或 `RUN_STATE.json`，也不表示本文件列出的
机制已经实现。

## 2026-10-04 执行校准

本研究文档中的部分设计已经落地。`ABS-HINDSIGHT-01` 的第一版 SQLite
`MemoryAdapter（记忆适配器）`、固定 `EvalTask（评测任务）`、`Score（评分）` 和
`FeedbackEvent（反馈事件）` 已落到 `packages/core` 与 `apps/server`，证据见
`SPEC/23-local-eval-memory-rsi-v1-2026-10-04.md` 和
`validation/local-eval-memory-rsi-v1-2026-10-04.json`。混合召回、Embedding（向量表示）、
版本化过期字段和 Hindsight Postgres 运行时仍未实现。

## 1. 本轮要回答的问题

用户希望借鉴几个公开项目的成熟机制，同时避免因为“看起来像 Agent OS”就复制整套产品。
本轮只回答四件事：

1. 这些项目实际解决了什么问题；
2. 哪些机制与本项目的 SQLite-first、RunEvent、审批和 ContextPacket 相容；
3. 哪些机制应该保持为可选适配器或以后再做；
4. RSI（受控自我改进）怎样只产生可回滚候选，而不让系统自行扩权或自我修改事实源。

本轮没有安装第三方依赖、没有引入外部运行时、没有改动旧工作台，也没有开始广泛实现。

## 2. 研究边界与证据

### 2.1 公开项目

| 项目 | 官方仓库 | 许可证 | 本轮观察到的提交 | 维护信号 | 结论 |
|---|---|---|---|---|---|
| Paperclip | [paperclipai/paperclip](https://github.com/paperclipai/paperclip) | MIT | `d6d88b9de2fc766637422cc43f985c747455a1b0` | 2026-10-02 有新提交；README 和服务端代码持续围绕任务、心跳、审批、预算演进 | 适合借鉴控制面和治理语义，不直接替换本项目核心 |
| Hindsight | [vectorize-io/hindsight](https://github.com/vectorize-io/hindsight) | MIT | `f7dd3f4fd7420f7beec60c32c965e5e5cf7be066` | 2026-10-02 有新提交；含系统评测目录 | 适合借鉴带来源记忆和召回分层；不把其 Postgres 服务作为本地事实源 |
| Univer | [dream-num/univer](https://github.com/dream-num/univer) | Apache-2.0 | `3bf21d06fc62c3a49bfe9c7f3efb1412a71532fc` | 2026-10-02 有新提交；dev 分支持续更新 | 适合未来 Artifact/表格工作台；当前不引入整套电子表格引擎 |
| StarNet | [androoAGI/starnet](https://github.com/androoAGI/starnet) | MIT | `fbddbf992f8e7082196f07c3024781fcf1c276fc` | 2026-09-28 有新提交；默认开发分支为 `feat/harness-backend`，最新发布版为 v0.12.5 | 适合借鉴能力授权、运行投影和受限恢复；不复制其桌面 UI 或品牌 |

提交号和时间是本轮只读快照的证据，不代表依赖已经锁定，也不替代后续重新核验许可证和版本。

### 2.2 我们自己的现状

目前本项目的事实源和边界仍是：

```text
SQLite / packages/core 类型与状态机
        ↓
append-only RunEvent + receipt
        ↓
ContextSnapshot / ContextPacket
        ↓
Provider / Tool / Approval
        ↓
Web 与 Electron 投影
```

上一轮已经用同一个 Codex 执行桥验证了完整账本和结构化恢复包都能恢复 12/12 个关键字段；
恢复包本地 token 估算缩减 81.5%。这证明本项目的恢复包可被 Codex 读取，不证明 Codex 的
原生压缩、自由聊天全文无损或实际账单缓存收益。该证据保留在
`validation/context-codex-recovery-v1-2026-10-03.{json,md}`，本轮不重跑。

## 3. 推荐结论

不复制任何一个项目的完整架构。吸收以下四类机制：

1. **Paperclip 的治理机制**：事件幂等、任务归属、审批状态幂等、预算硬停止和有界唤醒；
2. **Hindsight 的记忆机制**：`retain / recall / reflect` 分离，记忆带范围、来源、时间和版本；
3. **StarNet 的安全运行机制**：事实源与界面投影分离，能力授权逐次判断，只有明确的瞬时读操作可以有限重试；
4. **Univer 的边界机制**：插件注册和生命周期由宿主掌控，未来需要表格/工作台时用 facade 连接，避免业务代码直接散落到 UI。

受控 RSI 不是第五套 Agent 架构，而是挂在现有 Run、Eval、Approval 和 Artifact 之上的候选流程：

```text
运行证据 / 用户修改
        ↓
生成候选 Prompt / Skill / MemoryPolicy
        ↓
固定评测 + 安全扫描 + 回归比较
        ↓
审批
        ↓
分阶段启用或回滚
```

候选永远不能直接修改权限、Provider、状态机、生产代码、正式 Bot 注册或后台 Routine。

## 4. 各项目的机制、数据流和复用边界

### 4.1 Paperclip：控制面和治理

#### 观察到的机制

- `server/src/services/heartbeat-run-events.ts` 在事务中锁定 Run，校验公司/Run/Agent 绑定，
  原子分配事件序号；重复的 native source event 会返回 `duplicate`，相同事件号但 payload
  hash 不同会报告冲突。
- `server/src/services/approvals.ts` 只允许 `pending / revision_requested` 进入决定；重复提交同一
  决定返回原结果，相反决定被拒绝。审批后的业务副作用通过明确的 reconcile 路径触发。
- `server/src/services/budgets.ts` 按公司、Agent 或项目计算观察到的支出，达到硬上限时暂停作用域，
  并生成“提高预算后恢复或保持暂停”的治理结果。
- heartbeat 服务把唤醒、任务归属、工作区 lease、技能加载、MCP 运行时和受限重试放在持久化
  控制面；README 描述了任务 checkout、单一归属、上下文保存和回滚治理。

#### 对本项目的启发

事件去重和审批幂等直接加强现有 `RunEvent`/`ApprovalRequest`；预算和 heartbeat 只作为以后
Routine 的受控增量。它不能接管本项目的 Run 状态机，也不能把第三方数据库作为事实源。

#### 不吸收

- Paperclip 的公司级组织图、云端多租户和远程 Agent 管理；
- 它的 heartbeat 调度器作为本项目首版默认后台监听；
- 其运行时 MCP/skill 注入实现和 UI。

### 4.2 Hindsight：带证据的记忆

#### 观察到的机制

- Retain 把输入拆成事实、实体、关系、时间信息和 chunk；同一文档用 content hash 和行锁
  处理重试与并发，避免崩溃重试重复写入。
- Recall 把语义、关键词/BM25、图关系和时间检索并列执行，再融合、重排并按 token 预算裁剪；
  存储层通过统一 `recall_unified` 接口隐藏具体索引实现。
- Reflect 不是把新答案覆盖旧记忆，而是基于来源事实生成可追溯的 mental model；支持版本、历史、
  撤回和来源引用。来源不足或工具失败时，流程应失败或显式标记证据不完整。
- memory bank 是隔离边界；观察和记忆具有范围，不应跨项目泄漏。

#### 对本项目的启发

本项目只吸收接口和数据约束：

```ts
MemoryAdapter.retain(input)  // 从 RunEvent/Artifact 产生候选记忆
MemoryAdapter.recall(query)  // 只返回范围内且带 evidenceRefs 的结果
MemoryAdapter.reflect(input) // 生成带版本和来源的派生模型
```

SQLite `MemoryItem` 仍是入口；`ContextAssembler` 只加载指定 project/bot/run 范围内的、未过期且
有来源的记忆。后续可以实现 SQLite/BM25 适配器，再考虑外部 Hindsight 适配器。

#### 不吸收

- Hindsight 的 Postgres schema、部署服务、embedding/reranker 作为首版必需依赖；
- 没有来源、时间、范围或置信度的“自动长期记忆”；
- 用 Reflect 的模型输出覆盖用户决定、Artifact 或原始事件。

### 4.3 Univer：插件与 Artifact 工作台边界

#### 观察到的机制

- `packages/core/src/services/plugin/plugin.service.ts` 以注册表管理插件，显式声明依赖，
  用拓扑顺序加载，并按生命周期阶段启动。
- `packages/core/src/facade/f-univer.ts` 将事件、命令、撤销/重做等能力收敛到稳定 facade；业务调用
  不必直接依赖内部 injector。
- `packages/core/src/sheets/workbook.ts` 以 snapshot 保存工作簿，维护 revision、worksheet 顺序、
  保存和生命周期事件。

#### 对本项目的启发

如果未来要做可编辑的表格/计划工作台，先定义 `ArtifactWorkspaceAdapter` 和稳定 facade，
把命令、撤销/重做、revision 和保存都落到 Artifact/RunEvent，再接 Univer。当前 Product Builder
只需要 Markdown/JSON/HTML Artifact，不应提前引入完整电子表格引擎。

#### 不吸收

- Univer 全部 packages、公式引擎、渲染器作为当前运行时依赖；
- 让 Web 组件直接修改核心状态；
- 把 workbook snapshot 当成 RunEvent 或 SQLite 的替代事实源。

### 4.4 StarNet：能力授权、状态投影和受限恢复

#### 观察到的机制

- `sidecar/runstore.js` 把运行历史作为 append-only 日志，记录 Artifact、工具轨迹、完成证据、
  恢复尝试和中断链；内存镜像有上限，磁盘日志仍完整。
- `sidecar/permissions.js` 是纯的、注入依赖的 consent broker：硬拒绝先于所有授权；非网络只读
  可以自动通过；自主运行没有人工同意时默认拒绝；每次调用重新读取可撤销的 host 状态。
- `sidecar/recovery.js` 只对明确的瞬时工具读失败做有限重试； mutation/connector 得不到“没有发生”
  的证明时不自动重试。
- `sidecar/memory-store.js` 把 notebook、todo、pending、declined 和 derived embedding 分开，
  高风险记忆提案进入有上限的 pending 队列，重复提交按 `runId + proposalId` 去重。
- `sidecar/agent-lifecycle.js` 在删除/归档前先保留 lifecycle reservation，防止新运行在检查和删除之间
  插入。

#### 对本项目的启发

这些机制与现有中文三档权限、ApprovalRequest、ToolRuntime、RunEvent 很相容：

1. Web 看到的是 projection，真正状态从 SQLite/RunEvent 回放；
2. 读操作和写/执行操作的重试策略不同；
3. permission grant 需要记录 scope、actor、时间和撤销状态；
4. memory proposal 和已接受记忆分开保存。

#### 不吸收

- StarNet 的桌面工作站、房间/走廊隐喻、品牌和 UI；
- “Full Access” 绕过本项目硬拒绝层的做法；
- 让自主任务通过沉默、缓存或模型文字自我批准 execute、外发、凭据或敏感路径。

## 5. 吸收矩阵

优先级含义：P0 是现有核心的安全/一致性修补，P1 是下一批正式能力，P2 是可选增强，P3 是暂不排期。

| ID | 来源与机制 | 吸收？ | 目标模块 | 优先级 | 前置依赖 | 主要风险 | 验证方式 |
|---|---|---|---|---|---|---|---|
| ABS-PAPERCLIP-01 | Run 事件原子序号、source id/hash 去重、冲突识别 | 吸收 | `packages/core` RunEvent 持久化/回放 | P0 | 现有 SQLite event log | 并发写入或旧事件迁移误判 | 并发重复提交、hash 冲突、重启回放 |
| ABS-PAPERCLIP-02 | Approval 条件迁移、重复同意幂等、reconcile 分离 | 吸收 | Approval service / release reconcile | P0 | 现有 ApprovalRequest、Artifact release | 副作用在审批前发生 | 同意/拒绝重复提交、相反决定、崩溃后 reconcile |
| ABS-PAPERCLIP-03 | 预算窗口、硬停止、暂停后恢复 | 以后吸收 | future Routine/Run budget policy | P1 | usage receipt、scope identity | 把成本 unknown 当成真实账单 | fixture budget exhaustion、恢复与审计 |
| ABS-PAPERCLIP-04 | heartbeat 唤醒、lease、技能注入 | 限定吸收 | future scheduled runs | P2 | 明确的 Routine/用户授权 | 默认后台监听、重复唤醒、权限扩大 | coalescing、lease 过期、停止条件 |
| ABS-HINDSIGHT-01 | retain/recall/reflect 分离与统一 MemoryAdapter | 已吸收（SQLite 首版） | `packages/core`、`apps/server` | P1 | MemoryItem、ContextAssembler | 引入第二事实源 | `validation/local-eval-memory-rsi-v1-2026-10-04.json` |
| ABS-HINDSIGHT-02 | 事实带来源/时间/版本，派生模型可回撤 | 吸收 | MemoryItem、ContextSnapshot、Artifact | P1 | sourceRefs、eventRefs、hash | 派生摘要覆盖用户决定 | source replay、撤回、过期/冲突检查 |
| ABS-HINDSIGHT-03 | 混合召回、token budget、rerank | 可选 | `packages/adapters` SQLite/BM25 adapter | P2 | P1 MemoryAdapter | 召回质量和成本不可解释 | 固定 query/evidence recall、token 上限 |
| ABS-UNIVER-01 | 插件注册、依赖拓扑和生命周期 | 吸收概念 | future adapter registry | P2 | Provider/Tool adapter contracts | 过早抽象、循环依赖 | 注册顺序、重复插件、dispose |
| ABS-UNIVER-02 | facade、command、revision、snapshot | 以后吸收 | Artifact workspace / Web | P2 | Artifact schema、RunEvent | 第二套编辑状态 | revision、undo/redo、重启回读 |
| ABS-STARNET-01 | source of truth 与 projection 分离 | 吸收 | Web selectors、Run replay、diagnostics | P0 | SQLite/RunEvent | UI 写入事实或显示过期状态 | 刷新、跨进程重开、事件回放 |
| ABS-STARNET-02 | consent broker 硬拒绝、逐次授权、撤销生效 | 吸收 | ToolPolicy、ApprovalRequest、ToolRuntime | P0 | 中文三档权限 | cached grant 越权或 silent consent | 只读/写入/执行、撤销、越权路径 |
| ABS-STARNET-03 | 只重试明确瞬时 read，mutation 不猜测副作用 | 吸收 | Provider/Tool retry policy | P0 | callId/requestId 幂等 | 误把超时当成未执行 | read retry、write timeout、duplicate call |
| ABS-STARNET-04 | memory stores 与 pending proposal 分离 | 吸收概念 | MemoryItem、ImprovementProposal | P1 | EVAL-01 类型契约 | 未决定提案混进长期上下文 | restart、cap、dedupe、discard |
| RSI-01 | 运行证据生成候选 Prompt/Skill/MemoryPolicy | 吸收 | `ImprovementProposal` | P1 | EvalTask/EvalRun/FeedbackEvent | 候选直接改正式对象 | 只能写 draft，不能发布 |
| RSI-02 | 固定评测、扫描、审批、分阶段发布、回滚 | 吸收 | Eval engine、Approval、Artifact release | P1 | RSI-01、版本 hash | 自评、指标漂移、无回滚 | baseline/candidate、rollback、append event |
| RSI-03 | 代码自修改 | 暂不吸收 | 不进入首版 | P3 | 独立 worktree、测试、review | 代码、依赖、权限和数据一起变化 | 只有未来明确立项后再做隔离补丁 |

## 6. 受控 RSI 的分层定义

“自我改进”不是一个动作，必须区分五个层级：

| 层级 | 允许做什么 | 是否自动生效 | 说明 |
|---|---|---|---|
| Prompt/Skill 迭代 | 根据反馈生成候选文本或 Skill diff | 否 | 只能生成 `draft`，保留 baseVersion 和 changedRefs |
| Eval feedback | 把 schema 失败、工具失败、人工修改和评分写成证据 | 可以自动记录 | 证据不是结论，必须带 evidenceRefs |
| Policy update | 提议 ToolPolicy、MemoryPolicy 或 ProviderPolicy 版本 | 否 | 需要安全扫描和用户审批；不能扩大权限 |
| Code self-modification | 在隔离 worktree 生成补丁并跑测试 | 否，首版不做 | 未来也必须人工 review、可回滚、不得触碰生产凭据 |
| Privilege escalation | 添加网络、写入、execute、外发、凭据或自建 Bot/Routine 权限 | 永远禁止 | 任何候选都应被硬拒绝并留下审计事件 |

### 6.1 最小安全闭环

```text
Candidate(draft)
  → schema/static/security checks
  → frozen EvalTask replay
  → baseline vs candidate report
  → pending approval
  → staged activation
  → health check
  → publish or rollback
```

硬规则：

- 每个候选有 `baseVersion`、`candidateVersion`、内容 hash、触发证据和评测任务版本；
- 候选不可以修改 `ToolPolicy` 的允许集合，只能减少权限或提出待审阅变更；
- 没有独立评分或硬约束证据时，状态只能是 `unscored`/`draft`；
- 发布、拒绝、回滚都写 append-only RunEvent；
- 发布失败或健康检查回归时，恢复 baseVersion，不覆盖历史；
- 每轮迭代有最大深度、最大次数和预算，不能无限递归地产生候选。

### 6.2 首版明确禁止的“伪 RSI”

- 模型自己评自己，然后把结果当成改进证明；
- 根据一次失败自动改 Prompt 并立即用于正式 Run；
- 把“上下文压缩后还能回答”当成模型质量全面提升；
- 用错误重试掩盖工具已经执行过的可能性；
- 让候选通过文字指令取得 full access、网络、凭据或外发能力；
- 让候选自动创建、注册、启用另一个 Bot 或后台任务。

## 7. 实施顺序

这份研究不重新打开已经完成的 Codex 上下文验证，也不恢复此前暂停的公开模型对比。后续如果用户恢复
EVAL/RSI 增量，按下面顺序推进：

### 阶段 A：先补一致性底座（P0）

1. 对现有 RunEvent 做 Paperclip 风格的 source id/hash 幂等和冲突回归；
2. 对现有 Approval 做条件迁移、重复决定和 reconcile 回归；
3. 对 Tool/Provider 重试做 StarNet 风格分类：只读瞬时失败可有限重试，写/执行超时进入待核查；
4. 检查 Web projection 是否完全从 SQLite/RunEvent 回放，不由组件本地状态冒充事实。

### 阶段 B：记忆和评测契约（P1）

1. 按现有 `SPEC/12` 从 EVAL-01 开始落 `EvalTask/EvalRun/Score/FeedbackEvent/ImprovementProposal`；
2. 增加 `MemoryAdapter.retain/recall/reflect` 类型，但先用 SQLite 本地实现；
3. 所有 MemoryItem 加 `projectId/botId/sourceRefs/eventRefs/observedAt/expiresAt/confidence/status`；
4. 固定回放任务后才允许生成 RSI 候选。

### 阶段 C：可选工作台和调度（P2）

1. 真正需要可编辑表格/计划时，再做 Univer facade 适配器；
2. 真正需要 Routine 时，再做 Paperclip 风格 heartbeat/lease/budget，并且默认关闭；
3. 真正需要混合召回时，再做 SQLite/BM25 adapter；不先引入 Hindsight Postgres。

## 8. 验收和停止条件

### 8.1 研究设计已完成

- 四个项目的许可证、快照提交、核心目录和主要机制已记录；
- 每条吸收项都有目标模块、依赖、风险和验证方式；
- “吸收”与“当前不吸收”明确分开；
- RSI 的候选、评测、审批、发布、回滚和禁区明确；
- 没有新增第三方运行时依赖，也没有把研究写成已实现能力。

### 8.2 后续实现不能宣称完成的条件

- 只读研究或 README 阅读不能写成代码已接入；
- Fixture、机械 schema PASS 或模型自评不能写成真实质量提升；
- MemoryAdapter 类型存在不能写成记忆召回效果已验证；
- 候选生成不能写成自动自我优化已经开启；
- Web projection 通过不能写成 Electron、真实 Provider 或外部服务全部通过。

## 9. 当前唯一下一步

本轮 P1 的本地评测与记忆最小闭环已经完成。后续若继续推进，应单独选择一个方向：

1. 评估 Embedding（向量表示）或混合召回，证明召回质量；或
2. 设计真实任务验证，证明评分和记忆是否减少人工修改；或
3. 进入 Univer facade（工作台外壳）或 Paperclip Routine（例程调度）等 P2 能力。

这些方向都不自动安装第三方运行时，也不改变当前已经交付的本地运行版。
