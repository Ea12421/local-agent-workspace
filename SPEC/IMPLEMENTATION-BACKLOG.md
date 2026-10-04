# Implementation Backlog / 推进清单

状态值：

- `DONE`：代码和专项验证已有证据；
- `PARTIAL`：代码存在，但缺集成、真实环境或边界验证；
- `BLOCKED`：外部环境阻塞；
- `TODO`：尚未实现；
- `NEXT`：解除阻塞后唯一优先任务。

## 当前校准（2026-10-04）

当前机器事实源为 `RUN_STATE.json`：`complete / memory-recall-strategy-control-v1 / 4/4`。本阶段已经把本地评测和项目记忆接入受控 RSI，并把 `lexical/hybrid` 做成单次运行可选择、可回放的策略；11 条记忆、6 条查询的固定比较仍保留为策略选择依据。新增证据见：

- `SPEC/23-local-eval-memory-rsi-v1-2026-10-04.md`
- `validation/local-eval-memory-rsi-v1-2026-10-04.json/.md`
- `validation/local-eval-memory-rsi-ui-v1-2026-10-04.json/.md`
- `SPEC/24-memory-recall-hybrid-v1-2026-10-04.md`
- `validation/memory-recall-hybrid-v1-2026-10-04.json/.md`
- `validation/memory-recall-benchmark-v1-2026-10-04.json/.md`
- `validation/memory-recall-strategy-control-v1-2026-10-04.json/.md`

下面较早的 M0–M10 表格和历史状态保留作实施记录；不要用其中过时的“下一步”覆盖当前 `RUN_STATE.json`。混合召回在固定样本上改善 Hit@1 和 MRR，但仍需真实项目样本后才能切换默认；另一个高价值方向是进入 R9 真人现实验证，这两项都不能自动伪造成已完成。

## 2026-10-03 当前执行校准

上一阶段 `deepseek-tool-loop-v1` 已完成：真实 DeepSeek 只读 Tool Loop、工具结果回传、Artifact 和完整 RunEvent 链已有证据。下面旧条目中“DeepSeek 尚未真实调用”的表述属于历史快照，不再代表当前状态；以 `RUN_STATE.json` 和 [`ROADMAP-EXECUTION-V1-2026-10-03.md`](./ROADMAP-EXECUTION-V1-2026-10-03.md) 为当前路线。

当前不重新设计产品，按以下顺序连续推进：

```text
固定任务质量门
→ 失败/取消/重试/恢复
→ Provider 互换边界
→ Product Builder 真实 Provider 接入
→ Web/Electron 与安装交付收口
→ 面试掌握包
→ 真人现实验证（需要用户本人数据）
```

普通工程单元不等待用户确认；只有密钥/外部权限、不可逆操作、发布/外发或真人数据门才停。

## Milestone M0：范围和证据冻结

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M0-01 | 确认产品定义和反目标 | `SPEC/00`, `AGENTS.md` | 无 | DONE | 用户、场景、边界写清 |
| M0-02 | 将旧聊天结论降级为假设 | `SPEC/00`, `HANDOFF.md` | 无 | DONE | 没有未验证的“通过”结论 |
| M0-03 | 建立模型来源核验门 | `SPEC/02`, receipts | M0-02 | PARTIAL | Provider、harness、billing、mock 可追溯 |
| M0-04 | 建立中断恢复协议 | `RUN_STATE.json`, `scripts/*` | 无 | DONE | checkpoint、recover、validate 可执行 |
| M0-05 | 冻结外部开发 Agent 协作协议 | `SPEC/11-external-agent-orchestration.md`, `HANDOFF.md`, `RUN_STATE.json` | M0-04 | DONE | 总控、专门角色、唯一写入者、交接、冲突裁决、额度恢复和质量门有统一规则 |

## Milestone M1：Core Domain

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M1-01 | 定义领域类型 | `packages/core/src/types.ts` | M0 | DONE | Project/Bot/Run/Handoff/Approval/Source/Artifact 类型存在 |
| M1-02 | 实现 Run 状态机 | `packages/core/src/state-machine.ts` | M1-01 | DONE | 合法/非法迁移有测试 |
| M1-03 | 实现 append-only RunStore | `packages/core/src/run-store.ts` | M1-02 | DONE | sequence、重复事件、幂等有测试 |
| M1-04 | 统一 ID 和品牌类型 | `packages/core/src/ids.ts` | M1-01 | DONE | 不同实体 ID 不混用 |
| M1-05 | 增加 crash/replay 测试 | `packages/core/src/*.test.ts`, `apps/server/src/persistence.test.ts` | M1-03 | DONE | 内存回放、SQLite SIGKILL→reopen committed Run/Event、回滚和备份恢复均有专项证据；见 `validation/m10-06-recovery-scale-results.json` |

