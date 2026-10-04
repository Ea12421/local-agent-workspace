> **2026-10-04 RSI 记忆策略可控运行已收口：** `RUN_STATE.json` 当前为 `complete / memory-recall-strategy-control-v1 / 4/4`。Web 的受控自动更新卡片可为单次运行选择“关键词模式（默认）”或“混合模式”；实际策略会写入 `improvement.run_started`、候选提案并可通过详情 API 回放，非法值 HTTP 400 拒绝。专项 5/5、全量测试 105/105、typecheck 和 Web build 通过。默认仍为关键词模式，未把固定基准的改善写成真实提效。证据见 `validation/memory-recall-strategy-control-v1-2026-10-04.json/.md`。若恢复工作，先运行 state validation 和 diff check，再决定是否进入真实项目样本或 R9 真人验证；不要自动切换默认策略。

> **2026-10-03 Codex CLI 更新复测：** 本机已从 `0.155.1` 更新到官方最新稳定版 `0.160.0`。更新后 `npm run context:codex` 的 `full_context` 与 `verified_context_packet` 均通过，12/12 关键字段恢复；最新结果见 `validation/context-codex-recovery-v1-2026-10-03.json/.md`。`RUN_STATE.json` 仍为 `complete / controlled-command-adapter-v1 / 7/7`。

> **2026-10-04 记忆召回扩大基准当前恢复点：** `RUN_STATE.json` 为 `complete / memory-recall-benchmark-v1 / 3/3`。11 条固定记忆、6 条查询比较结果为：关键词 Hit@1 `2/6`、MRR `0.638889`；混合 Hit@1 `4/6`、MRR `0.833333`；Hit@3 均为 `6/6`。默认策略暂不切换，仍需真实项目样本或进入 R9 真人现实验证。证据见 `validation/memory-recall-benchmark-v1-2026-10-04.json/.md`。

> **2026-10-04 记忆混合召回 v1 已收口：** `MemoryAdapter` 保留 `lexical` 默认基线，增加可选 `hybrid` 策略和可解释分项评分。`npm run memory:baseline` 固定样例通过：混合模式把完整短语排到第一位，项目隔离通过；专项记忆/RSI 4/4、`npm run test:all` 105/105、typecheck、Web build 和 state validation 均通过。当前 `RUN_STATE.json` 为 `complete / memory-recall-hybrid-v1 / 4/4`；证据见 `SPEC/24-memory-recall-hybrid-v1-2026-10-04.md`、`validation/memory-recall-hybrid-v1-2026-10-04.json/.md`。默认策略暂不切换。

> **2026-10-03 Codex 原生环境已恢复：** 之前的 `Operation not permitted` 已确认是受限执行环境阻止 Codex CLI 写入自身状态目录造成的。一次受控权限探针成功启动 Codex CLI 0.155.1 后，`npm run context:codex` 的 `full_context` 与 `verified_context_packet` 均通过，12/12 个关键字段读回；完整状态估算 4195 tokens，恢复包 774 tokens，估算缩减 81.5%，压缩包 case 记录 `cached_input_tokens=11008`。`RUN_STATE.json` 当前为 `complete / controlled-command-adapter-v1 / 7/7`。这只证明本项目结构化恢复包能被同一 Codex CLI 读取，不证明 Codex 内部自动压缩、原生 `resume` 或成本收益；不读取凭据、不改 VPN。证据：`validation/context-codex-recovery-v1-2026-10-03.json/.md`。

> **2026-10-03 受控命令阶段已收口（历史 checkpoint，当前结果见上方）：** `RUN_STATE.json` 当时处于 `controlled-command-adapter-v1`，固定命令模块、Web/API 审批闭环和打包应用 Computer Use 回归均完成，进度 7/7。该条记录写入时 Codex/Text app-server 仍返回 `Operation not permitted`；随后环境恢复并完成同一 Codex/Text 上下文验证，当前事实以本文件最上方的 `complete / 7/7` 回执和 `RUN_STATE.json` 为准。`project.test → npm run test` 与 `project.build_web → npm run build:web` 仍是唯一 profile；HTTP 专项 1/1、桌面回归、全量测试和构建证据保持有效。不做 provider/Harness 横向比较。证据：`SPEC/22-controlled-command-adapter-v1-2026-10-03.md`、`validation/controlled-command-adapter-v1-2026-10-03.json/.md`、`apps/server/src/controlled-command-http.test.ts`。

# Recovery Handoff

> **2026-10-03 RSI 当前恢复点：** `RUN_STATE.json` 当前为 `blocked_environment / external-absorption-rsi-v1 / 5/6`。RSI 控制面、SQLite/RunEvent 回放、HTTP、Web build、Electron directory package 和新包 Computer Use 回归均已通过。曾出现的 `自动更新失败：not_found` 已定位为重建后旧 Node 服务仍驻留内存；清理旧 Electron/Node 实例并从当前 release 包重启后，端口 65498 的 Computer Use 点击“开始自动更新”显示“固定检查 通过 / 候选版本 prompt:v3 / 处理方式 自动记录”，并出现回滚按钮。唯一剩余阻塞是 Codex CLI 0.155.1 的同一 Text/Codex 恢复复测在 app-server 初始化返回 `Operation not permitted`。不重复同一阻断，不做 DeepSeek、OpenRouter、GPT-4o 或不同 Harness 横向比较；若环境权限变化，再按 `RUN_STATE.json.next_action` 运行 `npm run context:codex`。

> **2026-10-03 P0 修正路线已收口：** `RUN_STATE.json` 当前为 `complete / project-scoped-projection-v1 / 7/7`。在原交付版基础上，已补齐项目范围读取、动态权限撤销、Provider/RunEvent 语义幂等和有界重试的可回读契约；全量测试 90/90、typecheck、Web build、state validation 和 diff check 均通过。最新证据入口为 `SPEC/16`–`SPEC/20` 与 `validation/*project-scoped*`、`*dynamic-permission*` 文件。

> **当前停止边界：** 上下文验证继续固定同一 Codex/Text 通道，不做跨模型比较；Codex 内部原生压缩和 prompt cache 命中没有稳定可见回执，不能写成已验证。自动后台 retry、真人提效、真实模型质量、Codex native resume、GitHub clean-room 和 Developer ID 签名仍是后续或独立边界，不属于本次 P0 收口。

