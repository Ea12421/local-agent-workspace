### 2026-10-03 · Codex CLI 更新至 0.160.0 并复测通过

- 本机 Codex CLI 从 `0.155.1` 更新到官方最新稳定版 `0.160.0`；没有安装项目依赖，没有改 VPN。
- 更新后重新运行 `npm run context:codex`，`full_context` 和 `verified_context_packet` 均完成，12/12 关键字段恢复，`structuralPass=true`。
- 新版本验证证据：`validation/context-codex-recovery-v1-2026-10-03.json`，记录时间为 2026-10-03T14:36:18Z。
- 继续保持边界：结果证明本项目结构化恢复包可被同一 Codex CLI 读取，不把它写成 Codex 内部自动压缩、原生 `resume` 或成本收益证明。

### 2026-10-03 · Codex 原生环境恢复与上下文验证通过

- 在一次受控的系统权限探针中，Codex CLI 0.155.1 能正常启动并返回 `OK`；确认之前的 `Operation not permitted` 来自当前受限执行环境无法写入 Codex 自身状态目录，不是项目代码或模型质量失败。
- 重新运行 `npm run context:codex`：`full_context` 和 `verified_context_packet` 均完成，12/12 个关键字段读回，`structuralPass=true`。
- 完整状态估算 4195 tokens，结构化恢复包 774 tokens，估算缩减 81.5%；恢复包 case 记录 `cached_input_tokens=11008`。
- 证据：`validation/context-codex-recovery-v1-2026-10-03.json/.md`。
- 边界：这证明本项目生成的 ContextSnapshot/ContextPacket 可被同一 Codex CLI 读取；不把它写成 Codex 内部自动压缩、原生 `resume` 或真实成本收益证明。
- `RUN_STATE.json` 已从 `blocked_environment` 更新为 `complete / controlled-command-adapter-v1 / 7/7`。

### 2026-10-03 · 受控命令 HTTP/UI 审批闭环收口

- 将两个固定 profile 接入本地 HTTP/Web：`GET /api/commands`、预览、创建待审批 Run、精确审批解析、取消和只读 replay；不开放任意 Shell、参数追加或后台执行。
- 批准后由同一 `ControlledCommandRuntime` 执行，RunEvent 记录 `approval.requested`、`approval.resolved`、`tool.invoked`、`tool.completed/failed` 和终态；审批仍写入 SQLite `ApprovalRequest`，没有新增迁移。
- Web 新运行对话框新增“受控测试/构建命令”和两个固定命令选择；审批卡显示实际 argv 与声明影响，拒绝/取消不会启动进程。
- 新增 `apps/server/src/controlled-command-http.test.ts`：1/1 通过；全量 `npm run test:all` 103/103、`npm run typecheck`、`npm run build:web`、`git diff --check` 通过。
- 证据：`SPEC/22-controlled-command-adapter-v1-2026-10-03.md`、`validation/controlled-command-adapter-v1-2026-10-03.json/.md`。
- 当前仍保留 Codex/Text app-server `Operation not permitted` 环境阻塞；不重复 `context:codex`，不做 provider/Harness 横向比较。下一步只剩一次真实桌面回归和交付状态校准。

### 2026-10-03 · 受控测试/构建命令适配器模块收口

- 新增 `packages/adapters/src/command-runtime.ts`：首批只登记 `npm run test` 与 `npm run build:web` 两个固定 profile；调用方不能追加参数、替换可执行文件或改变工作目录。
- 运行前强制检查项目根目录、`read_only`、`command` 工具白名单、精确 argv、一次性 `command.run` 审批和授权状态；不开放任意 Shell、`workspace_write` 或 `full_access`。
- 进程使用 `shell:false`，支持 profile 超时、AbortSignal 取消、stdout/stderr 上限、密钥脱敏和同一 `requestId` 幂等回放；每次尝试返回 `controlled-command-receipt.v1`。
- 专项测试 6/6、`npm run typecheck` 通过；通过适配器真实执行 `npm run test`，核心测试 7/7、exitCode=0。`project.build_web` 只做 profile/dry-run 校验，因会生成产物仍需逐次审批。
- 证据：`SPEC/22-controlled-command-adapter-v1-2026-10-03.md`、`validation/controlled-command-adapter-v1-2026-10-03.json/.md`。
- 下一步：接入 HTTP/UI 的 preview → approval → RunEvent/receipt → cancel/replay；Codex/Text app-server 的 `Operation not permitted` 保持独立阻塞，不重复盲试。

### 2026-10-03 · 受控命令桌面回归与阶段收口

- 从当前打包应用 `release/mac-arm64/Local Agent Workspace.app` 通过 Computer Use 选择“受控测试/构建命令（逐次审批）”与 `project.test`（`npm run test`）。
- 审批前界面显示实际命令、声明影响 `read_workspace` 和“仅对本次 Run 生效”；点击“确认并继续”后，运行记录回读 `用户确认继续 → run.resumed → controlled-command · run · recorded → tool · operation · succeeded → 运行完成`。
- 切到“运行记录”并点击“刷新”后，事件链仍可回读；技术详情显示本地 `npm profile`、`api_key`、确定性延迟。未把本次回归写成模型质量或上下文压缩证明。
- 验证账本更新为 `PASS_INTEGRATED_DESKTOP`：`validation/controlled-command-adapter-v1-2026-10-03.json/.md`；`RUN_STATE.json` 与 `HANDOFF.md` 已把本阶段标为 7/7 收口。
- Codex/Text app-server `Operation not permitted` 仍是独立环境阻塞；不重复 `context:codex`，不做 provider/Harness 横向比较。

# Local Agent Workspace 开发日志

### 2026-10-03 · 收口复测与环境阻塞更新

- 按唯一下一步再次运行 `npm run context:codex`；`full_context` 和 `verified_context_packet` 仍在 Codex CLI 0.155.1 的 in-process app-server 初始化阶段收到 `Operation not permitted`，没有新增恢复质量结论。
- 系统已解锁，但 4310 仍由旧目录包进程提供；新 `release/mac-arm64` 包已构建，LaunchServices 打开返回 `kLSNoExecutableErr (-10827)`，隔离 CUA 启动超时，因此没有把旧界面当成新 UI 验收。
- 未安装 npm 包、未改 VPN、未引入 provider 对比；`RUN_STATE.json`、RSI 验证 JSON/Markdown 和 `SPEC/21` 保持 `blocked_environment` 与准确下一步。

### 2026-10-03 · 同一 Codex/Text 上下文恢复复测

- 按用户决定只用同一 Codex/Text 执行器跑 `full_context` 与 `verified_context_packet`，没有做 provider 或 Harness 横向比较。
- 当前 CLI `0.155.1` 两个 case 都在模型开始前失败：`failed to initialize in-process app-server client: Operation not permitted`；没有生成恢复质量结论，也没有把失败归因于模型或压缩算法。
- `scripts/context-codex-validation.ts` 已改为先落盘失败回执，状态为 `blocked_environment`，不会因断言提前丢失证据。证据：`validation/context-codex-recovery-v1-2026-10-03.json/.md`。
- 保留 2026-10-02 的成功证据作为历史记录；本次当前环境复测不能覆盖它，也不能把旧结果当成当前已复现。
- 唯一下一步：环境解除后重跑这条固定脚本；仍不做 DeepSeek/OpenRouter/GPT-4o 或不同 Harness 对比。

### 2026-10-03 · RSI 服务端与 Web 最小闭环

- 修复 RSI SQLite 回放测试的重复关闭清理问题；现在覆盖低风险 prompt 候选的 Run → proposal → evaluation → publish → rollback、重复提交幂等和重启回读。
- 新增 `apps/server/src/improvement-http.test.ts`：HTTP 层验证项目隔离、重复提交、发布、回滚和高风险 provider 审批阻断；专项 RSI/core/HTTP 共 6/6 通过。
- Web 增加“受控自动更新”卡片：用户可启动一次固定结构检查，看到候选版本、检查结果、发布状态并回滚；高风险候选没有普通用户按钮。
- 验证：`npm run typecheck`、`npm run build:web`、RSI/core/HTTP 专项测试均通过；当前仍未把控制面检查写成真实模型质量、Codex 原生压缩或成本收益证明。
- 下一步：做全套相关回归、Computer Use 用户视角检查并落盘证据，然后收口本阶段。

### 2026-10-03 · R1 固定任务质量门

- 新增 `validation/fixed-task-quality-tasks-v1.json`、`scripts/fixed-task-quality-gate.mjs` 和专项测试；检查真实 Provider、只读工具、目标路径、事件链、越权拒绝、Artifact 和结构化栏目。
- 在受控本地服务会话中执行 3 条 DeepSeek 只读任务：`READ-01`、`READ-02` 成功并生成 Artifact；`BOUNDARY-01` 访问 `../outside.txt`，返回 422，留下 `tool.failed`/`run.failed`，没有 Artifact。
- 结果：机械硬约束 3/3；`qualityEligibleCount=0`。本批观察到 Provider 实际模型 `deepseek-flash` 和 provider 报告的缓存输入 token；这不升级为质量/成本结论。
- 验证：`npm run test:all` 75/75、`npm run typecheck`、`npm run quality:fixed`、`npm run validate:state`、`git diff --check` 均通过。
- 下一步：失败/取消/重试/恢复专项；保持只读，不扩大到默认写入、Shell 或多 Bot 质量宣称。

### 2026-10-03 · R2 失败、取消与恢复门

- **结果**：新增 `validation/failure-recovery-gate-v1.json`，把现有 75/75 工程测试按失败、越权、审批、取消、重试幂等、ContextSnapshot 和 SQLite 重启回读分组。
- **通过项**：HTTP/JSON provider 错误显式失败；schema/工具失败无 Artifact；路径越权留下 `tool_path_traversal`；重复 callId 不重复副作用；审批拒绝不执行写入；同一 Run 重试和新 segment 恢复可回放；取消竞态不会补写成功；HTTP retry 幂等。
- **边界**：这是控制面契约门，不是 DeepSeek 真实 429/长时 soak、Codex 原生 resume、断电恢复或模型质量证明。
- **下一步**：Provider 互换边界，检查三类 Provider 的身份与能力语义是否一致。

### 2026-10-02 · DeepSeek 真实只读 Tool Loop

- 新增 `DeepSeekToolLoopProvider` 和 `deepseek-tool-loop` Web/API 入口；服务端只从进程环境读取 Key，不写入项目，不读取 Keychain/Cookie/Token 文件。
- 只开放 `filesystem.read` + `read_only`；内部的 `filesystem.read` 在 DeepSeek 请求中映射为合法的 `filesystem_read` 函数名，返回后再映射回领域契约；写入、删除、Shell、外发没有入口。
- 修复 Tool Loop assistant 消息的 provider replay 字段，离线测试覆盖 `reasoning_content`、tool call 和 tool result 的下一轮回传。
- 真实回归读取 `fixtures/demo-project.json`，通过 `provider.event → tool.invoked → tool.completed → provider.event → artifact.created → run.succeeded`；请求 `deepseek-chat` 实际返回 `deepseek-flash`，两段 prompt cache 均为 miss。
- 真实回归没有观察到 `reasoning_content`，所以只把字段缺失时的闭环记为通过；thinking-model 的真实 reasoning 回放仍未验证。
- 验证：typecheck、Tool Loop/adapter 专项测试通过；真实证据为 `validation/deepseek-tool-loop-v1-2026-10-02.json`。
- 边界：这只证明一次真实只读闭环，不证明模型质量、成本收益、长期缓存命中或跨进程恢复。

### 2026-10-02 · 本地只读 Tool Loop Web/API 入口

- 新增 `tool-loop-local`：Fixture 模型只负责提出读取请求，`LocalToolRuntime` 在当前项目工作区真实读取文件，之后继续模型回合并生成 Artifact。
- RunEvent 顺序固定为 `provider.event → tool.invoked → tool.completed → provider.event → artifact.created → run.succeeded`；项目外路径通过同一条 loop 返回 `tool_path_traversal`，不生成产物。
- Web 新建运行入口已明确标注“真实读取 + Fixture 决策”，避免把控制面证据写成真实模型质量。
- 执行回执改为显示“Fixture 决策 + 真实工具”和“真实文件读取，模型质量未验证”，把两种证据边界直接呈现给使用者。
- 验证：typecheck、全套测试 73/73、Web build、HTTP 正常/越权回归、Computer Use 和 state validation 通过。证据：`validation/local-tool-loop-web-v1-2026-10-02.json`。
- 边界：真实 DeepSeek/Codex Tool Loop、Git 作为 loop 工具、签名 DMG 和真人提效仍未验证。

### 2026-10-02 · DeepSeek 真实 one-shot smoke

- 通过一次最小直连请求和一次项目 `DeepSeekApiAdapter` 请求，确认真实 DeepSeek API 返回 HTTP 200、结构化 JSON 和 usage。
- Provider envelope 保留 `prompt_cache_hit_tokens=0`、`prompt_cache_miss_tokens`；本地 cache receipt 仍是 `unknown`，没有把本地 hash 当成命中。
- 请求使用 `deepseek-chat` 标签时，响应 `model` 返回 `deepseek-flash`；该路由事实已记录，不能按请求标签猜测实际模型。
- 本次没有写入或打印 Key，没有上传项目文件，也没有修改 VPN。证据：`validation/deepseek-one-shot-smoke-v1-2026-10-02.json`。
- 边界：这只证明真实 one-shot 连通性和适配器解析，不证明 Tool Loop、模型质量、缓存收益或现实提效。

### 2026-09-30 · M3-07f stable prompt prefix hash

- Provider request builder 对 `opportunistic/required` cache policy 计算稳定前缀 SHA-256，仅包含 system messages、constraints、output schema 和工具定义；objective 变化不会改变前缀 hash。
- `disabled` 请求不写 hash；Provider 没有回报时仍显示 `unknown`，不把本地 hash 冒充 cache hit、cache write 或节省成本。
- 验证：适配器专项 24/24、全套测试 70/70、typecheck、state validation、diff check 通过。

### 2026-09-30 · M3-07d explicit local Tool Loop bridge

- `runToolLoop` 增加 `toolRuntimeMode`，默认保持 `fixture`；只有显式选择 `local` 才会把 ToolExecutionRequest 交给 `LocalToolRuntime`。
- 新增只读回归：Fixture Provider 请求读取当前工作区 `fixtures/demo-project.json`，事件顺序为 `provider.event → tool.invoked → tool.completed → provider.event → artifact.created`，结果包含真实文件内容、相对路径和 `mode=local`。
- 没有开放 Web 入口、workspace_write、删除、任意 Shell 或 full_access；Provider 仍为 Fixture，不能写成真实模型质量证据。
- 验证：tool-loop 8/8、全套测试 69/69、typecheck、state validation、diff check 通过；证据 `validation/m3-07d-local-tool-loop-2026-09-30.json`。

### 2026-09-30 · M3-03 DeepSeek response envelope replay

- 新增 `normalizeDeepSeekChatResponse`，把 DeepSeek/OpenAI-compatible chat 回执归一化为 `ProviderResponseEnvelope`；`reasoning_content` 与原始 tool payload 保留在 `providerFields`，usage 的 snake_case 字段统一映射，prompt cache 未报告仍为 `unknown`。
- tool arguments 不是 JSON object 时显式返回 `provider_tool_arguments_invalid`，不会静默进入工具循环；DeepSeek adapter 事件附带 envelope，但仍保持 one-shot、无 streaming/tool loop/resume 的能力声明。
- 验证：适配器相关专项 23/23、typecheck、diff check 通过。证据：`validation/m3-03-deepseek-envelope-replay-2026-09-30.json`。
- 边界：没有读取或使用 API key；离线回放不等于真实 DeepSeek API、成本/cache 或业务质量验证。

### 2026-09-30 · Electron 目录包回归

- `npm run build:desktop` 与 `npx electron-builder --config apps/desktop/electron-builder.yml --mac --dir` 重新打包 `/Users/m4air/Work Agent开发。/release/mac-arm64/Local Agent Workspace.app`；Computer Use 退出旧进程后重新打开，看到本地服务正常、工作台概览、当前运行、安全范围、Provider、Bots 和产物列表。
- 首屏继续显示只读边界，不会把底层 workspace_write 能力误标成当前 Product Builder 默认权限。
- 验证：`pnpm test:all` 66/66、`npm run typecheck`、`npm run validate:state`、`git diff --check` 和 `pnpm run demo` 通过。完整用户视角证据追加到 `validation/m4-04-user-surface-audit-2026-09-30.json`。
- Clean-room 临时副本随后做了一次联网依赖安装尝试；`registry.npmjs.org` DNS 返回 `ENOTFOUND`，因此只记录为外部网络阻塞，不改 VPN、不重复重试。证据为 `validation/m8-01-clean-room-offline-attempt-2026-09-30.json`。

### 2026-09-30 · M3-06 ToolRuntime operation guard

- `FixtureToolRuntime` 和 `LocalToolRuntime` 现在先校验 tool/operation 配对；`filesystem+shell`、`shell+read` 等 malformed 请求以 `tool_operation_mismatch` 失败，不会进入策略绕过或执行路径。
- 既有路径穿越、symlink、只读权限、精确 argv 白名单、secret 脱敏和幂等 receipt 继续生效；本单元没有开放写入、删除、任意 Shell 或 `full_access`。
- 验证：适配器专项 15/15、`npm run typecheck`、`git diff --check` 通过。证据：`validation/m3-06-tool-operation-guard-2026-09-30.json`。

### 2026-09-30 · M3-06 workspace_write 最小纵向单元

- `LocalToolRuntime` 增加当前项目目录内的受控 UTF-8 文件写入：相对路径/符号链接隔离、256 KB 上限、同目录临时文件 + fsync + 原子 rename、requestId 幂等。
- 新文件遵守 `workspace_write` policy；覆盖已有文件视为潜在破坏性动作，始终要求逐次 `approvalGranted=true`。receipt 只记录路径、字节数和内容 hash，不回显正文。
- Tool Loop 现在把内容和 approval 状态传到 runtime；`tool.invoked` 审计事件只保存正文 hash/字节数，不把写入内容落进 SQLite。专项适配器 16/16、Tool Loop 7/7、`npm run typecheck`、全套 `pnpm test:all` 66/66 通过。证据：`validation/m3-06-local-workspace-write-2026-09-30.json`。
- 边界：不开放删除、项目外路径、任意 Shell、`full_access` 或真实 Provider Tool Loop。

### 2026-09-30 · M4-04 用户视角界面审计

- **修正**：概览统一使用 Product Builder 的 active Run；Artifact 当前 Run 优先并标记本次运行/历史运行；技术 ID、工作区路径和 Provider 细节默认折叠。
- **体验**：Fixture 改为“本地演示”，明确不代表真实模型效果；安全范围和 Bot 有效权限统一为只读；项目创建、设置、搜索、时间筛选、视图切换在未接入时置灰并标明后续开放。
- **Computer Use**：重建并重开 `/Users/m4air/Work Agent开发。/release/mac-arm64/Local Agent Workspace.app`，检查概览、Bots、项目产物三页。当前 Run 的 5 个产物排在历史记录前，历史草稿没有删除。
- **验证**：`npm run typecheck`、`pnpm exec vite build apps/web --config apps/web/vite.config.ts`、`pnpm test:all` 63/63、Electron directory build、`node scripts/validate-state.mjs`、`git diff --check` 通过。证据：`validation/m4-04-user-surface-audit-2026-09-30.json`。
- **边界**：仍是 Fixture/本地控制面验证，不证明真实模型质量、DeepSeek、成本缓存或多 Bot 价值。

本文件记录已经发生的工程事实；下一步以 `RUN_STATE.json` 为唯一机器状态源，不从聊天记录猜测恢复位置。

### 2026-09-30 M10-07 · SQLite/M2 持久化状态校准

