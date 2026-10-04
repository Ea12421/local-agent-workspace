# 外部网页 Chat 评审合并记录（2026-09-29）

## 0. 这份文件解决什么问题

这不是新的产品 SPEC，也不是外部 AI 的自动执行指令。

它记录一次已经完成的外部计划讨论，并把外部意见与本项目的本地事实源合并成一条可恢复的路线。后续恢复任务时，以 `RUN_STATE.json`、本文件和最近的 `DEVLOG.md` 为准，不从网页聊天重新猜状态。

本轮只做计划完善：没有改业务代码、没有安装依赖、没有读取或发送凭据、没有调用 DeepSeek、没有执行外部 AI 建议中的工程动作。

## 1. 外部评审来源与可信边界

- 渠道：用户已打开的 Firefox 网页 ChatGPT 页面。
- 讨论方式：两轮。
  1. **盲评**：只提供产品目标、场景、边界和失败问题，避免被现有实现锚定。
  2. **知情复核**：再提供当前本地实现、已验证能力、未完成项和约束，让外部 AI 对照当前事实修正第一轮意见。
- 结果性质：架构建议和风险提示，属于 `proposal`，不是本项目的测试证据，也不是代码审查通过结论。
- 安全边界：只发送了项目目标、架构、状态和约束；没有发送 API Key、Cookie、Token、私有文件内容或本机凭据。

## 2. 主控已核对的本地事实

以下事实来自当前工作区的 `AGENTS.md`、`RUN_STATE.json`、`SPEC/09-provider-portability-and-tool-contract.md`、`SPEC/IMPLEMENTATION-BACKLOG.md`、现有测试和 `DEVLOG.md`：

- 本地 v0.1 已有 SQLite-first control plane、Run 状态机、append-only RunEvent、审批、Artifact、ContextSnapshot 和恢复 segment。
- Fixture Product Builder 可以在无 Key 下演示；Fixture 不能当成真实模型效果。
- Codex CLI/订阅路径已经有只读执行桥和部分真实 receipt；Codex 在本项目中是 `ExecutionAgent`，不是公开 API 额度。
- DeepSeek 已有请求适配和能力探针，但真实 API 尚未用用户 Key 运行；当前 one-shot 探针不宣称 streaming 或 tool loop。
- `ModelRequestEnvelope`、`ProviderResponseEnvelope`、`ToolCallEnvelope`、`UsageSummary`、`PromptCacheReceipt` 等中立契约已冻结；`ContextPacket` 已进入 Codex/DeepSeek request builder。
- 当前尚未完成：统一 ProviderResponseEnvelope 的落盘映射、完整 model→tool→result→next segment 循环、真实 DeepSeek smoke、真实 prompt-cache 命中/成本证据、完整 Codex 原生 resume，以及多 Bot 质量/提效证明。
- 当前工作区有大量既有改动；本轮不回退、不覆盖、不整理无关改动。

## 3. 外部评审的共同结论

### 3.1 产品应先收窄

外部 AI 的两轮意见一致认为，v0.1 的价值应先定义为：

> 一个有可靠控制面、可恢复、可审计、可替换执行层的本地 AI Workflow Runtime。

“Local Agent Workspace with Reliable Workflow Runtime”可以作为更准确的 v0.1 描述候选，但目前只是描述建议，不自动改产品正式名称。

首版的最小用户闭环是：

```text
创建 Project
→ 输入想法
→ Product Builder Workflow
→ 生成 Artifact
→ 关键节点审批
→ 继续执行
→ 查看历史并从中断处恢复
```

### 3.2 保留、调整和后置

| 项目 | 主控决定 | 原因 |
|---|---|---|
| Project / Run / Event / Artifact / Approval | 保留 | 已经是本项目的事实源和可追溯骨架 |
| SQLite-first 持久化 | 保留 | 已有恢复、回放、幂等和隔离证据 |
| Single Product Builder + 固定 Workflow | 保留并作为默认 | 先证明流程可靠，再讨论角色数量 |
| Provider 抽象 | 保留并继续收紧 | Codex、DeepSeek、Fixture 的能力和计费语义不同 |
| ToolPolicy、审批和 receipt | 保留 | 是安全和诊断的基础 |
| ContextSnapshot / ContextPacket | 保留并做现实质量验证 | 仅有结构化恢复还不等于恢复后的答案质量不下降 |
| 完整 Tool Loop | **上调为下一工程单元** | 当前最明显的运行时缺口 |
| Usage / Cost 可观察性 | P1 | 多 Provider 对比时必须知道 usage 来源和未知项 |
| Prompt Cache | 先只留契约与 unknown | 没有真实 Provider 证据前不做缓存策略优化 |
| Multi-Agent / Sub-Agent | 后置 | 当前固定任务显示延迟显著上升，质量证据仍不足 |
| Skill Marketplace / Bot 自我创建 | 后置 | 会扩大权限、递归和治理范围 |
| Computer Use | 后置 | 不属于 v0.1 的硬验收能力 |
| 云端多用户、自动外发、自动发布 | 不做 | 与当前本地优先和审批边界冲突 |

## 4. 与本地计划的冲突及合并决定

### 冲突

本地 `RUN_STATE.json` 原先写的是：

> 先实现 ProviderResponseEnvelope 的统一 one-shot 回执映射，再设计工具调用循环。

外部评审给出的唯一下一工程单元是：