> **2026-10-03 基线交付终态：** R1 机械质量门、R2 失败/恢复、R3 Provider 契约、R4 真实 DeepSeek 草稿链、R5 上下文/成本基线、R6 Web/Electron 本地体验、R7 本地交付包、R8 面试掌握材料均已完成并有验证记录。当前可直接使用无 Key Fixture 主流程，也可在服务端配置 `DEEPSEEK_API_KEY` 后运行真实草稿入口；真实模型质量、多 Bot 优势、真人提效、Codex native resume、GitHub clean-room 和 Developer ID 签名仍明确是未验证/后置边界。当前机器状态以 `RUN_STATE.json` 最新字段为准；本版本之后的 EVAL/RSI 增量目前暂停。

> **当前可交付物：** Web/Electron 共用同一个本地 control plane 和 SQLite 事实源；macOS arm64 DMG 为 `release/Local Agent Workspace-0.1.0-arm64.dmg`，SHA-256 为 `671d111e21b9de714fc3f143897a68ef3bab1ce341c286decaadfef4dd6953fa`。DMG 完整性校验与只读挂载已通过；当前机器没有 Developer ID，因此包未签名。

> **恢复规则：** 后续额度中断或重新打开窗口时，先读 `RUN_STATE.json`、`SPEC/ROADMAP-EXECUTION-V1-2026-10-03.md`、`docs/USER-GUIDE.md` 和 `docs/INTERVIEW-DEMO-PACK-V1-2026-10-03.md`，不要按本文件下面的历史条目重跑 R1-R8。只有用户明确要继续时，才从可选的 R9 真人现实验证或新的功能需求开始；旧 `/Users/m4air/AI产品经理工作台` 仍只读，不能接管。

> **2026-10-03 暂停中的增量：** 用户要求先验证上下文连续压缩，再决定是否恢复 EVAL/RSI。`npm run context:multi-pass` 完成 3 次带父链 Snapshot/Packet 恢复；`npm run context:deep-recovery` 验证 Provider 中断、数据库关闭/重开、同一 Run retry/start、工具结果回放和 Artifact 幂等；`npm run context:benchmark` 量化 10/30/100/300 个事件、每种 20 次快照的恢复包大小、字段保留和耗时。证据为 `validation/context-multi-pass-v1-2026-10-03.json`、`validation/context-deep-recovery-v1-2026-10-03.json`、`validation/context-benchmark-v1-2026-10-03.json` 和 `.md` 报告，全套测试为 80/80。当前 `RUN_STATE.json` 为 `paused / eval-rsi-v1 / 3/7`；EVAL-01 尚未实施，等待用户明确恢复。

> **2026-10-02 当前恢复点：** `RUN_STATE.json` 已完成 `deepseek-tool-loop-v1`（3/3）。真实 DeepSeek 只读 Tool Loop 已通过一次：模型提出 `filesystem.read`，本地 `LocalToolRuntime` 读取 `fixtures/demo-project.json`，结果回传并生成 Artifact；事件链完整，实际返回模型记录为 `deepseek-flash`。证据：`validation/deepseek-tool-loop-v1-2026-10-02.json`；Web 入口 Computer Use 证据：`validation/deepseek-tool-loop-web-v1-2026-10-02.json`。下一阶段是固定任务质量、失败处理和重试边界；不要把一次 loop 写成模型质量或成本收益证明。

> **2026-09-30 当前状态校准：** 本轮恢复以 `RUN_STATE.json` 为准，阶段为 `post-v0.1-complete-safe-backlog-complete`。DeepSeek 离线请求契约、项目 workspace 路径绑定回归、默认只读一致性和文档校准均已完成；当前全套测试 73/73、typecheck、Web build、state validation、diff check 通过。后续只等待外部条件，不把历史 `delivery-v0.1-ready` 快照当作当前终态。

> 2026-09-30 M10-07 持久化状态校准：早期 M10-03/M2-04 的 PARTIAL/TODO 记录属于历史快照；当前 SQLite schema、EventLog、全实体 typed CRUD、事务幂等、Product Builder checkpoint、SIGKILL 重启恢复、跨进程写、备份恢复及 10k/100k 规模边界均已有专项证据，M2/M10 按 DONE 处理。证据：`validation/m10-07-persistence-reconciliation-2026-09-30.json`。迁移失败注入仍是独立限制，不把它误写成已验证；真实 Provider、Codex native resume、clean-room 签名和真人提效仍是其他边界。

> 2026-09-30 continuous-delivery：M3-06 已补齐 workspace_write 最小纵向单元。LocalToolRuntime 仅允许当前 workspace 内 bounded UTF-8 原子写；覆盖已有文件始终逐次审批；receipt 不回显正文，幂等与路径/symlink guard 有测试。全套测试 66/66、typecheck、state validation、diff check 通过。临时 clean-room 离线安装因 pnpm store 缺 `better-sqlite3-11.10.0.tgz` 阻塞，DeepSeek Key 与 Codex state DB 仍是外部条件；恢复以 `RUN_STATE.json` 的 next_action 为准，不重复盲试。
> 2026-09-30 continuous-delivery：M3-06 已补齐 workspace_write 最小纵向单元。LocalToolRuntime 仅允许当前 workspace 内 bounded UTF-8 原子写；覆盖已有文件始终逐次审批；receipt 不回显正文，幂等与路径/symlink guard 有测试。全套测试 66/66、typecheck、state validation、diff check 通过。临时 clean-room 离线安装和一次联网重试均受阻：本地 store 缺 `better-sqlite3-11.10.0.tgz`，联网时 `registry.npmjs.org` DNS `ENOTFOUND`；DeepSeek Key 与 Codex state DB 仍是外部条件；恢复以 `RUN_STATE.json` 的 next_action 为准，不重复盲试。

> 2026-09-30 M4-04 已完成：用户视角界面审计和 Electron 回看通过。概览的 Run、Clarify/Planner、Provider、Artifact 已统一到 Product Builder active Run；当前 5 个产物优先，历史保留；技术字段折叠；未接入按钮置灰并标明后续开放；Bots 有效权限与只读安全边界一致。证据为 `validation/m4-04-user-surface-audit-2026-09-30.json`。当前仍不是真实模型质量验证；下一步是 Provider 真实消费门。

> 2026-09-30 M4-03 已完成：Approval → Artifact release 的 Fixture 用户流程已通过 Electron Computer Use。独立 Run `run-fixture-1790710745587-b1y2vt` 完成目标用户/场景确认，精确 approvalId 审批后 5 个 Artifact 变为最终产物，旧 Run 草稿保持隔离；计划中的审批和 release 步骤都变为可执行，退出并重开后仍可回读。证据为 `validation/m4-03-approval-release-2026-09-30.json`。当前唯一下一步是 Provider 真实消费门：用户提供 DeepSeek Key 后做一次受限 one-shot，或 Codex `.codex` state DB 权限条件变化后再做 native recovery；继续不写 `~/.codex`、不重复真实 smoke、不开放写工具/full_access。