- **校准**：对照当前 `apps/server/src/persistence.ts`、持久化专项测试和 M10-01 至 M10-06 证据，确认 M2-01/M2-02/M2-04 与 M10-01 至 M10-06 当前均可按 DONE 处理。早期 `validation/m10-03-sqlite-runstore-results.json` 等文件保留其当时的 PARTIAL/TODO 快照，不改写历史。
- **覆盖**：当前证据包含 SQLite schema/EventLog、全实体 typed CRUD、事务幂等、Product Builder checkpoint、SIGKILL 重启恢复、跨进程写、备份恢复及 10k/100k 事件边界；专项汇总见 `validation/m10-07-persistence-reconciliation-2026-09-30.json`。
- **边界**：迁移失败注入未纳入本次补充，仍作为独立缺口；该缺口不推翻已验证的运行时 schema、事务和恢复结论，也不等于真实 Provider 质量、DeepSeek、Codex native resume 或现实提效已验证。

### 2026-09-30 · M4-03 Approval → Artifact release 与 Electron 重启验收

- **修正**：`POST /api/runs/:runId/approvals/:approvalId/resolve` 在精确审批后显式调用 `reconcileProductBuilderRelease`，返回 `artifactRelease` 和 `finalArtifactIds`；release reconcile 同时同步 approval/release 计划步骤，避免阻断已清空但 UI 仍显示“阻塞”。Fixture Web 运行生成独立 Run ID，避免新运行覆盖固定演示投影。
- **Computer Use**：重建并打开 `/Users/m4air/Work Agent开发。/release/mac-arm64/Local Agent Workspace.app`，创建 Run `run-fixture-1790710745587-b1y2vt`；确认“独立开发者”和“每日内容规划中制作 AI 视频”，再点击“确认并继续”。UI 显示 clarification/approval 阻断清除、计划步骤可执行；当前 Run 的 5 个 Artifact 为“最终产物”，旧 `run-fixture-001` 的 5 个草稿不受影响。
- **重启回读**：退出并重开同一 Electron 目录包后，Run、审批已完成、计划中的 release 可执行和最近执行 receipt 仍能回读。
- **验证**：专项 9/9；`pnpm test:all` 63/63；`npm run typecheck`、`pnpm --filter @agent-workspace/web build`、`pnpm run build:desktop && npx electron-builder --config apps/desktop/electron-builder.yml --mac --dir`、`node scripts/validate-state.mjs`、`git diff --check` 通过。证据：`validation/m4-03-approval-release-2026-09-30.json`。
- **边界**：这是 Fixture 控制面/SQLite/UI 验收，不是真实模型质量；没有读取或写入 `~/.codex`，没有接 DeepSeek，没有开放写工具或 `full_access`。

### 2026-09-30 · M4-01 Web/Electron 回读

- `WorkspaceSnapshot.productBuilder` 从 SQLite release state 读取 Clarification/Planner 投影；首页新增 Clarify / Planner 卡片，显示 provided/unknown、固定步骤状态和 release blockers。
- `pnpm run build:desktop` 与 Electron `--dir` arm64 目录包通过；Computer Use 重新打开 `127.0.0.1:50472`，看到了新卡片和 `clarification_pending、approval_pending`。
- 可见性证据已写入 `validation/m4-01-clarify-planner-2026-09-30.json`；Fixture 只证明控制面和回读，不升级为真实 Provider 质量结论。

### 2026-09-30 · M4-01 Product Builder Clarify/Planner 契约

- 新增 `clarifications`：目标用户、主要场景、成功指标和外部证据分别记录 provided/unknown、阻塞性和来源引用。
- 新增固定 `plan`：clarify → research → product → architecture → evaluation → approval → release，缺少目标用户或场景时下游步骤为 blocked，并追加 `clarification_pending`。
- 空 idea 在创建 Source 前拒绝；未知项不会写成 Source，Context Snapshot 会记录待确认项。
- 通过 workflow、continuity、HTTP smoke 专项测试；没有接入新的 Provider、写工具权限或 DeepSeek。

### 2026-09-30 · M3-07e Codex 执行环境能力探针

- 新增 `GET /api/provider/codex-diagnostics`，只读检查 Codex CLI 版本、公开 `exec --json`/`resume`/`app-server` 入口，以及 `~/.codex/state_5.sqlite` 和 `.codex` 目录的写权限元数据。
- `pnpm run diagnose` 已同步输出 `codexEnvironment`，所以 clean-room 或用户本地诊断不必打开数据库内容就能看到是否为 `blocked_environment`。
- 当前实测 `codex-cli 0.155.1` 和公开入口存在，但文件和目录均不可写，状态为 `blocked_environment`；证据为 `validation/m3-07e-codex-environment-diagnostic-2026-09-30.json`。
- Web Codex 探针将环境阻塞与命令不可用分开显示。没有读取状态库内容、凭据、Cookie，也没有修改 VPN、DNS、代理或防火墙；没有重复真实 smoke。
- 验证：HTTP smoke 2/2、`npm run typecheck`、Web build、`git diff --check` 通过。

### 2026-09-30 · M3-07d Provider model receipt HTTP/Web 可见回读

- HTTP `GET /api/core/runs/:runId` 增加 `modelReceipt`/`modelReceipts` 归一化摘要；`GET /api/persistence/entities` 同步提供 `modelReceipts`。摘要包含 Provider identity、request/raw response hash 引用、camelCase usage、prompt cache 状态、错误、Provider 字段和事件回放引用，不返回原始模型输出。
- Web `WorkspaceSnapshot`、最近执行卡、Provider 卡和 Run 详情已显示模型回执。提示词缓存在 `providerReported=false` 时明确显示“未报告（未知）”；执行桥 receipt 与模型 response receipt 分开，避免把 Codex CLI 执行状态当成模型用量或 ToolCall。
- 新增 HTTP smoke：写入一个受控 model receipt 后，通过 `/api/core/runs/:id` 验证 usage、cache unknown、raw hash 和 replay ref 可回读。
- 验证：HTTP/runtime/persistence 专项 17/17；全套 `pnpm test:all` 58/58；`npm run typecheck`、`pnpm --filter @agent-workspace/web build`、`node scripts/validate-state.mjs`、`git diff --check` 均通过。
- 边界：真实 Codex 当前 smoke 仍被 Codex 自身 `state_5.sqlite` 权限阻塞；本单元没有重复重试该错误，没有接 DeepSeek、真实 Provider Tool Loop、写工具或 `full_access`。

### 2026-09-30 · 外部开发 Agent 协作协议冻结

- 用户确认采用“总控 + 按需专门角色 + 确定性质量门”的混合式外部协作方式。
- 新增 `SPEC/11-external-agent-orchestration.md`，冻结 `orchestrator`、`architecture`、`runtime-provider`、`security-tool`、`persistence-recovery`、唯一 `implementer`、`qa-evidence` 和 `release-ops` 的职责、权限、触发条件、交接格式、写入边界、冲突裁决、review 预算、限额/上下文恢复和用户可读报告要求。
- 这套协议约束开发过程，不等同于产品运行时的 Bot 角色；`SPEC/10-agent-role-map-and-lifecycle.md` 继续描述产品内部 Bot/Workflow 的候选生命周期。
- 当前不是同时启动所有角色。下一工程单元按依赖分批：架构/契约与 Runtime/Provider → Persistence/Recovery 与 Security/Tool → QA/Evidence → 唯一实现者收口。没有把多 Agent 数量写成质量证明。
- `SPEC/IMPLEMENTATION-BACKLOG.md` 新增 M0-05，`RUN_STATE.json`、`SPEC/PROGRESS.md` 和 `HANDOFF.md` 已把该协议作为下一阶段恢复入口。

### 2026-09-30 M3-07d · Fixture-first ProviderResponseEnvelope 与 Tool Loop 纵切片

- Core 增加 `ProviderResponseEnvelope.rawResponseRef`、`finishReason` 和 `error`；新增 `packages/adapters/src/provider-envelope.ts`，把 provider-specific raw payload 归一化为稳定 hash、usage、prompt cache unknown 和结构化 ToolCall。未知缓存不会被当成命中或不支持。
- 新增 `apps/server/src/tool-loop.ts`：控制面显式负责 schema 校验、工具白名单映射、callId 幂等、逐次审批、FixtureToolRuntime 执行、工具结果消息、下一模型段、Artifact 和最大循环保护；Provider 只负责提出响应。
- `POST /api/runs` 新增 `provider=tool-loop-fixture` 入口；ApprovalRequest 和 ProviderResponseEnvelope 在非测试运行时可写入 SQLite entity store，测试环境仍使用内存隔离。
- 专项验证通过：Provider envelope 2/2，Tool Loop 6/6，HTTP smoke 2/2；全套 `pnpm test:all` 54/54、typecheck、`validate-state` 和 `git diff --check` 通过。
- 失败/边界证据：schema 错误在进入 ToolRuntime 前终止且不生成 Artifact；审批拒绝不调用工具；重复 callId 只产生一次 `tool.invoked`；工具路径越权、循环上限和 provider 中断均留下可诊断事件。尝试直接监听本机 127.0.0.1 端口时被当前受限执行环境返回 `EPERM`，因此只把 HTTP handler smoke 作为证据，不宣称端口监听成功。
- 当前仍未完成：真实 Provider 消费 `ProviderResponseEnvelope` 的 tool loop、Web 审批后恢复、DeepSeek API 真实调用、真实 usage/cache/cost 和业务质量/真人提效验证。

## 2026-09-28 M4-08 · Product Builder release state persistence

- **实现**：`ProductBuilderResult` 显式返回 `releaseBlockers`；Handoff depth/cycle guard 与 Source/Handoff/Artifact Conflict Check 的结果进入 `product-builder.release-state.v1`。
- **持久化**：每个 Product Builder checkpoint event 携带 release state；新增 `product_builder.state_checkpoint` 类型用于旧 checkpoint 的一次性 `legacy_backfill`。SQLite 与 JSONL 回放都保留 `artifactRelease`、`finalArtifactIds`、冲突、handoff 校验和阻断原因。
- **API**：`GET /api/core/runs/:runId` 和 `/api/persistence/entities` 可读回 Product Builder 状态；preview 优先返回按 Run 持久化的 Artifact，避免重放时暴露新随机 ID。
- **验证**：Product Builder/continuity/HTTP 专项 9/9；全套测试 36/36；typecheck、state validation、`git diff --check` 均通过。
- **边界**：批准 approval 不会自动宣称 release；最终 Artifact promotion/reconcile 仍是下一阶段工作。M8-04 人工编辑、真人提效和 DeepSeek 仍未验证。

## 2026-09-28 M5/M6 · Artifact/Source preview

- **实现**：新增 `GET /api/persistence/artifacts/:id` 与 `GET /api/persistence/sources/:id`；Artifact 详情返回正文、来源引用、`draft/final` 状态和 release state。
- **Web**：Artifacts 页面支持点击行打开正文预览，并展示 Run、类型、草稿阻断原因和来源引用；Fixture fallback 也提供离线预览。
- **验证**：后端 HTTP/continuity 专项 5/5、typecheck 通过；从 `apps/web` 目录运行本地 Vite production build 通过。根目录直接调用 Vite 找不到入口、`pnpm` 触发 Corepack 用户缓存权限错误，均已改用项目正确入口验证。
- **人工验收边界**：Computer Use 能读到本地工作台页面，但本轮点击没有形成可靠 AX 状态变化；不把 UI 点击体验写成 PASS。

## 2026-09-26

### 网络与依赖

- 普通 Codex 沙箱访问 `registry.npmjs.org` 返回 DNS `ENOTFOUND`。
- 受控主机网络访问同一 registry 返回 HTTP 200，`npm view pnpm version` 成功。
- 没有修改 VPN、DNS、代理或防火墙。
- Corepack 下载并启用项目锁定的 `pnpm@9.15.0`。
- `pnpm install` 成功，生成 `pnpm-lock.yaml`，安装 440 个工作区包。
- 项目初始化命令是 `pnpm run setup`；不要使用 pnpm 自带的 `pnpm setup`，后者会尝试修改用户 shell 配置。

### 构建与 Computer Use

- `pnpm run typecheck`：server/packages、Web、Desktop 类型检查通过。
- `pnpm test:all`：10 tests passed。
- `pnpm --filter @agent-workspace/web build`：Vite production build 通过。
- 移除 Google Fonts 运行时导入，Web 只使用本机系统字体回退。
- `pnpm package:mac`：生成 `release/Local Agent Workspace-0.1.0-arm64.dmg`。
- DMG 当前未签名，因为机器没有 Developer ID；这不是构建失败。
- Firefox Computer Use 已打开 `http://localhost:5173/`，看到本地服务、项目、Run 时间线、审批卡、Bots 和 Fixture Provider；点击审批后出现“已确认，Architecture Bot 将继续工作”。
- Electron 打包进程被系统登记为运行中，但 Computer Use 绑定其窗口连续超时，因此桌面窗口可见性保持 PARTIAL，不写成完整验收通过。

### Codex 执行桥

- Codex CLI `0.155.1` 订阅登录态已经完成真实只读 Product Builder Run，receipt 在 `evidence/receipts/codex-product-builder-run-2026-09-26.json`。
- 新增控制面取消逻辑：先设置取消意图、终止子进程，再 append `run.cancelled`；覆盖“句柄尚未登记”的启动竞态。
- 适配器和控制面取消专项测试通过，结果包含在 10 个测试中。
- Codex `resume` 仍未接通；当前恢复策略是保留 Run/Event/receipt，下一次从 saved RunRequest 重启。

### Clean-room 与验证题集

- 在 `/private/tmp/local-agent-workspace-clean-room-20260926` 建立隔离源码副本，从零执行 `pnpm install`、`pnpm run setup`、`pnpm test:all`，10 tests passed。
- 当前目录没有 Git remote，因此这是 clean-room 源码复现，不冒充 literal GitHub clone。
- M8-04 10 题固定任务、统一记录字段和 single_call/single_bot/multi_bot 判定规则已冻结：
  - `validation/m8-04-tasks.json`
  - `validation/README.md`
  - `validation/m8-04-results.jsonl`
- Fixture 只证明契约、事件、回放和审批边界，不计入模型质量结论。

## 2026-09-27

### M8-07 codex-pet-studio 真实项目验证

- 用户明确授权使用本机项目进行真实测试后，选择 `codex-pet-studio` 作为首个非敏感候选；Codex subscription 以 read-only 读取项目状态，生成安装前产品化计划，结构化追踪门通过。
- 使用 bundled Pillow 12.3.0 对真实 `outputs/package/sha-wujing/` 做不写入 dry-run：WebP、`1536×1872`、57 个有效格、15 个透明格、alpha 仅 `0/255`、16 色和目标写入为 false 全部通过。
- 落盘：`validation/m8-07-real-project-codex-pet.json`、`validation/m8-07-real-project-codex-pet-artifact.json`、`validation/m8-07-codex-pet-dry-run.json`、`validation/m8-07-codex-pet-install-candidate.json`、`validation/m8-07-reality-card.json`。
- 结论是窄范围 `PASS / Real-input Ready`：Product Builder 能把真实项目状态推进为可审查的安装候选计划和只读预检。Codex 实际加载、用户接受和安装仍未知；项目规则要求安装前再次确认，因此当前状态为 `blocked_user`。
- 用户随后明确授权安装；安装 smoke 新增 `~/.codex/pets/sha-wujing`，前后 manifest 与逐文件 hash 校验通过，既有 `angelina-mellow-wish` 未改动。Computer Use 尝试读取 Codex app 被平台安全策略拒绝，因此安装文件 PASS 与 Codex 加载 PASS 分开记录，当前转为 `blocked_environment`。
- 用户随后确认 Codex 界面已出现沙悟净；M8-07 安装 smoke 现在收口为 `PASS_INSTALLED_AND_USER_CONFIRMED`。Computer Use 的限制仍保留为工具事实，但不再阻断用户可见加载证据。下一步切入 `personal-knowledge-mcp-mvp`，验证更接近 Agent 产品的数据边界与产品推进能力。

### M8-04 质量证据审计

- 新增 `scripts/m804-evidence-audit.mjs`：按 `receipt_id` 读取并核对已有 36 条 provider receipt，生成 36 个不可覆盖派生 artifact，再从 artifact 回读后做严格 JSON 解析和回放 hash。
- 审计结果：36 条 source receipt 对应成功，27 条 artifact 可严格解析和回放，9 条因前缀、拼接或 provider 不完整被拒绝；所有记录继续保持 `quality_eligible=false`。
- 36 条记录都缺人工编辑统计、独立 reviewer rubric 和 usage/cost，因此这些字段写为明确阻断原因，不用派生 artifact 冒充人工质量证据。结果见 `validation/m8-04-quality-evidence-audit.json`。
- 专项审计测试通过；typecheck 和 `git diff --check` 通过。下一步是补录真实人工评审与真人三任务门，仍不把多 Bot 设为默认。
- 10 份既有 `m8-04-manual-review-*.json` 保留原始审计前结论，并补充 `historical_pre_quality_audit` 与当前审计账本引用，避免把历史的 artifact/replay 缺口和当前补证状态混为一谈。

### M8-04 首个真实试跑

- 使用已核验的本机 Codex CLI subscription execution bridge 执行固定任务 PB-01 的三条路径：`single_call`、`single_bot`、`multi_bot`。
- `multi_bot` 按 Research → Product → Architecture → Evaluation 执行 4 个阶段，产生 20 条 provider 事件和 4 个结构化交接记录。
- 第一次 `--path all` 长批次只完成 `single_call`，外层执行会话随后结束；将 `single_bot` 和 `multi_bot` 单独重试后各有成功记录。这个结果说明 JSONL/receipt 必须作为恢复依据，不能依赖长会话连续性。
- `pnpm run m804:validate` 已校验 5 条真实记录：`single_call` 7/8 硬约束，`single_bot` 两次均 8/8，`multi_bot` 两次均 8/8；0 条记录进入质量证据，因为人工复核和真人使用证据尚未完成。
- 当前下一步：人工复核 PB-01，然后按每批最多 3 条 provider 路径执行剩余 9 题；每批后 checkpoint 和校验。不要把这次试跑写成多 Bot 已被证明优于单 Bot。

### M8-04 输出契约修正与受控复测

- 复核发现旧 `multi_bot` receipt 把四个阶段 JSON 拼接进 `output_excerpt`；原校验器只取最后一个对象，存在误判风险。
- 最小修正已落盘：`scripts/m804-pilot.ts` 只把 Evaluation 最终阶段作为 Artifact，四阶段仍保留在 `attempts` 和 `structured_handoffs`；`scripts/validate-m804.ts` 现在只接受完整文本中的单个 JSON 对象。
- 修正后的校验把旧两个 `multi_bot` 拼接记录标为 `output_json_found=false`，没有隐藏或删除历史证据。
- 普通沙箱重试因 Codex CLI 状态库不可写产生一条 `provider_incomplete`；随后受控只读会话晚到写入 3 条 multi Bot receipt，其中可解析记录为 7/8，带前缀或拼接的记录被严格校验拒绝。
- 当前 PB-01 共 9 条真实 provider 记录（8 条完成、1 条不完整），全部 `quality_eligible=false`。重复的数字 `attempt=4` 由并发外层会话造成，唯一审计键是 `receipt_id`；下一步仍是人工复核与回放证据，不把 7/8 或执行耗时写成多 Bot 优势。
- 人工复核已落盘到 `validation/m8-04-manual-review-PB-01.json`：同一输入和 provider 可比，但 usage/cost、Artifact id/valid、replay hash、人工编辑统计和 reviewer rubric 缺失，因此质量证据仍阻断。

### DMG 重打包边界

- 为让桌面入口与最新代码保持一致，重新执行了 `pnpm package:mac`。
- `build:desktop`、Electron native dependency rebuild 和 `.app` 编译均成功；生成 DMG 时 `hdiutil create` 失败，直接复现错误为 `create failed - 设备未配置`，`diskutil` 同时报告 DiskManagement framework 不可用。
- 这不是代码、依赖、VPN 或项目网络错误；已有 `release/Local Agent Workspace-0.1.0-arm64.dmg` 仍保留，早前打包成功证据继续有效。本次不再重复同一系统失败，新的桌面封装验证留待具备可用 DiskManagement 的 macOS 环境。

