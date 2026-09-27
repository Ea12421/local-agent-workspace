# Recovery Handoff

更新时间：2026-09-27（Asia/Shanghai）

## 当前目标

在 `/Users/m4air/Work Agent开发。` 交付可从 GitHub 复现的 Local Agent Workspace v1：单一本地 control plane 管理 Project、Bot、Run、Handoff、Approval 和 Artifact；首个内置 Bot 是 Product Builder。

## 当前状态

- `RUN_STATE.json`：当前为 `running`，长期路线已改为 SQLite-first；M8-04 质量证据仍阻断，M8-05 窄范围验证完成，M8-06 比较保留为历史 PARTIAL，M10-01 SQLite 适配层、M10-02 schema/migration 已通过，M10-03 RunStore 边界已通过但整体仍为 PARTIAL；M10-05 Product Builder SQLite checkpoint、全 typed entity round-trip、entity summary 和 approve persistence 已通过，Desktop 仍部分验证
- 阶段：`m10-05-http-persistence-pass`
- 已完成：
  - 根 monorepo 配置、AGENTS.md、环境样例和 setup/demo/typecheck 脚本
  - `SPEC/00-06`、`SPEC/MASTER-SPEC.md`、`SPEC/IMPLEMENTATION-BACKLOG.md`、`SPEC/TRACEABILITY.md`、`SPEC/PROGRESS.md`、`SPEC/AI-EXECUTION-PROTOCOL.md`、`docs/architecture.md`、`docs/interview-playbook.md`
  - `packages/core`：类型契约、显式 Run 状态机、append-only 事件、幂等事件仓储、测试
  - `packages/adapters`：DeepSeek 模型通道、Fixture 通道、Codex CLI/SDK 执行桥、权限策略
  - `packages/workflow`：Product Builder 确定性 workflow，4 个结构化交接、5 个来源关联 Artifact 和待审批边界
  - `apps/server`：HTTP control plane、fixture API、core snapshot API、Codex 版本探针、JSONL 事件回退和 SQLite schema 边界
  - `apps/server/src/http-smoke.test.ts`：不打开端口也能验证 health 和 Product Builder API
  - `apps/web`：React/Vite 中文工作台、项目/Bot/Run/审批/Artifact/Provider 视图，优先走本地 HTTP、失败回退 fixture，并明确显示数据来源
  - `apps/desktop`：启动本地 server、加载同一 Web UI 的 Electron 薄壳文件
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
  - arm64 Electron DMG 已生成并且打包进程已启动；Computer Use 读取 Electron 窗口连续超时，所以桌面可见性仍是 PARTIAL
  - DeepSeek 尚未用用户 Key 实跑；Codex Product Builder 端到端 Run、取消和恢复仍待验证
  - M8-04 10 题三路径机械执行已完成；所有记录仍缺质量补证，不能写成多 Bot 质量或提效通过
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
15. M8-04 先保留质量证据阻断状态；DeepSeek 有 Key 后再做 API 对比。SQLite-first 是长期运行时路线，JSONL 仅作 portable/demo/export/灾备。
16. M10-01 SQLite 适配层已通过：全套等价 Node tests 20/20、typecheck、diff check；better-sqlite3 ABI 不匹配时由 node:sqlite 接管并返回显式 persistence mode。
17. M10-02 schema/migration 已通过：schema v1、schema_meta、run_events、context_snapshots、run_segments、idempotency_keys 已验证，21/21 测试通过；失败注入、全实体事务、导入导出和恢复规模验证仍未完成。
18. M10-03 仍为 PARTIAL：schema v2、单连接 SqliteRunStore、Run/Event/idempotency/segment 事务、runtime 默认接入、重启回读、回滚、三个独立进程并发写、备份恢复和项目隔离已验证，24/24 测试通过；全实体 typed CRUD、长时规模和 Product Builder 完整接入仍未完成。
19. M10-05 当前为 PARTIAL：Product Builder checkpoint、ContextSnapshot、snapshot-created event、幂等行和 Handoff/Approval/Artifact/Source/ProviderReceipt typed round-trip 已验证，HTTP replay 已验证；Project/BotProfile/Skill typed repositories 和完整 HTTP 读写仍未完成。Git 已在本地建立 `main` 基线并提交，当前没有 remote，不 push。

### 当前唯一下一步

实现 Project/BotProfile/Skill typed repositories，并让 HTTP 提供持久化实体摘要和审批/重试/取消读写；不复制 `packages/core` 业务逻辑。

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
- 当前唯一下一步：完成持久化 retry/cancel 与完整 HTTP entity routes；随后进入 M10-04 JSONL import/export。