> 2026-09-30 M4-02 已完成：Clarification resolution 已接入 Web/Electron。用户填写目标用户后，服务端通过 append-only state checkpoint 更新同一 Product Builder Run；计划由 blocked 变为 ready，退出并重开 Electron 后状态保持。Computer Use 同时修复了 UI 使用错误 Run ID 的问题；HTTP smoke 已隔离到临时 SQLite。证据为 `validation/m4-02-clarification-resolution-2026-09-30.json`。当前唯一工程下一步是用已存在的 `approvalId` 完成一次用户确认→release reconcile→Artifact 回读；继续保持 Fixture-first，不接 DeepSeek、不开放写工具/full_access，不重复 Codex 自身 state DB 的真实 smoke。

> 2026-09-30 底层契约阶段：当前唯一恢复点是 `RUN_STATE.json` 的 `product-builder-web-clarify-plan`。除 Provider-neutral envelope、Fixture-first Tool Loop、Codex JSONL → `ProviderResponseEnvelope`、SQLite model receipt、审批恢复和 Codex 环境探针外，Product Builder 的 `clarifications`/固定 `plan` 已通过专项与全套测试，Web/Electron 也能回读并显示未知项和阻断步骤；旧 checkpoint 重放时 release projection 会以幂等 state-sync 事件保持一致。探针确认 `codex-cli 0.155.1` 的公开入口存在，但 `.codex/state_5.sqlite` 与目录不可写；真实 Provider Tool Loop 留在条件门后，不重复同一 smoke。真实 DeepSeek、多 Bot 和真人效果仍未完成。下一步是本地 UI 的 Clarification resolution。

> 外部 AI 评审入口：先读 `docs/EXTERNAL-AI-DIAGNOSTIC-BRIEF-V1.md`（项目状态与评审上下文包），再使用 `docs/EXTERNAL-AI-PLANNING-PROMPT-V1.md`。外部计划必须先经过主控事实核验，不能直接覆盖 `RUN_STATE.json` 或 backlog。

> 如果外部 AI 是没有本地文件访问能力的网页 Chat，请直接复制 `docs/EXTERNAL-CHAT-ONE-SHOT-PACK-V1.md`，不要使用要求“读取项目文件”的提示词。

> 如果希望降低原有方案的锚定影响，使用两轮材料：先复制 `docs/EXTERNAL-CHAT-BLIND-DESIGN-PACK-V1.md` 做盲评；保存结果后，再把结果和 `docs/EXTERNAL-CHAT-INFORMED-COMPARISON-PACK-V1.md` 一起发回网页 Chat 做知情复核。

> 评审时用 `docs/EXTERNAL-CHAT-REVIEW-SCOPE-V1.md` 控制优先级：先看产品最小闭环、长任务恢复、Provider 边界和 Tool Loop，再看成本、Multi Bot、Skill 和桌面细节。

> 本次外部意见只能作为已核验的计划输入，不能直接覆盖 `RUN_STATE.json`、SPEC 或代码；完整取舍、冲突处理和停止条件见 `docs/EXTERNAL-CHAT-RECONCILIATION-2026-09-29.md`。

> 2026-09-29 增量说明：恢复位置以 `RUN_STATE.json` 为准。本地 v0.1 交付版已收口：真实只读 filesystem/read、Git status 和 Git diff --stat 已接入；最新桌面包用独立服务端口启动，Computer Use 运行 `run_mulk7kis` 和 `run_mulkr9p7` 均成功，从项目绑定目录执行只读 Git 命令并各自回读 5 个事件。Web 和桌面 UI 现在直接显示当前 workspacePath、只读权限以及允许/禁止的动作，`/api/ui-snapshot` 也有回归断言。完整 `npm run test:all` 为 44/44，Fixture demo、诊断、构建和 DMG 校验均通过。后续如果开新阶段，优先做受控测试/构建命令；仍不开放任意 Shell、删除、DeepSeek 或外部发布。

更新时间：2026-09-30（Asia/Shanghai）

## 当前目标

在 `/Users/m4air/Work Agent开发。` 交付可从 GitHub 复现的 Local Agent Workspace v1：单一本地 control plane 管理 Project、Bot、Run、Handoff、Approval 和 Artifact；首个内置 Bot 是 Product Builder。

## 当前状态

- `RUN_STATE.json`：当前以文件实际字段为准，已经是 `complete / delivery-ready-v1 / 6/6`。SQLite-first 持久化与恢复、R1-R8 交付单元已完成；M8-04 质量资格、Codex native resume、GitHub clean-room、签名和真人提效仍按独立边界保留
- 阶段：`RUN_STATE.json.phase=delivery-ready-v1`；下面较早的条目是历史审计记录，不覆盖当前终态
- 已完成：
  - 根 monorepo 配置、AGENTS.md、环境样例和 setup/demo/typecheck 脚本
  - `SPEC/00-06`、`SPEC/MASTER-SPEC.md`、`SPEC/IMPLEMENTATION-BACKLOG.md`、`SPEC/TRACEABILITY.md`、`SPEC/PROGRESS.md`、`SPEC/AI-EXECUTION-PROTOCOL.md`、`docs/architecture.md`、`docs/interview-playbook.md`
  - `packages/core`：类型契约、显式 Run 状态机、append-only 事件、幂等事件仓储、测试
  - `packages/adapters`：DeepSeek 模型通道、Fixture 通道、Codex CLI/SDK 执行桥、权限策略
