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
