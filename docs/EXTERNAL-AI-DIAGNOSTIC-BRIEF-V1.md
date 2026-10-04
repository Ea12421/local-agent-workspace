# Local Agent Workspace 项目状态与外部评审上下文包 v1

更新时间：2026-09-29（Asia/Shanghai）

用途：把当前项目的事实、已验证能力、未完成能力和下一阶段问题交给另一个 AI 做独立架构评审和规划。

这不是外部 AI 已经给出的诊断结论，也不是最终实施计划。它是一个经过主控整理的事实包，帮助外部 AI 在 fresh context 中审查当前方案；外部 AI 的返回结果仍然必须由主控重新核验。

## 0. 阅读规则

这份上下文包是项目当前状态的索引，不是让外部 AI 直接相信的结论。外部 AI 必须：

1. 先读取 `RUN_STATE.json`、本简报、`SPEC/09-provider-portability-and-tool-contract.md` 和相关源码；
2. 把“已验证事实”“代码存在但未真实验证”“设计提案”分开；
3. 不把 Fixture、模型自评、单次机器测试写成真实产品质量；
4. 不读取凭据、Cookie、Token 或 `.env` 中的 secret；
5. 不修改代码、不安装依赖、不发送消息、不发布，除非另行明确授权。

## 1. 项目身份

项目：`Local Agent Workspace / Project Bot OS`

目录：`/Users/m4air/Work Agent开发。`

一句话：

> 一个本地优先的 Agent 工作空间。用户按项目创建和管理 Bot；Bot 有职责、输入输出 Schema、工具、权限、Provider、Memory、审批规则和停止条件。系统把长任务变成可追踪的 Run、Event、Handoff、Approval 和 Artifact。

首个场景：Product Builder。用户给出一个产品想法，系统推进澄清、规划、研究、产品定义、技术方案、评测和执行计划。

真实问题：

```text
ChatGPT 长对话
→ 人工复制和整理
→ 自己判断方案
→ 再交给 Codex
→ 上下文、来源、决策和进度容易丢失
```

项目要解决的是任务推进、状态持久化、工具边界和决策可追溯性，不是再做一个普通聊天框。

## 2. 用户当前真正想解决的问题

用户不是底层 Provider 专家。用户希望：

- 把重复的 AI 能力固定成可复用 Workflow/Skill/Bot；
- 让 Agent 负责流程中的判断和执行节点；
- 长任务遇到限额、上下文压缩或中断后还能恢复；
- 控制成本，尤其是长上下文、重复提示词、重复工具调用和失败重试成本；
- 工具真的能调用，但不能越权读写、外发或发布；
- 未来可以更换 API，而不是把业务逻辑绑死在某一个 Provider；
- 先由外部 AI 做独立诊断和完整计划，再由主控 Agent 判断、落盘和实施。

用户可以提出“提示词缓存”“工具调用”“上下文压缩”等概念，但不负责判断它们如何落地。外部 AI 的任务是把概念转成可验证的工程设计。

## 3. 当前状态总览

### 3.1 上一阶段已交付

本地 Alpha v0.1 已可运行和继续开发：

- React + Vite Web UI；
- Node.js 本地 Server；
- Electron 薄桌面壳和 macOS arm64 DMG；
- SQLite-first 运行时持久化；
- Run 状态机和 append-only RunEvent；
- Fixture Product Builder 全流程；
- Project、Bot、Run、Handoff、Approval、Source、Artifact、Memory 核心契约；
- Codex CLI 订阅执行桥；
- 真实只读 filesystem/read；
- 真实只读 `git status --short`；
- 真实只读 `git diff --stat`；
- 路径、符号链接、命令白名单、常见凭据形态脱敏；
- Web 和 Electron 对 workspacePath、只读权限、允许/禁止动作可见；
- Artifact、Source、Approval、Run receipt 的本地回读。

### 3.2 当前执行状态

唯一机器事实源是根目录 `RUN_STATE.json`。当前阶段：

```text
phase = provider-portability-context-injection
status = running
progress = 5/6
```

当前唯一下一步：

> 实现 `ProviderResponseEnvelope` 的统一回执映射，先覆盖 DeepSeek one-shot 的 raw fields、usage 和 prompt cache unknown，再设计工具调用循环。

### 3.3 已验证结果

