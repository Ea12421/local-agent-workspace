# Agent Role Map 与全链路责任设计

状态：`proposal / freeze-before-implementation`

说明：本文件描述产品运行时的 Bot / Workflow 角色。开发这个项目时的外部协作规则已经单独冻结在 `SPEC/11-external-agent-orchestration.md`，两者不能混用。

本文件回答一个问题：如果把一个 AI 产品从想法推进到交付，哪些职责需要 Agent，哪些职责必须由确定性 Runtime、检查器或用户承担？

## 1. 总决定

我们需要设计完整角色地图，但不应该让每个岗位都变成一个常驻 LLM Agent。

采用四层结构：

```text
L0 确定性 Control Plane / Runtime
  → L1 一个持久 Product Builder Bot
    → L2 当前 Run 按需激活的专家节点
      → L3 QA / 安全 / 恢复 / 发布闸门
        → L4 后续 Skill / Routine / 多 Agent 产品化
```

原因：状态迁移、权限、审批、幂等、回放、恢复、成本统计和发布阻断必须可审计，不能交给 LLM 自己决定。Agent 只负责不确定的判断、研究、方案和解释。

当前固定任务的多 Bot 路径曾比单 Bot 慢约 2.7–6.5 倍，而且没有质量资格证据。因此“角色全部同时拉满”不是默认方案；每个 Run 只激活完成当前目标所需的最小节点。

## 2. 统一角色契约

所有 Agent 角色或确定性闸门都必须声明：

```ts
type RoleManifest = {
  id: string;
  kind: "llm_agent" | "deterministic_gate" | "adapter" | "human_gate";
  purpose: string;
  trigger: string;
  inputRefs: string[];
  outputSchema: string;
  tools: string[];
  permissionTier: "read_only" | "workspace_write" | "full_access";
  providerPolicy: string;
  memoryPolicy: string;
  stopConditions: string[];
  approvalRules: string[];
  maxIterations: number;
  budget: { maxTokens?: number; maxDurationMs?: number; maxCostCents?: number };
  evalSuite: string;
};
```

每次交接必须使用结构化 `HandoffEnvelope`，至少包含 objective、inputRefs、outputSchema、constraints、approvalRequired、status、depth、parentHandoffId 和 resultRefs。禁止用自由闲聊作为事实交接。

## 3. L0：确定性 Runtime（不做常驻 Agent）

### 3.1 Run Coordinator

- 职责：创建 Run、状态迁移、节点顺序、取消、重试、恢复、最大深度和最大循环次数。
- 输入：RunRequest、Workflow 图、已完成事件。
- 输出：下一个允许执行的节点和 RunEvent。
- 权限：不能自行扩大工具权限。
- 停止：状态冲突、循环、预算耗尽、待用户审批、恢复校验失败。

### 3.2 Tool Runtime

- 职责：工具 Schema 校验、路径/命令 guard、执行、超时、取消、脱敏和 receipt。
- 输入：ToolCallEnvelope、ToolPolicy、Project workspacePath。
- 输出：ToolResult、ToolExecutionReceipt。
- 权限：只能执行已批准的工具和命令。
- 停止：越权、路径穿越、符号链接越界、超时、输出超限、审批缺失。

### 3.3 Policy / Approval Gate

- 职责：判断是否需要逐次审批，保存批准/拒绝理由和审批引用。
- 始终审批：外发、删除/覆盖重要数据、访问项目外敏感路径、生产配置、支付/发布、凭据读取。
- 规则：审批只能授权当前动作，不能让 Agent 获得永久更高权限。

### 3.4 Context / Memory Manager

- 职责：ContextSnapshot、事实、决定、Artifact、未决问题、下一步、压缩和恢复。
- 规则：摘要不能覆盖权威事实；不保存或伪造 chain-of-thought；跨项目隔离。

### 3.5 Audit / Usage Ledger

- 职责：append-only RunEvent、ProviderResponse、Tool receipt、usage、cost、cache、错误和审批记录。
- 规则：Provider 报告、估算和未知必须分开；订阅额度不能冒充 API 费用。

### 3.6 Release Gate

- 职责：检查 Schema、来源、冲突、审批、Artifact hash、测试和限制说明。
- 输出：`PASS / PARTIAL / NO-GO`。
- 规则：Gate 自己不能把模型自评升级成成功，也不能自动发布。