> 直接完成 fixture-first 的 Tool Loop 纵向切片。

### 合并后的决定

两者不是二选一。Tool Loop 需要先有可诊断的模型回执，因此新的工程单元定义为：

> **M3-07d：fixture-first Tool Loop vertical slice；先做最小 ProviderResponseEnvelope 回执映射/持久化，再串起 model → ToolCall → schema/幂等 → approval → ToolRuntime → tool result → next model segment。**

这里的“先做”只表示实现顺序，不表示现在已经开始实现。本轮只冻结计划。

### 这个单元的最小边界

必须覆盖：

1. `ProviderResponseEnvelope` 保存 provider、request id、raw response 引用、structured output、tool calls、usage、finish reason 和 error。
2. `ToolCallEnvelope` 至少保存 `callId`、`toolName`、`arguments`、`status`、`approvalRef`。
3. Tool result 至少保存 `callId`、`success`、`output`、`error`、`sideEffects`。
4. 工具执行前做 schema 校验、权限判断和逐次审批。
5. 以 `callId` 做幂等保护，设置最大循环次数，工具失败后留下可恢复状态。
6. 执行结果作为下一段模型输入，事件、receipt 和 Artifact 引用可回放。
7. 先用 Fixture 验证控制流；不把 Fixture 结果写成 DeepSeek 或 Codex 的真实能力。

## 5. 最终分阶段路线（本次冻结版）

### 阶段 A：当前阶段——Execution Loop

目标：完成一条可回放的 `Model → Tool → Result → Continue → Artifact` 纵向切片。

进入条件：现有 Run/Event、ToolPolicy、审批、receipt 和 ContextPacket 契约继续保持不变。

停止条件：Tool Loop 的状态迁移、幂等、审批拒绝、工具失败和中断恢复没有专项通过，就不扩展 Multi-Agent 或 Skill。

### 阶段 B：Provider 完整化

目标：让 Fixture、Codex 和 DeepSeek 的能力差异在统一回执中可见。

内容：ProviderResponseEnvelope 持久化、usage 来源、cost unknown/estimated/provider-reported、真实 DeepSeek smoke、能力探针与实现一致性。

前置条件：需要用户提供或配置 DeepSeek Key；Key 只用于本地运行，不写入 Git，不发送给外部 Chat。

### 阶段 C：Context Recovery 现实质量

目标：比较不中断、被压缩后恢复、被强制停止后恢复三种路径的输出质量和可追溯性。

内容：保留原始目标、事实、决定、Artifact、未决问题和下一步；摘要中不保存或伪造 chain-of-thought。

### 阶段 D：真实使用验证

目标：用至少 3 个非敏感真实任务判断是否稳定、可理解、值得再次使用。

工程通过不自动等于提效通过；真人耗时、修改量、返工、恢复体验和再次使用意愿仍是独立证据。

### 阶段 E：是否引入 Multi-Agent

只有在固定任务证据显示：质量提高至少 20%，或人工修改时间下降至少 30%，并且成本和延迟增幅不超过 50% 时，才考虑把 Sub-Agent 设为默认路径。否则保留结构化 Single Bot Workflow。

## 6. 暂时不做的事情

- 不因为外部 AI 提到“Agent OS”就批量改名或重构目录。
- 不为了证明多 Agent 而新增多个 Bot。
- 不把提示词缓存命中、订阅额度价格或模型质量写成未知之外的结论。
- 不在没有 Key 和真实 receipt 时宣称 DeepSeek 已接通或效果已比较。
- 不把外部评审文字当作测试、面试证据或产品成功证明。
- 不在本轮实现 Tool Loop；实现必须作为下一轮独立工程单元启动并验证。

## 7. 可能推翻路线的证据

- 如果真实中断后恢复并没有业务价值，产品可能应收窄为 Artifact/Project 管理器。
- 如果 Single Bot 在真实任务中已经足够，永不引入 Multi-Agent 也是有效结论。
- 如果 Multi-Agent 在固定阈值下稳定获益，再引入 Sub-Agent；不是先设计生态再找价值。
- 如果 Provider 抽象导致大量特殊分支，可能拆成 Model Provider 与 Execution Backend 两条接口。
- 如果 Tool Loop 风险高且收益低，回退为只读分析助手，而不是放宽权限。

## 8. 当前状态与下一步

- 当前状态：**计划已完成外部盲评、知情复核和主控合并；实现没有在本轮推进。**
- 当前阶段：`provider-portability-context-injection`，`RUN_STATE.status=running`。
- 当前唯一下一工程单元：**设计并冻结 M3-07d 的 fixture-first Tool Loop 纵向切片**，其中 ProviderResponseEnvelope 最小回执映射是前置子步骤。
- 当前明确卡点：真实 DeepSeek Key、真实 Provider usage/cache、Codex 原生 resume、Context Recovery 的业务质量，以及真人使用证据。
- 本轮停止条件已满足：计划冲突已解释，路线、边界、证据门和暂停项已落盘；下一轮才进入代码实现。

## 9. 继续工作时先读哪些文件

1. `RUN_STATE.json`
2. 本文件
3. `SPEC/09-provider-portability-and-tool-contract.md`
4. `SPEC/IMPLEMENTATION-BACKLOG.md`
5. `DEVLOG.md` 最近一条记录

恢复时先核对上述文件与 `git status`，不要从网页聊天恢复工程状态。
