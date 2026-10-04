# 最新状态（2026-10-04）

- RSI 记忆策略可控运行已完成：Web 可为单次运行选择 `lexical（关键词模式，默认）` 或 `hybrid（混合模式）`；服务端拒绝非法值；实际策略写入 `improvement.run_started`、候选提案并可从 Run 回读。证据为 `validation/memory-recall-strategy-control-v1-2026-10-04.json/.md`。
- 本轮专项记忆/RSI 5/5、`npm run test:all` 105/105、typecheck、Web build 通过；默认仍为 `lexical`，没有把固定基准改善写成全局默认或真实提效。
- 记忆召回扩大基准已完成：11 条固定记忆、6 条固定查询；`lexical` Hit@1=2/6、MRR=0.638889，`hybrid` Hit@1=4/6、MRR=0.833333，Hit@3 均为 6/6。混合模式暂不切换默认，等待更大或真实项目样本。证据为 `validation/memory-recall-benchmark-v1-2026-10-04.json/.md`。
- 记忆混合召回 v1 已完成：保留 `lexical（关键词）` 默认基线，增加可选 `hybrid（混合）` 策略和可解释的关键词/短语/新鲜度分数。固定基线显示混合模式改善完整短语排序；证据为 `SPEC/24-memory-recall-hybrid-v1-2026-10-04.md`、`validation/memory-recall-hybrid-v1-2026-10-04.json/.md`。
- 本阶段验证：`npm run memory:baseline`、`npm run typecheck`、专项记忆/RSI 4/4、`npm run test:all` 105/105、`npm run build:web` 和 `git diff --check` 均通过。混合模式暂不替换默认策略。
- 本地评测与记忆接入 v1 已完成，事实源为 `SPEC/23-local-eval-memory-rsi-v1-2026-10-04.md`。
- 本轮增量已把评测结果接到用户界面：受控自动更新卡片显示评分、评测任务、反馈摘要和历史记忆引用；详情/回滚 API 同时返回 `evaluationBundle`。证据为 `validation/local-eval-memory-rsi-ui-v1-2026-10-04.json/.md`。
- `packages/core` 已导出 `EvalTask（评测任务）`、`Score（评分）`、`FeedbackEvent（反馈事件）` 和 `MemoryAdapter（记忆适配器）`。
- RSI 评测 Artifact 同时保存任务、评分和反馈；SQLite 记忆支持项目隔离、确定性去重、关键词召回、复盘摘要和重启读回。
- `npm run typecheck` 通过；专项测试 6/6；`npm run test:all` 104/104。
- 当前 `RUN_STATE.json`：`complete / local-eval-memory-rsi-v1 / 4/4`。首版召回是有界关键词匹配，不宣称语义向量检索、真实模型质量提升或真人提效。

# 最新状态（2026-10-03）

- 本机 Codex CLI 已更新到官方最新稳定版 `0.160.0`。
- 之前的 `Operation not permitted` 已确认是受限执行环境阻止 Codex CLI 写自身状态目录；通过一次受控主机权限探针后，app-server 可以正常启动。
- `npm run context:codex` 已在 `0.160.0` 上复测通过：`full_context`、`verified_context_packet` 两条 Run 均完成，12/12 关键字段恢复；证据为 `validation/context-codex-recovery-v1-2026-10-03.json/.md`。
- 当前项目事实源 `RUN_STATE.json`：`complete / controlled-command-adapter-v1 / 7/7`。固定命令审批闭环、Web/Electron 回归和上下文恢复验证均已收口。
- 后续可选工作是 R9 真人现实验证；它需要真实用户执行记录，因此仍不自动伪造或代填。

# 当前推进进度

> **2026-10-03 公开 Benchmark 阶段：** 已冻结 `SPEC/13-public-benchmark-and-harness-comparison-v1.md` 与 `validation/public-benchmark-matrix-v1-2026-10-03.json`。按 LongMemEval 官方检索层规则完成 LongMemEval-S cleaned 全量 500 题中的 470 道有效题：BM25、最近优先和 Oracle 上界均已生成 JSON、Markdown、SVG 证据。BM25 的 Recall any@5=88.5%、Recall all@5=73.8%、Recall all@10=80.4%，前 5 session 平均上下文缩减 87.3%。这是检索层结果，不是模型问答准确率，也不是不同 Harness 的跨协议排名。下一步是固定 20 题 reader/QA 子集，再对照无压缩与多次压缩。

> **2026-10-03 上下文控制面阶段：** 已完成三项上下文连续性验证：连续 3 次 Snapshot/Packet 恢复保留结构化字段并能发现 hash 篡改；真实 SQLite Run 在 Provider 中断、数据库关闭/重开后可恢复，同一工具调用和 Artifact 不重复；量化基准覆盖 10/30/100/300 个事件、每种 20 次快照，给出完整账本与恢复包估算、字段保留和耗时表。证据：`validation/context-multi-pass-v1-2026-10-03.json`、`validation/context-deep-recovery-v1-2026-10-03.json`、`validation/context-benchmark-v1-2026-10-03.json` 和 `.md` 报告。之前暂停的 EVAL/RSI/动态事实增量仍未重启；当前公开 Benchmark 是独立的新阶段，不把 EVAL-01 proposal 写成已实现。

> **2026-10-03 连续执行路线已完成本版本交付：** R1 固定任务机械门、R2 控制面失败恢复门、R3 Provider 契约门、R4 真实 Product Builder 草稿链、R5 上下文/成本基线、R6 Web/Electron 本地体验门、R7 本地交付复现和 R8 面试/掌握材料均已完成。R9 真人现实验证按用户决定后置，仍保持“未验证”，不阻塞当前本地交付版。

> **2026-10-03 R4 真实草稿接入：** `POST /api/product-builder/provider-draft` 已用真实 DeepSeek 跑通一次非敏感固定输入。请求返回 `HTTP 200`，事件链为 `run.created → run.started → provider.event → provider.event → artifact.created → run.succeeded`；Schema 校验通过，`unknowns`、`source_refs` 和 `approval_required=true` 均存在。Provider 回执记录请求标签 `deepseek-chat`、实际模型 `deepseek-flash`、294 输入 token、709 输出 token、128 cached input token、cache `hit`；输出正文只保留 hash。草稿 Artifact 已写入 SQLite，但 promotion 仍为 `pending_user_approval`，没有替换正式 Fixture Artifact。证据为 [`validation/deepseek-product-builder-draft-v1-2026-10-03.json`](../validation/deepseek-product-builder-draft-v1-2026-10-03.json)。这只证明真实草稿链路和回执边界，不证明模型质量、成本优势、多 Bot 优势或真人提效。

