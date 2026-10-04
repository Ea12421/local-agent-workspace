# 网页 Chat AI 知情复核包 v1

> 这是第二轮材料。使用顺序：先把 `EXTERNAL-CHAT-BLIND-DESIGN-PACK-V1.md` 发给网页 Chat AI，保存它的第一轮方案；然后把本文件连同第一轮方案一起发给它。本轮的目标不是让它重新顺着旧方案补充，而是让它把盲评方案和当前真实项目逐条比较。

## 给网页 Chat AI 的任务

你现在进入第二轮“知情复核”。你已经有一份自己先前写出的盲评方案，下面又给出了当前项目的事实摘要。请不要为了维护第一轮方案而强行解释；如果第一轮方案不适合当前项目，必须明确推翻或缩小它。

请输出：

1. 第一轮方案中应该保留的部分；
2. 第一轮方案中应该删除、降级或后置的部分；
3. 当前项目已经实现但第一轮方案没有考虑的部分；
4. 当前项目缺失但必须补的部分；
5. 最终的唯一实施路线。

## 复核规则

- 当前事实只以本消息提供的摘要为准；
- 不要声称你运行过项目；
- 不要把代码存在写成真实 Provider 已验证；
- 不要把 Fixture 写成真实模型质量；
- 不要把 Prompt Cache 类型写成缓存已生效；
- 不要把工具权限和 Tool Loop 混为一回事；
- 不要因为已有设计存在，就默认它是正确的；
- 不要因为第一轮方案没有提到某个能力，就忽略它。

---

# 当前项目事实摘要

项目是一个本地优先的 `Local Agent Workspace / Project Bot OS`。

核心目标：

- 按项目管理 Bot；
- Bot 有职责、输入输出 Schema、工具、权限、Provider、Memory、审批和停止条件；
- Product Builder 把产品想法推进为研究、产品定义、技术方案、评测和执行计划；
- 长任务中断、限额、上下文压缩后可以恢复；
- 工具调用可审计且不越权；
- Provider 可以替换；
- 成本、延迟、重试和失败可观察。

## 技术事实

- TypeScript；
- Node.js >= 22；
- React + Vite Web；
- Node 原生 HTTP Server；
- Electron 薄桌面壳；
- SQLite-first 运行时事实源；
- JSONL 只作为 demo/export/灾备；
- Codex CLI 是 Execution Agent；
- DeepSeek 是 Model Provider；
- Fixture 是无 Key 演示 Provider。

## 已验证能力

- Run 状态机；
- append-only RunEvent；
- SQLite 持久化、重启恢复、幂等和事件回放；
- Fixture Product Builder；
- Codex CLI 只读执行桥；
- 只读 filesystem/read；
- 只读 Git status；
- 只读 Git diff stat；
- 路径、绝对路径、symlink escape 和精确 argv 防护；
- Tool receipt；
- ContextSnapshot 和 segment/fallback recovery；
- Web/Electron 本地启动；
- 测试 46/46 通过。

## 已有但仍是 Partial 的能力

- DeepSeek adapter：只有 one-shot HTTP，没有真实 Key 验证；
- `ProviderResponseEnvelope`：Core 类型已定义，统一响应映射和持久化未完成；
- `PromptCachePolicy/Receipt`：类型已定义，真实 Provider cache 指标未接通；
- `UsageSummary`：类型已定义，真实 usage/cost 账本未完成；
- `ToolCallEnvelope`：类型已定义，模型响应到 ToolRuntime 的完整循环未完成；
- Codex resume：已有 fallback recovery，原生 resume 未接通；
- 多 Bot：有结构化流程和历史机械数据，但质量/效率优势未证明。

## 当前 Provider 事实

### Codex

- 通过公开 `codex exec --json`；
- 是执行 Agent，不是普通 API；
- 订阅登录状态可以探测；
- `billingSource` 必须保持 `unknown`；
- 支持 JSONL 事件和取消；
- 原生 resume 未接通；
- prompt cache 指标 unknown。

### DeepSeek

- `/chat/completions` one-shot；
- API key 尚未真实使用；
- 当前不是真 streaming；
- 当前不执行 tool call；
- 当前只按 `json_object` structured output；
- 保留 `reasoning_content`、`tool_calls`、`usage` 原始字段；
- cancellation/resume 未实现；
- prompt cache unknown。

### Fixture

- 无 Key；
- 确定性；
- `isMock=true`；
- 只用于演示和工程测试。

## 当前安全边界

默认权限：只读、工作区写入、完全访问。

始终逐次审批：外发、删除重要数据、敏感路径、生产配置、发布、支付、权限变更、凭据读取。

当前不做：任意 Shell、无人审批发布、自动发消息、云端多用户、无限 Bot 自我创建、读取 Cookie/Token、订阅伪装 API。

## 当前 Prompt Cache 事实

- Prompt Cache 被当作成本/延迟优化，不是状态恢复基础；
- 已有 `PromptCachePolicy` 和 `PromptCacheReceipt` 类型；
- 当前默认 cache policy 是 disabled；
- Provider 不报告命中时必须写 unknown；
- Codex CLI 当前没有稳定公开 cache 指标；
- 没有真实 cache hit/miss、cached tokens、成本下降证据；
- 需要考虑稳定前缀、tool schema、项目状态变化和失效。

## 当前 Tool Loop 事实

已经有权限、路径 guard、工具执行、超时、输出上限和 receipt。

尚未完成：

```text
model response
→ tool call parse
→ schema validation
→ permission
→ approval
→ ToolRuntime
→ receipt
→ tool result message
→ next model segment
```

尤其缺少 callId 幂等、参数校验、工具结果回传、最大循环深度、失败恢复和跨 Provider 映射。

## 当前 Context 事实

- ContextSnapshot 保存 durable facts、decisions、unknowns、approval refs、artifact/source refs、next action 和 tail events；
- 有 hash 和事件范围；
- 有 fallback recovery；
- `ContextPacket` 已进入 Codex prompt 和 DeepSeek messages 的 request builder；
- 这不证明真实 DeepSeek recovery，也不证明压缩后质量不下降；
- tokenizer 估算仍是粗略值。

---

# 请输出最终复核结果

## 1. 保留 / 推翻 / 后置表

把第一轮方案的每个关键结论放入以下三类：

- 保留；
- 推翻或重写；
- 后置。

每项说明理由和证据等级。

## 2. 当前项目缺口表

至少覆盖：

- ProviderResponseEnvelope；
- usage/cost；
- Prompt Cache；
- Tool Loop；
- Context Recovery；
- Codex/DeepSeek 边界；
- SQLite receipt；
- Approval；
- 单 Bot / 多 Bot。

## 3. 最小正确实现

请给出不追求炫技、但能真正运行的最小闭环。

## 4. 分阶段计划

每阶段写：目标、文件/模块、依赖、不做什么、测试、真实验证、停止条件和唯一下一步。

## 5. 最终唯一推荐

只给一条路线，并明确：

- 下一步马上做什么；
- 哪些设计不能现在做；
- 哪些必须等 DeepSeek Key；
- 哪些必须等真人使用；
- 什么证据才足以交付。

---

# 复核输出的边界

你的结果是外部架构意见，不是本地代码执行结果。主控 AI 会再次核验，并决定哪些内容写回项目 SPEC、backlog 和 RUN_STATE。

