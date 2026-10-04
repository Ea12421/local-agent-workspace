# 设计完整性审计（2026-09-30）

> **校准（2026-09-30）：** 本文的历史审计结论记录了审计生成时“完整 Tool Loop 未实现”的状态。随后已补上显式 `toolRuntimeMode=local` 的本地只读 Tool Loop bridge；它仍由 Fixture Provider 驱动，真实 DeepSeek/Codex Provider Tool Loop、写入、删除、任意 Shell 和模型质量验证仍未完成。当前证据见 `validation/m3-07d-local-tool-loop-2026-09-30.json`。

> **当前实现校准（2026-09-30）：** ProviderResponseEnvelope 的离线映射、Codex model receipt、Fixture-first Tool Loop 和显式 local read-only bridge 已有测试与回执；DeepSeek request contract 也已通过 fake-fetch 回归。下表中仍写“未完成”的内容，指真实 Provider 消费、真实质量或更宽权限边界，不指这些离线/控制面契约不存在。

## 结论

外部网页 AI 的建议对“工程顺序”基本正确：先完成可靠的 Single-Bot Workflow Runtime 和 Tool Loop，再用证据决定是否引入 Multi-Agent。

但它不能作为完整产品方案。用户原本想要的“把能力固化成 Skill/Workflow，由 Bot 长期拥有并重复运行，必要时再由 Agent 协调”的产品层，目前只有骨架和候选设计，还没有完整实现或真实效果证据。

当前项目应被准确描述为：

> 本地 Alpha 控制面已经可用；可靠运行时正在补齐；能力产品化层尚未完成。

## 1. 五种状态必须分开

- **已设计**：文档和类型说明了应该怎样工作。
- **已实现**：代码路径已经存在。
- **已验证**：测试、回放、Computer Use 或真实 receipt 证明代码确实按预期运行。
- **已证明有效**：真人或固定对照任务证明质量、效率或复用价值。
- **未知/未设计**：不能根据文档、Fixture 或厂商宣传推断。

“有类型”不等于“已接通”，“测试通过”不等于“模型效果好”。

## 2. 当前各层完成度

| 领域 | 设计 | 实现 | 验证 | 当前判断 |
|---|---|---|---|---|
| Project、Run、Event、Approval、Artifact | 已冻结 | 已实现 | SQLite、回放、幂等、并发和重启已有证据 | 本地控制面可靠 |
| ContextSnapshot / fallback recovery | 已冻结 | 已实现 | 合同级恢复和 segment 有证据 | 业务内容质量未证明 |
| 只读文件/Git、路径和审批 | 已冻结 | 已实现窄边界 | 安装版 Computer Use 已验证 | 只读能力可用，尚非通用执行器 |
| Fixture Product Builder | 已设计 | 已实现 | Fixture、Artifact、Approval、release state 已验证 | 只能证明控制流，不证明模型质量 |
| Codex ExecutionAgent | 边界已明确 | 只读执行桥已实现 | CLI、取消、receipt 有真实证据 | 原生 resume 和完整模型工具循环未完成 |
| DeepSeek ModelProvider | 边界已明确 | one-shot adapter 已写 | 未用真实 Key smoke | 不能说已经可替换 |
| ProviderResponseEnvelope | 已冻结 | Fixture/Codex/DeepSeek 离线映射与 model receipt 已实现 | 专项与全套测试 | 真实 Provider 消费仍未完成 |
| model→ToolCall→审批→工具→结果→下一模型段 | 已冻结 | Fixture 完整循环；local read-only bridge | 专项、HTTP/Web 回放 | 真实 Provider Tool Loop 仍未完成 |
| BotProfile / Skill / Workflow / Agent 分层 | 候选模型已写 | Bot/Skill 基础实体存在 | 还没有 Skill 生命周期证据 | 产品骨架有，能力平台未完成 |
| Skill 版本、测试、发布、回滚、自优化草稿 | 有方向性设计 | 未实现 | 未验证 | 后续主线 |
| Routine、定时/事件触发、后台任务 | 基本未冻结 | 未实现 | 未验证 | 尚未具备 Manus/Grok 式自动化 |
| Computer Use / Cloud Computer | 只保留 Adapter 方向 | 未作为完整后端 | 未作为产品能力验证 | 不应宣称达到 Manus/Muse |
| Usage、Cost、Prompt Cache | 契约和 unknown 规则 | usage 回执与稳定 prefix hash 已实现 | 离线/控制面测试 | 真实 cache/cost 仍只能报告 unknown |
| 多 Bot 质量/效率 | 有实验规则 | 有机械路径 | 质量资格为 0，延迟约为单 Bot 2.7–6.5 倍 | 不能默认开启 |
| 真人现实价值 | 有验证卡 | 未完成 | 没有本人基线和复用意愿 | 未知 |