## 当前恢复入口

1. 读取 `RUN_STATE.json`。
2. 读取本文件和 `evidence/receipts/build-and-ui-validation-2026-09-26.json`。
3. 当前下一步是复核 PB-01 并分批执行 M8-04 剩余 9 题；不要重复安装，也不要重做已经通过的 Web/DMG 验证。

## 2026-09-27 Context Continuity 与 Git checkpoint

- 用户明确授权继续推进、后置 DeepSeek，并要求单个逻辑 Run 能跨模型限额、上下文压缩和外层会话中断恢复；因此新增 M9 Context Continuity，不把聊天连续性当作事实源。
- 本地 Git 已建立 `main` 基线并提交 `2da7256`、`cd73718`；没有配置 remote，也没有 push。
- `packages/core/src/context.ts` 实现不可变 `ContextSnapshot`、结构化摘要、事件范围、tail、content hash 和恢复 Packet；原始 RunEvent 不删除。
- `apps/server/src/persistence.ts` 新增 `JsonlContextSnapshotStore`：append-only、重复 snapshot id 拒绝、重启读取、按 project/run 隔离 latest。
- M9-02 验证结果：`pnpm test:all` 14/14、`pnpm run typecheck` 通过；随后继续实现 M9-03。DeepSeek 和 M8-04 质量证据不受本次测试结果替代。
- M9-03 已完成：`executeCodexRun` 在 provider 未完成或抛错时保持同一 `runId`，追加 `run.segment_*`、`context.snapshot_created` 和 `run.resume_requested`，把经过 hash/事件范围校验的 `ContextPacket` 传入下一段；测试适配器证明第一段失败、第二段成功的恢复链。
- M9-03 验证结果：`pnpm test:all` 15/15、`pnpm run typecheck` 通过。该结果证明恢复契约和事件链，不证明真实 Codex/DeepSeek 在所有限额场景都能原生 resume。
- M9-04 已完成：Product Builder 为 4 个 Handoff、5 个 Artifact、1 个 Approval 生成稳定幂等 checkpoint；server 将边界事件与 snapshot 追加到 JSONL，重放同一 `runId` 时跳过已记录 checkpoint。
- M9-04 验证结果：`pnpm test:all` 17/17、`pnpm run typecheck` 通过。该结果证明本地契约和重复恢复行为，不替代 M8-04 的真实模型质量证据。
- M9-05 已完成：将 synthetic provider limit、同一 Run 恢复、JSONL 重启读取、hash/事件范围校验、重复 Product Builder checkpoint、跨项目隔离和原始事件保留写入 `validation/m9-context-continuity-results.json`；状态为 `PASS_CONTRACT_ONLY`。
- M9 全部完成后，唯一下一步回到 M8-04：PB-01 人工复核与剩余 9 个固定任务的小批量真实 Codex subscription execution bridge 运行。DeepSeek 仍后置。
- PB-02 小批次已完成：single_call 43.260s、single_bot 51.279s、multi_bot 167.466s；三条路径 schema 均通过但均为 6/8 hard constraints。multi_bot 约为 single_bot 的 3.27 倍，不能据此设为默认路径。
- `validation/m8-04-manual-review-PB-02.json` 已记录 artifact/replay hash、人工编辑、reviewer rubric 和 usage/cost 缺失，因此 PB-02 仍是 `quality_evidence_blocked`；没有把执行完成写成质量通过。
- RS-01 小批次已完成：single_call 15.128s、single_bot 33.878s、multi_bot 180.750s；三条路径均 schema_pass=true、8/8 hard constraints，但 multi_bot 约慢 5.33 倍。
- `validation/m8-04-manual-review-RS-01.json` 已记录 RS-01 的 replay/edit/rubric/cost 证据缺口；质量证据仍为 0，下一批从 RS-02 继续。
- 计分器复核发现并修正一处账本 bug：类别诊断字段曾被错误计入 hard constraint 分母，导致部分记录可能显示 9/8。修复为只统计任务冻结的 `hard_constraints` 后，重算所有 18 条记录，`overExpected=0`。
- RS-02 校正后为 single_call 5/8、single_bot schema failure 0/8、multi_bot 6/8；`validation/m8-04-manual-review-RS-02.json` 已落盘，质量证据仍为 0。
- AR-01 三路径校正后为 single_call 8/8、single_bot 7/8、multi_bot 8/8；multi_bot 约为 single_bot 的 3.97 倍，`validation/m8-04-manual-review-AR-01.json` 已落盘，质量证据仍为 0。
- AR-02 三路径校正后为 single_call 7/8、single_bot 7/8、multi_bot schema failure 0/8；multi_bot 约为 single_bot 的 2.71 倍，`validation/m8-04-manual-review-AR-02.json` 已落盘，质量证据仍为 0。
- EV-01 三路径校正后为 single_call 6/8、single_bot schema failure 0/8、multi_bot 6/8；multi_bot 约为 single_bot 的 3.98 倍，`validation/m8-04-manual-review-EV-01.json` 已落盘，质量证据仍为 0。
- EV-02 三路径校正后均为 6/8；multi_bot 约为 single_bot 的 6.53 倍，`validation/m8-04-manual-review-EV-02.json` 已落盘，质量证据仍为 0。
- EX-01 三路径校正后均为 7/8；multi_bot 约为 single_bot 的 3.98 倍，`validation/m8-04-manual-review-EX-01.json` 已落盘，质量证据仍为 0。
- EX-02 三路径校正后为 single_call 7/8、single_bot schema failure 0/8、multi_bot schema failure 0/8；multi_bot 480.462s，约为 single_bot 的 6.18 倍，`validation/m8-04-manual-review-EX-02.json` 已落盘。
- M8-04 机械执行收口：36 条 receipt、30 个唯一 task×path 组合、`overExpected=0`、`quality_eligible=0`；`validation/m8-04-aggregate-summary.json` 明确记录了质量证据阻断和 PB-01 晚到重试。下一步只做质量补证或 3 个现实任务验证，不把自动校验当作提效证明。

### 2026-09-27 M8-04 · 修正硬约束计分分母

- **复现**：RS-02 自动校验曾出现 `multi_bot 9/8`，与固定题集的 8 条硬约束不一致。
- **根因**：类别诊断字段被追加到同一个 `checks` 对象后，计分器统计了全部字段，而不是题集声明的 `hard_constraints`。
- **修复**：`scripts/validate-m804.ts` 只对 `task.hard_constraints` 求和；没有重跑模型调用，只重算已有 JSONL。
- **验证**：`pnpm run m804:validate` 18 条记录通过重算；检查结果 `overExpected=0`；`pnpm run typecheck` 通过。

### 2026-09-27 M8-05 · 窄范围现实验证与同 Run 恢复

- **预注册**：`validation/m8-05-reality-card-v1.json` 冻结了三个非敏感本地状态任务、白名单、结构化追踪 rubric、3/3 阈值、恢复护栏和排除项；脚本版本绑定到 `513fae8`。
- **真实输入**：使用本地 Codex CLI subscription execution bridge，`isMock=false`，没有调用 DeepSeek；REAL-01 读取当前项目 `AGENTS.md/RUN_STATE.json/SPEC/PROGRESS.md/HANDOFF.md`，REAL-02 读取 Pi-Agent-Workbench 的 `AGENTS.md/STATE.md`，REAL-03 读取 personal-knowledge-mcp-mvp 的 `AGENTS.md/STATE.md`。被测项目均只读。
- **结果**：3/3 任务输出单个 JSON 对象，必填键齐全，`source_refs` 均在预注册白名单内，显式列出 `unknowns` 和一个 `next_action`。原始回执在 `validation/m8-05-raw/`。
- **恢复 smoke**：真实 provider 第一段在 `thread.started` 后人为中断；控制面保持同一 `runId`，追加 1 个 `ContextSnapshot`、1 个 `run.resume_requested`，第二段完成并进入 `run.succeeded`。这证明 fallback 执行链恢复，不等于 Codex 原生 resume。
- **内容边界**：恢复 smoke 的第二段模型输出因提示要求“不要执行读取命令”而返回 blocked；因此只把“运行链恢复”计为 PASS，不把它写成业务任务内容完成。M8-05 不覆盖人工 baseline、人工编辑、费用、用户再次使用、多 Bot 质量或 DeepSeek parity。
- **环境与授权**：第一次尝试被自动审批阻止，原因是向订阅模型传递本地文件范围未单独确认；用户随后明确授权本卡白名单文件只读处理。没有修改 VPN、DNS、代理、被测项目或凭据。

## 当前恢复入口

1. 读取 `RUN_STATE.json`、`HANDOFF.md` 和 `validation/m8-05-review.md`。
2. 若继续验证，先为一个真实 Product Builder/技术路线任务冻结 paired baseline card；不要重跑 M8-05 三个任务或 recovery smoke。

### 2026-09-27 M8-06 · 冻结 paired baseline

- **真实任务**：判断 ContextSnapshot 持久化继续采用 JSONL 事实源加可选 SQLite 索引，还是在 v1 前迁移为 SQLite-first。
- **输入范围**：冻结为当前项目 `AGENTS.md`、`RUN_STATE.json`、`HANDOFF.md`、`SPEC/MASTER-SPEC.md`、`packages/core/src/context.ts`、`apps/server/src/persistence.ts` 和 `validation/m9-context-continuity-results.json`；不读取凭据、Cookie、Token、`.env` 或外部资料。
- **paired arms**：手工 baseline 固定 7 步，结构化 arm 为同一白名单的一次 Codex read-only Run；两边都要求 options、trade-offs、dependencies、risks、rollback、source_refs、unknowns 和唯一 next_action。
- **阈值**：人工整理步骤相对减少至少 25%；来源覆盖、未知项、回滚和零越权是硬护栏；owner willingness 在用户复核前保持 UNKNOWN。
- **当前状态**：卡片已冻结且两条 arm 已执行；比较结果为 `PARTIAL`。不重跑 M8-05，不接 DeepSeek。

### 2026-09-27 M8-06 · paired baseline 结果

- **手工 proxy arm**：生成 `validation/m8-06-manual-baseline.md`，按冻结的 7 步写出 JSONL-first vs SQLite-first 的 options、trade-offs、dependencies、risks、rollback、source_refs、unknowns 和 next_action。明确记录没有把 controller 时间冒充用户时间。
- **结构化 arm**：同一输入白名单、Codex subscription、read-only，耗时 `56234ms`；单 JSON、必填键、来源白名单全部通过，原始 receipt 为 `validation/m8-06-raw/structured-run.json`。
- **比较结果**：`validation/m8-06-comparison.json` 为 `PARTIAL`。不能计算人工整理步骤下降率，因为 baseline 是 proxy、structured arm 尚未经过 owner 编辑，owner willingness 仍 UNKNOWN。
- **临时路线判断**：保留 JSONL-first 作为 provisional recommendation，不执行 SQLite-first 迁移；下一步补 JSONL 尾行损坏、并发 append 和从日志重建索引的有界故障注入/性能测试。
- **可读性修正**：`validation/m8-06-structured-run.json` 明确作为机器审计回执；新增 `validation/m8-06-owner-review.md`，把技术结论、证据边界和 owner 只需回答的判断改成人话。

### 2026-09-27 M8-06 · JSONL 边界专项

- **实现**：`apps/server/src/persistence.test.ts` 新增尾行损坏、同进程并发 append 和重载后 latest 重建测试；夹具时间统一为固定宽度 ISO 秒，避免字符串排序制造假失败。
- **结果**：`node scripts/typecheck.mjs`、专项 persistence tests（5/5）、全套等价 Node 测试（19/19）和 `git diff --check` 均通过；损坏尾行按 `SyntaxError` fail-closed，20 个并发快照完整写入且按 project/run 重建最新记录。`pnpm test:all` 的 Corepack wrapper 受用户缓存权限阻断，未把它写成代码失败。
- **边界**：这是 JSONL-first 的有界契约检查，只覆盖同进程写队列；未证明跨进程锁、长时吞吐、M8-04 质量或现实提效。证据为 `validation/m8-06-jsonl-failure-results.json`。
- **后续处理**：该比较已被 M10 长期架构决策覆盖；JSONL 边界测试保留为 portable/灾备契约，不再决定运行时事实源。

### 2026-09-27 M10 · 长期持久化路线改为 SQLite-first

- **决策**：结合未来多项目、多 Bot、长时间 Run、审批竞态、Web/Electron 多进程、跨项目检索和长期留存，SQLite 定为运行时唯一事实源；JSONL 降级为 portable/demo/export/灾备格式。
- **评审依据**：当前 JSONL 的 19/19 测试只证明同进程小规模契约，不能证明跨进程原子写、复杂查询、长期规模和多实体事务。原始比较结果保留在 `validation/m8-06-comparison.json`，不再作为长期路线决定。
- **M10-01 实现**：新增 `SqliteContextSnapshotStore`、SQLite 默认 factory、WAL/foreign_keys/busy_timeout、Node 22 `node:sqlite` 兼容驱动；Product Builder 和 runtime 不再硬编码 JSONL 默认路径；HTTP 回执显示 `persistence.mode`、backend、driver 和降级原因。
- **验证**：全套等价 Node tests 20/20、typecheck 和 diff check 通过。当前 `better-sqlite3` 二进制按 Node 24 编译，与 Node 22 ABI 不匹配；系统已自动选择 `node:sqlite`，未修改 VPN 或安装凭据。
- **下一步**：M10-02 版本化 SQLite schema 与 migration runner，先覆盖 `schema_meta`、`context_snapshots`、`run_segments` 和 `idempotency_keys`。


### 2026-09-27 M10-02 · 版本化 SQLite schema 与迁移

- **实现**：在 `apps/server/src/persistence.ts` 增加 `SQLITE_SCHEMA_VERSION=1`、`SQLITE_MIGRATIONS`、`schema_meta` 版本记录和事务包裹的 migration runner。迁移 v1 创建 `run_events`、`context_snapshots`、`run_segments`、`idempotency_keys` 及索引；`SqliteContextSnapshotStore` 和 `openEventLog` 共用该 runner。
- **验证**：`node scripts/typecheck.mjs` 通过；全套等价 Node tests `21/21` 通过；`git diff --check` 通过。临时 DB 的 schema inspection 得到版本 1 和五类表，二次 inspection 与首次结果一致。
- **边界**：回滚分支已实现，但还没有失败注入测试；全实体事务、JSONL 导入导出、崩溃/跨进程/备份恢复和规模验证仍未完成。better-sqlite3 ABI 不匹配时继续由 `node:sqlite` 接管。
- **证据**：`validation/m10-02-schema-migration-results.json`。
- **下一步**：M10-03 全实体 SQLite 事务与幂等，先接入 `run_segments`、`idempotency_keys`，再扩展其余领域实体。


### 2026-09-27 M10-03 · SQLite RunStore 第一段

- **实现**：schema v2 增加 Project、Skill、BotProfile、Run、Handoff、Approval、Source、Artifact、Memory 和 Provider Receipt 表；新增单连接 `SqliteRunStore`，把 Run 创建、状态迁移、RunEvent 和 idempotency 记录放进同一事务，并提供 Run segment 写入与回读。
- **验证**：typecheck、persistence 专项 8/8、全套等价 Node tests 22/22、diff check 通过；关闭并重新打开数据库后 Run、事件和 segment 可读回；同一个 key 重放返回原事件，不同 action 报冲突。
- **边界**：现有 runtime 仍使用 `InMemoryRunStore`；Product Builder checkpoint 仍未通过该仓储原子写入；失败注入、并发、跨项目隔离、全实体 typed CRUD、导入导出和备份恢复仍待补。
- **证据**：`validation/m10-03-sqlite-runstore-results.json`。
- **下一步**：把 `SqliteRunStore` 接入可恢复 runtime 默认路径；Product Builder/HTTP 完整接入留到 M10-05。


### 2026-09-27 M10-03 · runtime 默认接入

- **实现**：`apps/server/src/runtime.ts` 的默认 `runtimeStore` 切换为 `SqliteRunStore`；正式路径使用 `data/workspace.db`，Node test 使用按进程隔离的临时数据库。`ensureSeeded()` 先回读固定 fixture Run，避免服务重启重复创建。
- **验证**：persistence/runtime 专项 `11/11`、全套等价 Node tests `22/22`、typecheck、diff check 通过；覆盖同 key 并发重放、错误序号回滚、重启回读和跨项目 listRuns。
- **边界**：Product Builder checkpoint 仍未通过同一事务仓储写入；跨进程竞争、显式失败注入、备份恢复、全实体 typed CRUD 和 HTTP 完整接入仍待完成。
- **下一步**：补 M10-03 剩余边界后进入 M10-05。


### 2026-09-27 M10-03 · 边界验证收口

- **验证**：增加一次性失败注入，确认 Run 更新、RunEvent 和幂等记录在中途异常时一起回滚；使用 SQLite `VACUUM INTO` 创建备份并重新打开恢复库；三个独立 Node 进程同时写同一个数据库，全部成功。
- **结果**：persistence 专项 `10/10`、runtime 专项 `3/3`、全套等价 Node tests `24/24`、typecheck 和 diff check 通过。
- **边界**：这仍不覆盖长时锁竞争、kill/restart、10k/100k 事件规模、全实体 typed CRUD 或 Product Builder checkpoint 的同事务接入。
- **下一步**：进入 M10-05，把 Product Builder checkpoint、ContextSnapshot、幂等记录和 HTTP 读取接入同一 SQLite 事实源。


### 2026-09-27 M10-05 · Product Builder SQLite checkpoint

- **实现**：Product Builder 默认 event log 与 ContextSnapshot store 改为共享 SQLite 连接；每个 checkpoint 将 checkpoint event、ContextSnapshot、snapshot-created event 和幂等记录放在同一事务。
- **验证**：重开数据库后 replay 跳过 10 个 checkpoint；HTTP 连续 preview 第二次返回 `created=0/skipped=10`；Product Builder/HTTP 专项 `3/3`、全套等价 Node tests `25/25`、typecheck 和 diff check 通过。
- **边界**：Handoff、Approval、Artifact、Source、Memory、ProviderReceipt 还没有 typed entity repository；HTTP 其他读写路由、JSONL 导入导出和规模验证仍待完成。
- **下一步**：补剩余 typed persistence 和完整 HTTP 读写。


### 2026-09-27 M10-05 · typed entity persistence

- **实现**：新增 `SqliteEntityStore`，将 Product Builder 的 Handoff、ApprovalRequest、Source、Artifact 和 ProviderReceipt 写入 SQLite；replay 时仅在本轮创建 checkpoint 才写实体 bundle，避免随机 Artifact 重复。
- **验证**：实体写入、关闭重开回读和 replay 去重通过；Product Builder/HTTP 专项 `3/3`、全套等价 Node tests `25/25`、typecheck 和 diff check 通过。
- **边界**：Project、BotProfile、Skill typed repositories、完整 HTTP 实体读写、JSONL 导入导出和规模验证仍待完成。
- **下一步**：补三类基础实体 repository，再接持久化实体摘要和审批/重试/取消 HTTP 路由。

### 2026-09-27 M10-05 · 基础实体与 HTTP 摘要

- **实现**：Project、Skill、BotProfile typed persistence roundtrip 已接通；新增 `GET /api/persistence/entities` 汇总持久化实体；approve route 已验证持久化写入。
- **验证**：`node scripts/typecheck.mjs`、Product Builder/HTTP 专项 `3/3`、全套等价 Node tests `25/25`、`git diff --check` 通过。
- **边界**：retry/cancel 与完整 HTTP entity create/read/update 路由仍待完成；下一阶段是 M10-04 JSONL 导入导出，之后再做 M10-06 崩溃恢复和规模验证。


### 2026-09-27 M10-05 · HTTP routes 收口