- `packages/workflow`：Product Builder 确定性 workflow，4 个结构化交接、5 个来源关联 Artifact 和待审批边界
- `packages/workflow`：Product Builder Clarify/Planner 契约，显式 unknown/provided、阻塞规则和固定步骤计划
  - `apps/server`：HTTP control plane、fixture API、core snapshot API、Codex 版本探针、JSONL 事件回退和 SQLite schema 边界
  - `apps/server/src/http-smoke.test.ts`：不打开端口也能验证 health 和 Product Builder API
  - `apps/server/src/tool-loop.ts`、`apps/server/src/tool-loop.test.ts`：Fixture-first Tool Loop 控制面与失败/幂等/恢复专项
  - `packages/adapters/src/provider-envelope.ts`、`packages/adapters/src/provider-envelope.test.ts`：ProviderResponseEnvelope 归一化与 raw hash/usage/cache receipt
  - `apps/web`：React/Vite 中文工作台、项目/Bot/Run/审批/Artifact/Provider 视图，优先走本地 HTTP、失败回退 fixture，并明确显示数据来源
  - 本轮新增：approval reconcile、统一 `correlationId` 错误回执、Bot 创建/复制/停用 API/UI；完整人工交互仍待 Computer Use 回执
  - `apps/desktop`：启动本地 server、加载同一 Web UI 的 Electron 薄壳文件；appId 已固定为 `com.localagentworkspace.desktop.v1`
  - `apps/desktop/src/main.ts`：health-ready 轮询后再打开窗口
  - `apps/desktop/tsconfig.json`、`scripts/build-desktop-entry.mjs`：确保 electron-builder 使用真实的 CommonJS 入口
  - `evidence/receipts/build-and-ui-validation-2026-09-26.json`：依赖、构建、Web Computer Use 和 DMG 证据
  - `scripts/m804-pilot.ts`、`scripts/validate-m804.ts`：固定任务试跑和自动校验入口
  - `validation/m8-04-results.jsonl`、`validation/m8-04-validation-summary.json`：PB-01 试跑账本与校验摘要
  - `validation/m8-04-manual-review-PB-01.json`：PB-01 人工复核、可比性和质量证据阻断项
  - `packages/core/src/context.ts`、`packages/core/src/context.test.ts`：ContextSnapshot 纯函数与恢复校验
  - `apps/server/src/persistence.ts`、`apps/server/src/persistence.test.ts`：JSONL ContextSnapshot 持久化与隔离测试
  - `apps/server/src/product-builder-continuity.ts`、`apps/server/src/product-builder-continuity.test.ts`：Product Builder 边界 checkpoint 与重放幂等
  - `validation/m9-context-continuity-results.json`：M9 契约验证账本
  - `validation/m8-04-manual-review-PB-02.json`：PB-02 三条路径自动结果和质量证据阻断项
  - `validation/m8-04-manual-review-RS-01.json`：RS-01 三条路径自动结果和质量证据阻断项
  - `validation/m8-04-manual-review-RS-02.json`：RS-02 三条路径自动结果和质量证据阻断项
  - `validation/m8-04-manual-review-AR-01.json`：AR-01 三条路径自动结果和质量证据阻断项
  - `validation/m8-04-manual-review-AR-02.json`：AR-02 三条路径自动结果和质量证据阻断项
  - `validation/m8-04-manual-review-EV-01.json`：EV-01 三条路径自动结果和质量证据阻断项
  - `validation/m8-04-manual-review-EV-02.json`：EV-02 三条路径自动结果和质量证据阻断项
  - `validation/m8-04-manual-review-EX-01.json`：EX-01 三条路径自动结果和质量证据阻断项
  - `validation/m8-04-manual-review-EX-02.json`：EX-02 三条路径自动结果和质量证据阻断项
  - `validation/m8-04-aggregate-summary.json`：M8-04 全套机械执行汇总
  - `scripts/m804-evidence-audit.mjs`、`scripts/m804-evidence-audit.test.mjs`：M8-04 派生 artifact、严格 JSON 回放和质量阻断审计
  - `validation/m8-04-quality-evidence-audit.json`、`evidence/artifacts/m8-04/`：36 条 receipt→artifact 对应审计与 36 个派生 artifact（27 条可严格回放）
  - `validation/m8-05-reality-card-v1.json`：M8-05 执行前冻结卡与结果状态
  - `validation/m8-05-reality-results.json`：3 个真实本地任务与 recovery smoke 汇总
  - `validation/m8-05-raw/REAL-01.json`、`REAL-02.json`、`REAL-03.json`：原始 provider 回执
  - `validation/m8-05-review.md`：窄范围结论、恢复内容阻断说明与未验证项
  - `validation/m8-06-paired-baseline-card-v1.json`：ContextSnapshot JSONL-first vs SQLite-first 的 paired baseline 卡
  - `validation/m8-06-manual-baseline.md`、`validation/m8-06-structured-run.json`、`validation/m8-06-comparison.json`：两条 arm 和比较结果
  - `validation/m8-06-owner-review.md`：给人阅读的 JSONL-first / SQLite-first 判断卡
  - `validation/m8-06-jsonl-failure-results.json`：JSONL 尾行损坏、同进程并发 append 和重建 latest 的专项结果
  - `SPEC/08-persistence-architecture-decision.md`：长期 SQLite-first 决策、portable 边界和 M10 实施顺序
  - `validation/m10-01-sqlite-adapter-results.json`：SQLite adapter、驱动探针、20/20 测试与限制
  - `validation/m10-02-schema-migration-results.json`：schema v1、migration runner、21/21 测试、幂等 inspection 与限制
  - `validation/m10-03-sqlite-runstore-results.json`：schema v2、单连接 RunStore、runtime 默认接入、回滚/备份/跨进程和 24/24 测试与限制
  - `validation/m10-05-product-builder-persistence-results.json`：共享 SQLite checkpoint、typed entity round-trip、replay、HTTP 连续 preview 和 25/25 测试
  - `validation/m10-07-persistence-reconciliation-2026-09-30.json`：M2/M10 当前状态与历史验证快照的校准记录
- `scripts/checkpoint.mjs`、`scripts/validate-state.mjs`、`scripts/recover.mjs`：限额/压缩后的原子 checkpoint、状态校验和恢复入口
- `scripts/diagnose.mjs`：不依赖安装的 Node/npm/pnpm/Codex/Fixture 环境诊断
- 验证通过：
  - `pnpm test:all`：14 tests passed
  - `npm run typecheck`：server TypeScript syntax check passed
  - `npm run setup`：passed
  - `npm run demo`：fixture demo passed，输出 4 handoffs / 5 artifacts / pending approval
  - `npm run diagnose`：记录 Node 22.23.1、codex-cli 0.155.1
  - Codex 订阅路径真实最小调用：`codex exec --json` 返回约定 JSON；receipt 为 `evidence/receipts/codex-cli-probe-2026-09-26.json`
  - CodexExternalAdapter 已接入 control plane；真实只读 Product Builder Run `run_dabface1-e16b-449c-99a0-214c90def682` 成功，receipt 为 `evidence/receipts/codex-product-builder-run-2026-09-26.json`