## 4. L1：持久 Product Builder Bot

这是 v0.1 唯一持久 Bot。

- 职责：维护项目目标和长期上下文，按需调用专家节点，汇总冲突，生成 Artifact 和执行计划。
- 输入：自然语言想法、Project、已批准 Memory、Skill 版本、历史 Artifact。
- 输出：澄清结果、Workflow 计划、结构化 Handoff、Product Brief、Technical Proposal、Evaluation Plan、Execution Plan。
- 工具：默认只读；只能在当前项目草稿目录写入；搜索、文件和 Git 通过 ToolPolicy 控制。
- 不允许：自我提升权限、自动创建无限 Bot、绕过审批、自动发布、把未知事实补成确定事实。
- 停止：关键未知项需用户决定、Schema/来源/冲突失败、权限不足、循环/预算超限、恢复状态不一致。

## 5. L2：按 Run 激活的产品专家节点

这些角色暂时是 Workflow 节点，不是常驻 Bot。

### 5.1 Clarifier / Planner

- 输入：原始想法、已有项目上下文。
- 输出：未知项、用户决策问题、依赖有序的 Workflow 图和停止条件。
- 权限：只读。
- 停止：目标、用户、范围或成功标准无法识别。

### 5.2 Research Agent

- 输入：研究问题、范围、时效要求、允许来源。
- 输出：带 Source 引用的事实包、未知项、冲突项、检索时间和来源质量。
- 权限：公开网络/资料只读；不能外发或改项目。
- 停止：来源不足、来源冲突、过期或研究预算耗尽。

### 5.3 Product Definition Agent

- 输入：Clarifier 结果、Research Report、项目约束。
- 输出：用户、场景、痛点、价值、MVP、非目标、风险和决策记录。
- 权限：读输入，写草稿 Artifact。
- 停止：用户/场景/价值仍不成立，或关键事实不足。

### 5.4 Architecture Agent

- 输入：Product Brief、Provider 能力矩阵、工具和部署约束。
- 输出：方案选项、取舍、依赖、成本/复杂度/稳定性风险、推荐架构和未知项。
- 权限：只读代码和规范；不能直接改代码或配置。
- 停止：能力未知、风险无法界定或方案冲突。

### 5.5 Evaluation Agent

- 输入：Product Brief、Technical Proposal、固定题集、验收阈值。
- 输出：成功指标、硬约束、Bad Case、对照方案和 PASS/PARTIAL/NO-GO 建议。
- 权限：读、运行白名单测试和 Fixture；不能自行修改正式结果。
- 停止：阈值不清、输入不完整、只能依赖模型自评。

### 5.6 Synthesis / Conflict Resolver

- 输入：各节点结构化结果、Source/Artifact refs。
- 输出：合并包、显式冲突、责任追踪和待用户决定清单。
- 权限：只能写 draft merge，不能修改原始证据或抹平冲突。
- 停止：引用断裂、Handoff 成环/超深度、冲突未解决。

### 5.7 Artifact / Execution Planner

- 输入：已批准合并包、Evaluation Plan、项目约束。
- 输出：PRD、技术方案、评测计划、执行任务、依赖顺序和来源图。
- 权限：只能写当前项目草稿目录。
- 停止：审批缺失、引用不完整、目标超出当前 Run。

## 6. L3：质量、安全、恢复和交付角色

这些角色按事件临时激活；机械检查优先由脚本完成，LLM 只解释和归因。

### 6.1 QA / Verifier

- 检查：Schema、事件回放、Artifact 可重建、固定题集、回归、人工修改记录。
- 输出：结构化 findings 和 PASS/PARTIAL/NO-GO。
- 权限：读、运行测试/构建/诊断；默认不改代码。
- 规则：不能自己批准自己生成的结果。

### 6.2 Security / Policy Reviewer

- 检查：路径穿越、符号链接、敏感路径、命令白名单、secret 脱敏、外发和审批边界。
- 输出：allow/block 建议和证据引用。
- 权限：只读审计；不能放宽策略。
- 停止：任何安全性无法证明的高风险动作。

### 6.3 Recovery / Incident Agent

