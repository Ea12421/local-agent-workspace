# 外部 AI 独立架构评审与规划提示词 v1

下面整段可以直接复制给另一个 AI。建议把它放在项目根目录 `/Users/m4air/Work Agent开发。` 的新窗口中使用。

这不是让外部 AI 替主控直接实现，也不是让它编造一个新项目。它的角色是独立评审者：先核对事实，再指出风险、缺口和优先级，最后给出可执行计划。它不能覆盖 `RUN_STATE.json`、不能直接改代码，也不能把自己的建议写成已验证事实。

注意：本文件适合能读取项目目录的 Agent/开发环境。网页端 Chat AI 请使用 [`EXTERNAL-CHAT-ONE-SHOT-PACK-V1.md`](./EXTERNAL-CHAT-ONE-SHOT-PACK-V1.md)，因为网页 Chat 无法读取本地文件。

```text
你是一个负责 AI Agent 平台架构、Provider 适配、长任务成本控制和安全工具调用的独立架构评审者。

你的任务不是马上写代码，而是先对一个已有项目做 fresh-context 诊断，并产出一份可以交给主控 Agent 实施的分阶段工程计划。

项目目录：/Users/m4air/Work Agent开发。

请先读取这些文件和源码：

1. RUN_STATE.json
2. AGENTS.md
3. docs/EXTERNAL-AI-DIAGNOSTIC-BRIEF-V1.md
4. SPEC/09-provider-portability-and-tool-contract.md
5. SPEC/MASTER-SPEC.md
6. SPEC/IMPLEMENTATION-BACKLOG.md
7. SPEC/PROGRESS.md
8. DEVLOG.md
9. HANDOFF.md
10. packages/core/src/types.ts
11. packages/core/src/context.ts
12. packages/adapters/src/provider-adapters.ts
13. packages/adapters/src/provider-request.ts
14. packages/adapters/src/tool-runtime.ts
15. apps/server/src/runtime.ts
16. packages/adapters/src/adapters.test.ts

不要读取：

- 任何 API key、Token、Cookie、登录凭据或 .env secret；
- /Users/m4air/AI产品经理工作台 中的未提交改动；
- 与本次问题无关的大量历史输出。

项目背景：

这是一个本地优先的 Agent Workspace / Project Bot OS。它用 Project、BotProfile、Skill、ToolPolicy、Run、RunEvent、Handoff、ApprovalRequest、Source、Artifact、MemoryItem 和 ContextSnapshot 管理长任务。首个场景是 Product Builder，把产品想法推进成研究、产品定义、技术方案、评测和执行计划。

当前已有：

- SQLite-first control plane；
- Run 状态机和 append-only event；
- Fixture Product Builder；
- Codex CLI subscription execution bridge；
- DeepSeek one-shot adapter，但没有真实 Key 实跑；
- 只读 filesystem/Git ToolRuntime；
- ToolPolicy、路径/symlink guard、审批概念和 receipt；
- ContextSnapshot、segment、fallback recovery；
- ModelRequestEnvelope、ProviderResponseEnvelope、ToolCallEnvelope、UsageSummary、PromptCachePolicy/Receipt 类型；
- Codex/DeepSeek request builder 已显式消费 ContextPacket；
- 完整测试 46/46 通过。

当前没有完成：

- 真正的 model → tool call → approval → ToolRuntime → tool result → next model loop；
- ProviderResponseEnvelope 的统一响应映射和持久化；
- Provider-reported usage/cost/cache receipt；
- 真实 DeepSeek 调用；
- Codex 原生 resume；
- 长任务成本下降的真实证据；
- 多 Bot 质量和效率优势证据。

请严格区分三类结论：

A. verified：源码、测试、receipt 或真实运行直接证明；
B. partial/unverified：代码存在或有局部测试，但缺真实 Provider/用户证据；
C. proposal：你提出的新设计，不能写成当前事实。

你需要重点分析四个问题：

一、长任务成本优化

请分析：

- 稳定提示词前缀、prompt caching、cache hit/miss、cached input tokens 应如何设计；
- system prompt、Bot profile、tool schema、项目背景、ContextSnapshot、最近 tail 哪些适合缓存；
- 如何计算 cache key、何时失效、Provider 不提供缓存指标时如何降级；
- Codex CLI 没有公开稳定 cache 指标时，系统如何保持诚实；
- tokenizer 不同、上下文压缩、重试、工具结果重复和多 Agent 复制带来的真实成本；
- 应该记录哪些 usage/cost 字段，哪些是 provider 值、哪些是 estimate；
- 怎样建立低成本、可重放、可验证的长任务策略。

二、工具调用是否真正可用

请分析完整闭环：

model response
→ tool call parsing
→ JSON Schema validation
→ ToolPolicy
→ approval
→ ToolRuntime
→ tool receipt
→ tool result message
→ next model segment

请指出：

- 当前代码在哪一步已经存在；
- 哪一步只是类型或计划；
- 每一步应产生什么 RunEvent 和 receipt；
- 如何处理 callId 幂等、超时、取消、重试、失败、审批拒绝、最大循环深度和跨 segment 恢复；
- 如何防止路径穿越、symlink escape、任意 Shell、敏感路径和外发动作；
- 怎样用 Fixture 先证明闭环，再用 Codex/DeepSeek 做真实 Provider 验证。

三、Provider 可替换性

请比较：

- Codex subscription execution agent；
- DeepSeek model API；
- OpenAI-compatible API；
- 本地模型。

请明确：

- 哪些控制面可以复用；
- 哪些必须由 Adapter 重新实现；
- streaming、tool calling、structured output、reasoning_content、usage、cache、resume 的兼容风险；
- 是否应该保持现有 ProviderAdapter，还是增加 ModelProviderAdapter/ExecutionAgentAdapter 两层；
- 如何定义 capability probe，避免“声明支持”超过真实实现；
- API Key、订阅、CLI、local 的 authMode/billingSource 应如何区分；
- 什么条件满足后才能说“换 API 可运行”。

四、阶段顺序和停止条件

请基于当前项目而不是重新发明一个全新项目，给出：

- P0 必须先做的 3–5 个工程单元；
- 每个工程单元要改哪些文件或模块；
- 每个单元的输入、输出、依赖和风险；
- 每个单元的专项测试和真实验证；
- 哪些问题必须有 DeepSeek Key 才能验证；
- 哪些可以用 Fixture 或 fake Provider 先验证；
- 哪些工作应该后置，避免在细枝末节上浪费时间；
- 每个阶段的 PASS、PARTIAL、BLOCKED、NO-GO 标准；
- 发生模型限额、上下文压缩或执行中断时，如何从 RUN_STATE/HANDOFF/DEVLOG 恢复；
- 何时应该停止开发并交付一个可用版本。

请输出以下格式：

## 1. 一句话结论

说明当前底座是否适合继续做长任务 Agent Workspace，以及最大风险是什么。

## 2. 事实审计表

列：问题、当前证据、状态（verified/partial/unverified/proposal）、影响。

至少覆盖：Prompt Cache、Usage/Cost、Tool Loop、Context Recovery、Provider Swap、Codex、DeepSeek、SQLite、Approval。

## 3. 目标架构

用一张 ASCII 图说明：

Control Plane、Context/Compaction、Provider Router、Execution Agent、Tool Policy、Approval、ToolRuntime、Receipt、SQLite 之间的关系。

## 4. 契约建议

给出你认为必须冻结的 TypeScript 接口。对每个接口说明：

- 解决什么问题；
- 谁创建；
- 谁消费；
- 如何持久化；
- 如何兼容没有该能力的 Provider。

不要为了完整而发明几十个接口，只保留真正影响长期维护的契约。

## 5. 长任务成本方案

用“现在 / 目标 / 最小实现 / 后续优化”的表格说明：

- prompt cache；
- context compaction；
- usage/cost；
- retry；
- tool result reuse；
- model routing；
- single Bot vs multi Bot。

必须说明哪些指标当前无法得到，不能假装精确。

## 6. 工具调用最小闭环

给出一个最小但完整的事件序列和错误序列，包括：

- 成功调用；
- 需要审批；
- 越权拒绝；
- 超时；
- 重放；
- 中断恢复。

## 7. 分阶段实施清单

每个阶段使用以下格式：

- 阶段名称；
- 目标；
- 要改的文件/模块；
- 依赖；
- 不做什么；
- 专项测试；
- 真实验证；
- PASS/FAIL/暂停条件；
- 完成后唯一下一步。

建议至少覆盖：

1. ProviderResponseEnvelope + usage/cache receipt；
2. Fixture tool loop；
3. Codex tool loop 或明确说明 Codex 工具边界；
4. DeepSeek real API smoke；
5. 长任务成本观测；
6. 最终交付判断。

## 8. 风险和反对意见

主动指出：

- 哪些设计可能过度工程化；
- 哪些能力其实不应该现在做；
- Prompt cache 可能带来的失效和隐私风险；
- 多 Bot 可能变慢的原因；
- 工具调用最容易越权的地方；
- API-compatible 误判风险；
- 当前项目最可能再次卡住的位置。

## 9. 给主控 Agent 的最终建议

最后只给一条推荐推进路径，不给互相冲突的多个主线。推荐路径必须说明：

- 下一次只做哪个最小工程单元；
- 为什么现在做它；
- 如何验证；
- 什么结果会让你改变路线；
- 哪些结论仍然必须等待真实 DeepSeek Key 或用户使用证据。

注意：你这次只输出诊断和计划，不修改代码、不安装包、不运行真实 Provider、不读取密钥。计划写完后，交给主控 Agent 审核和落盘。
```

## 使用后的回收方式

外部 AI 返回计划后，不直接执行。主控 Agent 应先把它拆成三类：

1. 与当前事实一致的建议；
2. 需要通过源码/测试核验的建议；
3. 需要用户决定或真实 Key 才能验证的建议。

只有第一类和已经核验通过的第二类，才能进入 `SPEC/IMPLEMENTATION-BACKLOG.md`。第三类必须保留为 `pending_user` 或 `blocked_environment`，不能写成完成。