- **实现**：完成 Project/Skill/BotProfile POST/GET/PATCH 持久化路由；POST `/api/runs` 返回真实 runtime Run ID；cancel route 经 `SqliteRunStore` 持久化，未知 Run 返回 404；retry route 经状态机事务覆盖 failed→queued、幂等重放和非法状态 409；entity summary 增加 ProviderReceipt。
- **验证**：typecheck、HTTP smoke、全套等价 Node tests `25/25`、`git diff --check` 全部通过。
- **边界**：M8-04 质量证据、Electron 可见性、DeepSeek、literal GitHub clone 和 Codex 原生 resume 的既有阻断保持不变。
- **唯一下一步**：实施 M10-04 JSONL import/export（导入、导出、校验、重建）；M10-06 崩溃恢复与规模验证后置。

### 2026-09-27 M10-04 · JSONL import/export

- **实现**：新增 `scripts/import-export/cli.mjs` 的 export、validate、import/rebuild；导出格式 `local-agent-workspace.export.v1`，schemaVersion 2，manifest 记录 payloadSha256 与逐表计数。
- **校验**：JSON record、表白名单、主键重复、run_events sequence 连续、ContextSnapshot hash、JSON columns；篡改 payload 与非空 target 明确拒绝。
- **验证**：`scripts/import-export/cli.test.mjs` 专项 2/2；真实 `data/workspace.db` export→validate→import 54 rows，重开计数 projects=1、runs=0、events=19、idempotency=0。
- **证据**：`validation/m10-04-jsonl-import-export-results.json`。主任务另行记录 27/27、typecheck、full suite、git diff check。
- **状态**：M10-04 DONE；M8-04、Electron、DeepSeek、literal GitHub clone、Codex 原生 resume 限制保持不变。
- **下一步**：切到 M8-04 质量证据审计/现实验证。

### 2026-09-27 M10-06 · 恢复、并发与规模验证完成

- 有限 SQLite open/migration busy retry 修正已通过；三进程并发 writer 专项 PASS。
- kill/restart：SIGKILL 子进程后 reopen，已读回 committed Run/Event；10k scale test PASS。
- 100k 真实脚本 PASS：`eventCount=100000`、`first=1`、`last=100000`、`durationMs=336`、`driver=node:sqlite`。
- 纳入既有 rollback、online backup/restore 与跨进程证据；全套 `29/29`、typecheck、`git diff --check` PASS。
- 证据：`validation/m10-06-recovery-scale-results.json`。M10-06 标记 DONE。

### 当前唯一下一步

切到 M8-04 质量证据审计/现实验证。DeepSeek 仍需 Key；Electron 可见性 PARTIAL；GitHub clone/Codex native resume 仍受限制。

### 2026-09-27 M8-08 · personal-knowledge-mcp-mvp 真实输入验证

- **真实输入**：只读 `/Users/m4air/总控/projects/personal-knowledge-mcp-mvp` 的 `AGENTS.md`、`STATE.md`、`PROJECT_DOCS_INDEX.md`；没有读取真实知识库、凭据、Cookie、Token 或项目外资料。
- **Codex 执行**：subscription CLI run `87830305-fb5a-4a69-bb00-35eb7c3d5613` 完成，提出“增加可重复的离线 fixture evidence report”作为下一步安全增量；原始回执与 Artifact 已保存。
- **结构化结论**：内容 JSON 含全部要求字段且证据引用在白名单内，但前置了一句说明文字；严格单 JSON 门判为 `PARTIAL`，不能当作结构化成功。
- **候选项目 smoke**：既有 `npm test` 在普通沙箱因绑定 `127.0.0.1:18787` 返回 `EPERM`；一次本机 loopback 权限重试后 `PASS`，9 项检查通过，`real_data_accessed=false`。候选项目没有被修改。
- **现实卡**：`validation/m8-08-reality-card.json`。这证明“能读取真实项目边界并提出安全计划”，不证明结构化输出可靠、真实资料可接入或 Product Builder 已产生提效。
- **下一步**：在当前 workspace 加固 provider-output normalization/ambiguity contract，并用已捕获的 prose+JSON transcript 做专项验证；不重复真实调用。

### 2026-09-28 M8-10 · Provider receipt 接入

- **实现**：Core 新增 `provider.output-receipt.v1`，Adapter 统一生成原文 SHA-256、解析状态、`exact/fenced/embedded` 模式、提取结果 hash 或拒绝原因；不覆盖原始 provider 文本。
- **回填**：M8-08 的真实 Artifact 与结果回执已离线增加该 metadata，原始输出 hash 保持一致，模式记录为 `embedded`；没有新增模型调用。
- **验证**：Core+Adapter `9/9`、typecheck、RUN_STATE 校验、JSON 解析和 diff check 全部通过。
- **下一步**：为第三个非敏感现实任务冻结 reality card，优先验证技术路线判断或项目推进计划；保持只读和固定白名单。

### 2026-09-28 M8-11 · 第三个现实任务：技术路线判断

- **真实输入**：当前 workspace 的 `AGENTS.md`、`RUN_STATE.json`、`SPEC/PROGRESS.md`、`SPEC/08-persistence-architecture-decision.md`，固定白名单只读。
- **Codex 执行**：run `ac46d495-51aa-49a8-a2a2-eee794db77a5` 完成；12/12 必需字段齐全，4/4 来源引用在白名单内，`provider.output-receipt.v1` 为 `embedded`，无文件/数据库/外部状态变化。
- **窄范围结论**：`PASS` 只证明真实项目状态→结构化技术路线对象的追踪链；模型 next_action 与本次任务本身重复，未经过人工 baseline 或独立评审，不证明路线判断正确或能提效。
- **证据**：`validation/m8-11-reality-card.json`、`validation/m8-11-real-project-technical-route.json`、`validation/m8-11-real-project-technical-route-artifact.json`。
- **下一步**：对 M8-07、M8-08、M8-11 三次现实任务做对照汇总，明确哪些是执行能力证据、哪些仍缺内容质量和真人提效证据。

### 2026-09-28 M8-12 · 三次现实任务对照收口

- **落盘**：新增 `validation/m8-reality-comparison-v1.json` 与 `validation/m8-reality-comparison-v1.md`。
- **结论**：M8-07、M8-08、M8-11 证明了受控只读执行、来源白名单、原始回执和 Artifact 可追溯；M8-08 原始严格 JSON 曾为 PARTIAL，现以 embedded normalization 保留，不改写历史结论。
- **未证明**：内容质量、人工修改量下降、成本/延迟收益、真人再次使用、多 Bot 优势、DeepSeek parity、Codex native resume 和 Electron 可见性。
- **下一步**：冻结一个由用户本人完成的非敏感固定任务基线，测量 ChatGPT→手工整理→Codex 与 Agent Workspace 两条路径；不以主控代理时间或模型自评代替。

### 2026-09-28 M8-13 · 真人基线卡冻结

- **卡片**：`validation/m8-13-user-baseline-card-v1.md`。
- **固定任务**：为 `personal-knowledge-mcp-mvp` 设计 fixture-only 离线验证报告下一步计划。
- **两条路径**：当前 ChatGPT→手工整理→Codex，与 Agent Workspace 结构化路径，必须使用同一输入和同一成功标准。
- **待记录**：真实耗时、手工步骤、人工修改、返工、来源可追溯性、中断恢复和再次使用意愿。
- **状态**：`PENDING_USER_EXECUTION`；没有代填任何用户测量数据。

### 2026-09-28 M8-14 · Computer Use + Codex execution 联调

- **Computer Use**：Chrome 打开 `http://localhost:5173/`，工作台、Project、Bots、Fixture Run、审批卡、运行记录和 Artifacts 均可见；点击“确认并继续”后页面提示已确认，Runs/Artifacts 页面可回读。
- **环境修正**：Vite/Rolldown 的 React refresh 报 `Missing field moduleType`，通过关闭 dev HMR 恢复渲染；根 `dev:web` 明确以 `apps/web` 为 Vite root。没有安装依赖或改变 VPN。
- **Codex 真实证据**：probe 为 `codex-cli 0.155.1`；`run_mukpml8l`、`run_mukpnxhl` 为 `authMode=subscription`、`isMock=false` 的真实只读 Run，RunEvent 保存 thread/turn/agent_message/usage/终态。
- **receipt 修正**：补上 `SqliteEntityStore.saveProviderReceipt` 与 runtime segment receipt；`run_mukpy6pf` 返回 `receiptId=run_mukpy6pf:codex:segment:1`，SQLite 可回读 `provider.execution-receipt.v1`，保存 provider、usage、事件摘要 hash，不保存模型原文。
- **验证**：typecheck PASS；服务器/核心/适配器/工作流测试 `29/29` PASS；证据 `validation/m8-14-computer-use-codex-e2e-v1.md/.json`。
- **边界**：Web“新建一次运行”仍是提示文案，尚未接 Codex endpoint；输出质量、真人提效、多 Bot 优势、DeepSeek parity、Codex native resume 和 Electron 可见性仍未证明。
- **唯一下一步**：把 Web 新建运行接成显式 Codex/Fixture Provider 选择与真实 Run 创建，再执行固定任务的真人 A/B 基线。

### 2026-09-28 M8-15 · Web 新建运行入口

- **实现**：Web“新建一次运行”改为真实对话框，可在 Fixture 本地演示与 Codex 订阅执行桥之间选择；入口调用本地 HTTP control plane，不把失败静默降级为 Fixture。
- **回执显示**：前端按实际响应读取 `run.id`、`run.status`、顶层 `receiptId`、provider event 数和 Product Builder 的 `approval.runId`；增加执行回执卡，区分演示数据与真实执行。
- **Computer Use**：Chrome 流程完成；短只读 Codex 任务返回 `run_mukqh9uy`、5 个事件、`run_mukqh9uy:codex:segment:1`，页面标记“真实执行”。Fixture 流程也完成；首次映射误差已修正。
- **验证**：`node scripts/typecheck.mjs`、`git diff --check`、Core/adapter/workflow/server tests `29/29` PASS；SQLite `provider.execution-receipt.v1` 可回读。证据：`validation/m8-15-web-run-entry-v1.md/.json`。
- **边界**：内容质量、真人提效、多 Bot 价值、DeepSeek parity、Codex native resume 和 Electron Computer Use 仍未验证。
- **唯一下一步**：按 `validation/m8-13-user-baseline-card-v1.md` 执行固定任务真人 A/B，不用代理时间或模型自评替代。

### 2026-09-28 M8-16 · Workspace 固定任务 arm

- **固定输入**：新增 `validation/m8-13-fixed-input-v1.md`，冻结 `personal-knowledge-mcp-mvp` 的 fixture-only、localhost-only、只读任务与结构化输出字段。
- **真实执行**：通过 Chrome Computer Use 选择 Codex 订阅执行桥完成 `run_mukr3edw`；5 个 provider events，receipt 为 `run_mukr3edw:codex:segment:1`，`authMode=subscription`、`isMock=false`。
- **输出**：严格 JSON 可解析，包含 summary、evidence、unknowns、boundary、plan、next_action、stop_conditions、risks；原始输出 hash 和 provider receipt 已保存。
- **证据**：`validation/m8-13-workspace-run-mukr3edw.json`、`validation/m8-13-workspace-arm-v1.md`。
- **结论**：Workspace arm PASS；M8-13 整体仍为 `PARTIAL / HUMAN_BASELINE_REQUIRED`。机器运行时间不能替代真人 A/B 的耗时、手工步骤、修改量、返工和再次使用意愿。
- **唯一下一步**：由用户在同一固定输入下完成基线 A，补齐真人字段后再判断是否有现实提效。

### 2026-09-28 M8-16 · 回执摘要展示修正

- **修正**：Web API 现在同时支持直接 Provider event 和 `RunEvent.data.stream` 两种结构，能在执行回执卡展示 Codex agent message 摘要；不改变原始事件或 receipt。
- **验证**：typecheck、RUN_STATE 校验、diff check PASS；不重复调用模型。

### 2026-09-28 M8-17 · 持久化 Run 回读

- **实现**：新增 `GET /api/core/runs/:runId`；Web 启动时从 SQLite 选择最近一次已结束 Run，并恢复 `run`、Provider events、结构化输出摘要和 receipt。
- **Computer Use**：重新打开 `http://localhost:5173/?v=persisted-run` 后，页面自动显示 `run_mukr3edw`、5 个 Provider events、`run_mukr3edw:codex:segment:1` 和完整 JSON 摘要。
- **验证**：HTTP smoke、typecheck、diff check、全套 Node tests `29/29` PASS。证据：`validation/m8-17-persisted-run-replay-v1.md`。
- **结论**：刷新/上下文切换不再丢最近一次运行结果；真人 A/B 仍未完成。
- **唯一下一步**：用户用同一固定输入完成基线 A，补齐真实耗时、手工步骤、修改量、返工和再次使用意愿。

### 2026-09-28 M8-18 · 机器版 A/B 对照完成

- **A 路径**：直接独立 Codex CLI 单次调用，使用同一固定输入；默认路由先返回 `Selected model is at capacity`，一次有界回退到 `gpt-5.6-luna` subscription。调用为只读、临时、无工具访问，CLI 墙钟 `103033ms`，JSONL 4 行、1 条 agent message。
- **B 路径**：复用 Workspace 的 `run_mukr3edw`，`openai-codex` subscription、`isMock=false`，5 条 Provider events，receipt `run_mukr3edw:codex:segment:1`；刷新回放已在 M8-17 通过。
- **容量回执**：默认路由的 `Selected model is at capacity` 单独落盘于 `validation/m8-13-baseline-a-capacity-failure.json`；不把它解释为周限额耗尽。
- **落盘**：`validation/m8-13-baseline-a-single-call-raw.json`、`validation/m8-13-baseline-a-single-call.md`、`validation/m8-13-baseline-a-manual-normalization.json`、`validation/m8-13-machine-comparison-v1.md/.json`。
- **机器结论**：Workspace 的结构化输出、事件、receipt 和刷新恢复更完整；直接单次调用更轻量、可读性更自然，但需额外整理和独立保存。没有证明多 Bot 更好，也没有测出真人手工耗时、修改量、返工或再次使用意愿。
- **状态**：M8-18 DONE；整体仍 `PARTIAL / HUMAN_REALITY_REQUIRED`。保持 `validation/m8-13-user-baseline-card-v1.md` 的真人字段为空，不把机器墙钟写成真人耗时。
- **下一步**：真人现实验证门；若暂不进行真人测量，则保留结构化单 Bot/Codex 作为默认路径，不扩大到多 Bot 默认。

### 2026-09-28 M8-19 · codex-pet-studio 真实项目质量对照与合同审计

- **机器质量对照**：同一冻结提示分别走直接 `gpt-5.6-luna` 单次调用与 Workspace `run_mukw5aif`。两条路径都正确区分历史证据、本轮未执行项、未知项和停止条件；Workspace 检查拆分更细并保留 RunEvent/receipt。该对照不证明图片合同或模型能力孰优，因两条路径模型路由不同。
- **真实 staging 审计**：只读读取 `pet.json`、`spritesheet.webp`、QA PNG、57 份 native frame 和视觉闸门文档；结构、像素、网格、57/15 格、颜色、alpha、nearest-neighbor、WebP 像素回读共 `364/364 PASS`，`0 FAIL`。
- **视觉回读**：48×52 主样品和 contact sheet 逐项通过人物/念珠/方便铲剪影、像素簇、非动漫脸、选择性描边、主光方向、武器形制和逐帧稳定性；证据 `validation/m8-19-codex-pet-visual-review.md`。这是审计代理观察，不是用户审美接受。
- **边界**：没有安装、没有写入 `~/.codex/pets`、没有网络、没有依赖安装、没有修改候选项目；候选仓库原有未跟踪目录未触碰。
- **状态**：M8-19 合同审计 PASS；安装运行、用户接受和 Product Builder 整体现实提效仍未验证。
- **下一步**：若用户明确确认写入 `~/.codex/pets/sha-wujing`，再单独做安装 smoke、前后 manifest、加载结果和回滚验证；在确认前不安装。

### 2026-09-28 M8-20 · codex-pet-studio 安装现实验证门

- **安装前回读**：目标 `/Users/m4air/.codex/pets/sha-wujing` 已存在；`pet.json` 与 `spritesheet.webp` 与 M8-19 审计通过 staging 包逐字节一致，SHA-256 分别为 `4f86aa0ce18977f452404fd1638ec25fcd67f55c2b4536c9d914e6366d76ac94` 与 `90792e4a7932070f26d287ee285becb9ced3f6fae02918138f291a2686c28d48`。
- **副作用边界**：因目标内容已相同，本轮没有覆盖、删除或新增写入；未访问 secret、网络或其他目录。证据：`validation/m8-20-install-preflight.json`、`validation/m8-20-install-postflight.json`。
- **运行时检查**：Computer Use 尝试访问 Codex App 时被安全策略拒绝（`com.openai.codex`），不能观察当前 Codex 是否加载或动画运行；记录为 `BLOCKED_CUA_CODEX_APP_SAFETY`，不绕过策略。
- **Verdict**：`PARTIAL`。支持“审计通过的包已经存在于目标目录”的窄 claim；不支持“Codex runtime load PASS”或“用户已接受”。Reality card：`validation/m8-20-codex-pet-install-reality-card.json`。
- **下一步**：保留现有目标，不重复安装；等待用户可见确认或寻找受允许的运行时观察路径。

### 2026-09-28 M8-20 user-visible observation correction

- **用户观察**：用户本人确认在 Codex App 宠物界面看到“沙悟净”，并看到“更新”按钮及一段更新指令文本。
- **能支持的结论**：当前 Codex App 可见一个名为“沙悟净”的宠物；这补充了运行时存在的用户观察。
- **不能支持的结论**：由于目标目录在本次之前已经存在，不能据此证明当前显示资源来自本次 staging 包；更新按钮和弹窗指令的目标、写入动作与副作用也未知。
- **边界**：不点击更新、不执行弹窗指令、不覆盖目标目录；先获取完整指令原文再判断。
- **证据**：`validation/m8-20-user-visible-observation.md`，并更新 `validation/m8-20-codex-pet-install-reality-card.json` 与 `validation/m8-20-install-postflight.json`。


### 2026-09-28 M8-20 screenshot clarification

- 用户截图显示 Codex Composer 中预填了 `Hatch Pet upgrade the existing pet at 沙悟净 to the latest pet version with looking directions`。
- 发送箭头仍可见，故只能确认升级草稿存在，不能确认任务已发送、文件已修改或宠物已升级。
- 截图可见模型标签 `GPT-6 Astra Ultra`；仅作为界面标签记录，不外推实际路由或计费来源。
- 截图已留档：`validation/m8-20-codex-pet-update-prompt.png`；更新现实卡与 RUN_STATE，保持不发送。


### 2026-09-28 回到主项目主线

- 沙悟净只作为 M8-20 真实运行时样本，不是产品功能或主线依赖；截图已解释为尚未发送的 Hatch Pet 草稿。
- 主线切回 M8-04 质量证据 readiness 审计：现有 36 条 receipt、27 条严格 JSON replay、0 条 quality eligible；官方 evidence-audit 专项测试通过。
- 不启动新的模型批次，不发送宠物升级草稿；下一步只读核对 M8-04 证据一致性和剩余阻断。


### 2026-09-28 M8-04 AR-01 post-hoc evidence

- 对 AR-01 的 single_call、single_bot、multi_bot 做了事后只读复核；三条均可绑定 source receipt、派生 artifact 并严格回放。
- 三条 post-hoc rubric：single_call 14/15、single_bot 12/15、multi_bot 13/15；人工编辑量、token、费用和真人提效仍不可观察。
- multi_bot 148964ms，约为 single_bot 的 3.97 倍，超过默认 2 倍延迟上限；不设为默认。
- 证据：`validation/m8-04-posthoc-review-AR-01.json/.md`。


### 2026-09-28 M8-13 machine proxy substitution

- 用户明确授权由总控 Agent 代替其完成固定任务两条机器路径；使用已保存的同一固定输入与真实机器回执，不重复调用模型。
- A 直接 Codex CLI：103033ms、自由 Markdown、需 4 步总控规范化；B Workspace：83194ms、严格 JSON、5 个 Provider events、receipt `run_mukr3edw:codex:segment:1`、刷新恢复通过。
- A/B 模型路由不同，不能据此比较内容质量；机器层默认候选为结构化 single-Bot/Codex。
- 证据：`validation/m8-13-machine-proxy-substitution-v1.json/.md`。


