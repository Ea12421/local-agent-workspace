# Agent 角色矩阵与质量门设计 v1

日期：2026-09-30  
状态：`planning / contract-candidate`  
适用范围：Local Agent Workspace v0.1，以及后续 Product Builder、Skill、Routine 的演进

## 0. 先说结论

项目可以按完整产品生命周期拆出 Agent 角色，但不应让每个角色都拥有写代码、改权限或发布的能力。

正确的分工是：

```text
Agent：负责理解、规划、审查、解释和提出修正
确定性检查器：负责测试、扫描、构建、回放、哈希和门禁判断
审批人：负责高影响动作和最终交付判断
控制面：负责状态、事件、权限、幂等、回放和证据关联
```

角色数量不是目标。每个角色必须有清晰的输入、输出、允许动作和停止条件；如果两个角色的输出相同，就合并，而不是为了“看起来像完整团队”继续拆分。

## 1. 总体生命周期

```text
范围冻结
  → 架构与契约设计
  → 实现
  → 确定性测试
  → Agent 质量审查
  → 安全与权限门
  → 恢复与运维门
  → 构建与安装复现门
  → 证据审计
  → 人工交付批准
  → 现实使用反馈
```

每个阶段都写入 `RunEvent` 或对应的审计记录。Agent 的文字结论不能替代测试结果、receipt、构建产物或人工批准。

## 2. 角色分层

### 2.1 角色总表

| 角色 | 主要职责 | 默认类型 | 能否写业务代码 | 能否直接放行 |
|---|---|---|---:|---:|
| Scope / Product Steward | 维护目标、范围、反目标、验收标准和冲突记录 | Agent | 否 | 否 |
| Architecture / Contract Reviewer | 审查领域边界、Provider、Tool、Context、数据契约 | Agent | 否；可提补丁建议 | 否 |
| Runtime Implementer | 实现已批准的单一工程切片 | 受控执行 Agent | 仅限批准写集 | 否 |
| Test Strategist | 设计测试矩阵、固定任务和风险优先级 | Agent | 否 | 否 |
| Deterministic Test Runner | 执行单测、类型检查、集成测试、回放和 schema 校验 | 确定性检查器 | 否 | 只能按硬规则报告 |
| QA / Integration Reviewer | 阅读测试和运行证据，判断跨模块行为是否连贯 | Agent | 否 | 否 |
| Provider Compatibility Reviewer | 比较 Fixture、Codex、DeepSeek 的实际能力与声明 | Agent + 探针 | 否 | 否 |
| Security / Privacy Reviewer | 威胁建模、权限边界、敏感信息和外发风险审查 | Agent + 扫描器 | 否 | 高风险问题可阻断 |
| Persistence / Recovery Reviewer | 审查 SQLite、事件、幂等、崩溃恢复、备份和重放 | Agent + 确定性测试 | 否 | 否 |
| SRE / Operations Reviewer | 审查启动、健康检查、诊断、停止、重试和运行手册 | Agent + 检查器 | 否 | 否 |
| Release / Reproducibility Reviewer | 审查 clean-room 安装、构建、打包、版本和产物指纹 | Agent + 构建器 | 否 | 否 |
| Evidence / Claims Auditor | 把每个对外结论映射到代码、测试、receipt 或真人记录 | Agent + 清单校验器 | 否 | 否 |
| Human Release Approver | 审批外发、发布、生产配置、敏感权限和最终交付 | 用户审批门 | 否 | 是 |

“默认类型”表示实现方式，不代表每个角色都应永久运行。短期内可以由一个主控 Agent 调度多个只读角色；长期才考虑把稳定角色固化成可版本化 Skill。

### 2.2 角色边界原则

1. 生产 Agent 不得自己给自己的实现签发最终质量结论。
2. 测试通过不等于产品有效；真人使用和固定任务对照由 Evidence Auditor 单独检查。
3. Security / Privacy 角色有权阻断，但无权自行放宽权限或删除审计记录。
4. Release 角色只产生候选交付包；外发、发布、安装到生产环境仍需要 Human Release Approver。
5. 任何 Agent 都不能读取凭据、Cookie 或 Token 文件；需要凭据时只接收脱敏的 Provider 状态或用户显式配置的运行时引用。
6. 角色之间使用结构化交接，不能用自由闲聊作为事实来源。