## 3. 发现的具体设计问题

> 本节保留当时审计提出的问题作为设计历史。ProviderResponseEnvelope 和 Fixture/local read-only Tool Loop 的“是否存在”问题已在 2026-09-30 校准中解决；本节对应的当前剩余问题是**真实 Provider 消费、真实质量和更宽执行权限**，详见 `SPEC/PROGRESS.md` 与 `validation/`。

### 3.1 ProviderResponseEnvelope 的文档和类型还没有完全对齐

SPEC 和外部评审要求保留 `raw_response_ref`、`finish_reason`、`error` 等诊断字段，但当前 core 类型主要有 output、toolCalls、usage、promptCache 和 providerFields，统一的原始回执引用和结束/错误语义还没有完整落到可持久化契约。

这不是文字小问题：没有这些字段，后续无法稳定比较 Codex、DeepSeek 和 Fixture 的失败、截断、工具请求和原始响应。

### 3.2 ToolRuntime 已有，但 Agent Tool Loop 没有

当前 ToolRuntime 可以执行 Fixture、只读文件和固定 Git 摘要，并有路径 guard、幂等 receipt 和部分脱敏。

但当前还没有完整的：

```text
Provider Response
→ Provider 产生 ToolCall
→ schema 校验
→ 权限/审批
→ ToolRuntime
→ Tool Result Message
→ 下一次 Provider 请求
```

所以现在能证明“工具边界安全地执行”，不能证明“模型能可靠地调用工具并根据结果继续工作”。

### 3.3 用户想要的 Skill/Bot 产品形态还没有真正落地

`SPEC/PRODUCT-MODEL-CLARIFICATION-V1.md` 已经提出正确的分层：

```text
Project
  → Skill Version
    → Workflow
      → Agent / Tool / Approval / Artifact Node
  → Bot 绑定并运行 Skill
```

但当前文件明确写着这是候选模型，Skill Registry、版本锁定、发布、回滚、固定题集评测和自优化草稿都还没有实现。

### 3.4 还没有 Routine/后台触发这一层

Manus、Grok Bot 和 Meta Muse 的共同产品启发，不只是“有一个 Bot”，而是：

- Bot 有持续身份和职责；
- Skill 是可复用流程；
- Routine/Goal 可以在时间或事件触发；
- 执行过程有活动日志；
- 外发、发布、支付、删除等动作仍要审批；
- 失败、无数据、过期数据和重试都有明确策略。

本项目目前有 Bot、Skill ID、Run、Approval、Artifact 和事件时间线，但没有真正的 Routine、Goal、后台 runner、通知策略和可暂停的自动任务。

### 3.5 Multi-Agent 判定阈值存在两个版本

现有 `SPEC/04-product-builder-workflow.md` 使用“人工修改下降 20% 或质量提升一级，成本/延迟不超过 2 倍”。外部复核合并记录使用了“人工修改下降 30%，成本/延迟增幅不超过 50%”。

两套阈值不能同时作为正式标准，后续必须冻结一个版本，否则实验结果会被不同标准解释。

