# Local Agent Workspace：网页 Chat AI 一次性上下文与规划任务包 v1

> 用法：把本文件从“给网页 Chat AI 的任务说明”开始，整体复制到没有本地文件访问能力的网页 Chat AI 中。对方不能读取本机文件，也没有 Agent、Tool、Shell、Git 或 Computer Use 能力，所以本文件已经把必要背景直接写全。

---

# 给网页 Chat AI 的任务说明

你现在是一个独立的 AI Agent 平台架构评审者和规划师。你没有本地文件访问权限，没有 Agent 工具，没有 Shell、Git、浏览器和 Computer Use。你只能根据下面这份项目说明工作。

你的任务不是立即写代码，也不是简单复述背景，而是：

1. 判断当前项目的底层架构是否适合长任务 Agent；
2. 评审长任务成本优化，尤其是 prompt caching、usage、重试、上下文压缩和多 Agent 成本；
3. 评审模型真正调用工具的完整闭环；
4. 评审 Codex 订阅执行桥、DeepSeek API 和其他 API 是否可以替换；
5. 找出设计中被高估、被遗漏、顺序错误或容易失败的地方；
6. 输出一个可以交给主控 AI 实施的分阶段计划。

你不能把下面的“候选设计”写成已经完成的功能。你的输出必须明确区分：

- `VERIFIED`：有代码、测试、receipt 或真实运行证据；
- `PARTIAL`：有部分代码或局部测试，但还缺真实 Provider、完整闭环或用户证据；
- `PROPOSAL`：你提出的新设计；
- `BLOCKED`：需要 API Key、外部环境或用户动作才能验证。

你只输出诊断和计划，不修改任何代码，不要求读取本地文件，不要求安装依赖，不要求用户提供密钥。

---

# 一、项目基本信息

项目名称：`Local Agent Workspace / Project Bot OS`

项目位置：一个本地优先的 TypeScript monorepo。当前由主控 AI 在本地维护。

产品定位：

> 用户按项目创建和管理 Bot。每个 Bot 有职责、输入输出 Schema、工具、权限、Provider、Memory、审批规则和停止条件。系统把一个长任务拆成可追踪的 Run、RunEvent、Handoff、Approval 和 Artifact。

首个内置能力是 Product Builder：

```text
自然语言产品想法
→ 澄清未知项
→ 任务规划
→ Research
→ Product Definition
→ Architecture
→ Evaluation
→ 冲突检查
→ 用户确认
→ Artifact 与执行计划
```

它要解决的问题不是“再做一个聊天框”，而是：

```text
长对话
→ 人工复制整理
→ 自己判断方案
→ 再交给 Codex
→ 上下文、来源、决策和进度容易丢失
```

---

# 二、当前总体状态

上一阶段的 Local Agent Workspace v0.1 本地 Alpha 已经可以运行和继续开发。

当前正在推进的新阶段：

```text
provider-portability-context-injection
```

当前目标：

> 冻结 Provider 可移植性、工具调用、上下文恢复、usage/cost 和提示词缓存的底层契约，并让能力探针与真实实现一致。

当前唯一工程下一步：

> 统一 `ProviderResponseEnvelope`，先覆盖 DeepSeek one-shot 的原始字段、usage 和 prompt cache unknown，再设计完整工具调用循环。

已经通过的验证：

- Provider/Adapter 专项测试：14/14；
- 完整项目测试：46/46；
- TypeScript workspace typecheck：通过；
- RUN_STATE 校验：通过；
- git diff check：通过；
- SQLite 重启、幂等、事件回放、并发和规模专项已有证据；
- Codex CLI 0.155.1 只读执行桥已有真实调用证据。

尚未证明：

- DeepSeek 真实 API 调用；
- prompt cache 真实命中和成本下降；
- 完整模型工具调用闭环；
- Codex 原生 resume；
- 多 Bot 带来质量或效率优势；
- 长任务真实成本下降；
- 真人再次使用意愿。