## 3. 各角色的输入、输出、停止条件和证据

### 3.1 Scope / Product Steward

**输入**

- 当前 `RUN_STATE.json`、`SPEC`、用户目标和已确认的反目标；
- 现有实现状态、未解决问题和上一阶段证据。

**输出**

- 本次变更的目标、范围、非目标；
- 完成定义、唯一下一步、风险和待确认问题；
- 需求冲突记录以及采用哪条规则的理由。

**停止条件**

- 用户目标、完成定义或权限边界互相冲突且不能从已有事实裁决；
- 变更同时扩大到新的产品层（例如从 Tool Loop 扩展到 Routine）但没有重新冻结范围；
- 发现计划把 Fixture、模型自评或宣传材料当成真实效果。

**验收证据**

- `RUN_STATE.next_action` 唯一且与 backlog、SPEC、HANDOFF 一致；
- 反目标仍生效；
- 每个后续角色都有明确输入和输出，不存在“负责所有事情”的空泛角色。

### 3.2 Architecture / Contract Reviewer

**输入**

- Scope Steward 的范围卡；
- `packages/core` 类型、状态机、Provider/Tool/Context SPEC；
- 当前实现和依赖方向。

**输出**

- 数据流图、模块边界、状态迁移和接口差异；
- 每个能力的 `designed / implemented / verified / proven-effective / unknown` 状态；
- 需要补充的契约字段、兼容矩阵和 ADR 建议。

**停止条件**

- Provider 能力只由名称推断，未经过探针或真实回执；
- 业务状态被第三方 Agent 框架夺走；
- 发现一个接口同时承担控制面、模型适配、工具执行和 UI 逻辑，无法审计。

**验收证据**

- 契约类型、SPEC 和真实 adapter 字段一致；
- 不存在“声明支持但实现未接通”的能力；
- 变更不破坏 `packages/core` 为事实源的规则。

### 3.3 Runtime Implementer

**输入**

- 已批准的单一 backlog 条目；
- 输入输出 Schema、允许写入路径、工具和审批边界；
- QA 与 Security 的前置约束。

**输出**

- 代码变更、迁移说明（如有）、测试和诊断 receipt；
- 未完成项、已知限制和回滚方式。

**停止条件**

- 需要扩大写入路径、读取凭据、修改生产配置或改变审批集合；
- 需要同时改动互相独立的产品阶段；
- 测试失败且原因不属于当前切片，禁止顺手重构无关模块。

**验收证据**

- diff 范围与写集一致；
- 相关 typecheck/test/build 通过；
- 关键行为有 RunEvent、receipt 和可回放输入；
- 不把测试用 Fixture 标记成真实 Provider 效果。

### 3.4 Test Strategist

**输入**

- 变更范围和风险；
- Domain、Provider、ToolPolicy、Persistence 和 UI 契约；
- 现有缺陷和历史失败指纹。

**输出**

- 测试矩阵：正常、拒绝、失败、超时、取消、重复、恢复、越权、跨项目；
- 固定输入和可比较的输出 Schema；
- 每条测试的严重级别、预期事件、receipt 和停止条件。

**停止条件**

- 只能测试“接口返回 200”，无法验证状态、事件或产物；
- 测试使用不可重复的随机输入却没有固定种子或快照；
- 质量断言依赖模型自评而没有外部 rubric。

**验收证据**

- 测试矩阵覆盖本次变更的风险；
- 每条关键测试都有明确 PASS/FAIL，不允许静默跳过；
- 失败能定位到 Run、segment、tool call 或 receipt。

### 3.5 Deterministic Test Runner

**输入**

- Test Strategist 冻结的测试命令、fixture、schema 和阈值。

**输出**

- 机器可读结果、退出码、日志、事件回放、覆盖的 commit/版本指纹。

**停止条件**

- 环境缺失、测试跳过或依赖未安装；
- 结果与旧缓存混用；
- 测试命令产生越权写入或外发行为。

