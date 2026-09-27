# Local Agent Workspace 开发日志

本文件记录已经发生的工程事实；下一步以 `RUN_STATE.json` 为唯一机器状态源，不从聊天记录猜测恢复位置。

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
- **当前状态**：卡片已冻结但两条 arm 尚未执行。下一步只执行这两条 arm，不重跑 M8-05，不接 DeepSeek。

### 2026-09-27 M8-06 · paired baseline 结果

- **手工 proxy arm**：生成 `validation/m8-06-manual-baseline.md`，按冻结的 7 步写出 JSONL-first vs SQLite-first 的 options、trade-offs、dependencies、risks、rollback、source_refs、unknowns 和 next_action。明确记录没有把 controller 时间冒充用户时间。
- **结构化 arm**：同一输入白名单、Codex subscription、read-only，耗时 `56234ms`；单 JSON、必填键、来源白名单全部通过，原始 receipt 为 `validation/m8-06-raw/structured-run.json`。
- **比较结果**：`validation/m8-06-comparison.json` 为 `PARTIAL`。不能计算人工整理步骤下降率，因为 baseline 是 proxy、structured arm 尚未经过 owner 编辑，owner willingness 仍 UNKNOWN。
- **临时路线判断**：保留 JSONL-first 作为 provisional recommendation，不执行 SQLite-first 迁移；下一步补 JSONL 尾行损坏、并发 append 和从日志重建索引的有界故障注入/性能测试。
