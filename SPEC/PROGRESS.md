# 当前推进进度

更新时间：2026-09-27

## 总状态

`m10-sqlite-first-adapter-pass-m8-04-quality-blocked-desktop-partial`

这表示：代码实现单元已完成，但项目最终验收没有完成。

## 已完成

- 产品定义和边界
- 领域类型与 Run 状态机
- append-only event 和幂等
- Provider/Fixture/Codex 探针
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
- M8-05 窄范围现实验证已完成：REAL-01/02/03 三个真实本地状态任务均通过结构化追踪门；一次真实 Codex provider segment 人为中断后，同一 `runId` 追加 `ContextSnapshot`、`run.resume_requested` 和第二 segment，最终 succeeded。结果为 `validation/m8-05-reality-results.json`，复核为 `validation/m8-05-review.md`。这只验证追踪和执行链恢复，不验证业务质量或提效。
- M8-06 paired baseline 卡已冻结：真实任务为 ContextSnapshot 的 JSONL-first vs SQLite-first 技术路线判断；固定了同一输入白名单、7 步手工基线、结构化 Run 输出键、25% 整理步骤阈值、来源/未知项/回滚护栏和 owner willingness 未知边界。卡片为 `validation/m8-06-paired-baseline-card-v1.json`。
- M8-06 两条 arm 已执行，比较结果为 `PARTIAL`：controller proxy 手工基线 7 步且未冒充用户计时；结构化 Codex subscription Run 为 56234ms，结构化追踪通过。由于缺少用户本人 baseline、人工修改和复用意愿，不能计算真实提效率。结果在 `validation/m8-06-comparison.json`；该比较保留为历史证据，不再作为长期存储路线决定。
- M8-06 JSONL 边界专项已通过：尾行损坏按 `SyntaxError` fail-closed；同进程 20 次并发 append 完整；重载后可按 project/run 重建 latest；typecheck、5/5 persistence tests、19/19 全套等价 Node tests 和 diff check 均通过。证据在 `validation/m8-06-jsonl-failure-results.json`。`pnpm test:all` 仅因 Corepack 用户缓存权限未运行；该结果不覆盖跨进程锁或长时吞吐。
- 长期架构重新评估后已决定 SQLite-first：SQLite 是运行时唯一事实源，JSONL 只用于 portable/demo/export/灾备。详细决策见 `SPEC/08-persistence-architecture-decision.md`。
- M10-01 适配层已开始：`SqliteContextSnapshotStore`、SQLite 默认 factory、WAL/foreign_keys/busy_timeout、`node:sqlite` 兼容驱动和 HTTP `persistence.mode` 回执已落地；runtime 与 Product Builder 不再硬编码 JSONL 默认路径。
- M10-01 验证：全套等价 Node tests 20/20、typecheck 和 diff check 通过；当前 better-sqlite3 二进制与 Node 22 ABI 不匹配，已由 node:sqlite 接管，不再静默失败。
- M10-01 证据已落盘到 `validation/m10-01-sqlite-adapter-results.json`；M10-02 schema_meta、migration runner、全实体事务、导入导出和跨进程/备份恢复验证仍未完成。

## 当前卡点

1. 本次依赖安装通过了受控主机网络；普通 Codex 沙箱仍会出现 registry DNS 失败。没有修改 VPN。后续安装应继续使用明确的受控网络命令，不能把网络恢复写成永久环境保证。
2. Electron arm64 App 已启动并被系统登记为运行中，但 Computer Use 读取其窗口连续超时，因此“进程启动”已验证，“桌面窗口可见性”仍是 PARTIAL。
3. DeepSeek 尚未真实调用；它是可选对比通道，需要用户提供 Key 后才能做真实模型验证。
4. Codex 原生 resume 尚未接通；M8-04 10 题质量证据仍阻断；M8-05 recovery smoke 验证的是控制面 fallback，不是 provider 原生 resume，且没有人工 baseline。
5. 当前工作区和隔离源码副本安装已通过；literal GitHub clone 仍待仓库 remote。
6. M8-04 的长批次在第一次 `--path all` 运行中只完成了 `single_call`，随后外层执行会话结束；按单路径重试后成功，说明下一批必须拆成小批并依赖 JSONL/receipt 恢复，不能把一次长会话当作唯一状态。
7. 2026-09-27 重打包时 `.app` 编译成功，但 `hdiutil create` 因系统 DiskManagement framework 不可用而失败；已有 DMG 保留，不把本次封装失败写成应用代码失败。
8. multi Bot 校验器已修正为严格单 JSON 对象；旧的拼接/前缀输出被拒绝，3 个晚到的受控复测 receipt 以唯一 `receipt_id` 追踪；可解析记录因缺少完整 replay 证据仍为 7/8，不能升格质量证据。

## 当前唯一下一步

实现 M10-02 版本化 SQLite schema 与 migration runner，先覆盖 `schema_meta`、`context_snapshots`、`run_segments` 和 `idempotency_keys`，再补 JSONL 导入导出与恢复测试。

## 网络恢复后的下一步

```bash
pnpm run recover
pnpm run validate:state
pnpm install
pnpm --filter @agent-workspace/web build
pnpm package:mac
```

随后按 `IMPLEMENTATION-BACKLOG.md` 的 M8 顺序继续，不重新设计产品。