- Provider/Adapter 专项测试：14/14；
- 完整项目测试：46/46；
- workspace typecheck：通过；
- `RUN_STATE` 校验：通过；
- `git diff --check`：通过；
- SQLite 重启、回放、幂等、并发和 100k 事件规模：已有专项证据；
- Codex CLI 0.155.1 的只读执行桥已有真实调用证据；
- DeepSeek 真实 API 尚未调用；
- 多 Bot 质量和效率优势尚未被证明。

## 4. 技术栈和事实源

| 层 | 技术/位置 | 当前事实 |
|---|---|---|
| 语言 | TypeScript | 已使用，core/server/adapters/workflow 共用类型 |
| 运行时 | Node.js >= 22 | 已验证本机 Node 22 |
| 包管理 | pnpm workspace / npm fallback | 依赖曾受 Corepack/cache/registry 环境影响，代码和本地验证已继续推进 |
| Web | React 19 + Vite 6 | 本地 UI 已构建 |
| Server | Node 原生 HTTP | 本地 control plane |
| 运行时数据库 | SQLite，优先 better-sqlite3，兼容 `node:sqlite` | SQLite 是运行时唯一事实源 |
| Portable | JSONL | 只用于 demo/export/灾备，不与 SQLite 并列为运行事实源 |
| Desktop | Electron 34 + electron-builder | 薄壳，复用 Web UI |
| Model Provider | DeepSeek API | Adapter 已写，真实 Key/真实调用未完成 |
| Execution Agent | Codex CLI/SDK 公开路径 | CLI 订阅执行桥已接入；原生 resume 未接通 |
| Demo | FixtureAdapter | 无 Key，确定性演示，不代表真实模型效果 |

业务事实源不是 LangGraph、OpenAI Agents SDK、Pi、Hermes 或 OpenHands。它们未来只能作为可替换执行节点或 Adapter。

## 5. 当前核心对象和状态

核心对象：

```text
Project
BotProfile
Skill
ToolPolicy
Run
RunEvent
Handoff
ApprovalRequest
Source
Artifact
MemoryItem
ContextSnapshot
RunSegment
ProviderReceipt
```

Run 状态：

```text
queued → running → waiting_user → succeeded / failed / cancelled
```

事件 append-only。要求支持取消、重试、中断恢复、幂等重放、崩溃恢复、工具调用审计和审批审计。

## 6. Provider 的当前真实边界

### 6.1 CodexExternalAdapter

当前路径：

```text
codex exec --skip-git-repo-check --cd <workspace>
  --sandbox read-only --ephemeral --json
```

事实：

- 是本地执行 Agent，不是普通模型 API；
- 通过公开 CLI 路径探测；
- 不读取 Cookie、Token 或私有登录文件；
- `authMode=subscription` 只表示 CLI 登录状态检测到 ChatGPT 登录；
- `billingSource=unknown`，不能写成已确认的订阅额度证明；
- 支持 JSONL 事件流；
- 支持取消；
- Codex 原生 resume 尚未接通；
- 当前可执行范围受只读 sandbox 和项目 cwd 限制。

### 6.2 DeepSeekApiAdapter

当前是最小 one-shot HTTP：

```text
POST https://api.deepseek.com/chat/completions
```

事实：

- 需要 API key；
- 真实 Key 尚未使用；
- 当前没有完整的 Web/API Provider 入口；
- 当前一次请求、一次响应，不是真 streaming；
- 当前不执行模型返回的 tool call；
- 当前不支持 resume；
- 当前 structured output 只按 `json_object` 处理；
- `reasoning_content`、`tool_calls`、`usage` 原始字段会保留在 Provider event；
- 原始字段被保留不等于工具调用已经执行；
- 能力探针已纠偏为 `streaming=false`、`toolCalling=false`、`structuredOutputModes=['json_object']`、`promptCaching='unknown'`。

### 6.3 FixtureAdapter

- 无 Key；
- 确定性事件；
- 用于演示、恢复和 UI 验收；
- `isMock=true`；
- 不得用于证明真实模型质量、成本或速度。

## 7. 提示词缓存：当前设计、价值和缺口

### 7.1 为什么需要

长任务经常重复发送：

- 系统规则；
- Bot 职责；
- 工具定义；
- 项目固定背景；
- 之前的结构化摘要；
- 最近一段历史。