- 真实验证缺口：
  - 普通 Codex 沙箱访问 registry 时仍可能 DNS 失败；使用受控主机网络后 `pnpm install` 已成功，未修改 VPN/DNS/代理/防火墙
  - Web Vite production build 已通过；Firefox Computer Use 已打开 `localhost:5173` 并完成审批按钮交互
  - arm64 Electron 目录包已启动；Computer Use 已读取原生窗口并进入 Bots 管理；DMG 签名、安装后和 clean-room 仍是 PARTIAL
  - DeepSeek one-shot 与一次真实只读 Tool Loop 已用用户授权 Key 实跑；Codex Product Builder 端到端 Run、取消和恢复仍待验证
  - M8-04 10 题三路径机械执行已完成；质量证据审计已补齐 receipt→artifact/readback 账本，但人工编辑、reviewer rubric、usage/cost 和真人门仍缺，不能写成多 Bot 质量或提效通过
  - PB-01 当前有 9 条真实 provider 记录（8 条完成、1 条 provider_incomplete），全部是 `quality_eligible=false`；可解析的 multi Bot receipts 自动校验为 7/8，另有前缀/拼接输出被严格拒绝，必须先人工复核，不能据此宣称单/多 Bot 质量优劣
  - 为同步最新桌面入口而重打包时，`.app` 编译成功，但 `hdiutil` 报 `设备未配置`；已有 DMG 保留，需在 DiskManagement 可用的 macOS 环境再复验封装
  - M8-05 窄范围 reality validation 已完成；M8-06 paired baseline 两条 arm 已执行但为 PARTIAL，现作为历史证据；长期存储路线已改为 SQLite-first

## 不要重新打开的决定

- 旧 `/Users/m4air/AI产品经理工作台` 只读参考，不接管未提交改动。
- control plane 自建状态机是事实源；LangGraph/Agents SDK/Pi/Hermes/OpenHands 只能作为可替换执行层。
- DeepSeek 是 `ModelProviderAdapter`；Codex 是 `ExecutionAgentAdapter`，不得混成同一种 Provider。
- 权限 UI 固定使用“只读 / 工作区写入 / 完全访问”，代码值分别是 `read_only/workspace_write/full_access`。
- 首版不做云端多用户、后台监听、自动外发/发布、无人审批的 Bot 自我扩张或 Computer Use 硬验收。

## 下一步

> 以下条目是历史推进记录，仅用于审计，不覆盖机器状态。当前唯一恢复位置、阶段和下一步以 `RUN_STATE.json` 为准；普通阶段不再等待用户确认，只有密钥、权限、网络或不可逆动作才会停。

0. 补 Clarification resolution：允许用户在本地 UI 明确填写/确认目标用户与主要场景，并以 append-only 事件更新同一 Run 的澄清投影；继续保持 Fixture 可用，不接 DeepSeek、不开放写工具/full_access，也不重复真实 Codex smoke。

1. Codex Run 取消专项测试已经通过并写入 receipt；Electron 进程已启动但窗口 AX 读取超时，保留为 PARTIAL。
2. 隔离 clean-room 源码副本已从零安装、setup、10 tests 通过；literal GitHub clone 仍待仓库 remote。
3. Context Continuity M9-01 至 M9-05 已完成：同一逻辑 Run 的不可变 snapshot、JSONL 存储、segment/fallback resume、ContextPacket 传递、Product Builder 边界幂等和契约验证已通过专项测试，账本为 `validation/m9-context-continuity-results.json`。
4. M8-04 PB-02 三条 Codex subscription 路径已完成并校验为 schema_pass=true、6/8 hard constraints；multi_bot 比 single_bot 慢约 3.27 倍，质量证据仍阻断，记录为 `validation/m8-04-manual-review-PB-02.json`。
5. M8-04 RS-01 三条路径已完成并校验为 schema_pass=true、7/8 hard constraints；multi_bot 比 single_bot 慢约 5.33 倍，质量证据仍阻断，记录为 `validation/m8-04-manual-review-RS-01.json`。
6. M8-04 RS-02 三条路径已完成并校验为 5/8、0/8、6/8；single_bot schema failure，multi_bot 比 single_bot 慢约 2.98 倍，质量证据仍阻断，记录为 `validation/m8-04-manual-review-RS-02.json`。
7. M8-04 AR-01 三条路径已完成并校验为 8/8、7/8、8/8；multi_bot 比 single_bot 慢约 3.97 倍，质量证据仍阻断，记录为 `validation/m8-04-manual-review-AR-01.json`。
8. M8-04 AR-02 三条路径已完成并校验为 7/8、7/8、0/8；multi_bot schema failure 且比 single_bot 慢约 2.71 倍，质量证据仍阻断，记录为 `validation/m8-04-manual-review-AR-02.json`。
9. M8-04 EV-01 三条路径已完成并校验为 6/8、0/8、6/8；single_bot schema failure，multi_bot 比 single_bot 慢约 3.98 倍，质量证据仍阻断，记录为 `validation/m8-04-manual-review-EV-01.json`。
10. M8-04 EV-02 三条路径已完成并校验为 6/8、6/8、6/8；multi_bot 比 single_bot 慢约 6.53 倍，质量证据仍阻断，记录为 `validation/m8-04-manual-review-EV-02.json`。
11. M8-04 EX-01 三条路径已完成并校验为 7/8、7/8、7/8；multi_bot 比 single_bot 慢约 3.98 倍，质量证据仍阻断，记录为 `validation/m8-04-manual-review-EX-01.json`。
12. M8-04 EX-02 三条路径已完成并校验为 7/8、0/8、0/8；single_bot/multi_bot schema failure，multi_bot 比 single_bot 慢约 6.18 倍，质量证据仍阻断，记录为 `validation/m8-04-manual-review-EX-02.json`。
13. M8-04 机械执行已收口：36 条 receipt、30 个唯一 task×path 组合、quality_eligible=0，总账本为 `validation/m8-04-aggregate-summary.json`；质量证据仍阻断。
14. M8-05 已完成：3/3 真实本地状态任务通过预注册追踪门；一次真实 Codex provider 中断后，同一 `runId` 追加 Snapshot 和 resume segment 并成功收口。Recovery 内容本身因提示禁止读取命令而返回 blocked，已单独记录，不能写成业务任务完成。
15. M8-04 先保留质量证据阻断状态；DeepSeek 真实只读 loop 已完成一次，下一步做固定任务质量与失败恢复验证。SQLite-first 是长期运行时路线，JSONL 仅作 portable/demo/export/灾备。
16. M10-01 SQLite 适配层已通过：全套等价 Node tests 20/20、typecheck、diff check；better-sqlite3 ABI 不匹配时由 node:sqlite 接管并返回显式 persistence mode。
17. M10-02 schema/migration 已通过：schema v1、schema_meta、run_events、context_snapshots、run_segments、idempotency_keys 已验证，21/21 测试通过；失败注入、全实体事务、导入导出和恢复规模验证仍未完成。
18. M10-03 仍为 PARTIAL：schema v2、单连接 SqliteRunStore、Run/Event/idempotency/segment 事务、runtime 默认接入、重启回读、回滚、三个独立进程并发写、备份恢复和项目隔离已验证，24/24 测试通过；全实体 typed CRUD、长时规模和 Product Builder 完整接入仍未完成。
19. M10-05 已完成：Product Builder checkpoint、ContextSnapshot、snapshot-created event、幂等行和全 typed entity round-trip 已验证；Project/Skill/BotProfile POST/GET/PATCH、Run create、cancel、retry、entity summary 和 approve HTTP 持久化均已验证。Git 已在本地建立 `main` 基线并提交，当前没有 remote，不 push。

