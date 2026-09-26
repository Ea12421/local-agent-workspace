# Recovery Handoff

更新时间：2026-09-27（Asia/Shanghai）

## 当前目标

在 `/Users/m4air/Work Agent开发。` 交付可从 GitHub 复现的 Local Agent Workspace v1：单一本地 control plane 管理 Project、Bot、Run、Handoff、Approval 和 Artifact；首个内置 Bot 是 Product Builder。

## 当前状态

- `RUN_STATE.json`：当前为 `running`，Context Continuity M9 已完成，Desktop 仍部分验证
- 阶段：`m9-context-continuity-verified`
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
  - M8-04 仅完成 PB-01；剩余 9 题未执行
  - PB-01 当前有 9 条真实 provider 记录（8 条完成、1 条 provider_incomplete），全部是 `quality_eligible=false`；可解析的 multi Bot receipts 自动校验为 7/8，另有前缀/拼接输出被严格拒绝，必须先人工复核，不能据此宣称单/多 Bot 质量优劣
  - 为同步最新桌面入口而重打包时，`.app` 编译成功，但 `hdiutil` 报 `设备未配置`；已有 DMG 保留，需在 DiskManagement 可用的 macOS 环境再复验封装
  - 尚未做 3 个非敏感真实任务的 reality validation

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
4. 下一步恢复 M8-04：先完成 PB-01 人工复核，再把剩余 9 个固定任务拆成每批最多 3 条 provider 路径执行；每批后校验并 checkpoint。
5. M8-04 先保留 PB-01 质量证据阻断状态；DeepSeek 有 Key 后再做 API 对比，3 个现实任务必须使用真实证据，不用 fixture 或模型自评替代。
6. Git 已在本地建立 `main` 基线并提交两次；当前没有 remote，不 push。

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
- `apps/server/src/persistence.ts`：事件 JSONL 与 ContextSnapshot JSONL 存储
- `apps/web/src/`：Web UI
- `apps/desktop/src/main.ts`：Electron 薄壳
- `fixtures/demo-project.json`：无 Key 演示输入

## 恢复规则

先读本文件和 `RUN_STATE.json`，再只检查上面“下一步”涉及的文件。若状态是 `blocked_environment`，先解决状态中列出的环境条件，再把状态恢复为 `running` 并写入唯一下一步。不要根据旧聊天重新设计产品，不要修改旧工作台，不要将 fixture/机械测试写成真实使用通过。