如果每次都把稳定前缀重新计费，长任务成本和延迟会增加。提示词缓存可能降低重复输入成本，但它是优化，不是恢复正确性的基础。

### 7.2 当前已经有

Core 已有：

- `PromptCachePolicy`；
- `PromptCacheReceipt`；
- `PromptCacheStatus`；
- `UsageSummary`；
- 稳定前缀 hash 字段的设计；
- Provider 没有公开指标时写 `unknown` 的规则。

当前 request builder 默认：

```text
cachePolicy.mode = disabled
```

Codex CLI 当前公开回执没有稳定 cache hit/miss 指标，因此只能写 `unknown`。

### 7.3 尚未完成

- 真正计算稳定前缀 hash 的统一实现；
- Provider-specific cache 参数映射；
- 命中、写入、cached input tokens 的真实解析；
- cache key 生命周期和失效规则；
- system prompt、tool schema、项目背景变化后的缓存失效；
- cache receipt 的 SQLite 持久化；
- 真实 Provider 成本账本；
- 不同 Provider tokenizer 差异下的成本估算；
- 缓存命中/未命中测试。

外部 AI 必须回答：哪些属于正确性必需，哪些只是成本优化；如果 Provider 不提供指标，系统如何安全降级。

## 8. 工具调用：当前设计、价值和缺口

### 8.1 当前已经有

- `ToolPolicy`；
- 三档权限：只读、工作区写入、完全访问；
- 强制逐次审批动作集合；
- filesystem 路径 guard；
- `..`、绝对路径、symlink escape 拒绝；
- 精确 argv 白名单；
- 只读文件读取；
- 只读 Git status 和 diff stat；
- 超时、输出上限、凭据形态脱敏和幂等 receipt 的基础实现；
- `tool.invoked`、`tool.completed`、`tool.failed` 事件。

### 8.2 当前没有

还没有完整的：

```text
模型响应
→ 解析 tool call
→ 校验工具 Schema
→ 校验 ToolPolicy
→ 创建 ApprovalRequest
→ ToolRuntime 执行
→ 保存工具 receipt
→ 把结果作为 tool message 回给模型
→ 继续下一模型 segment
```

还缺：

- provider-neutral tool call parser；
- callId 幂等；
- 工具参数 JSON Schema 校验；
- 并行工具调用策略；
- 最大工具循环深度；
- 每次调用的预算、超时和取消；
- 工具失败后的重试与补偿；
- 工具结果如何压缩进 ContextPacket；
- tool result message 的 Provider 映射；
- 审批拒绝后的模型恢复语义。

## 9. Context、压缩和限额恢复

### 当前已经有

- `ContextSnapshot`；
- durable facts、decisions、unknowns、pending approvals、artifacts、sources、next action；
- tail events；
- snapshot hash；
- Run segment；
- provider interruption 后的 fallback recovery；
- SQLite-first 持久化；
- JSONL portable/export/灾备；
- `RunRequest.context`；
- `ModelRequestEnvelope.context`；
- Codex prompt 和 DeepSeek messages 已接入 ContextPacket request builder。

### 关键限制

- ContextSnapshot 是本地状态压缩，不等于 Provider prompt cache；
- 当前没有真实 DeepSeek recovery 证据；
- Codex 原生 resume 仍未接通；
- Context 仍需要 Provider 适配器按自身消息格式注入；
- token estimate 是粗略估算，不能替代各 Provider tokenizer；
- 不能把上下文压缩后“还能继续运行”写成“质量不变”。

## 10. 长任务成本优化应诊断什么

外部 AI 至少要分别分析以下成本：

1. **输入 token 成本**：重复系统提示、工具 Schema、项目背景和历史。
2. **输出 token 成本**：模型输出过长、重复解释、无结构文本。
3. **工具成本**：重复读取文件、重复 Git 查询、失败后盲目重试。
4. **重试成本**：网络失败、限额、超时、结构化输出失败。
5. **上下文压缩成本**：摘要本身的调用次数和信息损失。
6. **多 Agent 成本**：多个 Agent 可能带来 2–6 倍延迟和输入重复。
7. **Provider 差异**：不同 API 的 token 计费、缓存、上下文窗口和工具价格不同。

候选优化方向：