> **2026-10-03 R4 修正：** 修复 `DeepSeekApiAdapter` 在可选 `DEEPSEEK_BASE_URL/DEEPSEEK_MODEL` 未设置时被显式 `undefined` 覆盖默认值的问题；新增回归测试。完整 `npm run test:all` 为 79/79，`npm run typecheck` 通过。第一次真实请求的失败证据保留在 [`validation/deepseek-product-builder-draft-adapter-default-bug-2026-10-03.json`](../validation/deepseek-product-builder-draft-adapter-default-bug-2026-10-03.json)，没有把它伪装成网络故障。

> **2026-10-03 R4 Web 回归：** Web 高级诊断入口已接入真实 Product Builder 草稿路由。Computer Use 在无 Key 的本地 API 上选择“DeepSeek Product Builder 草稿（真实模型，待审阅）”并提交后，页面保留失败 Run 记录，显示 `deepseek_api_key_missing`，没有生成假成功或晋级正式 Artifact。证据为 [`validation/deepseek-product-builder-web-no-key-cua-v1-2026-10-03.json`](../validation/deepseek-product-builder-web-no-key-cua-v1-2026-10-03.json)。Web build、`npm run test:all` 79/79、typecheck 和 state validation 均通过。下一步进入 R5：上下文压缩、stable-prefix hash、usage/cache 和分段恢复的统一基线。

> **2026-10-03 R5 基线：** 新增 `npm run context:baseline`，把 ContextSnapshot 压缩阈值/尾部恢复、stable-prefix hash 的可比性、DeepSeek `reasoning_content` 回放和 provider cache receipt 汇总成可重跑证据。结果写入 [`validation/context-cost-baseline-v1-2026-10-03.json`](../validation/context-cost-baseline-v1-2026-10-03.json)。它只证明契约和可观察性，不证明长期缓存命中、成本下降、模型质量或真人提效。

> **2026-10-03 R6 Web 回读修正：** 无 Key 的真实草稿请求现在先创建并持久化失败 Run；Web 回读同时读取 SQLite runtime Run，因此关闭对话框并刷新后仍显示“DeepSeek Product Builder 草稿 / 失败 / API key 未配置”，不会退回成“本地演示”。Computer Use v2 证据为 [`validation/deepseek-product-builder-web-no-key-cua-v2-2026-10-03.json`](../validation/deepseek-product-builder-web-no-key-cua-v2-2026-10-03.json)。

> **2026-10-03 R6 主流程对照：** 同一 Web 工作台随后用 Fixture 主流程运行，页面显示 5 个产物、2 项待确认和“等待人工确认”；真实 Provider 失败与本地演示没有互相覆盖。证据为 [`validation/web-main-and-failure-cua-v1-2026-10-03.json`](../validation/web-main-and-failure-cua-v1-2026-10-03.json)。

> **2026-10-03 R6 Electron 收口：** `npm run build:desktop` 和 Electron `server-process` 测试通过；子服务启动、重启换端口和占用端口隔离均有证据。Web build、Computer Use 主流程和失败刷新回读也通过。汇总证据为 [`validation/r6-web-electron-closure-v1-2026-10-03.json`](../validation/r6-web-electron-closure-v1-2026-10-03.json)。签名 DMG、clean-room 和真人效果继续留在后续门。

> **2026-10-03 R7 交付复现：** `setup/demo/diagnose/build:web/build:desktop/package:mac` 均通过；当前 arm64 DMG 通过 `hdiutil verify`，只读挂载能看到应用。当前 DMG SHA-256 为 `671d111e21b9de714fc3f143897a68ef3bab1ce341c286decaadfef4dd6953fa`。签名仍因无 Developer ID 证书未做，GitHub clean-room 因仓库无 remote 未做；两项均明确记录，不阻塞本地包。证据为 [`validation/r7-delivery-reproduction-v1-2026-10-03.json`](../validation/r7-delivery-reproduction-v1-2026-10-03.json)。

> **2026-10-03 R8 掌握材料：** 新增 [`docs/INTERVIEW-DEMO-PACK-V1-2026-10-03.md`](../docs/INTERVIEW-DEMO-PACK-V1-2026-10-03.md)，包含 30 秒介绍、5 分钟演示、10 分钟追问和证据边界；机器检查记录为 [`validation/r8-interview-pack-v1-2026-10-03.json`](../validation/r8-interview-pack-v1-2026-10-03.json)。

> **2026-10-03 R1 固定任务质量门：** 冻结 `READ-01`、`BOUNDARY-01`、`READ-02` 三个无敏感任务，并用真实 DeepSeek 只读 Tool Loop 执行。两条成功任务均产生 `run.created → run.started → provider.event → tool.invoked → tool.completed → provider.event → artifact.created → run.succeeded`；越权任务产生 `tool.failed → run.failed` 且没有 Artifact。机械硬约束 3/3 通过，`qualityEligibleCount=0`。本批实际模型为 `deepseek-flash`，三条任务都记录了 provider usage/cache；这只证明受控链路和硬边界，不能证明模型质量、成本收益、多 Bot 优势或真人提效。证据为 [`validation/fixed-task-quality-gate-v1-2026-10-03.json`](../validation/fixed-task-quality-gate-v1-2026-10-03.json)。下一阶段进入失败/取消/重试/恢复。