### 当前唯一下一步

按 `SPEC/11-external-agent-orchestration.md` 等待外部条件变化：Codex 环境探针已确认 `state_5.sqlite` 和 `.codex` 目录不可写，暂不重复真实 smoke；保持 Fixture、HTTP/Web 回执路径可用，真实 Provider Tool Loop 留在条件门后，不接 DeepSeek、不开放写工具/full_access。用户后续提供 DeepSeek Key 时，再单独开启真实 API one-shot 验证。

## 重要文件

- `RUN_STATE.json`：机器可读续接状态
- `SPEC/MASTER-SPEC.md`：详细产品与工程说明书
- `SPEC/IMPLEMENTATION-BACKLOG.md`：逐项推进清单
- `SPEC/AI-EXECUTION-PROTOCOL.md`：AI 执行与恢复协议
- `SPEC/00-product-contract.md` … `SPEC/06-validation-and-interview-evidence.md`：冻结契约
- `packages/core/src/`：领域事实源
- `packages/adapters/src/`：Provider/权限适配层
- `apps/server/src/index.ts`：本地 HTTP control plane
- `apps/server/src/runtime.ts`：core 运行时 fixture
- `apps/server/src/persistence.ts`：SQLite 运行时存储、JSONL portable 后端与能力诊断
- `apps/web/src/`：Web UI
- `apps/desktop/src/main.ts`：Electron 薄壳
- `fixtures/demo-project.json`：无 Key 演示输入

## 恢复规则

先读本文件和 `RUN_STATE.json`，再只检查上面“下一步”涉及的文件。若状态是 `blocked_environment`，先解决状态中列出的环境条件，再把状态恢复为 `running` 并写入唯一下一步。不要根据旧聊天重新设计产品，不要修改旧工作台，不要将 fixture/机械测试写成真实使用通过。

### 2026-09-27 M10-02 schema/migration checkpoint

- `RUN_STATE.json` 已推进到 `m10-02-schema-migration-pass`，唯一下一步为 M10-03。
- `apps/server/src/persistence.ts` 使用版本化 `SQLITE_MIGRATIONS`，通过 `schema_meta` 记录版本，并在迁移失败时回滚。
- `validation/m10-02-schema-migration-results.json` 记录 schema v1、五类表、二次 inspection 幂等和 21/21 测试结果。
- 当前不要把 schema v1 当作全实体持久化完成；下一步只接 M10-03 的事务与幂等。

### 2026-09-27 M10-03 RunStore checkpoint

- `RUN_STATE.json` 已推进到 `m10-03-boundary-pass`；M10-03 的 runtime 默认接入和边界测试已完成，但整体仍为 PARTIAL。
- `apps/server/src/persistence.ts` 的 schema v2 增加领域表；`SqliteRunStore` 以单连接事务写入 Run、RunEvent、幂等记录和 Run segment。
- `validation/m10-03-sqlite-runstore-results.json` 记录 22/22 全套测试、重启回读、同 key 重放和冲突边界。
- 下一步进入 M10-05：Product Builder/HTTP 完整接入。

### 2026-09-27 M10-03 runtime wiring checkpoint

- `apps/server/src/runtime.ts` 的默认 `runtimeStore` 现在使用 SQLite；正式运行路径为 `data/workspace.db`，Node test 使用进程隔离临时 DB。
- `ensureSeeded()` 会先回读固定 fixture Run，避免 Server 重启时重复插入。
- persistence/runtime 专项 11/11、全套等价 Node tests 22/22 通过；证据已更新到 `validation/m10-03-sqlite-runstore-results.json`。
- M10-03 仍需跨进程竞争、显式失败注入和备份边界；Product Builder checkpoint 与 HTTP 完整接入留给 M10-05。

### 2026-09-27 M10-03 boundary checkpoint

- M10-03 专项已覆盖显式失败注入回滚、`VACUUM INTO` 备份恢复和三个独立 Node 进程并发写；persistence 10/10、runtime 3/3、全套 24/24 通过。
- 当前仍不把全实体 typed CRUD、长时规模或 Product Builder 事务接入写成完成。
- M10-05 第一段已通过；下一步补 Handoff/Approval/Artifact/Source/Memory/ProviderReceipt typed persistence 和完整 HTTP 读写。

### 2026-09-27 M10-05 Product Builder persistence checkpoint

- Product Builder 默认 continuity 现在用共享 SQLite 连接；一个 checkpoint 的事件、ContextSnapshot、snapshot-created event 和幂等记录同事务提交。
- 重新打开数据库后 replay 跳过 10 个 checkpoint；HTTP 连续 preview 已验证第二次 `created=0/skipped=10`。
- Product Builder/HTTP 专项 3/3、全套 25/25 通过；证据为 `validation/m10-05-product-builder-persistence-results.json`。
- 当前已完成 Product Builder 相关 typed entity persistence 第一段；Project/BotProfile/Skill repositories 和完整 HTTP 读写仍是下一步。

### 2026-09-27 M10-05 typed entity checkpoint

- `SqliteEntityStore` 已接入 Product Builder continuity；Handoff、Approval、Source、Artifact、ProviderReceipt 可写入并在重开后回读，replay 不重复随机 Artifact。
- Product Builder/HTTP 专项 3/3、全套 25/25、typecheck 和 diff check 通过；证据为 `validation/m10-05-product-builder-persistence-results.json`。
- 下一步补 Project/BotProfile/Skill typed repositories，以及持久化实体摘要和审批/重试/取消 HTTP 读写。

### 2026-09-27 M10-05 HTTP persistence checkpoint

- `Project`、`Skill`、`BotProfile` typed persistence roundtrip 已 PASS；`GET /api/persistence/entities` entity summary 已 PASS；approve route persistence 已 PASS。
- typecheck、Product Builder/HTTP 专项 `3/3`、全套等价 Node tests `25/25`、`git diff --check` 均通过。
- 该 checkpoint 后续已完成 M10-04；当前唯一下一步已转为 M10-06 恢复与规模验证。

### 2026-09-27 M10-04 JSONL import/export checkpoint