## Milestone M2：Persistence

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M2-01 | 定义 SQLite schema | `apps/server/src/persistence.ts` | M1 | DONE | 版本化 schema、schema_meta、运行时表和领域实体表已迁移并通过重启 inspection；见 `validation/m10-02-schema-migration-results.json`、`validation/m10-05-product-builder-persistence-results.json` |
| M2-02 | 实现 SQLite EventLog | `apps/server/src/persistence.ts` | M2-01 | DONE | SQLite EventLog 与 RunStore 使用事务、sequence/唯一约束和显式 JSONL portable fallback；驱动能力在回执中可见 |
| M2-03 | JSONL clean-checkout fallback | `apps/server/src/persistence.ts` | M2-01 | DONE | 无 native 依赖测试通过 |
| M2-04 | Run 重启恢复 | `apps/server/src/runtime.ts`, `apps/server/src/persistence.test.ts` | M2-02 | DONE | SIGKILL 后 reopen 能读回已提交 Run/Event；跨进程写、备份恢复和 10k/100k 事件边界均有证据；见 `validation/m10-06-recovery-scale-results.json` |

## Milestone M3：Provider 与工具

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M3-01 | FixtureAdapter | `packages/adapters/src/provider-adapters.ts` | M1 | DONE | `isMock=true`，固定输出 |
| M3-02 | DeepSeekApiAdapter | 同上 | M1 | PARTIAL | 请求/receipt 代码已写；真实 API 未跑 |
| M3-03 | reasoning/tool 字段保留 | DeepSeek adapter | M3-02 | PARTIAL | 离线 DeepSeek chat 回执已归一化并保留 `reasoning_content`/raw tool payload；真实 thinking/tool API case 待用户 Key 后受限 one-shot |
| M3-04 | Codex CLI/SDK 执行桥 | 同上 | M1 | PARTIAL | `codex exec --json` 已真实跑通；适配器已转发 JSONL，resume 仍待接通 |
| M3-05 | ToolPolicy 和强制审批 | `tool-policy.ts` | M1 | DONE | allowlist 与 always-approval 测试通过 |
| M3-06 | FS/Git/Shell sandbox | `packages/adapters` | M3-05 | PARTIAL | 已补真实只读 filesystem/read、Git status 和 Git diff --stat、精确 argv Shell 白名单、tool/operation mismatch guard，以及受控 workspace_write 文件写入：路径/符号链接隔离、256 KB 上限、原子写、覆盖已有文件逐次审批、幂等 receipt；删除、更广 Shell 和真实 Provider Tool Loop 仍待单独验收，证据见 `validation/m3-06-tool-operation-guard-2026-09-30.json`、`validation/m3-06-local-workspace-write-2026-09-30.json` |
| M3-06c | 受控测试/构建命令适配器 | packages/adapters/src/command-runtime.ts；apps/server/src/runtime.ts；apps/server/src/index.ts；apps/web/src/App.tsx | M3-06 | DONE | 两个固定 profile、精确 argv、只读权限档位、预览、逐次审批、RunEvent/SQLite 审批、超时/取消/输出上限/脱敏/幂等、Web/API replay 已通过专项与全量测试；不开放任意 Shell，详见 SPEC/22-controlled-command-adapter-v1-2026-10-03.md |
| M3-07a | Provider-neutral request/response/tool/usage/cache contract | `packages/core/src/types.ts`, `SPEC/09` | M3-02/M3-04/M3-06 | DONE | envelope、工具调用状态、usage/cache receipt 和迁移矩阵已冻结；尚未声称 Adapter 已消费 |
| M3-07b | 能力探针与实现一致 | `packages/adapters/src/provider-adapters.ts` | M3-07a | DONE | DeepSeek one-shot 探针不再声明 streaming/tool loop；专项测试覆盖 |
| M3-07c | ContextPacket 显式注入 Provider | `packages/adapters`, `apps/server/src/runtime.ts` | M3-07a | PARTIAL | Codex/DeepSeek request builder 已实际消费 ContextPacket，并保留 hash/事件范围；真实 provider recovery 仍待验收 |
| M3-07d | Fixture-first ProviderResponseEnvelope 与工具循环纵切片 | `packages/adapters`, `apps/server/src/tool-loop.ts`, `apps/server/src/runtime.ts`, `apps/server/src/index.ts`, `apps/web/src/lib/api.ts` | M3-07c | PARTIAL | Fixture 控制面循环、显式 local read-only ToolRuntime bridge、Codex JSONL collector、snake_case usage、model.response 事件、非测试 SQLite model receipt、按 approvalId 精确解决和跨进程 Fixture resume、HTTP/Web model receipt 可见回读已通过专项与 smoke；当前仍未完成真实 Provider Tool Loop、DeepSeek 真实调用、真实 cache/cost 和业务质量验证 |
| M3-07e | Codex 执行环境能力探针 | `apps/server/src/index.ts`, `apps/web/src/lib/api.ts`, `apps/web/src/App.tsx` | M3-07d | PARTIAL / blocked_environment | 公开 `exec --json`、`resume`、`app-server` 入口存在；当前 `state_5.sqlite` 与 `.codex` 目录不可写，已落盘元数据证据并在 UI 区分环境阻塞；权限变化前不重复 live smoke |
| M3-07f | Stable prompt prefix hash | `packages/adapters/src/provider-request.ts` | M3-07a | DONE | cache-aware request 只计算稳定前缀 hash；不保存正文、不伪造 cache hit；不同 objective 复用同一稳定前缀，约束/工具变化会改变 hash |