### 2026-09-28 阶段状态校准

- 新增 `SPEC/STATUS-RECONCILIATION-2026-09-28.md`，明确项目是“核心运行时完成、最终验收 PARTIAL”的本地 Alpha。
- M9/M10 持久化与恢复不再作为下一步；主线转回 M4 Product Builder 完整性，优先补 Handoff cycle guard 与 Conflict Check。
- 修正 backlog 中 M8-05 的旧 TODO：三次窄范围真实本地任务已完成，但整体现实提效仍为 PARTIAL。


### 2026-09-28 M4-06/M4-07 workflow guard

- `packages/workflow/src/product-builder.ts` 新增 Handoff graph 最大深度/父链循环校验、Source/Handoff/Artifact 引用冲突检查。
- Product Builder 在审批未完成、图无效或存在冲突时返回 `artifactRelease=blocked` 与空 `finalArtifactIds`；既有 artifacts 保留为草稿输入。
- 增加 workflow 和 HTTP smoke 断言；专项测试 8/8、typecheck、RUN_STATE、diff check 通过。
- 当前剩余：把 release 状态和阻断原因持久化到 SQLite checkpoint/replay，避免刷新后只看到草稿 Artifact 而看不到释放状态。

### 2026-09-28 M4-08/M5-06/M6-02 · approval reconcile、API correlation 与 Bot 管理收口

- **Approval reconcile**：`POST /api/runs/:runId/approve` 在写入 `approval.resolved` 后调用显式 `reconcileProductBuilderRelease`；仅当 approval 已批准且没有其他 blocker 时，才把同一 Run 的 5 个持久化 Artifact 标记为 `released` 并写入 `finalArtifactIds`。重复 reconcile 不重复追加 checkpoint event。
- **API 诊断**：所有 HTTP 响应现在携带安全的 `x-correlation-id`；错误 body 同时返回 `correlationId`。客户端传入合法 correlation id 时原样透传，否则生成 `corr_<uuid>`。HTTP smoke 覆盖生成和透传。
- **Bot 管理**：Web 已接入创建、复制、停用 Bot 的本地 persistence API；停用是逻辑状态，不删除数据。Fixture 仍只作为无 Key 演示数据源。
- **验证**：全套 Node 测试 `37/37`、`node scripts/typecheck.mjs`、Web Vite production build、`node scripts/validate-state.mjs` 和 `git diff --check` 通过。
- **边界**：这次代码单元已收口，但 Bot 的真实人工点击尚未形成可靠 Computer Use 回执；Electron 可见性、literal GitHub clone、DeepSeek Key 和真人现实验证仍是外部验收边界。没有提交 Git commit，也没有修改旧工作台。

### 2026-09-28 Electron/Web 回归 · 启动链、CORS 与 Bot 持久化回读

- **复现**：直接启动 arm64 Electron 包后，原实现没有在 `4310` 提供可用 Web 页面；修复后再次尝试时，本机 macOS LaunchServices/GUI 初始化产生 `SIGABRT`，系统回执见 `~/Library/Logs/DiagnosticReports/Local Agent Workspace-2026-09-28-173800.ips`。该崩溃发生在窗口初始化前，不能归因于 React 页面。
- **修复**：Server 根路径提供 `apps/web/dist` 的静态 Web shell；Electron 使用系统 Node 启动 TypeScript Server，支持 `AGENT_WORKSPACE_PORT` 和 Electron 用户数据目录；打包配置将 Server、packages、Web dist 和 fixtures 放入 `asarUnpack`。Server runtime 会为用户数据目录创建 SQLite 父目录。
- **联调修复**：补齐 OPTIONS 的 `PATCH` 和 `x-correlation-id`，修复 Bot 停用的浏览器预检失败；Web 增加 `listBots`，刷新后合并 SQLite Bot 与 Fixture Bot，修复“写入成功但刷新消失”。
- **Computer Use 证据**：在本地 Web 回归中创建 `验收 Bot`、复制为 `验收 Bot 副本`、停用副本并刷新；刷新后副本仍显示“已停用”，停用/复制按钮灰化。详细记录：`validation/m6-02-bot-management-cua-v1.md`。
- **验证**：HTTP smoke（含静态 shell 和 CORS preflight）、全套 Node 测试 `38/38`、typecheck、Web build、RUN_STATE 校验和 diff check 通过。
- **当前边界**：Web/API 回归通过；原生 Electron 窗口仍受本机 GUI/LaunchServices 环境阻塞，详见 `validation/m7-electron-native-window-v1.md`。图标改造后置，等原生启动链可观察后再做。

### 2026-09-28 Electron 原生窗口崩溃修复 · appId 身份冲突

- **复现与定位**：旧 `com.localagentworkspace.desktop` arm64 `.app` 在 `NSApplication`/LaunchServices 注册阶段产生 `SIGABRT`；最小 Electron 窗口和未打包 `apps/desktop/dist/main.cjs` 均能持续运行，排除业务 Server、React 页面和本机全部 Electron GUI 崩溃。
- **验证假设**：手动改 bundle id 会破坏 Electron helper 配套并报 `Unable to find helper app`；通过 electron-builder 正规生成唯一 `com.localagentworkspace.smoke` 包可运行，证明问题收敛到本机旧同名 bundle 的 LaunchServices 身份冲突。
- **最小修正**：将尚未公开发布的正式 app id 改为 `com.localagentworkspace.desktop.v1`，不改变业务逻辑或数据模型。
- **真实复验**：`/private/tmp/local-agent-workspace-release-v5` 正规 arm64 包启动 8 秒仍运行；`4315/api/health` 返回 `ok`；Computer Use 读取原生窗口 `Agent Workspace · 项目工作台`，点击 `Bots` 后显示 Bots 管理和 Product Builder、Research、Architecture、Evaluation、验收 Bot 卡片。
- **结论**：M7-01/M7-02 窗口启动与 Computer Use 可见性 PASS；M7-03 仍 PARTIAL（未签名 DMG、安装后和 clean-room 验收未完成）。默认 Electron 图标继续后置。

### 2026-09-28 Electron 自定义图标与旧包清理

- **图标**：新增 `apps/desktop/assets/icon.svg` 与生成的 `icon.icns`，`electron-builder.yml` 的 macOS 配置固定使用该图标。
- **打包证据**：v6 arm64 目录包构建不再出现 `default Electron icon` 警告，Info.plist 的 `CFBundleIconFile=icon.icns`；Computer Use 已打开 v6 工作台概览。
- **清理**：停止旧 `release/mac-arm64` 进程及本轮 v5 临时 Server；v2/v3/v4/v5、unique、smoke 和旧项目 `release` 移到 `/private/tmp/local-agent-workspace-archive-20260928`，未删除，便于回滚。
- **当前唯一候选**：`/private/tmp/local-agent-workspace-release-v6`，app id 为 `com.localagentworkspace.desktop.v1`。

### 2026-09-28 Electron v6 DMG 构建

- 使用 `apps/desktop/assets/icon.icns` 生成 arm64 DMG：`/private/tmp/local-agent-workspace-release-v6-dmg/Local Agent Workspace-0.1.0-arm64.dmg`。
- electron-builder 目标构建成功并生成 blockmap；无 Developer ID，因此签名和安装后验收仍未宣称完成。
- 已将当前 DMG 复制到项目 `release/` 目录；旧 `release` 已在归档目录中保留，项目目录只保留 v6 交付包。

### 2026-09-28 Electron 安装后验收与旧端口清理

- Finder 复制粘贴已将 `release/Local Agent Workspace-0.1.0-arm64.dmg` 安装到 `/Applications/Local Agent Workspace.app`。
- 第一次启动返回 404，定位为旧 `node apps/server/src/index.ts` 进程占用默认 4310；停止 PID 27340 后重启安装版，`GET /` 返回 200 Web shell。
- Computer Use 已读取安装版窗口 `Agent Workspace · 项目工作台`，进入 `Bots 管理` 并显示 Product Builder、Research Bot、Architecture Bot、Evaluation Bot。
- 结论：安装后启动 PASS；Developer ID 签名和 clean-room 安装仍是后续交付边界。

### 2026-09-28 安装版审批与运行记录回归

- Computer Use 打开 `/Applications/Local Agent Workspace.app`，从 `工作台概览` 进入本地 Demo 的运行记录。
- 点击 `确认并继续` 后，界面回显“已确认，Architecture Bot 将继续工作”；再次打开 `运行记录` 能读到 `用户确认生成执行计划` 和 `生成 Product Brief 与执行计划` 两条后续事件。
- 这次回归确认安装版的审批→事件时间线可执行；不把它写成 DeepSeek 真实模型效果或真人提效证据。
- 当前外部边界保持不变：Developer ID 证书为 0 个有效 identity，Git remote 为空；因此签名和 literal GitHub clean-room 仍待外部条件，DeepSeek Key 与真人 A/B 继续后置。

### 2026-09-28 外部验收门探针

- 只读探针确认 Developer ID 有效 identity 为 `0`、当前仓库没有 Git remote、当前进程没有 `DEEPSEEK_*` 环境变量；未读取任何凭据，也没有创建 remote、发布或发送外部内容。
- 安装版继续通过 Computer Use 回读：本地服务正常，运行记录中保留审批后的两条后续事件。
- 证据：`validation/external-gate-probe-2026-09-28.json`。下一步保持 single-Bot/Codex 默认，等待外部条件或用户本人完成 M8-13 真人 A/B。

### 2026-09-28 M8-21 · 本地 Alpha 可用性与稳定性收口

- **范围调整**：按用户决定暂缓 M8-13 真人提效 A/B；本轮只判断“能启动、主流程能走通、状态和产物可回读、界面不误导”，不把机器证据写成真实提效结论。
- **UI 纠偏**：Fixture 页面不再显示 DeepSeek/API Key/API 额度；概览指标改为从当前 snapshot 计算；运行状态和 Provider 健康状态使用真实映射；Artifact 读取失败显示明确提示。
- **真实回归**：安装版 Computer Use 完成概览、审批继续、运行记录、Bot、Artifact 正文、刷新回读；新建 Fixture 运行后，工作台显示演示完成，运行记录保留 6 个主事件。
- **持久化回读**：`/api/product-builder/preview` 返回 `waiting_user`、4 个 handoff、5 个 artifact、1 个 approval 和 Fixture receipt；SQLite `/api/persistence/entities` 回读 5 artifacts、4 handoffs、1 approval、1 receipt，证明回执不是只停留在 UI。
- **刷新映射修复**：Web 恢复最近执行时优先读取 SQLite entities receipt，并按同一 receipt 的 Run ID 回读 Fixture 事件；安装版刷新后显示 `run-fixture-001`、6 个事件、receipt 和“演示数据”，不再把旧的 `run-core-fixture-001` 显示成最近真实执行。
- **Codex 真实入口**：安装版选择 `Codex 订阅执行桥（只读）` 后，本机探针显示 `codex-cli 0.155.1` 可用；真实只读任务 `run_mul8tcoe` 成功，UI 显示 5 个事件和 `run_mul8tcoe:codex:segment:1`，SQLite receipt 回读 `authMode=subscription`、`isMock=false`、`status=succeeded`。`billingSource=unknown` 保留为限制，不把订阅额度写成 API 额度。
- **审批重开回归**：安装版从 SQLite 读取 `pending` 并显示审批卡；点击确认后 approval=`approved`、artifactRelease=`released`、5 个最终 Artifact 可回读；重开安装版后审批卡消失，Codex receipt 仍保留。
- **静态验证**：`validate-state`、typecheck、38/38 Node tests、Vite build、`git diff --check` 全部通过；`pnpm` wrapper 仍受 Corepack cache EPERM 影响，但等价本地命令通过。
- **Verdict**：`PASS_ALPHA_USABLE_STABLE`。这只表示本地 Alpha 可继续开发、演示和受控测试；M8-13、DeepSeek、Developer ID、GitHub clean-room、Codex native resume 和多 Bot 真实比较继续 deferred。结果卡：`validation/m8-21-usability-stability-result-v1.json`；Computer Use 与接口原始观察：`validation/m8-21-usability-stability-observation-2026-09-28.md`。


### 2026-09-28 Artifacts SQLite-first 页面收口

- `apps/web/src/lib/api.ts` 的 `workspaceApi.getSnapshot()` 合并 `/api/persistence/entities` 返回的 Artifact 与 Product Builder release state；有持久化实体时优先显示 SQLite 产物，实体不可用才回退 Fixture。
- 列表按 `contentType`/扩展名映射类型，显示 kind、来源数量和 SQLite 标识；详情继续从 `/api/persistence/artifacts/:id` 读取正文、来源和 final/draft 状态。
- 安装版 Computer Use 回归：Artifacts 页显示 5 个 SQLite 产物；打开 `research-report.md` 可见正文、最终产物、`run-fixture-001` 和 `workspace://user-input` 来源。
- 验证：typecheck、validate-state、Vite build、git diff check 通过。下一步转向运行记录页的 SQLite RunEvent/receipt 对齐；DeepSeek 真实通道继续 deferred。


### 2026-09-28 Run 记录 SQLite-first 与刷新回读

- `apps/web/src/lib/api.ts` 读取持久化 receipt 和 `/api/runs/:runId/events`，把 SQLite 事件投影为可读时间线；receipt ID、事件数和演示/真实标识显示在运行详情。
- `apps/server/src/index.ts` 将 Run events 路由扩展为 continuity event 优先、SQLite RunStore fallback，保留未知 Run 的 404 诊断。
- `apps/web/src/App.tsx` 去掉运行记录页写死的统计数字，并将“刷新”接到 snapshot、最近执行和 approval 的本地回读。
- 安装版 Computer Use 验证：运行记录显示 `run-fixture-001`、SQLite receipt、6 个事件；点击刷新后显示“已从本地 SQLite 刷新运行状态”。
- 验证：全套 Node tests 38/38、typecheck、validate-state、Vite build、git diff check 通过；M6-03 标记 DONE。下一步补审批/重试真实 UI 回读；DeepSeek 继续 deferred。

### 2026-09-28 M5-04/M6-04 · 审批/重试真实回读与 Electron 子服务清理

- **Retry API**：Fixture/continuity Run 在 SQLite 中按 `retry:<runId>` 追加 `run.retry_requested`；重复请求返回既有事件，不重复写入；HTTP smoke 覆盖写入与回读。
- **Web 回读**：运行记录页刷新后从 SQLite RunEvent/receipt 重新投影，Computer Use 观察到事件数从 11 增至 12，并显示“已请求重试”和用户原因。
- **桌面稳定性**：发现旧 Electron 窗口退出后 Node 子服务仍占用 4310；`apps/desktop/src/main.ts` 新增统一 `stopServer()`，同时挂接 `window-all-closed` 和 `before-quit`。重新打包、安装、退出后确认端口释放，再启动仍可回读同一 SQLite 数据。
- **验证**：`node scripts/typecheck.mjs`、`node scripts/validate-state.mjs`、Vite build、Electron arm64 目录打包、`git diff --check`、全套 Node tests `41/41` 通过。Corepack 的 `pnpm` wrapper 仍受缓存权限限制，因此打包使用项目内已安装的直接二进制。
- **边界**：当前 Run 已批准，没有再次伪造 pending approval 点击证据；此前安装版 approval→release 回归仍作为审批点击证据。DeepSeek、签名、literal clean-room、真人 A/B 和多 Bot 质量继续 deferred。
- **下一步**：M3-06 FS/Git/Shell sandbox，先补路径穿越、symlink 和命令白名单测试。

### 2026-09-28 M3-06 第一小单元 · 沙箱边界 guard

- 新增 `packages/adapters/src/sandbox.ts`：`resolveSandboxPath` 处理 workspace root、`..`、绝对路径、逐段 symlink 和最终 realpath；`isAllowedCommand` 按完整 argv 精确匹配白名单并拒绝 shell interpreter、`-c` 和 metacharacter；`canUseSandboxOperation` 固化 filesystem/shell allowlist 与 read_only 禁写。
- 新增 3 组适配器专项测试，覆盖合法路径、路径穿越、绝对路径、文件 symlink 逃逸、非存在目标的 root 隔离、命令参数精确匹配、shell 组合和权限层级；适配器测试 `9/9` 通过。
- 没有执行真实 Shell、没有访问项目外路径、没有读取凭据；这只是 M3-06 的纯安全边界单元。
- 下一步：受控 ToolRuntime 的 dry-run/fixture receipt，再补超时、错误分类和 secret 脱敏。

### 2026-09-28 M3-06 第一纵向单元 · FixtureToolRuntime

- 新增 `packages/adapters/src/tool-runtime.ts`，只做 dry-run/fixture 策略验证，不读取文件内容、不写文件、不执行 Shell。
- 通过现有 `resolveSandboxPath`、`isAllowedCommand` 和 `canUseSandboxOperation` 生成 `tool.invoked`、`tool.completed`/`tool.failed` 所需的非敏感数据和 `tool.execution-receipt.v1`。
- `POST /api/runs` 增加 `provider=tool-fixture` 入口；RunEvent 顺序经 HTTP smoke 验证为 `run.created → run.started → tool.invoked → tool.completed → run.succeeded`，越权路径产生 `tool.failed`。
- Web 新建运行增加“受控 ToolRuntime（dry-run / fixture）”选项，运行记录把工具事件映射为可读中文时间线。
- 验证：适配器/服务器相关测试 `15/15`、typecheck、Vite build、`git diff --check` 通过。
- 当前状态仍为 `PARTIAL`：尚未做安装版 Computer Use 回归；超时、错误分类、secret 脱敏和真实工具执行继续后置。
- 唯一下一步：按 `SPEC/DELIVERY-CHECKLIST-V0.1` 执行安装版 Computer Use 验收。

### 2026-09-29 产品模型候选记录 · 能力工作流操作层

- 用户提出过一种可能方向：把能力封装成可复用 Skill/Workflow，由项目内 Bot 在权限、Provider、Memory 和审批边界下调用；Agent 是 Workflow 中负责判断或执行节点的单元。
- 新增 `SPEC/PRODUCT-MODEL-CLARIFICATION-V1.md` 仅作为候选记录，未改变当前 Product Contract、RUN_STATE、交付清单或 backlog；不得把候选方向写成已确认需求。
- 当前 Alpha 已跑通的是控制面和 Product Builder Fixture 全流程；尚未完成 Skill Registry、Skill Version 发布、真实工具执行和自优化闭环。
- 当前唯一下一步仍是按 `SPEC/DELIVERY-CHECKLIST-V0.1` 做安装版 Computer Use 验收，不提前扩展 Manager Agent 或自动 Skill 组合。

### 2026-09-29 M8-22 · ToolRuntime 安装版交付验收

- 安装版 Computer Use 完成受控 ToolRuntime 成功路径：`run_mulgevc0`，5 个事件，receipt `tool-request:run_mulgevc0`，运行记录显示 `tool.invoked → tool.completed → run.succeeded`。
- 刷新后仍从 SQLite 回读 ToolRuntime Run、事件和 receipt；关闭窗口后 4310 端口释放，重新激活应用后 Server、窗口和数据恢复。
- 越权路径 `../outside.txt` 产生 `run_mulge9rt`、`tool.failed` 和 `tool_path_traversal`，没有 `run.succeeded`。
- 首次验收发现 GUI Node 路径和 macOS activate 生命周期问题，分别通过 Node 路径解析和 `app.on('activate')` 最小修正；修正后重复打包和 Computer Use 验收通过。
- 证据：`validation/m8-22-tool-runtime-install-acceptance-2026-09-29.md`。
- 结论：`PASS_ALPHA_TOOLRUNTIME_INSTALL_ACCEPTANCE`。当前 Local Alpha v0.1 已达到交付清单的本地控制面验收门，等待用户接受或提出具体 P0 修改；不自动扩展真实工具执行、Skill Registry 或自优化。

### 2026-09-29 M3-06 · 真实只读 filesystem/read 第一增量