**验收证据**

- clean run 结果可复现；
- 结果引用准确的源码、配置和输入 hash；
- 无 `PASS` 但实际未执行的伪通过。

### 3.6 QA / Integration Reviewer

**输入**

- Deterministic Test Runner 的结果；
- Run/Event、ProviderResponse、ToolCall、Approval、Artifact 和 UI/API 回读证据。

**输出**

- 集成链路是否闭合的判断；
- 按严重级别列出缺陷、复现步骤、影响和建议修复；
- 结论：`PASS / PARTIAL / NO-GO`。

**停止条件**

- 任一关键环节只在 UI 看得到，但没有事件或 receipt；
- 工具执行完成但结果没有回传到下一模型段；
- Artifact 生成了，但无法追溯到输入、Provider、工具和审批。

**验收证据**

- Tool Loop 纵向切片至少证明：

```text
Provider Response
→ ToolCall
→ 参数校验
→ 权限/审批
→ ToolRuntime
→ Tool Result
→ 下一模型段
→ Artifact
```

- 正常、拒绝、工具失败、重复 callId、最大循环次数均有独立证据。

### 3.7 Provider Compatibility Reviewer

**输入**

- 各 Adapter 的 capability probe；
- `ProviderResponseEnvelope`、raw response 引用、usage/cache 状态；
- 相同固定任务在 Fixture、Codex、DeepSeek 上的结果。

**输出**

- 能力矩阵：文本、结构化输出、工具调用、streaming、取消、resume、reasoning、usage、cache；
- Provider 差异和转换规则；
- 可以复用、必须适配、仍未知的字段。

**停止条件**

- 只因为“OpenAI-compatible”就宣称语义等价；
- 把 Codex 订阅额度写成 API 额度；
- 真实 Key、真实回执或错误类型缺失，却给出“可直接切换”的结论。

**验收证据**

- 每项能力来自探针或真实回执；
- 未知值显式写 `unknown`；
- Provider 失败、截断和工具请求能在统一 envelope 中区分。

### 3.8 Security / Privacy Reviewer

**输入**

- ToolPolicy、路径 guard、Shell allowlist、审批规则；
- 工具参数、receipt、日志、Artifact 和网络边界；
- 可能的威胁场景和敏感数据分类。

**输出**

- 威胁模型和最小权限建议；
- 路径穿越、符号链接、跨项目、命令注入、secret 脱敏、外发和删除测试；
- 严重级别与阻断结论。

**停止条件**

- 读取凭据、Cookie、Token 或项目外敏感路径；
- 外发、删除、支付、发布、权限改变等动作没有逐次审批；
- 日志或 Artifact 泄露 secret；
- Agent 可以自行提升权限或修改自己的审批策略。

**验收证据**

- 高风险动作没有未审批成功路径；
- 路径和命令测试覆盖允许、拒绝、绕过尝试；
- receipt 记录 actor、policy、approvalRef、结果和脱敏后的参数；
- 无高严重度未关闭问题。

### 3.9 Persistence / Recovery Reviewer

**输入**

- SQLite schema、transaction、RunStore、EventLog、ContextSnapshot 和备份恢复脚本；
- 崩溃、并发、重复提交和跨项目隔离测试结果。

**输出**

- 事件顺序、幂等、回滚、恢复、备份一致性报告；
- 失败后的可重试点和人工介入点；
- `replayable / recoverable / partially-recoverable` 状态。

**停止条件**

- 状态只在内存或 UI 中存在；
- Run 恢复后重复工具调用或重复 Artifact；
- sequence、idempotency key 或 cross-project isolation 被破坏；
- ContextSnapshot 有记录但下一 Provider 没收到恢复 Packet。

**验收证据**

- kill/restart、cancel/retry、重复提交、DB lock、备份恢复均有证据；
- Run/Event/Approval/Artifact/Memory 的引用在回放后仍一致；
- 恢复后工具调用不会绕过审批。

### 3.10 SRE / Operations Reviewer

**输入**

- server/Electron 启动与健康检查；
- 日志、correlationId、状态诊断、重试退避和停止策略；
- 已知环境限制和 runbook。