## Milestone M4：Product Builder

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M4-01 | Clarify/Planner 数据契约 | `SPEC/04`, workflow | M1 | DONE | Clarification unknown/provided、阻塞规则、固定计划步骤、空想法拒绝和回放稳定性已落盘并通过专项测试；真实 Provider 质量仍由 M8 现实验证负责 |
| M4-02 | Research 输出 Source | `packages/workflow` | M3-01 | DONE | Source refs 存在 |
| M4-03 | Product Brief | 同上 | M4-02 | DONE | 用户/MVP/边界产出 |
| M4-04 | Architecture Proposal | 同上 | M4-03 | DONE | 选项、取舍、风险产出 |
| M4-05 | Evaluation Plan | 同上 | M4-04 | DONE | 指标和 Bad Case 产出 |
| M4-06 | Handoff depth/cycle guard | `packages/core`, workflow | M1 | DONE | 最大深度、缺失父节点和父链循环会阻断 release；专项测试通过 |
| M4-07 | Conflict Check | workflow | M4-05 | DONE | Source/Handoff/Artifact 引用冲突会阻断 release；专项测试通过 |
| M4-08 | User Approval gate | `apps/server`, workflow | M4-07 | DONE | pending approval、精确 approvalId resolve、批准后的 release reconcile、5 个 Artifact promotion、计划状态同步和 Electron Computer Use 回读均已验证；Fixture 限制不代表真实 Provider 或业务质量 |
| M4-09 | Artifact Writer | workflow | M4-08 | DONE | 5 个来源关联 Artifact |

## Milestone M5：Server/API

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M5-01 | HTTP server | `apps/server/src/index.ts` | M1 | PARTIAL | 代码已写；受限环境无法监听 |
| M5-01a | 无端口 request handler smoke test | `apps/server/src/http-smoke.test.ts` | M5-01 | DONE | health 和 Product Builder preview 可在不监听端口时验证 |
| M5-02 | Workspace/UI snapshot | 同上 | M5-01 | PARTIAL | API 转换代码存在 |
| M5-03 | Run create/cancel | 同上 | M1 | PARTIAL | 路由存在；集成请求待跑 |
| M5-04 | Approve/retry | 同上 | M4-08 | DONE | HTTP smoke 与安装版回读验证 approve/retry；bounded retry 事件按 `retry:<runId>:attempt:<n>` 写入 SQLite RunEvent，默认最多 2 次且失败返回可诊断 404/409 |
| M5-05 | Product Builder preview | 同上 | M4 | DONE | 原生 workflow 测试通过 |
| M5-06 | API 错误格式和 correlation | 同上 | M5-01 | DONE | 失败响应统一 JSON，带 `correlationId` body/header；HTTP smoke 覆盖生成与透传 |