---

# 三、技术栈和事实源

| 层 | 技术 | 状态 |
|---|---|---|
| 语言 | TypeScript | 已使用 |
| 运行时 | Node.js >= 22 | 已验证 |
| Web | React 19 + Vite 6 | 本地 UI 已构建 |
| Server | Node 原生 HTTP | 本地 control plane |
| 数据库 | SQLite，优先 better-sqlite3，兼容 node:sqlite | SQLite 是运行时唯一事实源 |
| Portable 存储 | JSONL | 只用于 demo/export/灾备 |
| Desktop | Electron 34 + electron-builder | 薄壳，复用同一 Web UI |
| Model Provider | DeepSeek API | Adapter 已写，真实调用未完成 |
| Execution Agent | Codex CLI/SDK 公开路径 | 只读订阅执行桥已接入 |
| Demo | FixtureAdapter | 无 Key 确定性演示 |

业务事实源是项目自己的 `packages/core`、Run 状态机、append-only RunEvent 和 SQLite。

LangGraph、OpenAI Agents SDK、Pi、Hermes、OpenHands 如果未来接入，只能作为可替换执行节点或 Adapter，不能成为 Project、Run、Approval、Artifact 的最终事实源。

---

# 四、核心对象和运行状态

核心对象：

```text
Project
BotProfile
Skill
ToolPolicy
Run
RunEvent
RunSegment
Handoff
ApprovalRequest
Source
Artifact
MemoryItem
ContextSnapshot
ProviderReceipt
```

Run 状态：

```text
queued
→ running
→ waiting_user
→ succeeded / failed / cancelled
```

所有 Provider、工具、审批和恢复动作都应该留下 RunEvent 和可诊断 receipt。

首版权限档位：

- 只读 `read_only`；
- 工作区写入 `workspace_write`；
- 完全访问 `full_access`。

以下动作始终逐次审批：

- 外发消息；
- 删除或覆盖重要数据；
- 访问项目外敏感路径；
- 修改生产配置；
- 支付、发布或改变权限；
- 读取凭据、Cookie、Token。

---

# 五、当前 Provider 真实能力

## 5.1 Codex subscription execution bridge

当前通过公开 CLI 路径调用：

```text
codex exec --skip-git-repo-check --cd <workspace>
  --sandbox read-only --ephemeral --json
```

它是 Execution Agent，不是普通模型 API。

已经有：

- CLI 版本探针；
- ChatGPT 登录状态探针；
- JSONL 事件解析；
- 只读 sandbox；
- 固定项目 cwd；
- 取消；
- Provider identity；
- `authMode=subscription` 的登录状态记录。

限制：

- `billingSource=unknown`，不能写成订阅额度证明；
- Codex 原生 resume 尚未接通；
- 没有稳定公开的 prompt cache 指标；
- 不能把它当成普通 `/chat/completions` API；
- CLI 工具行为和 Model Provider tool call 不是同一种接口。

## 5.2 DeepSeek API adapter

当前是最小 one-shot HTTP 请求：

```text
POST https://api.deepseek.com/chat/completions
```

已经有：

- API key 配置入口；
- model/base URL 配置；
- `json_object` structured output 请求；
- `reasoning_content` 原始字段保留；
- `tool_calls` 原始字段保留；
- `usage` 原始字段保留；
- ContextPacket message 注入；
- Provider identity。

当前没有：

- 真正 streaming；
- 通用 tool calling loop；
- JSON Schema 结构化输出；
- resume；
- 真实 API 运行证据；
- 完整 Web/API Provider 入口；
- 统一 ProviderResponseEnvelope 持久化。

当前能力探针明确报告：

```text
streaming = false
toolCalling = false
structuredOutputModes = [json_object]
promptCaching = unknown
cancellation = false
resume = false
reasoningContentPassthrough = true
```

