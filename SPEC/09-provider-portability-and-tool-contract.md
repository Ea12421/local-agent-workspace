# Provider Portability and Tool Contract

状态：`contract-frozen / implementation-partial`

本文件回答一个具体问题：当前通过 Codex 订阅执行桥运行的工作流，换成 DeepSeek 或其他 API 后，是否可以只改一个 Provider 名称继续运行。

结论是：**不能只改名称。** 业务控制面、项目状态、审批、事件和权限可以复用；模型消息、结构化输出、工具调用、上下文恢复、用量和提示词缓存必须经过统一契约，再由每个 Adapter 做映射。

## 1. 目标与边界

### 本阶段目标

1. 固定 Provider 与控制面的边界。
2. 固定模型消息、工具调用、上下文注入、用量和提示词缓存的中立数据结构。
3. 让能力探针只报告已经实现并能验证的能力。
4. 让后续新增 API Provider 时，不修改 `packages/core` 的 Run 状态机和 SQLite 事实源。

### 本阶段不做

- 不把 Codex 订阅伪装成公开 API 额度。
- 不在没有 Key 的情况下宣称 DeepSeek 真实调用通过。
- 不在本阶段实现完整的模型→工具→审批→执行→结果循环。
- 不把提示词缓存当成正确性、恢复能力或质量的前置条件。
- 不承诺所有 OpenAI-compatible API 具有相同的 tool calling、reasoning 或 JSON Schema 行为。

## 2. 三种运行边界

| 边界 | 当前实现 | 账单/认证 | 可以复用的部分 |
|---|---|---|---|
| `ExecutionAgentAdapter` | `CodexExternalAdapter` 调用公开 `codex exec --json` | 本地 CLI/订阅状态；`billingSource` 保持 `unknown` | Run、事件、取消、权限、项目 cwd |
| `ModelProviderAdapter` | `DeepSeekApiAdapter` 最小 one-shot HTTP | API key/API 额度 | Run、事件、结构化输出收据、权限 |
| `ToolRuntime/SandboxAdapter` | Fixture + 只读 filesystem/Git 摘要 | 本地权限 | 工具策略、路径 guard、receipt、审批 |

Codex 是执行 Agent；DeepSeek 是模型 API。两者都可以产生 Provider 事件，但不是同一种能力，也不能共享认证或用量语义。

## 3. Provider-neutral envelope

`packages/core/src/types.ts` 固定以下类型：

- `ModelRequestEnvelope`：一次模型请求的稳定输入，包括消息、目标、输入引用、输出 Schema、工具定义、ContextPacket 和缓存策略。
- `ProviderResponseEnvelope`：一次模型响应的稳定输出，包括文本/结构化结果、工具调用、用量、缓存回执和未解释的 provider 字段。
- `ToolDefinition`：工具名称、说明、输入 Schema 和最低权限档位。
- `ToolCallEnvelope`：`callId`、名称、参数、审批关联、执行状态和结果引用。
- `UsageSummary`：Provider 报告值、估算值和未知值必须区分。
- `PromptCachePolicy` / `PromptCacheReceipt`：缓存是可选优化，命中与否必须由 Provider 回报或明确标成 `unknown`。

这些类型当前是**契约层**。现有 `ProviderAdapter` 仍保持兼容；在 Adapter 真正消费 envelope 之前，不得把“有类型”写成“功能已接通”。

## 4. 工具调用生命周期

目标顺序固定为：

```text
model response
  → ToolCallEnvelope(requested)
  → permission check
  → ApprovalRequest（若动作属于始终审批集合）
  → ToolRuntime execute
  → tool receipt
  → tool result message
  → next model segment
```

控制面负责状态、权限、审批、幂等和事件；Provider 只负责把模型输出映射为响应；ToolRuntime 只负责在授权范围内执行。任何一段失败都要写 `RunEvent` 与可诊断 receipt，不能只在 UI 显示一条错误。