## Milestone M6：Web UI

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M6-01 | 工作台概览 | `apps/web/src/App.tsx` | M5 | PARTIAL | Fixture/HTTP fallback 代码存在 |
| M6-01a | 标记数据来源 | `apps/web/src/App.tsx`, `lib/api.ts` | M6-01 | DONE | 本地服务和 Fixture 显示不同状态 |
| M6-02 | Bot 管理 | 同上 | M5 | DONE | 创建、复制、停用 API/UI 已接入；Computer Use 已验证创建、复制、停用和刷新后的持久化回读 |
| M6-03 | Run 时间线 | 同上 | M5 | DONE | 安装版 Computer Use 已验证 SQLite RunEvent/receipt、真实 Run ID、动态事件计数和刷新回读 |
| M6-04 | 审批/重试 | `apps/web/src/lib/api.ts` | M5-04 | DONE | 安装版 Computer Use 刷新后显示“已请求重试”，SQLite receipt 与事件计数从 11→12；审批成功后回读 approval/release 状态 |
| M6-05 | Artifact/Source 预览 | 同上 | M4 | DONE | 本地 API 返回正文、来源引用和 draft/final 状态；Web 点击 Artifact 可预览 |
| M6-06 | Vite build | workspace | M6-01 | DONE | `pnpm --filter @agent-workspace/web build` 已通过 |

## Milestone M7：Desktop

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M7-01 | Electron 启动 Server | `apps/desktop/src/main.ts` | M5 | DONE | 新 `com.localagentworkspace.desktop.v1` arm64 App 启动后 Server 可用，health 返回 ok，Computer Use 已读取原生窗口 |
| M7-02 | health-ready 后开窗 | 同上 | M7-01 | DONE | health-ready 轮询后成功加载同一 Web UI；Computer Use 已进入 Bots 管理并读取卡片 |
| M7-03 | macOS dmg | `electron-builder.yml` | M6-06, M7-01 | PARTIAL | 带自定义图标的 arm64 DMG 已生成并完成本机安装后启动验收；当前机器无 Developer ID，签名和 clean-room 验收仍待完成 |

## Milestone M8：验证和交付

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M8-01 | clean-room install | README/SPEC | M6-06 | PARTIAL | 当前工作区 `pnpm install`、`pnpm run setup` 已通过；全新 clone 仍待验证 |
| M8-02 | DeepSeek 真实调用 | `.env`（不提交） | M3-02 | BLOCKED | receipt 和失败诊断存在 |
| M8-03 | Codex 真实执行桥 | Adapter + receipt | M3-04 | PARTIAL | 真实只读 Product Builder Run、适配器取消和控制面取消竞态已通过；resume 与 Web 端到端仍待验证 |
| M8-04 | 10 任务消融实验 | `validation/` | M4 | PARTIAL | 10 题三路径机械执行已收口（36 条 receipt、30 个唯一 task×path）；新增 receipt→artifact 对应审计和 36 个派生 artifact，27 条可严格 JSON 回放，但人工编辑、rubric、usage/cost 和真人门仍阻断质量结论 |
| M8-05 | 3 个现实任务 | `validation/` | M8-01, M8-02 | PARTIAL | 已完成三次窄范围真实本地状态任务；真人提效和复用意愿仍未完成 |
| M8-06 | 面试掌握包 | `docs/interview-playbook.md` | M8-04 | PARTIAL | 初稿存在；需要真实证据映射 |

## Milestone M9：Context Continuity

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M9-01 | ContextSnapshot 纯函数契约 | `packages/core/src/context.ts`, `types.ts` | M1 | DONE | 阈值、结构化摘要、事件范围、hash、tail 和恢复 Packet 有专项测试 |
| M9-02 | JSONL portable Snapshot 持久化 | `apps/server/src/persistence.ts` | M9-01 | DONE | portable 模式下 snapshot 写入、读取、重复拒绝、latest 隔离和重启 hydration |
| M9-03 | Run segment 与 fallback resume | `packages/adapters`, `apps/server/src/runtime.ts` | M9-01 | DONE | Provider limit/中断后同一 Run 创建新 segment，snapshot + tail 传入下一段，事件可追溯 |
| M9-04 | Product Builder 长窗口接入 | `packages/workflow`, `apps/server` | M9-02, M9-03 | DONE | Handoff、Approval、Artifact 后自动 checkpoint，恢复不重复工作 |
| M9-05 | Context Continuity 验证 | `validation/`, `SPEC/07` | M9-04 | DONE | synthetic limit、崩溃恢复、重复提交、跨项目隔离通过 |