## 5.3 FixtureAdapter

- 无 Key；
- 确定性输出；
- 用于 demo、回放、UI 和恢复测试；
- `isMock=true`；
- 不代表真实模型质量、速度或成本。

---

# 六、Prompt Cache 和长任务成本问题

用户真正关心的是：一个长任务运行很久时，如何减少重复输入和无效调用成本。

可能重复发送的内容：

- system prompt；
- Bot 职责；
- 工具 Schema；
- 项目固定背景；
- ContextSnapshot 摘要；
- 最近若干事件；
- 工具返回结果。

当前已经设计但还未真实接通：

- `PromptCachePolicy`；
- `PromptCacheReceipt`；
- `PromptCacheStatus`；
- `UsageSummary`；
- stable prefix hash 字段；
- Provider 没有指标时标记 `unknown`。

当前 request builder 默认：

```text
cachePolicy.mode = disabled
```

必须区分：

```text
ContextSnapshot = 本地状态压缩和恢复
Prompt Cache = Provider 对重复输入的成本/延迟优化
```

不能把上下文摘要当成缓存命中，也不能把稳定前缀 hash 当成缓存命中证明。

尚未完成：

- Provider-specific cache 参数；
- cache hit/miss/written 真实解析；
- cached input tokens；
- cache key 失效规则；
- usage/cost 统一持久化；
- 不同 tokenizer 的成本换算；
- cache 对 system prompt、tool schema、项目背景变化的失效处理；
- 长任务真实成本对照。

请重点判断：哪些是 P0 正确性能力，哪些只是 P1 成本优化，哪些应该后置。

---

# 七、工具调用问题

当前已经有：

- ToolPolicy；
- 权限档位；
- 强制审批动作；
- 路径越界拒绝；
- 绝对路径拒绝；
- symlink escape 拒绝；
- 精确 argv 白名单；
- 真实只读文件读取；
- 只读 Git status；
- 只读 Git diff stat；
- 超时和输出上限基础能力；
- 常见凭据形态脱敏；
- 幂等 Tool receipt；
- `tool.invoked`、`tool.completed`、`tool.failed` 事件。

但是完整模型工具调用闭环还没有完成。

目标闭环：

```text
模型响应
→ 解析 tool call
→ 校验工具名称和 JSON Schema
→ 检查 ToolPolicy
→ 必要时创建 ApprovalRequest
→ ToolRuntime 执行
→ 写 tool receipt
→ 把 tool result 作为下一条消息交回模型
→ 继续下一模型 segment
```

还需要设计：

- callId 幂等；
- 工具参数校验；
- 单次调用超时、取消、重试；
- 最大工具循环深度；
- 并行工具调用；
- 审批拒绝后的模型恢复；
- 工具结果压缩进 ContextPacket；
- 工具失败后的补偿策略；
- 跨 Provider tool message 格式映射。

DeepSeek 当前返回 `tool_calls` 时，只能保留字段，不能执行工具。

---

# 八、Context Recovery 和限额中断

已经有：

- ContextSnapshot；
- durable facts；
- decisions；
- unknowns；
- pending approvals；
- artifact/source refs；
- next action；
- 最近 tail events；
- snapshot hash；
- Run segment；
- provider interruption 后 fallback recovery；
- SQLite 持久化；
- `RunRequest.context`；
- `ModelRequestEnvelope.context`；
- Codex prompt 和 DeepSeek messages 的 ContextPacket 注入。

限制：

- 这证明状态能保存，不证明压缩后模型质量不下降；
- Codex 原生 resume 未接通；
- DeepSeek 真实 recovery 未验证；
- token estimate 是粗略估算，不能替代 Provider tokenizer；
- Prompt Cache 和 ContextSnapshot 不能混为一谈。

---

# 九、Provider 是否可替换