## 4. Manus / Cue / Muse / Grok Bot 对我们的真正启发

名称先拆开：

- **Cue** 是 Manus 2.0 旗下的个人 Agent 应用，不是 “CUE”；
- **Muse** 是 Meta 的个人 AI Agent，不是 Manus 的另一个名字；
- **Grok Bot** 是另一套持久 Bot、Skill、Routine 和云电脑产品。

### 可以借鉴的结构

1. **持久 Bot 身份**：名称、职责、长期偏好、工具和审批边界稳定存在。
2. **Skill 与 Bot 分离**：Skill 是可复用能力，Bot 是项目中的拥有者和执行入口。
3. **Routine/Goal**：稳定流程可以按时间或事件重新运行。
4. **可见执行过程**：用户能看到工具、审批、交接、产物和失败位置。
5. **草稿优先**：先研究、生成、准备和建议，再审批外发、购买、删除、发布或生产变更。
6. **执行后端分离**：本地文件、CLI、Computer Use、Cloud Computer 是不同边界，不应被一个“Agent”概念混在一起。

### 不能直接照搬的部分

- Manus Cue 的独立邮箱、电话、钱包和长期自治；
- 云电脑一直运行和跨服务登录；
- Meta Muse 的 Secure VM 和后台主动工作；
- Grok Bot 的共享云电脑、routine 后台执行和演示录制；
- 支付、外发、电话、发布等高风险动作。

这些能力需要更强的隔离、凭据管理、通知、计费、事故恢复和用户授权，不能因为竞品展示了就视为我们已经设计或实现。

## 5. 修正后的双轨路线

### 轨道 A：先补可靠运行时

唯一工程单元仍是 fixture-first Tool Loop：

```text
ProviderResponseEnvelope
→ ToolCall
→ schema / 幂等
→ Approval
→ ToolRuntime
→ Tool Result
→ next model segment
→ Artifact
```

### 轨道 B：现在冻结产品层契约，但暂不全部实现

为避免以后接入 Manus/Cue/Grok Bot 式能力时返工，先冻结以下契约：

- `SkillManifest`：版本、draft/tested/published/deprecated、输入输出 Schema、Workflow 图、工具、权限、Provider、Memory、失败/停止条件、固定题集和 changelog；每次 Run 锁定 Skill 版本。
- `Routine`：时间/事件触发、时区、启停、去重、lease、重试退避、最大次数、无数据/过期数据策略、审批边界、通知和错过运行策略。
- `ExecutionBackend`：fixture、Codex CLI、本地 Computer Use、Cloud Computer 的能力、隔离、凭据注入、session 和 receipt 边界。
- `Memory/Artifact`：事实来源、可读/可删记忆、版本化 Artifact、ContextSnapshot 不覆盖权威来源。
- `Activity/Audit`：工具调用、审批、失败、部分完成、恢复和外部动作全部可查。

冻结这些契约不等于现在就开放后台自动化或 Computer Use。

## 6. 最终判断

- 外部 AI 方案：**作为下一步工程顺序，基本正确；作为完整产品方案，不完整。**
- 当前底座：**控制面和 SQLite/恢复可靠性已有较强工程证据。**
- 当前 Agent 能力：**工具执行边界有窄范围证据，完整 Tool Loop 尚未证明。**
- 当前产品化能力：**Bot/Skill/Workflow 的概念骨架有，Routine、版本化 Skill、后台任务和执行后端体系还没有真正完成。**
- 当前真实效果：**没有足够证据证明比普通 ChatGPT→手工整理→Codex 更好，也没有证明达到 Manus、Muse 或 Grok Bot 的成熟度。**

因此，项目不能停在“方案看起来对了”，也不能直接扩展成完整 Agent OS。正确路径是：先补可靠运行闭环，同时冻结未来产品层契约，再用固定任务和真人使用证据决定哪些能力值得实现。