> **2026-10-02 DeepSeek 真实只读 Tool Loop：** 新增 `deepseek-tool-loop` Web/API 入口。服务端只读取环境变量中的 API Key，控制面只给模型 `filesystem.read`，由真实 `LocalToolRuntime` 读取 `fixtures/demo-project.json`，回传工具结果，再由模型生成 Artifact。真实回归通过完整事件链 `run.created → run.started → provider.event → tool.invoked → tool.completed → provider.event → artifact.created → run.succeeded`。请求标签为 `deepseek-chat`，服务返回实际模型 `deepseek-flash`；两段回执记录了 provider usage 和 `prompt_cache_miss_tokens`，本次均为 cache miss。离线测试补齐工具名映射、assistant `reasoning_content` 回放和下一轮 tool message；真实回归未观察到 `reasoning_content`。证据为 [`validation/deepseek-tool-loop-v1-2026-10-02.json`](../validation/deepseek-tool-loop-v1-2026-10-02.json)。这证明一次真实只读 Tool Loop，不证明模型质量、成本收益、长期缓存命中或跨进程恢复。

> **2026-10-02 当前阶段：** `deepseek-tool-loop-v1` 已完成一次真实只读回归；`RUN_STATE.json` 的 `complete` 只代表本阶段完成，不代表全局产品完成。下一工程门是用固定任务评测真实 DeepSeek 的输出质量、失败处理和重试边界。规格对照仍以 [`SPEC/TRACEABILITY-2026-10-02.md`](./TRACEABILITY-2026-10-02.md) 为准。

> **2026-10-02 继续推进：** `tool-loop-local` 已接入 Web/API：Fixture 模型提出 `filesystem.read`，`LocalToolRuntime` 在项目工作区真实读取，随后回传结果并生成 Artifact。正常请求通过完整事件链；`../outside.txt` 通过同一条 loop 返回 `tool_path_traversal` 且不生成产物。证据为 [`validation/local-tool-loop-web-v1-2026-10-02.json`](../validation/local-tool-loop-web-v1-2026-10-02.json)。这仍不是 DeepSeek/Codex 真实模型效果；真实 DeepSeek loop 已在本轮单独完成，下一步转向固定任务质量与失败恢复验证。

> **2026-10-02 DeepSeek 真实 one-shot：** 通过直连和项目 `DeepSeekApiAdapter` 各完成一次最小请求，均返回 HTTP 200 和结构化 JSON；usage 已进入中性 envelope，prompt cache 命中为 0，provider 仍报告为 unknown。请求标签为 `deepseek-chat` 时，响应的 `model` 字段返回 `deepseek-flash`，已作为可观察事实记录。这个结果只证明 API 连通和解析路径，不证明 Tool Loop、模型质量或成本收益。证据为 [`validation/deepseek-one-shot-smoke-v1-2026-10-02.json`](../validation/deepseek-one-shot-smoke-v1-2026-10-02.json)。

> **历史校准：** 以 `RUN_STATE.json` 为机器事实源。本轮安全 backlog 已完成：DeepSeek 请求字段保真、项目 workspace 路径绑定回归、默认只读一致性和文档校准均已落盘；`npm run test:all` 当前 73/73、`npm run typecheck`、Web production build、state validation 和 `git diff --check` 均通过。以下较早的 `complete / delivery-v0.1-ready` 记录属于历史快照。

> **2026-09-30 M3-02 DeepSeek request contract：** 离线 fake-fetch 测试确认 `input`、`inputRefs`、`constraints`、`outputSchema` 和 verified recovery context 不会被 adapter 丢弃；provider usage 标记为 `source=provider`；HTTP 非 2xx 和非法 JSON 保持显式失败。证据为 `validation/m3-02-deepseek-request-contract-2026-09-30.json`。这仍不代表真实 Key、网络、质量、缓存/成本或 Tool Loop 已验证。

> **2026-09-30 M3-06 project workspace binding：** `executeLocalFileReadRun` 现在使用持久化项目的 `workspacePath`（测试环境仍可用显式 `AGENT_WORKSPACE_PROJECT_ROOT` 覆盖），不再默认读取 server 进程目录；新增回归证据 `validation/m3-06-local-project-root-2026-09-30.json`。

> **2026-09-30 M3-07f stable prompt prefix hash：** `buildModelRequestEnvelope` 对 `opportunistic/required` cache policy 计算稳定前缀 SHA-256，输入只含 system messages、constraints、output schema 和 tool definitions，排除可变 objective；`disabled` 不产生 hash。专项 adapters 24/24、全套 `npm run test:all` 70/70、typecheck、state validation、diff check 通过。它只是本地比较键，不代表 Provider 已命中或写入缓存；真实 cache/cost 仍为 unknown。

> **2026-09-30 M3-07d explicit local Tool Loop bridge：** `runToolLoop` 新增显式 `toolRuntimeMode`，默认仍为 Fixture；在 `local + read_only + filesystem` 下已真实读取当前工作区文件，并完成 `provider.event → tool.invoked → tool.completed → provider.event → artifact` 事件链。专项 8/8、全套 `npm run test:all` 69/69、typecheck、state validation、diff check 通过。证据为 `validation/m3-07d-local-tool-loop-2026-09-30.json`。这仍由 Fixture Provider 驱动，不是 DeepSeek/Codex 真实 Tool Loop，也未开放写入、删除或 Shell。

> **2026-09-30 M3-03 Provider-neutral DeepSeek envelope replay：** 新增离线 `normalizeDeepSeekChatResponse`，将 DeepSeek `reasoning_content`、tool calls、snake_case usage 和 finish reason 归一化为 `ProviderResponseEnvelope`，并保留原始 provider 字段哈希引用；非法 tool arguments 会显式失败，不会进入 ToolRuntime。DeepSeek adapter 的 provider event 同时附带 envelope。专项 adapters 23/23、typecheck、diff check 通过。证据为 `validation/m3-03-deepseek-envelope-replay-2026-09-30.json`。这只证明离线解析契约，不证明真实 API、tool loop、缓存/成本或业务质量。

> **2026-09-30 M10-07 持久化状态校准：** `validation/m10-07-persistence-reconciliation-2026-09-30.json` 已将早期 M10-03/M2-04 的 PARTIAL/TODO 快照与当前实现分开。SQLite schema、EventLog、全实体 typed CRUD、事务幂等、Product Builder checkpoint、SIGKILL 重启恢复、跨进程写、备份恢复及 10k/100k 事件边界均有当前证据，M2/M10 按 DONE 处理。该证据不覆盖真实 Provider 质量、DeepSeek、Codex native resume、clean-room 签名或真人提效；迁移失败注入仍是独立限制。`RUN_STATE.json` 在该历史条目生成时为 `complete / delivery-v0.1-ready`；这是历史快照，当前状态以文件最新字段和本文顶部校准为准。