- 用户明确要求不在基础 Alpha 停留，继续把底座推进为实际可用能力；本增量只开放当前项目目录内的真实文件读取。
- 新增 `LocalToolRuntime`：要求 `mode=local`、`filesystem/read` 和 `read_only` policy；拒绝越界、绝对路径、符号链接逃逸、目录和其他操作。
- 读取上限为 256 KB（默认 64 KB），输出相对路径、大小、截断标记、内容哈希和常见凭据形态脱敏后的内容；重复 requestId 返回原结果。
- 新增 HTTP `provider=tool-local` 和 Web 入口；安装版 Computer Use 实际读取 `fixtures/demo-project.json`，Run `run_mulickfo` 成功，刷新后显示 5 个事件和真实执行回执。
- 验证：适配器/服务器相关测试 `16/16`、typecheck、Vite production build 通过；本机安装包目录构建通过。当前仍不开放写入、删除、Git/Shell 或 DeepSeek。
- 唯一下一步：实现只读 Git status 的精确白名单、固定工作目录、超时和失败回执。

### 2026-09-29 M3-06 · 只读 Git status 工程单元与安装版边界

- 新增 `LocalToolRuntime` 的 `shell` 分支，只接受精确 `git status --short`，使用 `shell: false`、固定 cwd、超时和输出脱敏；其他命令直接拒绝。
- 适配器/服务器相关测试达到 `17/17`，typecheck 和 Vite build 通过；临时 Git 仓库测试能读到 untracked 文件。
- 安装版 Computer Use 运行 `run_muliqifg` 返回 `tool_process_exit`，stderr 明确为当前 fixture 目录不是 Git 仓库；没有生成成功事件。
- 结论为 `PARTIAL_M3_06_LOCAL_GIT_STATUS`。下一步不是扩大命令权限，而是把 Project `workspacePath` 接入 ToolRuntime 的唯一 cwd 来源，再用用户授权的真实本地 Git 项目验收。

### 2026-09-29 M3-06 · 项目绑定与桌面服务归属修复后收口

- 复现：多个 Electron 测试包共用固定 `4310`，新包的子服务绑定失败后，健康检查误把旧服务返回的 200 当成启动成功；新窗口因此执行了旧版本代码。桌面 Web 页面又把 API 地址写死为 `4310`，动态端口启动后出现 `Failed to fetch`。
- 修复：桌面子服务通过 IPC 回传自己监听的动态端口，父进程只连接自己创建的 child；监听失败会明确退出；前端桌面模式跟随 `window.location.origin`，开发 Web 仍走 `4310`。
- 验证：服务归属专项 `2/2 PASS`；arm64 桌面包启动于 `61488`；Computer Use 通过 UI 运行 `run_mulk7kis`，状态 `succeeded`，5 个事件，`git status --short` 返回当前项目改动；页面显示“只读 Git status / 已完成”。
- 当前结论：`PASS_M3_06_LOCAL_GIT_STATUS`。下一步是受控的 `git diff --stat` 摘要，不开放写入、删除、任意 Shell 或 DeepSeek。

### 2026-09-29 M3-06 · 只读 Git diff 摘要

- 新增精确命令 `git diff --stat`，沿用项目 `workspacePath`、`shell: false`、超时、输出脱敏和 append-only receipt；不支持任意 diff 参数或其他 Shell 命令。
- 适配器与 HTTP smoke 专项 `14/14 PASS`；桌面 Web 页面新增“只读 Git diff 摘要（查看变更量）”入口。
- Computer Use 通过安装版入口完成 `run_mulkr9p7`，状态 `succeeded`，事件顺序为 `run.created → run.started → tool.invoked → tool.completed → run.succeeded`，输出 `git diff --stat`，`exitCode=0`。
- 下一步改为让 UI 显示项目绑定目录和只读权限，避免用户不知道工具正在读取哪个项目；仍不开放写入、删除、任意 Shell 或 DeepSeek。

### 2026-09-29 M3-06 · 项目绑定可见性

- `GET /api/ui-snapshot` 现在返回运行时实际使用的 `workspacePath`；优先读取 SQLite 项目绑定，没有绑定时使用与 ToolRuntime 相同的本地项目目录。
- Web 概览新增“当前项目边界”卡片，显示 `workspacePath`、只读权限、允许的文件/Git 摘要动作和明确禁止的写入/删除/任意 Shell。
- HTTP smoke 新增 workspacePath 回归断言；server/web/desktop typecheck、Vite build 通过，随后 Electron arm64 目录包重新构建成功。
- 最新固定 DMG：`release/Local Agent Workspace-0.1.0-arm64-fixed-v3.dmg`，SHA-256 `92cfd1f034533e300fdee5cbe42d80917d85db9493174b65ad41861531b47130`；仍未签名。
- Computer Use 浏览器回归看到页面显示真实 `/Users/m4air/Work Agent开发。`、`只读`、允许文件读取/Git status/Git diff --stat，且明确列出禁止写入/删除/任意 Shell。
- 下一步：在保持只读边界的前提下评估更细 diff、受控测试/构建命令或工作区写入，不开放任意 Shell、删除或 DeepSeek。

### 2026-09-29 · Local Agent Workspace v0.1 本地交付版收口

- 完整交付命令 `npm run test:all` 通过：44/44；`npm run demo`、`npm run diagnose` 通过。
- Server/Web/Desktop typecheck、Vite production build、Electron arm64 目录包、`node scripts/validate-state.mjs`、`git diff --check` 和 DMG SHA 校验均通过。
- 新增 `docs/USER-GUIDE.md` 与 `docs/DELIVERY-REPORT-V0.1.md`，更新 README、交付清单、进度和恢复文档，明确本次可交付范围与后续限制。
- `RUN_STATE.json` 收口为 `complete / delivery-v0.1-local-alpha`；这表示本地交付周期完成，不表示 DeepSeek、多 Bot 质量、工作区写入或正式发布已经完成。
### 2026-09-29 Provider 可移植性与工具契约阶段启动

- 用户询问 Codex 订阅执行桥切换到 API 后，提示词缓存、工具调用和上下文恢复是否已经设计好。
- 只读审计确认：现有 ProviderIdentity/Capabilities、Run/Event、ToolPolicy、Sandbox、receipt 和 ContextSnapshot 已有骨架；但没有 provider-neutral message/tool/usage/cache envelope，DeepSeek one-shot 不执行 tool call，Codex prompt 也没有消费 metadata 中的 ContextPacket。
- 新增 `SPEC/09-provider-portability-and-tool-contract.md`，冻结 Codex 执行 Agent、DeepSeek Model Provider、ToolRuntime 三种边界，明确 API 切换矩阵、缓存未知语义、ContextPacket 注入和后续 M3-07 顺序。
- `packages/core/src/types.ts` 新增 `ModelRequestEnvelope`、`ProviderResponseEnvelope`、`ToolDefinition`、`ToolCallEnvelope`、`UsageSummary`、`PromptCachePolicy`、`PromptCacheReceipt` 等 additive 契约；未把它们写成已接入实现。
- `DeepSeekApiAdapter.probeCapabilities()` 纠偏为 `streaming=false`、`toolCalling=false`、`structuredOutputModes=['json_object']`、`promptCaching='unknown'`；新增专项测试防止能力声明超过真实实现。
- 当前阶段状态为 `running`，验证通过后唯一下一步是让 Codex/DeepSeek request builder 显式消费 ContextPacket，再接 ProviderResponseEnvelope 与工具循环。

### 2026-09-29 Provider 可移植性契约验证

- `packages/adapters/src/adapters.test.ts` 专项 13/13 通过，新增断言确认 DeepSeek 不声明未实现的 streaming/tool loop，且只声明 `json_object` structured output、`promptCaching=unknown`。
- `npm run test:all` 45/45 通过；workspace typecheck、`RUN_STATE` 校验和 `git diff --check` 通过。
- 本增量没有真实调用 DeepSeek、没有读取 Key、没有修改旧工作台，也没有把 prompt cache 或 API 互换写成已完成。
- 当前唯一下一步：实现 Codex/DeepSeek request builder，让 `ContextPacket` 显式进入 `ModelRequestEnvelope.context`；暂不扩展完整工具循环。

### 2026-09-29 ContextPacket 显式注入

- `RunRequest` 新增可选 `context?: ContextPacket`；恢复时不再只把 snapshot id/tail id 放在 metadata。
- 新增 `packages/adapters/src/provider-request.ts`：构建 `ModelRequestEnvelope`，把经过 hash 校验的 snapshot、事件覆盖范围、tail events 和 continuation instruction 投影为 Provider 可读的恢复消息。
- Codex prompt 与 DeepSeek `/chat/completions` messages 都通过同一 request builder 消费 ContextPacket；默认 prompt cache policy 为 `disabled`，没有伪造缓存命中。
- 新增 builder 专项测试；适配器专项 14/14、完整测试 46/46、workspace typecheck 和 diff check 通过。
- 仍未宣称真实 DeepSeek recovery、ProviderResponseEnvelope 持久化或完整工具调用循环已完成。下一步是统一 one-shot response/usage/cache receipt。

### 2026-09-29 外部 AI 评审上下文材料落盘

- 新增 `docs/EXTERNAL-AI-DIAGNOSTIC-BRIEF-V1.md`：作为项目状态与外部评审上下文包，汇总当前事实、已验证能力、Prompt Cache/Usage/Cost、Tool Loop、Context Recovery、Provider Swap 和已知限制；它不是外部 AI 已经完成的诊断。
- 新增 `docs/EXTERNAL-AI-PLANNING-PROMPT-V1.md`：可复制给另一个 AI 的独立架构评审提示词，要求先读事实源、区分 verified/partial/proposal、只输出评审和计划，不读取 secrets、不改代码。
- 外部 AI 返回的计划不能直接执行；主控需要先把建议拆成事实一致项、待核验项和待用户/环境项，再写入 backlog。

### 2026-09-29 网页 Chat 一次性上下文包

- 用户澄清外部 AI 是没有本地文件访问权的网页 Chat，而不是 Cursor/Grok Agent。
- 新增 `docs/EXTERNAL-CHAT-ONE-SHOT-PACK-V1.md`：把项目背景、当前状态、Provider、Prompt Cache、Usage/Cost、Tool Loop、Context Recovery、API 替换风险和输出格式全部写入一份可直接复制的长消息。
- `docs/EXTERNAL-AI-PLANNING-PROMPT-V1.md` 保留给能读取项目目录的 Agent/开发环境，并明确网页 Chat 应使用一次性上下文包。

### 2026-09-29 网页 Chat 盲评与知情复核流程

- 用户担心把既有方案和主控结论全部交给网页 Chat 会造成锚定和污染判断。
- 新增 `docs/EXTERNAL-CHAT-BLIND-DESIGN-PACK-V1.md`：只给产品目标、场景、约束、失败问题和验收标准，不提供当前实现和旧结论，要求从零设计。
- 新增 `docs/EXTERNAL-CHAT-INFORMED-COMPARISON-PACK-V1.md`：在第一轮结果之后提供当前真实状态，要求外部 AI 比较保留、推翻、后置和缺口，并给唯一实施路线。
- 推荐顺序为“盲评 → 知情复核 → 主控核验和落盘”，避免既有方案污染，同时保留和当前代码接轨的能力。

### 2026-09-29 外部 Chat 评审重点范围

- 新增 `docs/EXTERNAL-CHAT-REVIEW-SCOPE-V1.md`，把外部评审重点分成 P0/P1/P2：先看产品最小闭环、长任务恢复、Provider 边界和 Tool Loop，再看 Prompt Cache/Usage/Cost、Single/Multi Bot、可观察性，最后才看 Skill 模型、Electron 和视觉细节。
- 评审要求外部 AI 输出唯一主路线、下一步单一工程单元、每阶段停止条件和可能推翻当前方向的证据，避免得到一篇泛泛的 Agent 技术百科。

### 2026-09-29 外部网页 Chat 盲评、知情复核与主控合并

- 用户授权通过 Firefox 网页 Chat 进行计划讨论；本轮只发送项目目标、架构、已核验状态和边界，没有发送凭据，也没有执行外部 AI 建议中的代码或安装动作。
- 外部 AI 先做盲评，再基于本地事实做知情复核。共同结论是把 v0.1 收窄为可恢复、可审计、可替换执行层的 Single-Bot Workflow Runtime，暂缓 Multi-Agent、Skill Marketplace、Computer Use 和 Bot 自我创建。
- 外部 AI 将 Tool Loop 定为唯一下一工程单元；主控核验后与本地 `RUN_STATE.next_action` 合并为 fixture-first 纵向切片：先做 `ProviderResponseEnvelope` 最小回执映射/持久化，再串起 `model → ToolCall → approval → ToolRuntime → tool result → next model segment`。
- 真实 DeepSeek Key、usage/cost/cache、Codex 原生 resume、Context Recovery 业务质量和真人使用证据仍是未完成项；没有把外部建议写成测试通过或产品效果证明。
- 详细取舍和停止条件落盘在 `docs/EXTERNAL-CHAT-RECONCILIATION-2026-09-29.md`；本次没有业务代码变更。

### 2026-09-30 设计完整性与竞品结构审计

- 只读复核本地 SPEC、core 类型、ToolRuntime、验证账本，并核对 Manus 2.0/Cue、Meta Muse、Grok Bot 的官方公开资料。
- 结论：外部 AI 的 Tool Loop 优先顺序适合作为工程路线，但不能替代完整产品设计；当前本地控制面和 SQLite/恢复较可靠，ProviderResponseEnvelope 统一落盘、完整 model→tool→result 循环、Skill 生命周期、Routine/后台触发、Provider 成本/缓存和真人效果仍未完成或未验证。
- 发现两项需要后续冻结的契约问题：ProviderResponseEnvelope 文档要求的 raw response/finish/error 字段与当前 core 类型未完全对齐；Multi-Agent 判定阈值在 `SPEC/04` 与外部合并记录中存在两套版本。
- 发现 Manus/Cue、Meta Muse、Grok Bot 的共同可借鉴结构是持久 Bot、可复用 Skill、Routine/Goal、可见审计和独立执行后端；本项目目前只有部分骨架，不能宣称达到这些产品的结构或效果。
- 完整审计落盘到 `docs/DESIGN-COMPLETENESS-AUDIT-2026-09-30.md`；本次仍未修改业务代码。

### 2026-09-30 全链路 Agent 角色地图与质量门设计

- 用户提出是否把产品、架构、开发、测试、QA、运维、发布等完整岗位都拆成 Agent 并全程协作。
- 主控决定采用分层而不是“所有角色常驻”：L0 确定性 Runtime；L1 一个持久 Product Builder Bot；L2 按 Run 临时激活的产品专家；L3 事件触发的 QA/安全/恢复/发布闸门；L4 后续 Skill/Routine/多 Agent/Computer Use 产品化。
- 状态机、权限、审批、幂等、恢复、审计、成本统计和发布阻断不交给 LLM；QA、Security、Release 不能给自己生成的结果签发最终 PASS。
- 角色责任、输入输出、权限、停止条件、结构化交接和激活顺序落盘到 `SPEC/10-agent-role-map-and-lifecycle.md`；QA、测试、安全、运维和证据硬门落盘到 `docs/AGENT-ROLE-MATRIX-AND-QUALITY-GATES-V1.md`。
- 当前只计划启用 Product Builder 与必要专家节点；Tool Loop 纵向切片仍是下一工程单元，不因“完整团队”而同时启动所有角色。
## 2026-09-30 M3-07d · Codex JSONL envelope 与非测试 SQLite receipt

- **设计裁决**：Codex 继续作为 `ExecutionAgent`；它的 CLI 内部命令不映射为本项目的外部 `ToolCall`。本轮只把最终 `agent_message`、`turn.completed` usage 和失败状态统一成 `ProviderResponseEnvelope`。
- **实现**：`packages/adapters/src/provider-envelope.ts` 新增 Codex segment collector；补齐 `input_tokens`、`output_tokens`、`cached_input_tokens` 映射；运行时追加 `model.response` 事件，并在非测试路径写入独立 `provider.model-response.v1` receipt。普通文本 receipt 脱敏为 hash，结构化 JSON 保留为结构化结果。
- **验证**：Provider/runtime 专项 8/8；`pnpm test:all` 57/57；typecheck、`git diff --check` 通过；临时 SQLite 写入→关闭→重开→回读通过；历史真实 Codex JSONL 离线回放证据为 `validation/m3-07d-codex-envelope-replay-2026-09-30.json`。
- **环境边界**：一次新的真实 Codex smoke 因当前受限环境无法写入 `/Users/m4air/.codex/state_5.sqlite` 而失败，失败 receipt 已保留；没有修改 VPN、权限、Codex 状态库或凭据。这个失败不影响 collector 的 fixture/历史回放证据，也不能写成当前真实调用通过。
- **下一单元**：按 `approvalId` 精确解析/解决审批，并实现持久化 Fixture Tool Loop 的重启后恢复；不接 DeepSeek、不开放写工具或 `full_access`。
## 2026-09-30 M3-07d · approvalId 精确审批与跨进程 Fixture resume

- **实现**：Approval row 保存 `metadata.callId`；`SqliteEntityStore` 新增 `getApproval` 和 `resolveApprovalById`，相同决定幂等、相反决定冲突；旧的按 Run 批量 approve 路径收窄为单 pending approval 才允许。
- **恢复入口**：新增 `POST /api/runs/:runId/approvals/:approvalId/resolve`。批准或拒绝后，若 Run 仍在 `waiting_user`，控制面按持久化 approval 找回 callId，恢复 Fixture Tool Loop；`tool.invoked` 仍由 callId 去重。
- **Web**：审批按钮优先调用精确 approval endpoint，没有 approvalId 时才保留旧兼容路径；Vite production build 和 workspace typecheck 通过。
- **验证**：SQLite approval 专项通过；非测试 HTTP smoke 验证“进程 A 创建 pending → 进程 B 重开 SQLite 并批准 → Run succeeded”；重复批准不新增事件，`tool.invoked` 只有 1 次。证据为 `validation/m3-07d-approval-restart-smoke-2026-09-30.json`。
- **边界**：仍是 Fixture/只读控制面恢复，不是 Codex 原生 resume，也不开放写工具或 `full_access`；真实 Codex 新 smoke 仍受限于 Codex 自身 state DB 只读环境。

## 2026-09-30 M4-02 · Clarification resolution 与 Electron 回读

- **实现**：Product Builder 的 `target_user` 等阻塞澄清项可在本地 Web/Electron 填写；服务端通过 append-only `product_builder.state_checkpoint` 更新同一 Run，重算固定计划和 release blockers。`ProductBuilderProjection` 携带自己的 `runId`，UI 不再把当前执行 Run 错用于澄清或审批；审批按 `approval.runId` 解析，重试仍按当前执行 Run。
- **测试隔离**：HTTP smoke 改用临时 SQLite 数据目录，避免读取或污染开发者持久化演示库；真实应用的 `data/workspace.db` 未清理、未删除。
- **验证**：专项 9/9、`pnpm test:all` 63/63、typecheck、Web build、Electron arm64 directory build、state validation、diff check 通过。Computer Use 输入“独立开发者”并确认后，UI 显示“可以进入审批”、四个下游计划步骤变为“可执行”；退出并重开 Electron 后状态保持。证据：`validation/m4-02-clarification-resolution-2026-09-30.json`。
- **边界**：仍是 Fixture/control-plane 证据；不代表 DeepSeek、真实 Provider Tool Loop、prompt cache/cost 或业务质量已经验证。Codex 自身 `~/.codex` 目录和 `state_5.sqlite` 未写入。
# 2026-09-30 · 当前安全 backlog 收口

- DeepSeek adapter request contract：保留 `input`、`inputRefs`、`constraints`、`outputSchema` 和 verified recovery context；provider usage 标记来源；非 2xx/非法 JSON 显式失败。只做 fake-fetch 离线验证，证据：`validation/m3-02-deepseek-request-contract-2026-09-30.json`。
- `executeLocalFileReadRun` 改用持久化项目 workspace root，并新增只读临时 workspace 回归；证据：`validation/m3-06-local-project-root-2026-09-30.json`。
- Web 当前三档权限标签统一为“只读 / 工作区写入 / 完全访问”；离线 Bot fallback 不再显示过时的“只读（可生成草稿）”。
- 复核：`npm run test:all` 73/73、`npm run typecheck`、Web production build、state validation 和 `git diff --check` 通过。
- 仍未把真实 DeepSeek、Codex native resume、clean-room 网络/签名安装或真人效果写成完成；这些继续按外部条件和独立验证门处理。

