# Independent Evaluation、Controlled RSI 与 Dynamic Context Freshness v1

状态：proposal / ready-for-main-window-reconciliation

日期：2026-10-03（Asia/Shanghai）

本文件是现有 Local Agent Workspace / Project Bot OS 的增量方案，不替代
SPEC/MASTER-SPEC.md、SPEC/IMPLEMENTATION-BACKLOG.md 或 RUN_STATE.json。
它描述下一轮功能迭代应如何增加独立评测、受控自我迭代和动态上下文新鲜度。

## 1. 目标与问题

当前项目已经有本地 Control Plane、SQLite-first 事实源、Run 状态机、
append-only RunEvent、审批、Artifact、ContextSnapshot、Provider Adapter
和受控 Tool Loop。

当前缺口是：

1. 还不能用统一结构比较单次调用、单 Bot Workflow 和多 Bot Workflow；
2. 运行失败、工具失败、格式错误和内容质量问题没有完全分离；
3. 用户修改和运行失败还不能稳定变成回归题；
4. Agent 可能把过时的静态说明书当成当前事实；
5. 还没有候选改进的评测、审批、发布和回滚闭环。

## 2. 核心原则

### 2.1 SPEC 不是实时数据库

SPEC 只保存相对稳定的内容：

- 产品目标；
- 状态机；
- 权限边界；
- 数据契约；
- Provider 边界；
- 验收规则；
- 明确的非目标。

当前进度、最近运行结果、Provider 能力、用户最新决定和事实来源必须保存在
SQLite、RunEvent、Artifact、MemoryItem 和 ContextSnapshot 中。

### 2.2 每次 Run 使用派生 ContextPacket

Agent 不直接把整份 SPEC 当作长期记忆。每次 Run 启动或恢复时，由
ContextAssembler 根据适用 SPEC 版本、Project/Run 状态、已批准 Memory、
Provider 能力、最近事件、未解决审批、来源和过期信息生成本次 Run 的
ContextPacket。

### 2.3 RSI 必须是受控迭代

RSI 只允许产生候选 Skill、Prompt 和 MemoryPolicy 版本。候选版本必须经过
固定评测、安全扫描、回归比较和用户批准后才能发布。

RSI 不得自动修改正式代码、状态机、权限、Provider，也不得自动注册 Bot、
启用后台 Routine、外发、发布或支付。

## 3. 范围

### 3.1 In Scope

- EvalTask、EvalRun、Score、EvalDataset 和评测报告；
- 单 Bot、结构化 Workflow、多 Bot 三条 SolverPath 的统一比较；
- 规则、独立模型、人工和安全扫描四类评分；
- FeedbackEvent、ImprovementProposal 和版本化候选；
- 基线/候选回归比较、审批、发布和回滚；
- SPEC 分类、动态事实新鲜度和冲突检测；
- ContextAssembler 对现有 ContextPacket 的补强；
- SQLite-first 持久化和 append-only 审计事件。

### 3.2 Out of Scope

- 不引入完整 LangGraph、Temporal、Inspect AI、Langfuse、Hindsight、Letta
  或 DSPy 作为业务事实源；
- 不把第三方框架状态机接管 packages/core；
- 不开放默认写工具、任意 Shell 或 full_access；
- 不做云端多用户、全局后台监听和无人审批 Bot；
- 不把一次 HTTP 200、Fixture PASS 或模型自评当成质量证明；
- 不把多 Bot 自动设为默认路径；
- 不把 SPEC 自动改写成新版本。

## 4. 参考项目与吸收边界

这些项目作为代码和机制参考，不作为运行时依赖：