> **2026-09-30 M3-06 workspace_write 最小纵向单元：** LocalToolRuntime 已支持当前项目目录内受控 UTF-8 文件写入；新文件受 workspace_write policy 控制，覆盖已有文件始终逐次审批；路径/符号链接、256 KB 上限、原子写、幂等和不回显正文均有专项测试。适配器 16/16、Tool Loop 7/7、全套 `pnpm test:all` 66/66、typecheck 通过。证据为 `validation/m3-06-local-workspace-write-2026-09-30.json`。不等于真实 Provider Tool Loop、删除、任意 Shell 或 full_access 已完成。

> **2026-09-30 M3-06 ToolRuntime operation guard：** 在权限策略前增加 tool/operation 配对校验，malformed 请求统一以 `tool_operation_mismatch` 失败并留下 receipt；适配器专项 15/15、typecheck、diff check 通过。只读 filesystem/Git 仍保持既有边界，工作区写入、删除和任意 Shell 未开放。证据为 `validation/m3-06-tool-operation-guard-2026-09-30.json`。

> **2026-09-30 M4-04 用户视角界面审计：** 以 Electron Computer Use 检查概览、Bots、项目产物三页。修正 Product Builder active Run 选择，避免旧 ToolRuntime Run 覆盖主流程；当前 Run 的 5 个产物优先展示，历史草稿保留并标为历史；首屏技术字段改为技术详情，Fixture 明确为本地流程演示，不代表模型效果；Bots 有效权限统一显示为只读（可生成草稿）；未接入的项目创建、设置、搜索、时间筛选和视图切换改为置灰的“后续开放”。`npm run typecheck`、Web build、`pnpm test:all` 63/63、Electron arm64 directory build、state validation、diff check 通过。证据为 `validation/m4-04-user-surface-audit-2026-09-30.json`。不证明真实 Provider 或业务质量；下一工程门仍是 Provider 真实消费。

> **2026-09-30 M4-03 Approval → Artifact release：** 重建 Web + Electron 目录包后，Computer Use 创建独立 Fixture Run `run-fixture-1790710745587-b1y2vt`，确认目标用户和主要场景，再通过精确 `approvalId` 审批。审批后 `approval_pending` 清除，计划中的“等待用户确认”和“释放最终产物”均变为可执行；该 Run 的 5 个 Artifact 显示“最终产物”，旧 `run-fixture-001` 的 5 个草稿保持草稿。退出并重开 Electron 后 Run、审批收口、计划和最终产物仍可回读。修复了桌面包未包含最新 Web/Server 构建、Fixture Run ID 固定和 release 计划步骤未同步三个问题。专项 9/9、全套 `pnpm test:all` 63/63、typecheck、Web build、Electron directory build、state validation、diff check 通过。证据为 `validation/m4-03-approval-release-2026-09-30.json`。Fixture 只证明控制面与持久化，不证明真实 Provider 或业务质量；下一工程门是 DeepSeek one-shot（需用户 Key）或 Codex native recovery（需 `.codex` 权限条件变化）。

> **2026-09-30 M4-02 Clarification resolution：** 本地 Electron UI 已允许填写并确认阻塞澄清项；确认后以 append-only `product_builder.state_checkpoint` 更新同一 Product Builder Run，`clarification_pending` 被移除，Research/Product/Architecture/Evaluation 步骤变为可执行。Computer Use 验证了输入、提交、退出重开后的状态保持，并修复了前端把 Product Builder state Run 与当前执行 Run 混用的问题。HTTP smoke 改为使用临时 SQLite 数据目录，避免继承开发者的持久化演示状态。专项 9/9、全套 `pnpm test:all` 63/63、typecheck、Web build、Electron directory build、state validation、diff check 通过。证据为 `validation/m4-02-clarification-resolution-2026-09-30.json`。下一步是用已有 `approvalId` 走一次用户确认与 Artifact release 回读；不接 DeepSeek、不开放写工具/full_access，也不重复真实 Codex smoke。

> **2026-09-30 M4-01 Web/Electron 回读：** Clarify/Planner 投影已从 SQLite state 通过 HTTP 接到 Web 与重建后的 Electron 包。Computer Use 在 `127.0.0.1:50472` 看到澄清卡片、unknown/provided、固定步骤状态和 `clarification_pending、approval_pending` 阻断；证据为 `validation/m4-01-clarify-planner-2026-09-30.json`。下一步是本地 UI 的 Clarification resolution，不重复已通过的 workflow/Provider smoke。

> **2026-09-30 M4-01 Clarify/Planner：** Product Builder 的澄清与规划契约已补齐。`clarifications` 明确记录目标用户、主要场景、成功指标和外部证据的 provided/unknown 状态；目标用户或场景缺失会留下 `clarification_pending` 并阻塞下游计划与 Artifact release，未知项不会伪造成 Source。`plan` 使用固定步骤、依赖和 Bot owner，空 idea 在创建 Source 前拒绝；workflow、SQLite continuity 和 HTTP smoke 专项通过。真实 Provider 仍不在本增量范围内。

> **2026-09-30 M3-07e Codex 环境能力探针：** 新增 `GET /api/provider/codex-diagnostics`，只读探测 Codex `exec --json`、`resume`、`app-server` 公共入口和自身 state DB 的权限元数据；Web 的 Codex 探针会把 `blocked_environment` 与“命令不可用”分开显示。当前观察到 `codex-cli 0.155.1` 和公开入口存在，但 `~/.codex/state_5.sqlite` 与 `~/.codex` 目录不可写，证据为 `validation/m3-07e-codex-environment-diagnostic-2026-09-30.json`。没有读取数据库内容、凭据、Cookie，也没有改 VPN/DNS/代理/防火墙；不重复同一真实 smoke。