**输出**

- 启停、故障分类、恢复、回滚和升级手册；
- 可观察性缺口；
- 操作结论：`ready / limited / blocked`。

**停止条件**

- 进程崩溃后没有确定的恢复步骤；
- 只显示“失败”而没有 correlationId、Run ID 或 receipt；
- 重试会无限循环、重复外发或重复副作用；
- 后台任务无法暂停、取消或诊断。

**验收证据**

- `pnpm setup/demo/dev`、health、日志和诊断命令有清晰结果；
- 取消、超时、provider 限额、工具失败和恢复可区分；
- runbook 能由另一人按步骤恢复。

### 3.11 Release / Reproducibility Reviewer

**输入**

- lockfile、安装脚本、构建配置、Electron 打包产物和版本元数据；
- clean-room 环境检查结果。

**输出**

- Web、Server、Electron/D​​MG 的构建与启动报告；
- 产物 hash、版本、已知签名限制和安装说明；
- 候选交付包，不代表已发布。

**停止条件**

- clean-room 无法安装或启动；
- 构建依赖隐式读取本机私有路径、未声明环境变量或未锁定依赖；
- 产物没有版本和来源指纹；
- 需要发布、上传、签名或外发但没有人工批准。

**验收证据**

- 按固定命令完成安装、demo、dev、build/package；
- Web 与 Electron 使用同一业务逻辑；
- 产物可通过 hash/版本追溯到源码和配置；
- 未签名 macOS 包明确标注限制，不写成“生产安装完成”。

### 3.12 Evidence / Claims Auditor

**输入**

- 全部测试结果、receipt、构建产物、固定任务结果、现实使用记录和用户批准；
- 对外 README、面试材料、交付报告和状态文档。

**输出**

- “声明—证据”映射表；
- 已验证、部分验证、未知、禁止宣称的结论；
- 对外展示包与本人掌握包的边界。

**停止条件**

- 代码存在但没有运行证据；
- Fixture、模型自评或厂商宣传被写成现实效果；
- `PASS` 没有对应输入、版本、日志和产物；
- 真实使用、真人修改量或再次使用意愿被猜测。

**验收证据**

- 每个重要结论至少关联一个可读文件、测试结果、receipt 或真人记录；
- `designed / implemented / verified / proven-effective / unknown` 五种状态不混写；
- 交付报告中的限制和未完成项与 `RUN_STATE` 一致。

### 3.13 Human Release Approver

**输入**

- Evidence Auditor 的结论；
- Security、Ops、Release 的阻断项；
- 交付包、隐私边界、发布目标和回滚方案。

**输出**

- 明确的 `approve / reject / approve-with-limits`；
- 批准的版本、范围、环境、有效期和撤销方式。

**停止条件**

- 任一硬门为 NO-GO；
- 需要扩大权限、外发、支付、发布或生产变更但用户没有逐次确认；
- 交付包与审计证据不一致。

**验收证据**

- 批准事件包含版本、范围、审批人、时间、理由和关联 artifact；
- 未批准的动作不能由 Agent 代替执行；
- 交付后可撤销、暂停和回滚。

## 4. 确定性检查器与 Agent 的边界

以下内容必须由确定性工具完成，Agent 只能解释结果：

- TypeScript typecheck、lint、单元/集成测试和退出码；
- JSON/Schema 校验、状态迁移合法性、事件 sequence 和幂等键；
- 路径穿越、符号链接、跨项目隔离和 Shell allowlist；
- secret 脱敏模式和禁止路径；
- SQLite 事务、备份恢复、并发写、kill/restart 和 replay；
- 构建、打包、产物 hash、版本和 clean-room 命令；
- ToolCall 最大循环次数、callId 去重和审批状态机；
- 运行健康检查、correlationId、Run ID 和 receipt 完整性。

以下内容适合交给 Agent，但结果必须附证据：

- 从用户目标提炼范围、反目标和验收标准；
- 解释架构取舍和 Provider 能力差异；
- 设计威胁模型、测试矩阵和固定任务；
- 诊断失败的根因候选并提出最小修正；
- 阅读真实产物，判断是否满足业务质量和可追溯性；
- 把多个报告合并成面向用户的交付说明。

