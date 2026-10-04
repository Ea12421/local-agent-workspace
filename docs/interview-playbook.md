# Local Agent Workspace 面试与交付掌握包

这份文档只使用当前项目已经落盘的代码、测试和 validation 证据。它用于本人讲解和现场演示，不把 Fixture、模型自评或机械测试写成真实业务效果。

## 1. 一句话介绍

Local Agent Workspace 是一个本地优先的 Agent 工作台：它把项目、Bot、权限、工具调用、审批、运行事件、上下文恢复和产物放进同一条可追溯的控制链。首个内置流程是 Product Builder，用于把产品想法推进成研究、产品定义、架构建议、评测计划和执行计划。

## 2. 现场演示顺序

1. 打开 Web 或 macOS Electron 包，先指出“本地服务 / Fixture 演示”来源标识。
2. 展示项目、Bots、Run 时间线和 Artifact；说明业务状态由 `packages/core` 与 SQLite 控制，UI 不复制一套状态机。
3. 打开一个 Fixture Product Builder Run：先展示澄清项、Handoff、审批卡和草稿 Artifact。
4. 说明审批不是装饰：审批事件会追加到 append-only RunEvent，批准后才会释放最终 Artifact；刷新或重启后状态仍从 SQLite 回读。
5. 展示 Provider 诊断：Fixture 是 `isMock=true`；Codex 是只读 ExecutionAgent；DeepSeek 是 ModelProvider，真实 Key 未配置时必须显示未知/阻塞。
6. 如需展示工具边界，使用代码级固定测试说明 `filesystem.read` 的本地只读 Tool Loop；不要在现场打开 workspace_write、删除或任意 Shell。
7. 最后展示限制清单：真实 DeepSeek API、Codex native resume、clean-room 网络安装、DMG 签名和真人质量验证不宣称已完成。

## 3. 架构怎么讲

```text
Project
  └─ BotProfile / Skill / ToolPolicy
        └─ Run
             ├─ RunEvent（append-only）
             ├─ ApprovalRequest
             ├─ Handoff
             ├─ Provider receipt
             ├─ ContextSnapshot
             └─ Artifact / Source
```

控制面负责状态迁移、审批、幂等、恢复和审计；Provider 只负责把模型或执行 Agent 的输出归一化；ToolRuntime 只在授权范围内执行。任何 Provider、工具或审批动作都必须留下事件和可诊断 receipt。

## 4. 为什么不是“几个 Prompt 串起来”

如果只是几个 Prompt 串起来，模型换一次输出，系统就无法回答谁负责、读了什么、是否审批、失败后从哪里恢复。

这个项目把任务变成可检查的控制流：

```text
目标
→ 澄清未知项
→ 固定计划
→ 结构化 Handoff
→ Provider response
→ ToolCall schema/policy/approval
→ ToolRuntime
→ 下一模型段
→ Artifact
```

当前已经验证的是这条控制流的 Fixture 和本地只读工具边界；真实模型质量仍需单独验证。

## 5. 为什么先做 Single-Bot / 结构化 Workflow

多 Bot 只有在固定任务上减少人工修改，或质量提高且成本/延迟不超过阈值时才值得保留。现有机械证据显示 multi-Bot 延迟约为 single-Bot 的 2.7–6.5 倍，质量资格仍为 0，所以默认路径保持结构化单 Bot；多 Bot 保留为可比较的后续实验，不为展示而默认开启。

## 6. 权限和安全回答

中文权限分三档：

- **只读**：读取、分析、生成草稿。
- **工作区写入**：只能在当前项目目录内写入，并受白名单和审批限制。
- **完全访问**：首版不作为默认能力。

外发消息、重要删除或覆盖、敏感路径、生产配置、支付/发布和凭据读取始终逐次审批。当前 LocalToolRuntime 已有路径穿越、符号链接、大小上限、原子写和幂等回执；这不等于它已经是通用安全边界。

## 7. Provider 如何切换

不能只把 Provider 名称替换掉：

- **Fixture**：无 Key 的确定性演示，`isMock=true`。
- **Codex CLI**：公开 `codex exec --json` 的只读 ExecutionAgent，订阅认证可观察，但计费来源保持 `unknown`。
- **DeepSeek**：ModelProvider one-shot adapter，保留 `reasoning_content`、tool payload 和 snake_case usage；真实 HTTP、工具循环和 resume 仍需要真实 Key 与受限验证。

统一的 `ProviderResponseEnvelope`、`UsageSummary`、`PromptCacheReceipt` 和 `ContextPacket` 让上层契约稳定，但不抹平不同 Provider 的真实能力差异。

## 8. 长任务、压缩和提示词缓存

SQLite 是运行时事实源；ContextSnapshot 保存 durable facts、决策、未知项、下一步和受限事件尾部。中断后创建新 segment，恢复同一逻辑 Run，不依赖聊天窗口连续存在。

`stablePrefixSha256` 只对稳定 system messages、constraints、output schema 和工具定义做哈希，排除可变 objective。它只是本地比较键；只有 Provider 明确回报时，系统才记录 cache hit、write 或 cached token。当前 Codex/DeepSeek 的真实 cache/cost 仍为 unknown。

## 9. 当前可以承诺的程度

### 已构建并验证

- SQLite schema、事务、幂等、RunEvent 回放、重启恢复和跨进程边界。
- Product Builder Fixture 流程、Handoff、Approval、Artifact release 和 Web/Electron 回读。
- Codex 只读执行桥、取消、JSONL envelope 和环境能力探针。
- DeepSeek 离线回执归一化和 Provider-neutral envelope。
- Fixture Tool Loop，以及显式 `local + read_only + filesystem` 的真实本地只读 Tool Loop。
- 稳定前缀哈希、路径隔离、工具策略和审计脱敏。

### 不能承诺

- DeepSeek 真实 API 已接通或效果优于 Codex。
- Codex 原生 `resume` 已接通；当前本机 `.codex` 写权限是阻塞条件。
- clean-room GitHub clone 在当前网络下已完成；本机 DNS/依赖缓存不足。
- 未签名 DMG 可以在任意机器无警告安装。
- 多 Bot 已经比单 Bot 更快、更好或更省钱。
- 真人使用提效和再次使用意愿已经验证。

## 10. 证据索引

- Provider envelope：`validation/m3-03-deepseek-envelope-replay-2026-09-30.json`
- 本地只读 Tool Loop：`validation/m3-07d-local-tool-loop-2026-09-30.json`
- 稳定前缀哈希：`validation/m3-07f-stable-prefix-hash-2026-09-30.json`
- SQLite/M10 校准：`validation/m10-07-persistence-reconciliation-2026-09-30.json`
- 清洁环境阻塞：`validation/m8-01-clean-room-offline-attempt-2026-09-30.json`
- 完整交付报告：`docs/DELIVERY-REPORT-V0.1.md`