> **2026-09-30 M3-07d Provider 回执可见回读：** HTTP `GET /api/core/runs/:runId` 现在额外返回 `modelReceipt`/`modelReceipts` 摘要；只暴露 provider identity、camelCase usage、提示词缓存状态、错误原因、raw response hash 引用和事件回放引用，不返回原始输出。`/api/persistence/entities` 同步提供归一化 `modelReceipts`。Web 工作台已显示模型 Provider、认证/计费、输入/输出/缓存 token、明确的“未报告（未知）”、错误和回放引用；执行桥回执仍与模型回执分开。HTTP smoke、全套 `pnpm test:all` 58/58、typecheck、Web build、state validation 和 diff check 通过。真实 Codex 当前 smoke 仍因 Codex 自身 `state_5.sqlite` 权限阻塞，未冒充为成功；DeepSeek、真实 Provider Tool Loop、真实 cache/cost 和质量验证仍未完成。

> **2026-09-30 M3-07d 审批恢复增量：** SQLite 现在支持按 `approvalId` 精确读取和解决，approval row 保存 `callId`；重复同一决定幂等，冲突决定阻断。新增 `/api/runs/:runId/approvals/:approvalId/resolve`，批准后会恢复持久化 Fixture Tool Loop；Web 已优先调用新精确接口。专项 persistence/runtime/HTTP smoke、跨进程 SQLite 重开 smoke 和 Web build 通过，验证证据为 `validation/m3-07d-approval-restart-smoke-2026-09-30.json`。这仍只证明本地 Fixture 控制面和恢复，不证明真实 Provider Tool Loop、DeepSeek 或业务质量。

> **2026-09-30 M3-07d Provider envelope 增量：** 已新增 Codex JSONL segment collector。它会把最终 `agent_message`、`turn.completed` usage（含 snake_case input/output/cached token）和失败/未完成状态归一化为 `ProviderResponseEnvelope`；运行时追加 `model.response` 事件，并在非测试 SQLite 中以独立 `provider.model-response.v1` receipt 保存。专项测试 8/8、全套 `pnpm test:all` 57/57、typecheck、diff check 通过；临时 SQLite 重开回读通过；历史真实 Codex JSONL 离线回放通过。当前受限环境的一次真实 Codex smoke 因 Codex 自身状态库只读而失败，已保留失败 receipt，不能写成真实当前调用通过。Codex CLI 内部工具仍不映射为本项目 ToolCall。

> **2026-09-30 M3-07d 与外部协作协议冻结：** 已完成 `ProviderResponseEnvelope` 的 raw hash、usage、prompt cache unknown、finish/error 最小归一化；新增 Fixture model→ToolCall→schema 校验/幂等→审批→FixtureToolRuntime→工具结果→下一模型段→Artifact 的控制面循环。正常、schema 错误、审批拒绝、重复 callId、工具失败、循环上限和中断恢复均有专项测试，HTTP handler 已接 `provider=tool-loop-fixture`。同时冻结 `SPEC/11-external-agent-orchestration.md`，规定总控、按需专门角色、唯一写入者、结构化交接、冲突裁决、上下文恢复和质量门。这些是可回放的控制面证据，不是真实模型质量结论；真实 DeepSeek/Codex Provider 消费、Web 审批恢复和真实 usage/cache 仍未完成。

> **2026-09-29 状态校准：** 当前是“本地 Alpha 控制面已通过，真实只读 filesystem/read、Git status 和 Git diff --stat 已接入并通过安装版验证，项目 workspacePath 与只读权限已在 UI 可见”的持续开发状态。阶段事实以 `RUN_STATE.json` 和最近的 `DEVLOG.md` 为准；下面保留历史推进记录，不把旧的 PARTIAL/TODO 自动当成当前事实。

> **2026-09-28 M4 增量：** Handoff 图 guard、Conflict Check、`product-builder.release-state.v1` 和批准后的 Artifact promotion/reconcile 已落盘到 checkpoint/approval 事件；SQLite 重开、JSONL fallback、HTTP 回读、legacy backfill 和 approval reconcile 已通过专项及全套测试。

> **2026-09-28 M5/M6/M7 增量：** 新增 Artifact/Source 正文预览 API、统一错误 `correlationId`、Bot 创建/复制/停用 API/UI；Artifact 详情带 `releaseStatus`、来源引用和 release state，Web Artifact 页面支持点击预览正文。Computer Use 已验证 Bot 创建、复制、停用和刷新后的持久化回读；Electron 原生窗口已通过新 `appId=com.localagentworkspace.desktop.v1` 启动并进入 Bots 管理，自定义 `icon.icns` 已接入并通过打包检查，剩余是签名、安装和 clean-room 验收。


更新时间：2026-09-30（02:00，M3-07d Codex envelope 增量）

## 总状态

`m10-06-recovery-scale-pass-m8-04-quality-blocked-desktop-partial-m8-09-output-contract-pass-m3-07d-fixture-loop-partial`

这表示：代码实现单元已完成，但项目最终验收没有完成。

## 已完成