- `scripts/import-export/cli.mjs` 与 `cli.test.mjs` 已完成；格式 `local-agent-workspace.export.v1`、schemaVersion 2，manifest 含 payloadSha256。
- 校验覆盖 JSON、表白名单、主键重复、run_events sequence 连续、ContextSnapshot hash 和 JSON columns；导入为事务，非空 target 拒绝并回滚。
- 专项测试 2/2；真实 `data/workspace.db` export→validate→import 54 rows，重开 `projects=1,runs=0,events=19,idempotency=0`。
- 证据：`validation/m10-04-jsonl-import-export-results.json`。主任务另行记录 27/27、typecheck、full suite、diff check。
- M10-04 已 DONE。M8-04 质量证据、Electron 可见性、DeepSeek、literal GitHub clone、Codex 原生 resume 限制保留。

### 当前唯一下一步

切到 M8-04 质量证据审计/现实验证。

### 2026-09-27 M10-06 · 恢复、并发与规模验证完成

- 有限 SQLite open/migration busy retry 修正已通过；三进程并发 writer 专项 PASS。
- kill/restart：SIGKILL 子进程后 reopen，已读回 committed Run/Event；10k scale test PASS。
- 100k 真实脚本 PASS：`eventCount=100000`、`first=1`、`last=100000`、`durationMs=336`、`driver=node:sqlite`。
- 纳入既有 rollback、online backup/restore 与跨进程证据；全套 `29/29`、typecheck、`git diff --check` PASS。
- 证据：`validation/m10-06-recovery-scale-results.json`。M10-06 标记 DONE。

### 当前唯一下一步

切到 M8-04 质量证据审计/现实验证。DeepSeek 仍需 Key；Electron 可见性 PARTIAL；GitHub clone/Codex native resume 仍受限制。

### 2026-09-28 M8-14 recovery checkpoint

- 当前状态以 `RUN_STATE.json` 为准：`phase=m8-14-computer-use-codex-e2e`，状态仍为 `running`。
- 已用 Chrome Computer Use 走通 `http://localhost:5173/` 的 Fixture 控制面；已用本地 API 真实调用 Codex subscription execution bridge。
- 最新 receipt 证据：`run_mukpy6pf`，`receiptId=run_mukpy6pf:codex:segment:1`，SQLite `provider_receipts` 可回读。
- 代码与证据：`apps/server/src/runtime.ts`、`apps/server/src/persistence.ts`、`apps/server/src/product-builder-continuity.test.ts`、`validation/m8-14-computer-use-codex-e2e-v1.md/.json`。
- 唯一下一步：把 Web “新建一次运行”接入显式 Codex/Fixture Provider 选择和真实 Run 创建；之后再做 `m8-13-user-baseline-card-v1.md` 的真人 A/B 测量。

### 2026-09-28 M8-15 Web run-entry checkpoint

- `apps/web/src/lib/api.ts` 已新增显式 `fixture/codex` startRun 契约；`apps/web/src/App.tsx` 已新增目标输入、Provider 选择、忙状态和执行回执卡。
- Chrome Computer Use 已完成真实 Codex UI 流程：`run_mukqh9uy`、5 events、`run_mukqh9uy:codex:segment:1`、`isMock=false`、`authMode=subscription`。
- Fixture Product Builder 返回的 `approval.runId` / `waiting_user` 映射已修正；没有把 Fixture 写成真实模型效果。
- 验证：typecheck、diff check、29/29 Node tests、SQLite provider receipt readback PASS。
- 证据：`validation/m8-15-web-run-entry-v1.md/.json`。
- **当前唯一下一步**：按 `validation/m8-13-user-baseline-card-v1.md` 做真人固定任务 A/B，记录耗时、手工整理、修改量、返工、追溯性、中断恢复和再次使用意愿。

### 2026-09-28 M8-16 Workspace baseline arm checkpoint

- 固定输入已落盘：`validation/m8-13-fixed-input-v1.md`。
- Chrome Computer Use 使用同一输入完成 Codex arm：`run_mukr3edw`，5 events，`run_mukr3edw:codex:segment:1`，exact JSON。
- 原始结构化结果和 receipt：`validation/m8-13-workspace-run-mukr3edw.json`；人类可读报告：`validation/m8-13-workspace-arm-v1.md`。
- 结果只证明受控输入→结构化输出→receipt 链路，不证明真人提效或 synthetic 数据之外的效果。
- **当前唯一下一步**：由用户用相同固定输入完成 ChatGPT→手工整理→Codex 基线 A，填写 `validation/m8-13-user-baseline-card-v1.md` 的真人字段。

### 2026-09-28 M8-17 persisted run replay checkpoint

- 新增 `GET /api/core/runs/:runId`，Web 首次打开会从 SQLite 恢复最近一次已结束 Run。
- Chrome Computer Use 重开页面后回读 `run_mukr3edw`、5 个 Provider events、`run_mukr3edw:codex:segment:1` 和 exact JSON 摘要。
- HTTP smoke、typecheck、diff check、29/29 Node tests PASS；证据 `validation/m8-17-persisted-run-replay-v1.md`。
- 当前唯一下一步：由用户完成 `validation/m8-13-user-baseline-card-v1.md` 的基线 A；工程线不再阻塞该测量。

### 2026-09-28 M8-18 machine baseline checkpoint

- 同一 `validation/m8-13-fixed-input-v1.md` 已完成两条机器路径：直接 Codex CLI 单次调用与 Workspace `run_mukr3edw`。
- A 因默认路由容量错误后有界回退到 `gpt-5.6-luna`，CLI `103033ms`；结果是自由 Markdown，需人工规范化。原始与规范化证据：`validation/m8-13-baseline-a-single-call-raw.json`、`validation/m8-13-baseline-a-single-call.md`、`validation/m8-13-baseline-a-manual-normalization.json`。
- B 是 `openai-codex` subscription，5 provider events、receipt `run_mukr3edw:codex:segment:1`，exact JSON 与刷新恢复证据已保存。
- 综合比较：Workspace 默认路径更适合长期项目，因为有结构化契约、RunEvent、receipt 和恢复；直接单次调用更轻量。此结论只属于机器可观察层。
- 真人耗时、手工修改、返工、再次使用意愿仍未知；不得把 M8-18 标记为现实提效通过。
- **当前唯一下一步**：真人使用固定输入完成 `validation/m8-13-user-baseline-card-v1.md`；若暂不做，保持 `PARTIAL`，不默认启用多 Bot。

### 2026-09-28 M8-19 codex-pet-studio quality checkpoint