## Milestone M10：SQLite-first 持久化

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M10-01 | storage-neutral factory 与 SQLite ContextSnapshot backend | `apps/server/src/persistence.ts`, `runtime.ts`, `product-builder-continuity.ts` | M9 | DONE | SQLite 默认；JSONL 仅 portable；HTTP 返回 backend/mode/reason；20/20 测试通过 |
| M10-02 | 版本化 schema 与 migration runner | `apps/server/src/persistence.ts`, `apps/server/src/persistence.test.ts`, `validation/m10-02-schema-migration-results.json` | M10-01 | DONE | schema v1、`schema_meta`、四类运行时表、幂等重跑和重启 inspection 已验证；迁移失败注入作为独立限制保留，已在 `validation/m10-07-persistence-reconciliation-2026-09-30.json` 明确，不阻塞当前 DONE |
| M10-03 | 全实体 SQLite 事务与幂等 | `packages/core`, `apps/server/src/persistence.ts`, `validation/m10-03-sqlite-runstore-results.json`, `validation/m10-05-product-builder-persistence-results.json`, `validation/m10-06-recovery-scale-results.json` | M10-02 | DONE | Run/Event/idempotency/segment 事务、全实体 typed CRUD/HTTP round-trip、项目隔离、回滚、重启、跨进程写、备份恢复和 10k/100k 事件验证均已通过；`m10-03` 文件保留为早期 PARTIAL 快照，不代表当前状态 |
| M10-04 | JSONL 导入、导出和校验 | `scripts/import-export/*`, `validation/m10-04-jsonl-import-export-results.json` | M10-02 | DONE | 格式/表白名单/主键/sequence/hash/JSON columns 校验；事务导入、非空 target 拒绝；专项 2/2 与真实 DB 54 rows 重建通过 |
| M10-05 | runtime/Product Builder 完整持久化接入 | `apps/server/src/runtime.ts`, `apps/server/src/product-builder-continuity.ts`, `apps/server/src/http-smoke.test.ts`, `validation/m10-05-product-builder-persistence-results.json` | M10-03 | DONE | 共享 SQLite checkpoint 事务、ContextSnapshot、幂等 replay、全 typed entity round-trip；Project/Skill/BotProfile POST/GET/PATCH、Run create、cancel、retry 与 entity summary HTTP 路由均已验证 |
| M10-06 | 崩溃、多进程、备份恢复和规模验证 | `apps/server/src/*.test.ts`, `validation/m10-06-recovery-scale-results.json` | M10-03, M10-04 | DONE | kill/restart、跨进程竞争、DB lock、备份恢复、10k/100k 事件边界有证据；全套 29/29、typecheck、diff check 通过 |

M10 的详细架构决策见 `SPEC/08-persistence-architecture-decision.md`。

## 当前唯一优先级

> 2026-09-28 校准：M9/M10 核心持久化和恢复已完成；M4-06/M4-07、release state replay 与 approval reconcile 已完成；M5-06 已完成，M6-02 已接入 API/UI，下一步转入外部验收边界和 M8 现实证据。

当前执行顺序先完成 SQLite-first 运行时持久化，再补质量证据和 DeepSeek 对比；M8-04 机械执行与 M8-05 窄范围现实验证已收口，执行顺序固定为：

```text
M3-04/M8-03（Codex CLI bridge）
→ M6-06 → M7-01/M7-02 → M7-03 → M8-01
→ M9-01/M9-02/M9-03/M9-04/M9-05（Context Continuity）
→ M10-01（SQLite adapter）→ M10-02（schema/migrations）→ M10-03（RunStore 事务与 runtime 接入）→ M10-05（Product Builder/HTTP 持久化）→ M10-04（导入导出）→ M10-06（恢复与规模，已完成）
→ M8-04（质量证据补录/现实验证）→ M8-05（现实任务）→ M8-06（面试掌握包）→ M8-02（DeepSeek 可选对比）
```

外部开发协作协议已冻结在 `SPEC/11-external-agent-orchestration.md`。当前代码增量已完成必要的错误、Bot 管理、批准后 release、审批/重试回读和受控 ToolRuntime 第一纵向单元；不重复安装或重跑无关任务。下一条唯一自主动作按该协议分批启用架构/Runtime/Provider、Persistence/Recovery、Security/Tool 和 QA/Evidence 角色，推进真实 Provider 消费同一 envelope。外部签名、literal clean-room、DeepSeek Key、真人现实验证和多 Bot 质量继续按边界推进。