- 产品定义和边界
- 领域类型与 Run 状态机
- append-only event 和幂等
- Provider/Fixture/Codex 探针
- ProviderResponseEnvelope raw hash、usage/cache unknown 和错误回执归一化
- Codex JSONL segment collector、snake_case usage 映射、模型 envelope 事件和非测试 SQLite model receipt 回读
- Fixture-first Tool Loop：ToolCall、schema、审批、ToolRuntime、结果回传、Artifact、幂等与恢复回放
- Codex CLI 订阅执行桥最小真实调用；receipt 已落盘，默认 read-only
- Codex 子进程取消和控制面取消竞态专项测试通过（10 tests passed）
- CodexExternalAdapter 已接入 control plane；真实 Product Builder Run 从 `running` 到 `succeeded`，5 条 provider 事件已进入项目事件流
- 中文权限策略
- Product Builder Fixture workflow
- 4 个 Handoff、5 个 Artifact、1 个 Approval
- Server/API 源代码
- Web UI 源代码
- Electron 薄壳源代码
- 限额/上下文中断恢复机制
- 10 个原生测试（包含 Codex 适配器和控制面取消专项）
- 无端口 HTTP handler smoke test
- Electron health-ready 轮询
- npm workspace 安装回退入口
- Web 明确显示本地服务或 Fixture 数据来源
- Fixture demo
- 受控主机网络下 `pnpm install` 已完成；没有修改 VPN、DNS、代理或防火墙
- Web Vite production build 已通过
- arm64 Electron DMG 已生成：`release/Local Agent Workspace-0.1.0-arm64.dmg`
- Firefox Computer Use 已打开本地 Web，确认项目、Run 时间线、审批卡、Bot 管理和 Codex probe；审批按钮交互后显示“已确认，Architecture Bot 将继续工作”
- 去除 Web 对 Google Fonts 的运行时依赖，断网时不再等待外部字体
- 隔离 clean-room 源码副本从零 `pnpm install`、`pnpm run setup`、`pnpm test:all` 通过（10 tests passed）
- M8-04 10 题固定任务集、统一记录字段和单/多 Bot 判定阈值已冻结
- M8-04 PB-01 已用真实 Codex subscription execution bridge 跑通 `single_call`、`single_bot`、`multi_bot`；multi Bot 成功记录形成 4 个结构化阶段，单次记录为 19–29 条 provider 事件
- M8-04 自动校验已完成：9 条真实 provider 记录（其中 8 条完成、1 条 provider_incomplete）均有 JSON/schema 校验结果；当前有效完成记录为 `single_call` 7/8、`single_bot` 两次 8/8、旧 `multi_bot` 拼接/前缀输出被严格拒绝、可解析的 `multi_bot` 记录为 7/8；没有记录被提升为质量证据
- M8-04 试跑、重试和校验均写入 `validation/m8-04-results.jsonl`、`validation/m8-04-validation-summary.json` 和 `evidence/receipts/m804-*.json`
- Context Continuity v1 纯函数已完成：软/硬阈值、结构化摘要、事件范围、hash、tail 和恢复 Packet 均有专项测试。
- `JsonlContextSnapshotStore` 已完成为 portable 后端：快照追加、重启读取、重复 ID 拒绝、按 project/run 查询 latest，并保持原始 RunEvent 不变；SQLite 已成为默认运行时后端。
- Run segment/fallback resume 已完成：provider 未完成或抛错时，同一逻辑 Run 追加 segment、snapshot 和 resume 事件，并把已校验的 ContextPacket 传给下一段；专项恢复测试通过。
- Product Builder checkpoint 已完成：4 个 Handoff、5 个 Artifact、1 个 Approval 生成稳定幂等键；边界事件和 Snapshot 追加到 JSONL，重放同一 Run 会跳过已记录工作。
- M9-05 Context Continuity 验证已完成并写入 `validation/m9-context-continuity-results.json`：synthetic provider limit、同一 Run 恢复、snapshot 重启/篡改校验、重复 checkpoint、跨项目隔离和原始事件保留均通过；这是契约证据，不是模型质量或现实使用证据。
- M8-04 PB-02 已完成三条 Codex subscription 路径并自动校验：修正计分器后均 schema 通过、4/8 frozen hard constraints；`multi_bot` 为 167466ms，约为 `single_bot` 的 3.27 倍，不能据此设为默认。人工复核记录已更新，质量证据仍阻断。
- M8-04 RS-01 已完成三条 Codex subscription 路径并自动校验：修正计分器后三条均 schema 通过、7/8 hard constraints；`multi_bot` 为 180750ms，约为 `single_bot` 的 5.33 倍。Artifact/replay、人工编辑、reviewer rubric 和 usage/cost 仍缺失，人工复核记录已更新，质量证据仍阻断。
- M8-04 RS-02 已完成三条 Codex subscription 路径并自动校验：single_call 5/8、single_bot schema failure 0/8、multi_bot 6/8；`multi_bot` 约为 `single_bot` 的 2.98 倍。人工复核已落盘，质量证据仍阻断。
- M8-04 AR-01 已完成三条 Codex subscription 路径并自动校验：single_call 8/8、single_bot 7/8、multi_bot 8/8；`multi_bot` 约为 `single_bot` 的 3.97 倍。人工复核已落盘，质量证据仍阻断。
- M8-04 AR-02 已完成三条 Codex subscription 路径并自动校验：single_call 7/8、single_bot 7/8、multi_bot schema failure 0/8；`multi_bot` 约为 `single_bot` 的 2.71 倍。人工复核已落盘，质量证据仍阻断。
- M8-04 EV-01 已完成三条 Codex subscription 路径并自动校验：single_call 6/8、single_bot schema failure 0/8、multi_bot 6/8；`multi_bot` 约为 `single_bot` 的 3.98 倍。人工复核已落盘，质量证据仍阻断。
- M8-04 EV-02 已完成三条 Codex subscription 路径并自动校验：三条均 schema 通过、6/8 hard constraints；`multi_bot` 约为 `single_bot` 的 6.53 倍。人工复核已落盘，质量证据仍阻断。
- M8-04 EX-01 已完成三条 Codex subscription 路径并自动校验：三条均 schema 通过、7/8 hard constraints；`multi_bot` 约为 `single_bot` 的 3.98 倍。人工复核已落盘，质量证据仍阻断。
- M8-04 EX-02 已完成三条 Codex subscription 路径并自动校验：single_call 7/8，single_bot 和 multi_bot schema failure 0/8；`multi_bot` 为 480462ms，约为 `single_bot` 的 6.18 倍。人工复核已落盘，质量证据仍阻断。
- M8-04 机械执行已收口：36 条 receipt、30 个唯一 task×path 组合、`overExpected=0`、`quality_eligible=0`；总账本为 `validation/m8-04-aggregate-summary.json`。这不是多 Bot 优势结论，也不是现实使用验证。
- M8-04 质量证据审计已完成：`scripts/m804-evidence-audit.mjs` 读取并核对 36 条原始 receipt，生成 36 个不可覆盖的派生 artifact，并从 artifact 回读后严格 JSON 回放；36 条 source receipt 对应成功，27 条 artifact 可回放，9 条因前缀/拼接/不完整输出被拒绝。审计账本为 `validation/m8-04-quality-evidence-audit.json`，所有记录仍 `quality_eligible=0`，人工编辑、reviewer rubric、usage/cost 和真人门仍明确阻断。
- M8-05 窄范围现实验证已完成：REAL-01/02/03 三个真实本地状态任务均通过结构化追踪门；一次真实 Codex provider segment 人为中断后，同一 `runId` 追加 `ContextSnapshot`、`run.resume_requested` 和第二 segment，最终 succeeded。结果为 `validation/m8-05-reality-results.json`，复核为 `validation/m8-05-review.md`。这只验证追踪和执行链恢复，不验证业务质量或提效。
- M8-06 paired baseline 卡已冻结：真实任务为 ContextSnapshot 的 JSONL-first vs SQLite-first 技术路线判断；固定了同一输入白名单、7 步手工基线、结构化 Run 输出键、25% 整理步骤阈值、来源/未知项/回滚护栏和 owner willingness 未知边界。卡片为 `validation/m8-06-paired-baseline-card-v1.json`。
- M8-06 两条 arm 已执行，比较结果为 `PARTIAL`：controller proxy 手工基线 7 步且未冒充用户计时；结构化 Codex subscription Run 为 56234ms，结构化追踪通过。由于缺少用户本人 baseline、人工修改和复用意愿，不能计算真实提效率。结果在 `validation/m8-06-comparison.json`；该比较保留为历史证据，不再作为长期存储路线决定。
- M8-06 JSONL 边界专项已通过：尾行损坏按 `SyntaxError` fail-closed；同进程 20 次并发 append 完整；重载后可按 project/run 重建 latest；typecheck、5/5 persistence tests、19/19 全套等价 Node tests 和 diff check 均通过。证据在 `validation/m8-06-jsonl-failure-results.json`。`pnpm test:all` 仅因 Corepack 用户缓存权限未运行；该结果不覆盖跨进程锁或长时吞吐。
- 长期架构重新评估后已决定 SQLite-first：SQLite 是运行时唯一事实源，JSONL 只用于 portable/demo/export/灾备。详细决策见 `SPEC/08-persistence-architecture-decision.md`。
- M10-01 适配层已完成：`SqliteContextSnapshotStore`、SQLite 默认 factory、WAL/foreign_keys/busy_timeout、`node:sqlite` 兼容驱动和 HTTP `persistence.mode` 回执已落地；runtime 与 Product Builder 不再硬编码 JSONL 默认路径。
- M10-01 验证：全套等价 Node tests 20/20、typecheck 和 diff check 通过；当前 better-sqlite3 二进制与 Node 22 ABI 不匹配，已由 node:sqlite 接管，不再静默失败。
- M10-01 证据已落盘到 `validation/m10-01-sqlite-adapter-results.json`。
- M10-02 已完成：`schema_meta` 记录 schema v1，migration runner 以事务执行并在错误时回滚；`run_events`、`context_snapshots`、`run_segments`、`idempotency_keys` 五类表已创建，二次 inspection 与首次结果一致。证据为 `validation/m10-02-schema-migration-results.json`。
- M10-03 已完成（以 `validation/m10-07-persistence-reconciliation-2026-09-30.json` 为当前校准）：早期 `validation/m10-03-sqlite-runstore-results.json` 仍保留为历史快照；当前 SQLite RunStore 已覆盖全实体 typed CRUD、事务幂等、Product Builder checkpoint、重启回读、回滚、跨进程写、备份恢复和 10k/100k 事件边界。
- M10-05 已完成：Product Builder event log 与 ContextSnapshot 共享 SQLite 连接；checkpoint event、ContextSnapshot、snapshot-created event 和幂等行同事务写入，全部 typed entity round-trip、Project/Skill/BotProfile POST/GET/PATCH、Run create/cancel/retry、entity summary 和 approve persistence 已通过；HTTP preview 第二次调用返回 created=0/skipped=10。证据为 `validation/m10-05-product-builder-persistence-results.json`。
- M10-06 已完成：有限 SQLite open/migration busy retry、三进程并发 writer、SIGKILL 后 reopen、10k/100k 事件规模、既有 rollback/online backup/跨进程证据均通过；全套 29/29、typecheck、diff check 通过。证据为 `validation/m10-06-recovery-scale-results.json`。
- M10-07 已完成文档校准：以专项证据对齐 M2/M10 的当前状态，保留早期验证文件和其当时限制，不改写历史记录。迁移失败注入仍明确列为独立未覆盖项，不影响已验证的运行时 schema/事务/恢复结论。证据为 `validation/m10-07-persistence-reconciliation-2026-09-30.json`。
- M4-08/M5-06/M6-02 本轮收口：批准后 approval route 会显式 reconcile 并只在无阻断时 promote 5 个 Artifact；API 错误统一带 `correlationId` body/header；Bot 创建、复制、停用已接入本地 persistence API 与 Web 管理界面，Computer Use 已验证刷新后的状态回读。全套测试现为 41/41，typecheck、Web Vite build 和 diff check 通过。
- M8-07 真实项目验证已完成窄范围收口：对 `codex-pet-studio` 的非敏感 package 做只读预检和安装 smoke，用户确认 Codex 界面已出现沙悟净；这不证明通用 Product Builder 质量或多 Bot 优势。证据为 `validation/m8-07-reality-card.json` 与 `validation/m8-07-install-smoke.json`。
- M8-08 真实项目验证为 `PARTIAL`：Codex subscription 读取 `personal-knowledge-mcp-mvp` 的三个状态文件并提出安全的 fixture-only 离线 evidence report 增量，但原始输出带前置说明文字，严格单 JSON 门失败；候选项目既有 `npm test` 在一次本机 loopback 权限重试后通过 9/9，`real_data_accessed=false`。证据为 `validation/m8-08-reality-card.json`、`validation/m8-08-real-project-knowledge-mcp.json`。
- M8-09 结构化输出加固已完成：新增 exact/fenced/embedded 单对象解析与多对象拒绝策略，adapter 专项 6/6、typecheck、diff check 通过；对 M8-08 原始 transcript 的离线回放识别为 `embedded` 且 11 个必需键齐全。证据为 `validation/m8-09-structured-output-contract.json`。
- M8-10 Provider receipt 接入已完成：Core 增加 `provider.output-receipt.v1` 契约，Adapter 记录原文 hash、解析模式、提取 hash 或拒绝原因；M8-08 原始 Artifact/结果已离线回填且原文 hash 不变。Core+Adapter 9/9、typecheck、状态校验、JSON 和 diff check 通过。
- M8-11 第三个现实任务已完成窄范围验证：Product Builder 只读当前项目四个状态/架构文件，生成技术路线对象；12/12 必需字段、4/4 白名单来源、receipt 和无副作用门通过，结果为 `PASS`。模型建议与本次任务的 next_action 有重复，因此不能把它升级成“技术路线已被证明正确”。证据为 `validation/m8-11-reality-card.json`、`validation/m8-11-real-project-technical-route.json`。
- M8-12 三次现实任务对照已落盘：`validation/m8-reality-comparison-v1.json` 和对应 Markdown 明确分离执行追踪、内容质量与真人提效证据；当前只能保留“链路可运行”的窄范围结论，不能宣称产品提效或多 Bot 优势。
- M8-13 真人基线卡已冻结：`validation/m8-13-user-baseline-card-v1.md` 固定同一 fixture-only 任务的 ChatGPT→手工整理→Codex 基线与 Agent Workspace 路径，要求记录真实耗时、手工步骤、修改量、返工和再次使用意愿；当前等待用户本人执行。