| 项目 | 代码级机制 | 吸收方式 |
|---|---|---|
| OpenHands | 事件单点追加、Action/Observation 配对、阻断原因持久化 | 补充工具调用未完成扫描、阻断原因和恢复回放 |
| LangGraph | interrupt 恢复时重新执行节点，要求副作用幂等 | 审批前不做不可逆副作用，恢复依靠 callId/requestId |
| Inspect AI | Task = Dataset + Solver + Scorer，区分 unscored 和 failed | 采用 EvalTask、SolverPath、Score 契约 |
| Langfuse | Trace、Prompt 版本、Dataset、Score 连接成持续改进链 | 将失败事件和人工修改提升为本地回归题 |
| Letta / Hindsight | 有范围、有来源的记忆和 Recall/Reflect | 增加 MemoryEvidence，外部记忆只能作为 Adapter |
| DSPy | 用固定指标比较 Prompt/程序候选版本 | 只借鉴候选版本比较，不允许自动发布 |
| Temporal | Durable Workflow、重试、历史和恢复语义 | 借鉴语义，继续使用 SQLite，不引入 Server |
| OpenAI Agents SDK | 工具前后 Guardrail 和 Tripwire | 增加确定性工具检查和可审计阻断事件 |
| Paperclip | Heartbeat、预算硬停止、任务归属和审计 | 后续用于 Routine，本增量不启用后台调度 |
| Univer / StarNet | 结构化工作台、状态和交接可见性 | 后续只用于展示层，不改变 Control Plane |

## 5. 数据契约

### 5.1 Dynamic Spec

~~~ts
type SpecRef = {
  specId: string;
  version: string;
  section: string;
  kind: "contract" | "decision" | "live_state" | "example";
  status: "active" | "superseded" | "draft";
  appliesTo: string[];
};
~~~

live_state 不应继续堆在静态 SPEC 正文里，必须指向动态事实。

### 5.2 Dynamic Fact

~~~ts
type ProjectFact = {
  id: string;
  projectId: string;
  content: JsonValue;
  sourceRefs: string[];
  eventRefs: string[];
  observedAt: string;
  expiresAt?: string;
  confidence: "low" | "medium" | "high";
  status: "active" | "stale" | "superseded";
};
~~~

### 5.3 Evaluation

~~~ts
type EvalTask = {
  id: string;
  version: string;
  input: JsonValue;
  requiredArtifacts: string[];
  hardAssertions: string[];
  allowedTools: string[];
  expectedSourcePolicy: string;
};

type EvalRun = {
  id: string;
  taskId: string;
  solverPath: "single_call" | "single_bot" | "structured" | "multi_bot";
  providerIdentity: ProviderIdentity;
  runId: RunId;
  status: "passed" | "partial" | "failed" | "unscored";
  scores: Score[];
};

type Score = {
  name: string;
  value?: number;
  label?: string;
  scorer: "rule" | "model_judge" | "human" | "scanner";
  evidenceRefs: string[];
  confidence: "high" | "medium" | "low";
};
~~~

### 5.4 Controlled RSI

~~~ts
type FeedbackEvent = {
  id: string;
  projectId: string;
  runId?: RunId;
  source: "user_edit" | "tool_failure" | "schema_failure" | "human_label" | "scanner";
  issueType: "prompt" | "skill" | "memory" | "tool" | "provider" | "ux";
  evidenceRefs: string[];
  createdAt: string;
};

type ImprovementProposal = {
  id: string;
  target: "skill" | "prompt" | "memory_policy" | "tool_policy";
  baseVersion: string;
  candidateVersion: string;
  triggerRefs: string[];
  hypothesis: string;
  changedRefs: string[];
  evalTaskIds: string[];
  status: "draft" | "testing" | "pending_approval" | "published" | "rejected" | "rolled_back";
};
~~~

## 6. 运行流程

### 6.1 Run 前

~~~text
读取适用 SpecRef
→ 读取最新 ProjectFact
→ 校验 source、时间和过期状态
→ 检查 Spec/Fact 冲突
→ 生成 ContextPacket
→ 固定 specVersion、factRefs、snapshotId
→ 执行 Run
~~~

存在未解决冲突或关键事实过期时，Run 进入 waiting_user 或 needs_review，
不能静默采用旧值。

### 6.2 独立评测

~~~text
EvalTask
→ 选择 SolverPath
→ 执行 Run
→ 记录 Provider/Tool/Approval receipt
→ 运行硬约束检查
→ 运行独立评分和扫描
→ 生成 EvalRun
→ 形成 EvaluationReport
~~~

生产 Agent 不得独自给自己的结果最终评分。

### 6.3 受控 RSI

~~~text
RunEvent / ToolReceipt / FeedbackEvent
→ 归类失败
→ 生成 ImprovementProposal
→ 固定 EvalTask 回放
→ 安全和权限扫描
→ 基线/候选比较
→ 用户审批
→ 发布或回滚
~~~

## 7. 评测门

