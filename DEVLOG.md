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