- 2026-10-03 Context + Codex 恢复验证已完成：用同一个 `CodexExternalAdapter` 分别读取完整账本和经过 hash/事件范围校验的 `ContextPacket`；两条 Run 均完成，12 个关键字段全部恢复。完整状态估算 4,195 tokens，恢复包估算 774 tokens，估算缩减 81.5%。证据：`validation/context-codex-recovery-v1-2026-10-03.{json,md}`。这不测 Codex 内部压缩，也不证明自由聊天全文无损、原生 resume 或真实成本下降。

## 当前卡点

1. 本次依赖安装通过了受控主机网络；普通 Codex 沙箱仍会出现 registry DNS 失败。没有修改 VPN。后续安装应继续使用明确的受控网络命令，不能把网络恢复写成永久环境保证。
2. Electron 旧 appId 的 SIGABRT 已定位为本机旧同名 bundle 的 LaunchServices 身份冲突；新 `com.localagentworkspace.desktop.v1` arm64 DMG 已安装到 Applications，安装版由 Computer Use 读取并进入 Bots 管理；带自定义图标的 DMG 构建和安装后启动通过，签名与 clean-room 验收仍为 PARTIAL。
3. DeepSeek 尚未真实调用；它是可选对比通道，需要用户提供 Key 后才能做真实模型验证。
4. Codex 原生 resume 尚未接通；M8-04 10 题质量证据仍阻断；M8-05 recovery smoke 验证的是控制面 fallback，不是 provider 原生 resume，且没有人工 baseline。
5. 当前工作区和隔离源码副本安装已通过；literal GitHub clone 仍待仓库 remote。
6. M8-04 的长批次在第一次 `--path all` 运行中只完成了 `single_call`，随后外层执行会话结束；按单路径重试后成功，说明下一批必须拆成小批并依赖 JSONL/receipt 恢复，不能把一次长会话当作唯一状态。
7. 2026-09-27 重打包时 `.app` 编译成功，但 `hdiutil create` 因系统 DiskManagement framework 不可用而失败；已有 DMG 保留，不把本次封装失败写成应用代码失败。
8. multi Bot 校验器已修正为严格单 JSON 对象；旧的拼接/前缀输出被拒绝，3 个晚到的受控复测 receipt 以唯一 `receipt_id` 追踪；可解析记录因缺少完整 replay 证据仍为 7/8，不能升格质量证据。
9. Bot 管理和 approval reconcile 的代码闭环已完成，Computer Use Web 回归已通过；Electron 原生窗口已形成窗口级回执，当前仅保留未签名 DMG、安装后和 clean-room 验收缺口。