## 5. 质量门（Quality Gates）

### Gate Q0：范围门

通过条件：目标、非目标、唯一下一步、权限、停止条件冻结。  
阻断条件：把 Tool Loop、Multi-Agent、Routine、Computer Use 混进同一个未拆分切片。

### Gate Q1：契约门

通过条件：Core 类型、事件、ProviderResponse、ToolCall、Approval、Artifact 和 ContextPacket 对齐。  
阻断条件：能力只写在文档中，adapter 或回执没有对应字段。

### Gate Q2：运行门

通过条件：完整纵向链路可运行，所有关键步骤有事件和 receipt。  
阻断条件：工具能单独执行，但模型结果不能继续驱动下一段。

### Gate Q3：安全门

通过条件：权限、审批、路径、命令、secret、外发和跨项目隔离测试通过。  
阻断条件：任一始终审批动作可绕过，或出现敏感信息泄露。

### Gate Q4：恢复与运维门

通过条件：中断、崩溃、取消、重试、重复提交、Provider 限额和数据库恢复有明确证据。  
阻断条件：恢复后重复副作用，或用户无法知道失败位置和下一步。

### Gate Q5：复现与交付门

通过条件：clean-room 安装、Web/Electron 启动、产物 hash、已知限制和 runbook 完整。  
阻断条件：依赖本机私有状态，或把 unsigned/partial 产物写成正式交付。

### Gate Q6：现实价值门

通过条件：固定任务对照和至少有限的真人使用记录，证明质量、编辑量、恢复和复用价值。  
阻断条件：只有 Fixture、模型自评或机械 PASS，没有真人证据。

## 6. 当前项目的最小角色编排

当前不要一次性启动所有角色。M3-07d Tool Loop 纵向切片只需要：

1. Scope / Product Steward：冻结本次只做 Fixture-first Tool Loop；
2. Architecture / Contract Reviewer：确认 ProviderResponse、ToolCall、Approval、Tool Result 字段；
3. Runtime Implementer：只改批准的 runtime/adapter 写集；
4. Deterministic Test Runner：执行正常、拒绝、失败、重复和上限测试；
5. QA / Integration Reviewer：审查 Model→Tool→Result→Next Segment→Artifact 闭环；
6. Security / Privacy Reviewer：审查权限、路径、审批和 receipt 脱敏；
7. Persistence / Recovery Reviewer：审查重启、幂等和恢复；
8. Evidence / Claims Auditor：确认只能宣称已验证的范围。

SRE、Release 和 Human Release Approver 在纵向切片通过后、进入对外交付前再启动。Provider Compatibility Reviewer 在需要接入真实 DeepSeek 或第二个真实 Provider 时启动。

## 7. 当前项目的硬性停止条件

- 完整 Tool Loop 没有 `Tool Result → next model segment`，不得称为 Agent 已能自主调用工具；
- ProviderResponse 没有 raw reference、finish reason、usage、cache 状态和 error 语义，不能称为 Provider 可替换；
- Security 门未通过，不得开放工作区写入、Shell、Computer Use 或外发；
- Recovery 门未通过，不得做无人值守 Routine 或后台任务；
- Evidence 门未通过，不得宣称比普通 ChatGPT→手工整理→Codex 更高效；
- Multi-Agent 只有在固定任务中达到预先冻结的质量/编辑量阈值，才允许从候选转为默认；
- Skill 只有在版本锁定、测试、发布、回滚和批准机制存在后，才允许成为长期 Bot 能力。

## 8. 后续可升级为 Skill 的角色

可先把以下角色做成“只读审查 Skill”草稿：

- `qa-integration-review/v1`；
- `security-sandbox-review/v1`；
- `persistence-recovery-review/v1`；
- `release-reproducibility-review/v1`；
- `evidence-claims-audit/v1`。

这些 Skill 的注册、发布和权限提升仍需要用户批准。它们不能自我修改、自动发布新版本或创建无限子 Agent。