- 真实项目路径：`/Users/m4air/总控/projects/codex-pet-studio`；本轮只读使用 staging 包和 native frames，未修改候选项目。
- 机器质量对照证据：`validation/m8-19-codex-pet-direct-single-call.md`、`validation/m8-19-codex-pet-workspace-single-call.md`、`validation/m8-19-codex-pet-quality-comparison-v1.md/.json`。
- 合同审计证据：`validation/m8-19-codex-pet-staging-audit.json`；364/364 structural/pixel/nearest-neighbor checks PASS，视觉回读见 `validation/m8-19-codex-pet-visual-review.md`。
- 结论：当前 staging 包合同 PASS；不等于安装运行 PASS，也不等于用户审美接受或 Product Builder 现实提效通过。
- **唯一下一步**：候选项目要求写入 `~/.codex/pets` 前必须得到用户明确确认；确认前保持安装 pending，不修改宠物目录。

### 2026-09-28 M8-20 codex-pet install smoke checkpoint

- 目标目录：`/Users/m4air/.codex/pets/sha-wujing` 在执行前已存在，且 `pet.json`、`spritesheet.webp` 与 M8-19 staging 包逐字节一致；因此没有执行覆盖写入。
- 证据：`validation/m8-20-install-preflight.json`、`validation/m8-20-install-postflight.json`、`validation/m8-20-codex-pet-install-reality-card.json`。
- Verdict：内容级安装 `PASS`；整体安装现实验证 `PARTIAL`，因为 Computer Use 安全策略拒绝直接操作 Codex App，runtime load 未观察到。
- 不得把现有目标文件一致性写成 Codex 已加载、动画已运行或用户已接受。
- **当前唯一下一步**：用户可见确认当前 Codex 宠物，或使用另一个被允许的运行时观察路径；不得绕过 Computer Use safety。

### 2026-09-28 M8-20 user-visible observation checkpoint

- 用户本人在 Codex App 中看到“沙悟净”，并看到“更新”按钮与弹窗指令；这是真实用户可见观察，不是 Computer Use 自动回执。
- 当前只确认“有一个沙悟净显示”，不能确认它来自本次 staging 包；目标目录此前已存在且与 staging 包一致。
- **不要点击更新**：完整指令、目标路径、版本指纹和写入副作用尚未核对。
- 证据：`validation/m8-20-user-visible-observation.md`、`validation/m8-20-codex-pet-install-reality-card.json`。
- **当前唯一下一步**：读取更新窗口完整原文并做只读解释；解释前不执行任何更新。


### 2026-09-28 M8-20 screenshot clarification

- 用户提供截图，确认“更新”不是已执行的 shell 命令，而是 Codex Composer 中尚未发送的 Hatch Pet 升级草稿：`Hatch Pet upgrade the existing pet at 沙悟净 to the latest pet version with looking directions`。
- 当前可见模型标签为 `GPT-6 Astra Ultra`，仅记录界面事实。
- 不发送草稿、不改变宠物；下一步只读核对 Hatch Pet 升级规范、目标路径、版本指纹和回滚边界。
- 证据：`validation/m8-20-codex-pet-update-prompt.png`、`validation/m8-20-user-visible-observation.md`、`validation/m8-20-install-postflight.json`。


### 2026-09-28 主线恢复

- 用户确认继续推进原项目；沙悟净仅是一次现实样本，不改变主线。
- 当前主线：`m8-04-quality-evidence-readiness`。
- 下一步：只读审计 M8-04 现有 receipt/artifact/reviewer 卡与当前 SQLite receipt 快照，保留质量阻断，不把宠物截图或模型自评写成多 Bot 价值证据。


### 2026-09-28 M8-04 AR-01 post-hoc evidence

- M8-04 主线已完成一个不依赖 DeepSeek、也不冒充真人数据的最小证据单元。
- AR-01 三条路径为 `EVIDENCE_PARTIAL`；保持结构化 `single_bot` 为默认候选，`multi_bot` 不设默认。
- 下一步：如继续机器验证，新增固定任务并记录 artifact 前后 diff/人工编辑量；真人耗时和再次使用意愿仍需用户本人填写。


### 2026-09-28 M8-13 machine proxy substitution

- 用户授权总控 Agent 代替其完成两条机器路径；M8-13 机器代理对照已收口。
- A=103033ms、自由 Markdown、需 4 步规范化；B=83194ms、严格 JSON、5 events、receipt 和刷新回放。
- 结论仅适用于机器执行层：Workspace structured single-Bot/Codex 为默认候选；不能替代真人接受/修改/复用证据。


### 2026-09-28 阶段状态校准

- 项目不是全部完成：核心运行时和 SQLite-first 已完成，M3/M4/M5/M6/M7/M8 仍有明确 PARTIAL/BLOCKED。
- 当前唯一工程下一步：M4-06 Handoff cycle guard → M4-07 Conflict Check → 冲突阻止最终 Artifact。
- 状态总表：`SPEC/STATUS-RECONCILIATION-2026-09-28.md`。


### 2026-09-28 M4-06/M4-07 workflow guard

- Handoff cycle/depth guard 与 Product Builder conflict check 已在 workflow 层完成并通过专项测试。
- pending approval/冲突时不释放最终 Artifact，返回 `artifactRelease=blocked` 和空 `finalArtifactIds`。
- 下一步：将 release 状态/阻断原因接入 SQLite checkpoint 与 HTTP 回读，再推进 M5/M6。

## 2026-10-04 评测证据用户可见闭环

- `Improvement API` 的创建、详情和回滚响应现在返回 `evaluationBundle`；Web“受控自动更新”卡片显示评分、评测任务、反馈摘要和历史记忆引用条数。
- `npm run typecheck`、`npm run build:web`、Improvement HTTP 4/4、MemoryAdapter 1/1、`npm run test:all` 104/104 均通过。
- 当前阶段仍为 `complete / local-eval-memory-rsi-v1 / 4/4`；证据见 `validation/local-eval-memory-rsi-ui-v1-2026-10-04.json/.md`。
- 下一步可选：先做语义/混合召回评测，或进入 R9 真人现实验证；不把本轮结果写成模型质量提升。

## 2026-10-04 本地评测与记忆接入 v1

- 当前状态：`RUN_STATE.json` 为 `complete`，阶段 `local-eval-memory-rsi-v1`。
- 事实源：`SPEC/23-local-eval-memory-rsi-v1-2026-10-04.md`、`validation/local-eval-memory-rsi-v1-2026-10-04.json`。
- 已完成：`EvalTask`、`Score`、`FeedbackEvent`、`MemoryAdapter`；SQLite 记忆保存/召回/复盘/重启读回；RSI 评测 Artifact 和 `rsi.feedback` 记忆接入。
- 验证：typecheck 通过，专项 6/6，`npm run test:all` 104/104。
- 下一阶段候选：如需提升召回质量，单独设计 Embedding/混合检索；如需证明实际价值，执行真实任务验证。两者都不是本阶段已完成事实。