候选版本只有同时满足以下条件才能进入 pending_approval：

1. Schema 和硬约束不低于基线；
2. 关键来源策略没有回归；
3. 工具、审批、跨项目隔离没有回归；
4. 至少一个独立评分来源支持质量变化；
5. 成本、延迟和失败率没有超过预设上限；
6. 所有分数都有 evidenceRefs；
7. 运行可以从 SQLite 和 RunEvent 重放。

候选版本只有在用户批准后才能进入 published。

## 8. 第一批固定评测任务

1. 结构化输出符合指定 Schema；
2. 外部事实带来源，未知项没有被伪造为事实；
3. 工具调用只能使用声明的工具和权限；
4. 审批通过后同一个 callId 只执行一次；
5. 中断后继续同一 Run，不重复 Artifact；
6. 跨项目读取和路径穿越被拒绝；
7. Provider usage/cache/reasoning 按 reported/estimated/unknown 区分；
8. 过期事实被标记并阻止静默继续。

## 9. 实施任务

### EVAL-01：Core 契约

- 在 packages/core 增加评测和反馈类型；
- 保持现有 Run 状态机不变；
- 为每个评测对象定义 schemaVersion；
- 完成纯函数校验和序列化测试。

### EVAL-02：SQLite 持久化

- 增加 EvalTask、EvalRun、Score、FeedbackEvent、ImprovementProposal 持久化；
- 使用事务和幂等键；
- 写入对应 RunEvent 和 receipt 引用；
- 不改变现有表的事实语义。

### EVAL-03：独立评测引擎

- Fixture-first；
- 单次、单 Bot、结构化、多 Bot 路径可比较；
- 区分 failed、unscored 和质量失败；
- 产出机器可读 JSON 和人可读报告。

### EVAL-04：Dynamic Context Freshness

- 为 SpecRef/ProjectFact 增加来源、时间、状态和过期检查；
- 扩展 ContextAssembler；
- Run 固定 specVersion、factRefs、snapshotId；
- 冲突进入 needs_review，不静默执行。

### RSI-01：候选改进

- 从用户修改、工具失败、Schema 失败和扫描结果生成提案草稿；
- 不直接修改正式 Skill、Prompt 或权限；
- 生成基线/候选对照报告。

### RSI-02：发布和回滚

- 审批后发布版本；
- 发布前后保留 hash；
- 回归时可回滚到 baseVersion；
- 发布、拒绝和回滚都有 append-only 事件。

### MEM-01：记忆 Adapter 预留

- 定义 MemoryAdapter.retain/recall/reflect；
- SQLite MemoryItem 仍是本地事实入口；
- Hindsight/Letta 只作为后续可替换实现；
- 没有来源、置信度或范围的记忆不得进入长期记忆。

## 10. 验收和停止条件

### 本增量完成

- 固定评测任务可以在无 Key Fixture 下运行；
- 评测结果、Provider identity、Tool receipt 和 Artifact 可关联；
- 失败和 unscored 可以区分；
- 动态事实过期或冲突可以阻止静默继续；
- RSI 只能产生草稿，不能自动发布；
- 基线/候选可以比较并回滚；
- 全部状态可由 SQLite 和 RunEvent 重建。

### 必须停止

- Schema 迁移会覆盖或丢失现有数据；
- 需要读取凭据、Cookie 或项目外敏感路径；
- 需要改变默认权限；
- 需要自动外发、发布或支付；
- 评测只能依赖模型自评；
- 无法区分当前事实和旧 SPEC；
- 候选版本出现硬约束回归。

## 11. 证据边界

本方案落盘只证明设计已经明确，不证明多 Bot 已经优于单 Bot、候选版本已经提升
真实生产力、Prompt Cache 已节省成本、外部 Memory Adapter 已提高质量或真人提效
已经完成。

## 12. 主窗口执行规则

1. 读取当前 AGENTS.md、RUN_STATE.json、SPEC/README.md 和现有路线表；
2. 阅读本文件，检查与已有 SPEC 的冲突；
3. 只生成一份差异清单，不创建第二套总 SPEC；
4. 先实现 EVAL-01，再按任务顺序推进；
5. 每个任务都留下测试、receipt、validation 和唯一下一步；
6. 不把本文件的 proposal 改写成 implemented 或 DONE。