## 5. ContextPacket 注入

`ContextSnapshot` 是本地压缩与恢复事实源，不是 Provider 的 prompt cache。恢复时必须把以下内容显式放入 `ModelRequestEnvelope.context`：

- snapshot 的 durable facts、decisions、unknowns 和 next action；
- 受限数量的 tail events；
- continuation instruction；
- snapshot hash 和覆盖的事件范围。

当前代码已把经过 hash 校验的 ContextPacket 显式放进 `ModelRequestEnvelope.context`，Codex prompt 与 DeepSeek messages 都从同一 request builder 消费它；真实 Provider recovery 和业务层恢复质量仍未验证。

## 6. 提示词缓存设计

提示词缓存只优化延迟和成本，不承担一致性。设计规则：

1. 控制面按稳定前缀计算 hash，但不把完整提示词或敏感内容写入缓存回执。
2. Adapter 只有在 Provider 明确返回命中、写入或缓存 token 时，才能写 `hit`、`written` 或 `cachedInputTokens`。
3. Provider 不公开缓存指标时写 `unknown`；不能把稳定前缀 hash 当成命中证明。
4. `required` 只允许在 Provider 能确认缓存行为时使用；否则请求应失败并留下诊断事件。
5. Codex CLI 当前公开 JSONL 回执没有稳定的 prompt-cache 指标，因此其缓存状态保持 `unknown`。

当前 request builder 已对 `opportunistic` 和 `required` 请求计算 `cachePolicy.stablePrefixSha256`。输入只包含稳定的 system messages、constraints、output schema 和 tool definitions，排除可变 objective；这是本地比较键，不代表 Provider 已写入或命中缓存，Provider 未报告时 receipt 仍为 `unknown`。

## 7. API 切换兼容矩阵

| 切换 | 控制面 | Adapter | 额外工作 | 当前结论 |
|---|---|---|---|---|
| Fixture → Codex | 复用 | `CodexExternalAdapter` | CLI 探针、权限、输出解析 | 已可用 |
| Codex → DeepSeek | 复用 | 不能只替换名称 | 消息映射、结构化输出、tool loop、Key、错误/超时、真实 receipt | 当前不可直接切换 |
| DeepSeek → OpenAI-compatible API | 大部分复用 | 可复用 HTTP 外壳 | 重新探针；逐项核对 stream、tools、JSON Schema、reasoning、usage、cache | 只能部分复用 |
| 任意 API → 本地模型 | 复用 | 新 Adapter | auth、tokenizer、上下文限制、工具/结构化行为 | 需要单独实现 |

“OpenAI-compatible”只描述请求外形，不证明响应语义、工具调用或计费一致。

## 8. 迁移顺序与验收

### 8.1 M3-07d Fixture-first 纵切片（已实现控制面）

当前纵切片的最小事件顺序是：

```text
run.created
→ run.started
→ provider.event (model.response + ProviderResponseEnvelope)
→ tool.invoked
→ tool.completed / tool.failed
→ provider.event (next model segment)
→ artifact.created
→ run.succeeded
```

额外边界：

- ToolCall 先按 `ToolDefinition.inputSchema` 校验；schema 错误不会进入 ToolRuntime，也不会生成正式 Artifact。
- `callId` 是一次工具调用的幂等键；恢复或重复响应只能回放已有结果，不能再次产生 `tool.invoked`。
- `approvalRequiredActions` 命中的调用先写 `approval.requested` 并让 Run 进入 `waiting_user`；拒绝会写 `approval.resolved` 和 `tool.failed`，不执行工具。
- 每个模型响应保留 `rawResponseRef=sha256:<digest>`，usage 缺失时为 `source=unknown`，缓存没有 Provider 明确回执时为 `status=unknown`。
- `tool-loop-fixture` 是无 Key 演示和控制面测试入口，不能用于证明真实模型质量或真实成本。