- 稳定前缀和可验证 cache receipt；
- ContextSnapshot 分层：长期事实、任务摘要、最近 tail、当前工具结果；
- 结构化结果优先，减少自由文本；
- 只把相关 Source/Artifact 引用放回模型；
- 工具结果 hash + 幂等缓存，避免重复执行；
- 固定重试预算和最大 segment；
- 按任务类型路由模型，而不是所有节点使用最高价模型；
- 先单 Bot/结构化 Workflow，只有证据证明有价值才多 Bot；
- 记录真实 usage 和 provider-reported cache 状态。

这些都是候选方案，不代表项目已经实现。

## 11. API 替换兼容性

| 场景 | 可复用 | 必须重新实现 | 当前判断 |
|---|---|---|---|
| Fixture → Codex | control plane、Run、事件、权限 | CLI 探针、事件解析 | 已可用 |
| Codex → DeepSeek | Project、Run、SQLite、Context、权限 | message mapping、response mapping、usage、tool loop、错误、真实 API | 不能只改 Provider 名称 |
| DeepSeek → OpenAI-compatible API | HTTP 外壳、部分 envelope | 逐项验证 streaming/tools/schema/reasoning/usage/cache | 部分可复用 |
| API → 本地模型 | control plane 和 ToolPolicy | auth、tokenizer、上下文限制、工具/结构化行为 | 需要新 Adapter |

## 12. 当前已知限制和不要误判的地方

- 没有 DeepSeek Key 实跑，所以不能判断 DeepSeek 真实效果；
- Codex 订阅状态不等于公开 API 额度；
- prompt cache 类型存在不等于缓存已经生效；
- ToolRuntime 能执行只读工具不等于模型已经能自动调用工具；
- 完整测试通过不等于长任务成本下降；
- SQLite 持久化通过不等于多 Agent 质量更好；
- Fixture 跑通不等于真实模型可用；
- 多 Bot 过去的机械结果显示延迟常常是 single Bot 的数倍，不能默认开启；
- 当前没有云端多用户、自动发布、自动外发、无人审批或任意 Shell。

## 13. 外部 AI 必须产出的诊断结果

外部 AI 需要给出：

1. 当前架构是否适合长任务；
2. Prompt cache 应该放在哪一层；
3. 不能缓存时如何降级；
4. Tool call loop 的最小安全闭环；
5. Codex execution agent 和 DeepSeek model provider 是否应该继续共用一套接口；
6. ProviderResponseEnvelope、usage、cost、cache receipt 是否需要持久化；
7. 单 Bot、结构化 Workflow、多 Bot 的默认策略；
8. ContextSnapshot 与 prompt cache 的边界；
9. 哪些工作属于 P0，哪些可以后置；
10. 每个阶段的测试、验收、停止条件和回滚方式。

## 14. 项目事实源

- [RUN_STATE.json](../RUN_STATE.json)：机器可读唯一恢复状态；
- [SPEC/09-provider-portability-and-tool-contract.md](../SPEC/09-provider-portability-and-tool-contract.md)：Provider 可移植性和工具契约；
- [SPEC/MASTER-SPEC.md](../SPEC/MASTER-SPEC.md)：总体产品与工程说明书；
- [SPEC/IMPLEMENTATION-BACKLOG.md](../SPEC/IMPLEMENTATION-BACKLOG.md)：推进清单；
- [SPEC/PROGRESS.md](../SPEC/PROGRESS.md)：人类可读进度；
- [DEVLOG.md](../DEVLOG.md)：实现历史；
- [HANDOFF.md](../HANDOFF.md)：恢复摘要；
- [docs/DELIVERY-REPORT-V0.1.md](./DELIVERY-REPORT-V0.1.md)：上一阶段交付报告；
- [packages/core/src/types.ts](../packages/core/src/types.ts)：Core 契约；
- [packages/adapters/src/provider-adapters.ts](../packages/adapters/src/provider-adapters.ts)：Provider 实现；
- [packages/adapters/src/provider-request.ts](../packages/adapters/src/provider-request.ts)：统一请求构建；
- [packages/adapters/src/tool-runtime.ts](../packages/adapters/src/tool-runtime.ts)：工具执行边界；
- [apps/server/src/runtime.ts](../apps/server/src/runtime.ts)：Run、segment 和恢复；
- [packages/adapters/src/adapters.test.ts](../packages/adapters/src/adapters.test.ts)：适配器专项测试。