## 2026-10-02 · UX hardening v1

- **审批契约校正**：核对 `ApprovalRequest` 与 resolve endpoint 后确认它只支持 approved/rejected，不支持业务选项；Web 移除静态“独立创作者 / 企业内容团队”单选框，改为展示真实 action、权限等级和受控范围。目标用户继续走既有 clarification API。
- **状态与恢复**：失败 RunEvent 映射为 `failed` 并显示失败标记；完成运行显示“最近一次运行”；加载、审批、重试和刷新异常均有可见错误提示，启动失败可重试。
- **入口与可理解性**：新建运行将本地演示、只读项目检查作为主要方式，高级工具和 Codex 执行桥放入高级诊断；帮助按钮提供本地演示、审批和运行方式说明。
- **移动与未实现控件**：移动菜单支持打开、切换、遮罩关闭和 Escape；搜索、设置、Provider 设置、时间筛选和更多视图改为明确的后续开放说明；Artifact 行补齐 Space 键打开和 aria-label。
- **验证**：`npm run typecheck`、`npm run test:all`（73/73）、`npm run validate:state`、`git diff --check`、Impeccable detector（`[]`）、Web production build、Electron arm64 directory build 通过；最新桌面构建用 Computer Use 验证概览、帮助、运行入口、运行记录和状态展示。DMG 仍受本机 `hdiutil` 环境阻塞，未把它写成通过。
# 2026-10-02 · SPEC 对照与 UX 第二轮收口

- 生成 `SPEC/TRACEABILITY-2026-10-02.md`，逐条区分产品契约、运行时、Provider、Tool Loop、Agent 角色、Web/Electron 和现实效果的 `DONE / VERIFIED_ALPHA / PARTIAL / BLOCKED / TODO`。
- 校准 `SPEC/TRACEABILITY.md` 和 `SPEC/PROGRESS.md`，明确旧阶段 `complete` 只代表 `ux-hardening-v1`，不代表全局产品完成。
- Web 概览增加由 Run/Approval 状态计算的“下一步”提示；Bots 与项目产物页的搜索入口改为明确的“后续开放”提示；提高主要说明文字和技术详情对比度。
- 验证：`npm run typecheck`、`npm run test:all`（73/73）、Vite Web production build、`npm run validate:state`、`git diff --check` 和新 Web 版本 Computer Use 回归均通过。证据：`validation/spec-gap-and-ux-v1-2026-10-02.json`。
- 边界：真实 DeepSeek/Codex 质量、Codex native resume、prompt-cache 命中、签名 DMG、clean-room 和真人提效仍未完成或受外部条件限制。
# 2026-10-02 · Fixture Tool Loop Web 入口

- 对照后端已有的 `tool-loop-fixture` 能力，补齐 Web `ProviderChoice`、API 路由、运行回读和用户可见标签。
- 新建运行的“高级诊断”现在可以直接选择“Fixture Tool Loop（完整工具回放，无 Key）”，并明确它不调用真实模型、不读取文件、不产生模型费用。
- Computer Use 已完成选择、启动和结果回读；结果显示 `fixture-tool-loop`、本地计费和完成回执。
- 验证：`npm run typecheck`、`npm run test:all`（73/73）、Web build、state validation 和 diff check 通过。证据：`validation/provider-tool-loop-v1-2026-10-02.json`。
- 边界：真实 DeepSeek Tool Loop、Codex native resume 和业务质量仍未验证。
# 2026-10-03 · 连续执行路线冻结

- **原因**：用户要求先把完整路线落盘，再按路线连续推进，不在普通工程单元结束时反复等待确认。
- **产物**：新增 `SPEC/ROADMAP-EXECUTION-V1-2026-10-03.md`，把当前完成项、剩余阶段、验收门、真实阻塞和停止条件统一成一张可恢复路线表。
- **状态**：`RUN_STATE.json` 从上一阶段 `complete` 重新打开为 `running`，阶段为 `roadmap-and-fixed-quality-v1`；当前唯一下一步是固定任务质量门。
- **边界**：Fixture、单次 HTTP 200 和模型自评不作为质量证明；DeepSeek Key 只可通过环境变量短时使用；Codex 原生 resume、签名 DMG、clean-room clone 和真人提效仍分别保留为边界。

# 2026-10-03 · R3 Provider 边界与 R4 真实 Product Builder 草稿

- **R3 完成**：补齐 Fixture、DeepSeek API、DeepSeek Tool Loop 和 Codex 执行桥的身份/能力矩阵与测试；明确 `billingSource`、`actualModel`、`isMock`、usage/cache 和 Codex 环境降级，不把订阅额度写成 API 额度。证据：`validation/provider-boundary-v1.json`。
- **R4 纵向切片**：新增 `POST /api/product-builder/provider-draft`。真实 DeepSeek 只生成固定 Schema 的可审阅草稿，输出必须包含 `unknowns`、`source_refs`、`success_metrics` 和 `approval_required=true`；通过校验后保存 Provider receipt 与 SQLite draft Artifact，仍返回 `pending_user_approval`，不替换 Fixture 正式 Artifact。
- **真实证据**：固定非敏感输入真实返回 HTTP 200；请求标签为 `deepseek-chat`，实际模型为 `deepseek-flash`，usage 为 294/709/1003，缓存命中 128；事件链包含 `provider.event`、`artifact.created` 和 `run.succeeded`。证据：`validation/deepseek-product-builder-draft-v1-2026-10-03.json`。这不是质量证明。
- **修正**：第一次真实请求暴露可选 endpoint 环境变量覆盖默认地址的 bug；已修复并增加回归测试，失败原始证据保留为 `validation/deepseek-product-builder-draft-adapter-default-bug-2026-10-03.json`。完整测试 79/79，typecheck 通过。
- **Web 回归完成**：Web 高级诊断入口已接入真实草稿路由。Computer Use 在无 Key 的本地 API 上完成选择、提交和回读；页面显示失败 Run 与 `deepseek_api_key_missing`，没有假成功或正式 Artifact 晋级。证据：`validation/deepseek-product-builder-web-no-key-cua-v1-2026-10-03.json`。
- **验证**：`npm run build:web`、`npm run typecheck`、`npm run test:all`（79/79）和 `npm run validate:state` 通过。
- **下一阶段**：进入 R5 长任务上下文与成本基线，盘点并固化 ContextSnapshot、stable-prefix hash、usage/cache、reasoning_content 回放和分段恢复；不把本地 hash 写成缓存命中。

# 2026-10-03 · R5 基线与 R6 Web 回读修正

- **R5 基线**：新增 `scripts/context-cost-baseline.mjs` 与 `npm run context:baseline`，一次性验证压缩阈值、ContextSnapshot 尾部恢复、stable-prefix hash、DeepSeek `reasoning_content` 回放、provider cache receipt 和成本 unknown 语义。证据：`validation/context-cost-baseline-v1-2026-10-03.json`。
- **发现的问题**：无 DeepSeek Key 时，服务端原先直接返回 503，没有创建失败 Run；即使前端显示了失败，刷新后也会退回 Fixture。这个行为不满足“失败可见且可回读”。
- **修正**：无 Key 现在会创建并持久化失败 Run；Web 的 `getSnapshot`/`getLatestExecution` 会读取 runtime Run，并根据真实 Provider、状态和错误填充页面，不再用 Fixture 标题覆盖真实失败。
- **Computer Use 验证**：提交无 Key 草稿、关闭对话框、刷新后仍看到“DeepSeek Product Builder 草稿 / 失败 / API key 未配置”。证据：`validation/deepseek-product-builder-web-no-key-cua-v2-2026-10-03.json`。
- **主流程对照**：随后用同一工作台运行 Fixture 主流程，看到 5 个产物、2 项待确认和“等待人工确认”；两条路径的 Provider、状态和提示没有互相覆盖。证据：`validation/web-main-and-failure-cua-v1-2026-10-03.json`。
- **验证**：typecheck、Web build、`npm run test:all`（79/79）、context baseline、state validation 和 diff check 通过。
- **下一步**：R6 继续收口 Web/Electron 主旅程、失败/重试/Artifact/来源语义与桌面启动边界，再生成交付验收报告。

# 2026-10-03 · R6 Web/Electron 本地体验门

- **Web**：真实 DeepSeek 无 Key 失败能持久化并刷新回读；Fixture 主流程仍显示 5 个产物和等待人工确认；Provider 卡片不再把真实失败显示成内部 provider 名或“本地演示无费用”。
- **Electron**：`npm run build:desktop` 通过；`apps/desktop/test/server-process.test.cjs` 在受控本机权限下 2/2 通过，验证只连接自己的子服务、重启换端口和占用端口不冒充成功。
- **证据**：`validation/r6-web-electron-closure-v1-2026-10-03.json`、`validation/web-main-and-failure-cua-v1-2026-10-03.json`。
- **边界**：未签名 DMG、clean-room GitHub clone 和真人提效仍未完成；这些不能用目录构建或 Fixture 代替。
- **下一阶段**：进入 R7 安装与交付复现，先跑隔离目录启动/诊断/退出，再记录封装和外部环境限制。

# 2026-10-03 · R7 本地交付复现

- **命令**：`npm run setup`、`npm run demo`、`npm run diagnose`、`npm run build:web`、`npm run build:desktop` 和 `npm run package:mac` 均通过。
- **DMG**：当前源码生成 `release/Local Agent Workspace-0.1.0-arm64.dmg`；`hdiutil verify` 通过，SHA-256 为 `671d111e21b9de714fc3f143897a68ef3bab1ce341c286decaadfef4dd6953fa`；只读挂载后确认包含 `Local Agent Workspace.app`，随后卸载。
- **桌面服务**：Electron `server-process` 2/2 通过，验证自有子进程、重启换端口和占用端口隔离。
- **环境边界**：无 Developer ID 证书，DMG 未签名；当前 Git 仓库没有 remote，literal GitHub clean-room clone 未执行；Codex 0.155.1 自身 state 目录不可写，仍为 `blocked_environment`。
- **证据**：`validation/r7-delivery-reproduction-v1-2026-10-03.json`；用户操作说明和当前 DMG 名称已同步到 `docs/USER-GUIDE.md` 与 `docs/DELIVERY-REPORT-V0.1.md`。
- **下一步**：进入 R8，整理对外演示包和本人掌握包，明确每个结论的证据边界。

# 2026-10-03 · R8 掌握材料与本版本交付收口

- **材料**：新增 `docs/INTERVIEW-DEMO-PACK-V1-2026-10-03.md`，包含 30 秒介绍、5 分钟演示、10 分钟追问、证据索引和不可夸大的结论；`validation/r8-interview-pack-v1-2026-10-03.json` 记录材料检查。
- **最终边界**：本版本已经达到“本地可运行、可追踪、可恢复、可打包、可解释”的交付条件。真实模型质量、多 Bot 优势、Codex native resume、GitHub clean-room 和真人提效没有被写成完成。
- **R9**：真人现实验证按用户此前决定后置；没有本人真实记录前，只保留为未验证，不阻塞本地交付版。

# 2026-10-03 · 交付事实源与恢复文档收口

- **状态**：重新核对 `AGENTS.md` 与 `RUN_STATE.json`；当前唯一机器状态为 `complete / delivery-ready-v1 / 6/6`，没有重新打开已完成阶段。
- **文档修正**：`HANDOFF.md` 顶部新增当前终态、DMG hash、恢复规则和未验证边界；`README.md` 增加当前交付状态和 macOS 包信息；路线表更新为“本版本已达到本地交付条件”，避免旧历史段落被误读为当前下一步。
- **最终验证**：`npm run validate:state`、`npm run typecheck`、`npm run test:all`（79/79）、`npm run build:web`、`git diff --check` 全部通过。此前已完成的 Electron server-process 2/2、DMG `hdiutil verify`、只读挂载和 Computer Use 回读证据保持有效。
- **恢复规则**：额度中断后先读取 `RUN_STATE.json`、`SPEC/ROADMAP-EXECUTION-V1-2026-10-03.md`、`docs/USER-GUIDE.md` 和 `docs/INTERVIEW-DEMO-PACK-V1-2026-10-03.md`；不要从聊天记录或 HANDOFF 历史条目猜测状态。后续只有用户明确选择 R9 或提出新功能时才继续。

# 2026-10-03 · 上下文连续三次压缩验证

- **实现**：新增 `scripts/context-multi-pass-validation.mjs` 和 `packages/core/src/context-multipass.test.ts`；不改变 ContextSnapshot 生产代码，只验证现有结构化恢复契约。
- **验证**：连续生成 3 次带父链的 Snapshot，逐次回放同一 Run，检查目标、约束、事实、决定、未知项、审批、交接、Artifact、下一步、事件范围和 hash；同时验证篡改被拒绝。`npm run context:multi-pass`、专项 Core 测试（3/3）和 typecheck 通过。
- **证据**：`validation/context-multi-pass-v1-2026-10-03.json`。
- **边界**：这证明结构化状态的三次连续压缩/恢复，不证明自由聊天全文保留，不证明真实模型在恢复后的生成质量等同于未压缩路径，也不证明缓存成本下降。
- **状态**：该验证单元已完成；用户要求暂停的 EVAL/RSI 增量仍保持暂停，等待明确恢复。

# 2026-10-03 · SQLite 长任务深层恢复验证

- **范围**：在真实 SQLite RunStore 上执行一次只读 Tool Loop；Provider 在工具完成后故意中断，关闭并重开数据库，再对同一逻辑 Run 执行 retry/start 和恢复回放。
- **验证**：恢复后 Run 成功；工具调用只保留 1 次 `tool.invoked` 和 1 次 `tool.completed`，Artifact 只生成 1 次；连续写入并回读 3 个带父链的 ContextSnapshot，目标、约束、决定和下一步保持一致。
- **证据**：`validation/context-deep-recovery-v1-2026-10-03.json`；命令 `npm run context:deep-recovery`。
- **边界**：这是 Fixture Provider + 真实 SQLite/本地只读工具的恢复验证，不代表真实模型质量、Provider 原生 resume、自由聊天全文不丢或缓存成本收益。
- **状态**：上下文深层验证已完成；EVAL/RSI 仍暂停，恢复后从 EVAL-01 开始，不重复本次验证。

# 2026-10-03 · 结构化上下文量化基准

- **范围**：新增 `scripts/context-benchmark.mjs` 和 `npm run context:benchmark`；固定 10/30/100/300 个事件的历史，每种规模连续生成 20 个 Snapshot。
- **结果**：80 次恢复检查均保留 10/10 个结构化字段；父链、hash 篡改和事件缺口检测通过。恢复包相对完整账本的本地 token 估算缩减为 62.1%～98.6%，构建/恢复 P95 均在本地毫秒级。
- **报告**：`validation/context-benchmark-v1-2026-10-03.md`；机器证据：`validation/context-benchmark-v1-2026-10-03.json`。
- **边界**：这是 ContextLedger → ContextPacket 的控制面和包大小基准；本地 token 估算不等于 Provider 账单，不证明真实模型语义质量、提示词缓存成本收益或自由聊天全文无损。
- **状态**：结构化上下文控制面可以告一段落；真实 Provider 的无压缩/多次压缩语义对照保留为独立后续项，EVAL/RSI 继续暂停。
# 2026-10-03 · 公开 Benchmark 矩阵与 LongMemEval 检索基线

- **用户要求**：使用公开/行业 Benchmark 协议进行更多测试，产出可展示的文件；不同协议不能直接横比，Harness 只能在相同数据、模型、提示词、判分和重试条件下比较。
- **矩阵**：新增 `SPEC/13-public-benchmark-and-harness-comparison-v1.md` 与 `validation/public-benchmark-matrix-v1-2026-10-03.json`，纳入 LongMemEval、LoCoMo、LongBench、RULER、NoLiMa，并明确各自用途、状态和证据边界。
- **LongMemEval 数据**：使用官方 `LongMemEval_S cleaned`，500 题；按官方检索规则排除 30 道 abstention，实际 470 题。数据 SHA-256 为 `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`；官方仓库提交 `9e0b455f4ef0e2ab8f2e582289761153549043fc`。
- **实现**：新增 `scripts/longmemeval-retrieval-baseline.mjs` 与 `npm run benchmark:longmemeval`。BM25 按官方 `doc.split(" ")`、`query.split(" ")` 和 session 粒度重实现；另跑最近优先基线和答案 session 上界。
- **结果**：`validation/longmemeval-retrieval-v1-2026-10-03.json/.md/.svg`。最终 BM25 Recall any@5=89.4%、Recall all@5=74.7%、NDCG@5=77.0%、Recall all@10=81.3%，前 5 session 平均上下文缩减 87.3%；最近优先 Recall all@5=5.7%；Oracle 仅作上界。
- **修正**：首次运行后修正报告的 abstention 统计（940→30），移除非官方停用词/归一化，并按 `rank_bm25` 官方 IDF 公式重跑；最终 BM25 Recall any@5=89.4%、Recall all@5=74.7%、Recall all@10=81.3%。`git diff --check` 保持通过。
- **LoCoMo 诊断**：只读克隆官方仓库 `3eb6f2c585f5e1699204e3c3bdf7adc5c28cb376`，使用 10 段对话、1,982 道带 evidence 的 QA 跑 lexical BM25 evidence-recall。结果 `evidence_any@5=49.9%`、`evidence_all@5=42.8%`、前 5 turn 平均上下文缩减 99.1%；8 个标注 evidence ID 不在语料中，保留并单独报告。证据：`validation/locomo-evidence-retrieval-v1-2026-10-03.{json,md,svg}`。
- **Reader 子集冻结**：新增 `validation/longmemeval-reader-subset-v1-2026-10-03.json`，按 6 类各 3 道非 abstention + 2 道 abstention 固定 20 题；输入禁止 `answer`、`answer_session_ids` 和 `has_answer` 泄漏，官方 GPT-4o judge 仍为 pending_model_credentials。
- **边界**：本轮没有调用模型，不能说最终 QA 正确率、真实 Provider 质量、多 Bot 优势或 Harness 排名已验证。下一步是固定 20 题 reader/QA 子集，并在同一模型、同一判分器下对照无压缩与多次压缩。
# 2026-10-03 · OpenRouter Key 与 GPT-4o 最小探针

- 用户提供的 OpenRouter Key 通过 `GET /api/v1/key` 返回 HTTP 200；未把 Key 写入仓库或证据文件。接口显示 Key 有效、非 free tier、累计 usage=9.5711，但没有返回余额字段。
- 使用 `openai/gpt-4o`、Provider 固定 OpenAI、关闭 fallback、`max_tokens=1` 做最小 Chat Completions 请求，返回 HTTP 402：`Insufficient credits`。
- 结论：Key 没有被撤销，GPT-4o 路由本身可请求；当前阻塞是 OpenRouter 账户额度，不是代码、VPN 或模型关闭。证据：`validation/openrouter-gpt4o-smoke-v1-2026-10-03.json`。
- 安全边界：本次没有保存原始响应、没有修改账户。该 Key 已在聊天中以明文出现，建议用户在 OpenRouter 控制台撤销并重新生成，不再把它用于正式环境。

# 2026-10-03 · OpenRouter 第二个 Key 对照探针

- **账户对照**：第二个 Key 的 `/api/v1/key` 也返回 HTTP 200；两个 Key 的 `creator_user` 与 `workspace` 一致，因此是同一个 OpenRouter 账户/workspace 的两个 Key，不是两份独立余额。两个 Key 的原文均未写入项目。
- **最小调用**：第二个 Key 使用与首个 Key 相同的 `openai/gpt-4o`、固定 OpenAI provider、关闭 fallback、`max_tokens=1` 请求，返回 HTTP 402 `Insufficient credits`。
- **结论**：第二个 Key 本身有效，但同一账户当前没有足够可用额度完成 GPT-4o 调用；`reportedUsage` 不是余额字段。证据：`validation/openrouter-key-comparison-v1-2026-10-03.json`。
- **边界**：没有继续重复请求，没有修改账户；只有补充额度或提供另一授权 API 通道后，才继续冻结的 20 题 reader/judge。