| 切换 | 可复用 | 仍需重新做 | 当前结论 |
|---|---|---|---|
| Fixture → Codex | Run、SQLite、权限、事件、UI | CLI 探针和 JSONL 解析 | 已可用 |
| Codex → DeepSeek | Control Plane、Run、Context、权限 | message mapping、response mapping、usage、tool loop、错误、API key | 不能只改名称 |
| DeepSeek → OpenAI-compatible API | HTTP 外壳、部分 envelope | streaming/tools/schema/reasoning/usage/cache 逐项探针 | 部分可复用 |
| API → 本地模型 | Control Plane、ToolPolicy | auth、tokenizer、context window、工具/结构化行为 | 需要新 Adapter |

“OpenAI-compatible”只代表请求外形接近，不代表工具、缓存、reasoning、计费或恢复行为一致。

---

# 十、项目边界和反目标

当前不做：

- 云端多用户；
- 团队权限；
- 全局后台监听；
- 默认全局桌面控制；
- 自动发消息；
- 自动发布；
- 自动安装未知依赖；
- 无人工确认的 Bot 自我扩张；
- 把 ChatGPT/Codex 订阅伪装成公开 API；
- 把模型自评当成产品效果证明；
- 任意 Shell；
- 无审批的敏感路径访问；
- 现在就做 Skill 自动自优化闭环。

旧项目 `/Users/m4air/AI产品经理工作台` 只作为只读参考，不修改、不接管未提交改动。

---

# 十一、请你输出的内容

请严格按以下顺序输出：

## 1. 一句话总判断

当前底座是否适合继续做长任务 Agent Workspace？最大的风险是什么？

## 2. 事实审计表

至少覆盖：

- Prompt Cache；
- Usage/Cost；
- Tool Loop；
- Context Recovery；
- Provider Swap；
- Codex；
- DeepSeek；
- SQLite；
- Approval。

每项写：当前事实、证据等级、风险、建议。

## 3. 长任务成本优化方案

分别判断：

- 什么必须先做；
- 什么只是优化；
- 什么应该后置；
- 需要记录什么指标；
- Provider 不提供 cache 指标时如何降级；
- 如何避免缓存导致旧工具 Schema、旧项目状态或旧权限继续生效。

## 4. 工具调用最小闭环

给出成功、审批、越权、超时、重试、取消、中断恢复七种事件序列，并说明每步的事件和 receipt。

## 5. Provider 可替换设计

说明 Codex、DeepSeek、OpenAI-compatible API、本地模型哪些可以共用，哪些必须 Adapter-specific。

## 6. 分阶段实施计划

每阶段必须写：

- 目标；
- 修改范围；
- 输入和输出；
- 不做什么；
- 测试；
- 真实验证；
- PASS/PARTIAL/BLOCKED/NO-GO 条件；
- 唯一下一步。

至少覆盖：

1. ProviderResponseEnvelope + usage/cache receipt；
2. Fixture tool loop；
3. Codex tool boundary；
4. DeepSeek real API smoke；
5. 长任务成本观测；
6. 最终交付判断。

## 7. 反对意见

请主动指出：

- 哪些设计过度工程化；
- 哪些设计会导致长任务更慢更贵；
- 哪些地方容易越权；
- 哪些地方不能因为 API-compatible 就直接复用；
- 当前最可能再次卡住的位置。

## 8. 给主控 AI 的唯一推荐路径

最后只能推荐一条主线，明确：

- 下一步只做什么；
- 为什么现在做；
- 怎么验证；
- 什么证据会让你改变路线；
- 哪些结论必须等待真实 DeepSeek Key 或真人使用。

不要写代码，不要要求本地文件，不要要求密钥，不要把候选计划写成已完成事实。

---

# 十二、发回主控 AI 时的要求

网页 Chat AI 输出计划后，主控 AI 会重新核验。请不要声称你已经运行了本项目，也不要声称你看到了项目源码。你的输出只代表基于本消息的独立架构意见。