- 输入：失败 Run、事件回放、ContextSnapshot、Provider/Tool receipt。
- 输出：失败归因、可重试/需用户决定/不可恢复分类和恢复草稿。
- 权限：只能发起受控 retry/resume；不能修改历史事件或扩大权限。
- 停止：状态冲突、证据不足或重试预算耗尽。

### 6.4 Release / Operations

- 输入：测试、安全结果、Artifact manifest、环境诊断。
- 输出：版本、构建、安装诊断、发布清单和已知限制。
- 权限：白名单测试/构建命令；上传、发布、权限变更逐次审批。
- 停止：测试失败、hash/manifest 不一致、依赖缺失。

### 6.5 Provider / Cost Analyst

- 输入：ProviderResponse、usage、cache、latency、error receipt。
- 输出：provider-reported/estimated/unknown 分类、成本/延迟/失败对比、能力矩阵。
- 权限：只读账本。
- 停止：来源不明或字段缺失则标记 unknown。

## 7. L4：后续产品化角色

### 7.1 Skill Lifecycle Steward

负责从真实运行、失败和人工修改中生成 Skill 新版本草稿：

```text
运行证据
→ 改进草稿
→ 固定题回放
→ 评测差异
→ 用户批准
→ 注册新版本
```

不能直接发布、提升权限或绑定新工具。

### 7.2 Routine / Scheduler Operator

负责已批准 Workflow 的时间/事件触发、时区、去重、lease、重试、暂停、通知和错过运行策略。

它应该优先是确定性调度服务，不是自由发挥的常驻 Agent。

### 7.3 Bot Profile Builder

根据已验证 Skill 生成待审核 BotProfile 草稿；不能自动注册、启用、提权或递归创建。

### 7.4 Computer Use / Cloud Backend

只作为 ExecutionBackend Adapter：明确 session、隔离、凭据注入、审批、录屏/操作 receipt 和退出方式。首版不开放完整云电脑或支付/外发自治。

## 8. Agent 激活策略

### 当前 v0.1

启用：

- L0 Runtime；
- 一个 Product Builder Bot；
- Clarifier/Planner、Research、Product、Architecture、Evaluation 等按需节点；
- Fixture ToolRuntime、Approval、Artifact、Recovery 和 Release Gate。

### 当前下一工程单元

只补 L0 的 fixture-first Tool Loop：

```text
ProviderResponse
→ ToolCall
→ schema / 幂等
→ Approval
→ ToolRuntime
→ Tool Result
→ next model segment
→ Artifact
```

不同时启动 QA、运维、Skill 自优化和后台 Routine 的完整实现。

### 后续启用顺序

1. ProviderResponse、Tool Loop、恢复和使用量账本；
2. QA/Security/Recovery/Release 事件闸门；
3. Skill Manifest、版本锁定、固定题评测和回滚；
4. Routine/Scheduler、通知和暂停；
5. Computer Use/Cloud Backend；
6. 只有质量和效率证据通过后，才引入常驻 Multi-Agent 协作。

## 9. 每增加一个角色必须回答的问题

1. 它减少哪一类错误或返工？
2. 它的输入和输出 Schema 是什么？
3. 它有哪些最小工具权限？
4. 它什么时候必须停止？
5. 它由什么固定题或证据验收？
6. 这个职责能否由确定性 Runtime 完成？如果能，不增加 LLM Agent。
7. 它失败后谁接手？是否可重试、可回放、可取消？

没有明确答案的角色不注册为可运行 Agent。

## 10. 完成标准

本设计达到可实现状态，需要：

- 所有 L0/L1/L2/L3/L4 角色有唯一 ID、责任、权限、输入输出和停止条件；
- 每个交接可通过 `HandoffEnvelope` 回放；
- 每个工具动作有审批引用、receipt、幂等 key 和错误分类；
- 每个 Skill 版本能被 Run 锁定；
- 每个 Routine 有去重、暂停、重试和错过运行策略；
- QA、Security、Release 不能自我批准；
- 用户可以看到当前负责人、读了什么、产出了什么、失败在哪里、下一步是谁决定；
- 真实实现通过固定题、恢复、拒绝、失败、重复执行和最小现实使用门。

本文件是设计冻结前的角色地图，不表示 L2/L3/L4 已经实现。