# 2026-10-03 · 同一 Codex 执行器的上下文恢复验证

- **用户方向收窄**：不再等待 OpenRouter 额度，也不做不同模型/Harness 的横向比较；直接用当前 Codex 订阅执行桥验证本项目自己的压缩恢复包。
- **运行**：同一 `CodexExternalAdapter`、同一只读沙箱、同一提示词，分别读取完整 `ContextLedger` 与经过 hash/事件范围校验的 `ContextPacket`。
- **结果**：两条真实 Codex Run 均完成；目标、约束、事实、决定、未知项、审批、交接、Artifact 和下一步共 12 个关键标记全部找回。完整状态估算 4,195 tokens，恢复包估算 774 tokens，估算缩减 81.5%。
- **证据**：`validation/context-codex-recovery-v1-2026-10-03.json`、`validation/context-codex-recovery-v1-2026-10-03.md`、`SPEC/14-context-codex-validation-v1.md`。
- **边界**：Codex CLI 回执没有稳定暴露内部压缩策略或 prompt-cache 语义；本结果只证明本项目结构化恢复包可被同一 Codex 读取，不证明 Codex 原生 resume、自由聊天全文无损或实际账单成本收益。

# 2026-10-03 · 外部架构机制研究与受控 RSI 设计

- **范围**：只读核对 Paperclip、Hindsight、Univer、StarNet 的公开仓库、许可证、当前快照和关键运行模块；没有安装依赖、复制代码或修改旧工作台。
- **结论**：不引入任何一个完整项目。吸收 Paperclip 的事件/审批幂等与预算治理，Hindsight 的 retain/recall/reflect 和证据记忆边界，Univer 的插件/facade 边界，以及 StarNet 的 projection、逐次 consent 和有界恢复。
- **RSI 边界**：只允许“证据 → 候选 Prompt/Skill/MemoryPolicy → 固定评测 → 审批 → 分阶段启用/回滚”；不允许自动改权限、Provider、状态机、生产代码、Bot 注册或后台 Routine。
- **产物**：`SPEC/15-external-architecture-absorption-and-controlled-rsi-v1-2026-10-03.md`，包含来源快照、机制说明、吸收矩阵、风险、验证方式和后续顺序。
- **状态**：研究设计完成，代码接入未开始；后续恢复 EVAL/RSI 时先审计 `ABS-STARNET-01/02/03` 与 `ABS-PAPERCLIP-01/02`，不重跑上一轮 Codex 上下文验证，也不把 OpenRouter/DeepSeek 重新设为阻塞。

# 2026-10-03 · P0 差异审计与最小安全修正

- **审计范围**：检查 `allowedPaths`、项目范围详情、Handoff 过滤、动态权限撤销、事件语义幂等、重试上限、运行投影和中断恢复；不安装第三方框架、不做数据库迁移、不重跑 OpenRouter/DeepSeek。
- **发现并修正**：ToolRuntime 原先只做 workspace-root 和 symlink 检查，没有执行非空 `allowedPaths`；现在 Fixture/Local filesystem read/write 在路径解析后拒绝未列入 allowlist 的路径，并产生 `tool_path_not_allowlisted` 回执。
- **发现并修正**：Artifact/Source 详情原先可脱离项目查询；现在详情必须带 `projectId`，项目不匹配返回 404。Handoff 列表改为项目过滤；Product Builder 首次运行只补齐缺失的内置 Bot Profile，不覆盖用户已有修改。
- **保留为设计项**：动态撤销、语义事件幂等、有界重试、全量 runs/receipts/Bot detail 项目投影仍涉及公共契约，未用局部判断伪装完成。
- **验证**：adapters 22/22、HTTP smoke 2/2、persistence 12/12、continuity/tool-loop/context 17/17、typecheck、state validation、`git diff --check` 均通过。HTTP smoke 新增缺少项目范围 400、跨项目 Artifact/Source 404 断言。
- **产物**：`SPEC/16-p0-difference-audit-v1-2026-10-03.md`。下一工程单元先冻结四项公共契约，优先补齐 project-scoped projection，再做 bounded retry、semantic event idempotency 和 dynamic permission revoke。

# 2026-10-03 · Project-scoped 运行投影

- **范围**：只修多项目读取投影；不实现重试上限、Provider 事件语义幂等或动态权限撤销。
- **修正**：`/api/core/runs` 支持 `projectId` 过滤；Run 详情和事件详情在带项目范围时校验归属；`entities` 的 Provider receipt 通过 Run/Artifact/Approval 归属过滤；Web 的运行列表、最近运行和事件回读都传递当前项目 ID。
- **验证**：HTTP smoke 新增 A/B Run、事件、Artifact、Handoff、receipt 隔离以及 SQLite 关闭/重开回读；HTTP 2/2、persistence 12/12、Product Builder continuity 7/7、Web build、typecheck、state validation 和 diff check 均通过。
- **边界**：旧的无 `projectId` 诊断读取仍保留全局兼容；Bot 详情/复制的全局兼容路径和 receipt 的物理 `project_id` 字段暂不改，避免未经设计的迁移。
- **产物**：`SPEC/17-project-scoped-projection-v1-2026-10-03.md`。下一单元为 bounded retry。

# 2026-10-03 · Bounded retry 有界重试

- **问题**：Run 原先允许无限 `failed → queued`，HTTP retry 使用固定 key，第二次请求可能只回放第一次结果；这会混淆“请求重试”和“实际再次执行”。
- **实现**：新增 `packages/core/src/retry-policy.ts`；默认每个 Run 最多 2 次 retry，`RunRequest.retryPolicy.maxRetries` 可降低或配置但受硬上限 5 约束。每次 retry 写入独立 `run.retry_requested`，记录 attempt、上限、手动/自动模式、失败分类、原失败码和幂等键；没有数据库迁移。
- **路由行为**：成功、取消、未失败、不可重试失败和预算耗尽均返回可诊断 409；Product Builder 已发布状态拒绝 retry。retry 路由只重新排队，不调用 Provider/Tool，不制造 Artifact 或成功 receipt。
- **恢复**：InMemory 与 SQLite RunStore 都由事件历史计算 attempt；SQLite 事务同时保存状态、事件和幂等键，关闭重开后仍可回读 retry 记录。
- **验证**：Core 1/1、HTTP smoke 2/2、SQLite persistence 13/13、Product Builder continuity 7/7、Tool Loop 9/9、typecheck 和 `git diff --check` 通过；随后 `npm run test:all` 全套 82/82、Web build 也通过。
- **产物**：`SPEC/18-bounded-retry-v1-2026-10-03.md`、`validation/bounded-retry-v1-2026-10-03.json`。下一单元为 Provider/RunEvent 语义幂等；不在本轮实现动态权限撤销或自动后台 retry。

# 2026-10-03 · Provider/RunEvent 语义幂等

- **问题**：Provider 重连可能用新的随机事件 ID 重放同一业务事实；旧的 event ID/sequence 约束无法阻止语义重复，receipt 还可能被同 ID 覆盖。
- **实现**：新增 `packages/core/src/semantic-events.ts` 与 `apps/server/src/event-idempotency.ts`；Provider、Tool、Artifact、Approval、segment 和 retry 事件按稳定语义键去重。InMemory、SQLite RunStore、JSONL/SQLite continuity 统一先识别重放，再校验 sequence；当前 retry attempt 的终态不能被后到的不同终态覆盖。
- **回执**：`provider_receipts` 改为保留第一份；同 ID 的不同内容写入稳定 `:variant:<sha256-prefix>`，相同内容重放不增加记录。
- **修正**：第一次接入时发现未提供语义键的普通事件被错误地当成同一事件，导致 `tool.invoked/tool.completed` 和 segment 事件丢失；已改为只有非空语义键才走预回放，并补了 HTTP smoke/runtime 回归。
- **验证**：语义专项 5/5、相关 persistence/HTTP/runtime/Tool Loop 通过；`npm run test:all` 87/87、`npm run typecheck`、`npm run build:web`、`npm run validate:state`、`git diff --check` 均通过。
- **产物**：`SPEC/19-semantic-event-idempotency-v1-2026-10-03.md`、`validation/semantic-event-idempotency-v1-2026-10-03.json`。下一单元为动态权限撤销；上下文验证仍固定同一 Codex/Text 通道，不做跨模型比较。

# 2026-10-03 · 动态权限撤销

- **问题**：审批在排队、恢复或重试期间可能被用户撤销；只传递旧的 `approvalGranted` 布尔值会让工具继续使用过期授权。
- **实现**：`ToolPolicy.policyVersion`、`ToolAuthorizationSnapshot`、SQLite approval revoke、调用前 `authorizationVerifier` 和 `tool.authorization_revoked` 事件已经接入。撤销接口为 `POST /api/runs/:runId/approvals/:approvalId/revoke`；撤销后的调用 fail closed，不进入 ToolRuntime。
- **幂等**：重复撤销返回 `changed=false/idempotent=true`；SQLite 关闭/重开保留 `cancelled`；工具运行时即使直接收到 revoked/expired/cancelled 快照也拒绝副作用。
- **验证**：Tool Loop、Fixture ToolRuntime、SQLite 持久化、HTTP 路由专项通过；`npm run test:all` 90/90、`npm run typecheck`、HTTP smoke 2/2 通过。证据：`SPEC/20-dynamic-permission-revoke-v1-2026-10-03.md`、`validation/dynamic-permission-revoke-v1-2026-10-03.json`。
- **边界**：不监听全局后台，不杀掉已启动的 OS 进程，不自动扩大权限；下一工程单元优先补齐全量 project-scoped projection。

# 2026-10-03 · 完整项目范围投影

- **问题**：项目实体列表已经带范围，但 Run 详情、Run 事件、receipt 回放链接和 Bot 详情/停用仍保留无 `projectId` 的兼容路径；这会让“知道 ID 就能读取”的边界不一致。
- **实现**：Run 列表/详情、RunEvent、实体列表和 Bot 详情/停用现在要求 `projectId`；项目不匹配统一返回 404，缺少范围返回 400。Provider model receipt 的 `replayRef/eventsRef` 同步带项目范围。`/api/ui-snapshot` 明确保持为 workspace bootstrap，不承载项目私有详情。
- **验证**：HTTP smoke 新增无范围拒绝、Bot 详情/跨项目 404、Run/事件范围回归；`npm run typecheck`、专项 server tests、`npm run test:all`、Web build、state validation 和 diff check 通过。证据：`SPEC/17-project-scoped-projection-v1-2026-10-03.md`、`validation/project-scoped-projection-v1-2026-10-03.json`。
- **边界**：`provider_receipts` 未新增 `project_id` 列，继续通过 Run/Artifact/Approval 归属投影；自动后台 retry 不在本工程单元内启用。
# 2026-10-03 · 外部机制吸收与受控 RSI successor phase 启动

- **前置事实**：上一阶段 `project-scoped-projection-v1` 的 P0 7/7 保持为历史完成证据；没有把旧阶段重新打开。
- **本阶段目标**：把 Paperclip、Hindsight、Univer、StarNet 的研究结论转成具体吸收清单，并实现一键启动的受控 RSI 最小闭环（证据→候选→固定评测→受控发布/待审批→投影→回滚）。
- **边界**：不做 DeepSeek/OpenRouter/GPT-4o 或不同 Harness 横向比较；上下文只用同一 Codex/Text 通道验证结构化恢复；不做数据库迁移、不复制第三方代码、不自动改权限/Provider/代码/Bot/Routine。
- **已落盘**：`SPEC/21-external-absorption-rsi-execution-v1-2026-10-03.md`，已写明完成定义、停止条件、吸收矩阵、事件/Artifact/Approval 事实源和 API/UI 最小契约。
- **当前状态**：`RUN_STATE.json` 已切换到 `running / external-absorption-rsi-v1 / 1/6`；本阶段唯一下一步是核对最多四个新增项目（Inspect AI、Langfuse、LangGraph、OpenHands）的具体源码机制并回写矩阵。

# 2026-10-03 · 外部缺口研究收口

- **研究范围**：按缺口核对 Inspect AI、Langfuse、LangGraph、OpenHands Software Agent SDK 的官方仓库、许可证、公开源码/文档和维护信号；没有安装依赖或复制代码。
- **具体吸收**：Inspect 的 Task/Solver/Scorer/Score 分层进入本地 evaluator 契约；Langfuse 的 Trace→Dataset/Experiment→Score 关联进入本地 RunEvent/Artifact 报告；LangGraph 的 checkpoint/interrupt/replay 幂等语义复用现有 RunEvent/Approval；OpenHands 只吸收 Action/Observation、workspace scope 和控制面/执行器分层的设计边界。
- **许可证边界**：Inspect、LangGraph、OpenHands SDK 为 MIT；Langfuse 主体为 MIT，但 `ee/` 及对应目录受单独 `ee/LICENSE` 约束；本项目不复制 Enterprise 代码，不引入第三方运行时。
- **证据**：详细机制、来源链接、吸收状态和验证文件已写回 `SPEC/21-external-absorption-rsi-execution-v1-2026-10-03.md`。
- **状态**：`RUN_STATE.json` 推进到 `external-absorption-rsi-v1 / 2/6`；唯一下一步切换为 RSI 事件/投影契约，不做数据库迁移。

# 2026-10-03 · RSI 事件与纯投影契约

- **实现**：`packages/core/src/types.ts` 增加 `improvement.*` 事件类型；新增 `packages/core/src/improvement.ts`，定义 proposal/evaluation/approval/release/rollback 记录、风险 target 判定和 append-only 事件投影；`packages/core/src/index.ts` 导出契约。
- **安全边界**：投影只读取同一 Run 的事件；任何带不同 `projectId` 的 improvement 事件抛出 project mismatch；高风险 target（tool_policy/provider/code/bot/routine）不会被标为低风险自动发布。
- **验证**：`packages/core/src/improvement.test.ts` 4/4；`npm run typecheck`、`npm run validate:state`、`git diff --check` 通过。
- **状态**：`RUN_STATE.json` 推进到 `external-absorption-rsi-v1 / 3/6`；唯一下一步是服务端 deterministic RSI 最小闭环，不做数据库迁移。

# 2026-10-03 · RSI 自动更新 not_found 回归收口

- **复现**：新构建 UI 在 127.0.0.1:60630 点击“开始自动更新”返回 `自动更新失败：not_found`；同端口直接 `POST /api/improvements/run` 也返回通用 404。
- **定位**：工作区源码与 release 包的 `apps/server/src/index.ts` hash 一致，且都包含 RSI 路由；60630 的 Node 子进程是重建前已加载的旧内存 handler。问题不是 projectId、请求体或前端路径。
- **修复动作**：清理旧的本项目 Electron/Node 实例，重新从当前 `release/mac-arm64/Local Agent Workspace.app` 启动；没有改公共 API、没有安装依赖、没有改 VPN 或旧工作台。
- **验证**：当前包临时服务 60631 的 `POST /api/improvements/run` 返回 `201 Created`；新 Electron 服务 65498 经 Computer Use 点击同一按钮后显示“固定检查 通过 / 候选版本 prompt:v3 / 处理方式 自动记录”，并出现“回滚这次更新”，没有再次出现 `not_found`。完整工程检查仍以 RSI validation card 为准。
- **预防**：重新打包后必须退出旧 Electron 实例再启动新包；不把旧进程继续提供的静态页面当作新构建的路由验收。
- **边界**：Codex/Text `npm run context:codex` 的 `Operation not permitted` 仍是独立环境阻塞；按用户决定不做模型或 Harness 横向比较。

## 2026-10-04 本地评测与记忆接入 v1

- 新增 `packages/core/src/evaluation.ts`：`EvalTask`、`Score`、`FeedbackEvent` 契约。
- 新增 `packages/core/src/memory.ts`：`MemoryAdapter` 的 `retain/recall/reflect` 接口。
- 新增 `apps/server/src/memory-adapter.ts`：基于既有 SQLite `memory_items` 的有界关键词召回、复盘和确定性幂等保存。
- RSI 评测产物现在同时保存评测任务、评分和反馈，并将反馈写入 `rsi.feedback` 项目记忆；没有新增 SQLite migration。
- 验证：`npm run typecheck` 通过；专项 6/6；`npm run test:all` 104/104。
- 边界：首版是本地证据链和关键词召回，不宣称语义向量检索、真实模型质量提升或真人提效。

## 2026-10-04 评测证据用户可见闭环

- **实现**：Improvement API 的创建、详情和回滚响应新增 `evaluationBundle`；Web“受控自动更新”卡片显示评分、评测任务、反馈摘要和历史记忆引用条数。
- **事实源**：页面只投影 RunEvent/Artifact 的结构化结果，不新增第二套业务状态，也不把 Fixture 结果写成真实模型效果。
- **验证**：`npm run typecheck`、`npm run build:web`、Improvement HTTP 4/4、MemoryAdapter 1/1、`npm run test:all` 104/104 均通过。
- **证据**：`validation/local-eval-memory-rsi-ui-v1-2026-10-04.json/.md`。
- **边界**：这证明评测证据能被用户看到并回放；不证明语义检索、真实模型质量提升、真人提效或自动修改代码/权限/Provider。

## 2026-10-04 记忆混合召回 v1

- **实现**：`MemoryAdapter` 增加 `lexical/hybrid` 策略、固定 `now` 评测时间和可解释的 `lexicalScore/phraseScore/recencyScore`；SQLite 适配器保留原有中文子串匹配。
- **混合公式**：`0.7 × lexicalScore + 0.2 × phraseScore + 0.1 × recencyScore`。混合模式只作为可选策略，默认仍是 `lexical`。
- **验证**：固定样例中关键词基线把更新但词序拆散的记录排在前面；混合模式把完整短语排到第一位；项目隔离通过。`npm run memory:baseline`、typecheck、专项 4/4、`npm run test:all` 105/105、Web build 和 diff check 均通过。
- **证据**：`SPEC/24-memory-recall-hybrid-v1-2026-10-04.md`、`validation/memory-recall-hybrid-v1-2026-10-04.json/.md`。
- **边界**：这是固定样例的排序改善，不是向量检索、真实模型质量提升或真人提效证明；没有引入第三方运行时或 SQLite migration。

## 2026-10-04 记忆召回扩大固定基准

- **范围**：11 条固定记忆、6 条固定查询，覆盖英文连续短语、词序拆散、中文子串、scope 过滤和项目隔离。
- **结果**：关键词模式 Hit@1 `2/6`、MRR `0.638889`；混合模式 Hit@1 `4/6`、MRR `0.833333`；两者 Hit@3 均为 `6/6`。
- **判断**：混合模式在固定合成样例中更好，但不足以证明真实项目整体收益，所以默认仍保持 `lexical`。
- **证据**：`validation/memory-recall-benchmark-v1-2026-10-04.json/.md`；可重跑命令为 `npm run memory:benchmark`。

## 2026-10-04 RSI 记忆策略可控运行

- **实现**：受控 RSI 支持单次选择 `lexical（关键词模式，默认）` 或 `hybrid（混合模式）`；服务端校验允许值，RunEvent、候选提案和 Web 回读均记录实际策略。
- **验证**：`hybrid` HTTP 请求、提案回读和 `improvement.run_started` 回放通过；非法策略 HTTP 400；专项 5/5、全量测试 105/105、typecheck 和 Web build 通过。
- **边界**：没有改变全局默认，也没有把固定合成样例的排序改善写成真实模型质量或真人提效；Computer Use 视觉回归留在既有证据，本单元只验证 API/投影/构建链路。
- **证据**：`validation/memory-recall-strategy-control-v1-2026-10-04.json/.md`、`SPEC/24-memory-recall-hybrid-v1-2026-10-04.md`。