## 当前唯一下一步

按 `SPEC/11-external-agent-orchestration.md` 等待外部条件变化：Codex 环境探针已确认 `state_5.sqlite` 和 `.codex` 目录不可写，暂不重复真实 smoke；在权限状态变化前保持 Fixture、HTTP/Web 回执路径可用，真实 Provider Tool Loop 留在条件门后，不接 DeepSeek、不开放写工具/full_access。若用户后续提供 DeepSeek Key，再单独开启真实 API one-shot 验证。

## 网络恢复后的下一步

```bash
pnpm run recover
pnpm run validate:state
pnpm install
pnpm --filter @agent-workspace/web build
pnpm package:mac
```

随后按 `IMPLEMENTATION-BACKLOG.md` 的 M8 顺序继续，不重新设计产品。

### 2026-09-27 M10-05 · HTTP persistence routes 收口

- **实现**：Project、Skill、BotProfile typed persistence roundtrip 已通过；新增 `GET /api/persistence/entities` entity summary，并验证 approve route 写入持久化状态。
- **验证**：typecheck、HTTP smoke、全套等价 Node tests `25/25`、`git diff --check` 均通过。
- **边界**：M10-04 与 M10-06 已完成；M8-04 质量证据阻断保持不变。
- **证据**：`validation/m10-05-product-builder-persistence-results.json`。

## 2026-09-27 M10-04 · JSONL import/export 完成

- 实现：`scripts/import-export/cli.mjs` 提供 SQLite workspace 的 export、validate、import/rebuild；格式为 `local-agent-workspace.export.v1`，`schemaVersion=2`，manifest 记录 `payloadSha256`。
- 校验：覆盖 JSON record、表白名单、主键重复、`run_events` sequence 连续、ContextSnapshot 内容 hash、JSON columns；篡改 payload 和非空 target 均 fail-closed。
- 导入：使用单事务写入，失败回滚；目标表非空时拒绝，支持从导出重建并重开回读。
- 证据：专项测试 `2/2`；真实 `data/workspace.db` export→validate→import 共 `54` rows，重开计数 `projects=1,runs=0,events=19,idempotency=0`；详见 `validation/m10-04-jsonl-import-export-results.json`。
- 主任务另行记录：27/27、typecheck、full suite、`git diff --check` 已通过。
- M8-04、Electron、DeepSeek、literal GitHub clone、Codex 原生 resume 限制保持原状。

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