### 已完成本增量

- 中立 envelope 类型已落在 core，且不改变现有 Run 状态机。
- DeepSeek 探针将修正为：非 streaming、非 tool calling、`json_object` 结构化输出；reasoning 字段仍保留；取消与恢复仍不支持。
- 新增专项测试，防止“声明支持”再次超过实现。
- `RunRequest.context` 与 `provider-request.ts` 已让 Codex prompt、DeepSeek messages 显式消费经过校验的 `ContextPacket`；这证明注入路径存在，但还没有真实 DeepSeek recovery 证据。
- `ProviderResponseEnvelope` 已补 raw response hash、usage、prompt cache unknown、finish/error 字段；Fixture-first 控制面已完成一条可回放的 model→tool→approval→result→next model→artifact 纵切片。该切片证明控制面契约和失败边界，不证明真实 Provider 的工具能力。
- Codex JSONL segment collector 已把 `item.completed` agent message、`turn.completed` 的 snake_case usage 和 bridge failure 归一化为 envelope；运行时追加 `model.response` 事件，并在非测试 SQLite 保存独立 model receipt。临时数据库重开回读和历史真实 Codex JSONL 离线回放通过；一次新的真实 smoke 因受限环境无法写入 Codex 自身 state DB 失败，不能写成当前真实调用通过。

### 后续增量

1. **M3-07a**：为 Codex 和 DeepSeek 各自建立 request builder，把 `ContextPacket` 显式注入消息（代码已完成，真实 Provider recovery 待验收）。
2. **M3-07b**：统一 ProviderResponseEnvelope、usage/cache receipt 和 raw-field 保留（Fixture 映射已完成，真实 Provider 消费待验收）。
3. **M3-07c**：完成 Fixture-first 工具调用循环；每次调用经过 schema、ToolPolicy、审批和 ToolRuntime，并具备 callId 幂等、循环上限和恢复回放（已完成控制面纵切片，Web/真实 Provider 接入待验收）。
4. **M3-07d**：response/model receipt 的非测试 SQLite 写入和回读、Codex envelope 消费、按 approvalId 的精确审批恢复、重启后 Fixture Tool Loop resume 和 Web 继续执行已完成控制面部分；真实 Provider Tool Loop、DeepSeek 真实 HTTP、真实 cache/cost 和业务质量仍待外部条件/后续验收。

### 8.5 M3-06 workspace_write 最小纵向单元（已完成底层契约）

`LocalToolRuntime` 已支持一个有界的 workspace_write 文件操作，但 Product Builder 默认仍是只读。当前约束固定为：

- 只能使用当前项目目录内的相对路径；绝对路径、路径穿越和符号链接逃逸直接失败；
- 单次 UTF-8 写入最多 256 KB；同目录临时文件写入、`fsync` 后原子 `rename`；
- 新文件遵守 `workspace_write` policy；覆盖已有文件无论策略如何配置，都必须有逐次 `approvalGranted=true`；
- `requestId` 是幂等键，重复请求不会再次写入；
- `tool.invoked` 和 receipt 只保留正文 hash/字节数，不把正文写入 SQLite/RunEvent；
- 删除、项目外路径、任意 Shell、`full_access` 和真实 Provider Tool Loop 不在本增量中。

这证明了本地执行边界，不证明模型会正确选择写入动作，也不代表 Web 已默认开放写权限。
5. **M3-07e**：只有在至少两个真实 Provider 都通过同一固定任务的结构/错误/恢复门后，才把 API 切换标成可交付。

### 本阶段通过条件

- typecheck 通过；
- Adapter 专项测试通过；
- `ProviderCapabilities` 与真实代码一致；
- SPEC、RUN_STATE、DEVLOG 和 HANDOFF 指向同一唯一下一步；
- 不能使用“API 可直接替换”“已支持缓存”“已支持工具调用”等未经验证的描述。
