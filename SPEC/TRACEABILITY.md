# Requirements Traceability

> 历史基线：2026-09-30。`RUN_STATE.json` 是当前执行状态；本表区分代码/本地控制面证据与真实 Provider、clean-room、真人效果证据。2026-10-02 的逐条校准见 [`TRACEABILITY-2026-10-02.md`](./TRACEABILITY-2026-10-02.md)，不要把本文件旧表格当成最新阶段进度。

| 需求 | 规格来源 | 代码/文件 | 当前证据 | 状态 |
|---|---|---|---|---|
| 本地项目管理 | MASTER 1/2 | `apps/server`, `apps/web`, `packages/core` | SQLite/API/UI/CUA 回读 | VERIFIED_ALPHA |
| Bot Profile | MASTER 4 | `packages/core/src/types.ts`, `apps/server`, `apps/web` | 创建/复制/停用 API/UI 与持久化回读 | VERIFIED_ALPHA |
| Run 状态机 | MASTER 5 | `packages/core/src/state-machine.ts` | `npm run test:all` | DONE |
| Append-only events | MASTER 4/5 | `packages/core/src/run-store.ts` | sequence/duplicate 测试 | DONE |
| 幂等恢复 | MASTER 5 | `run-store.ts`, `scripts/checkpoint.mjs` | 原生测试 + state validator | DONE |
| DeepSeek 模型通道 | MASTER 6 | `packages/adapters/src/provider-adapters.ts` | 代码审查，未真实调用 | PARTIAL |
| Codex 执行桥 | MASTER 6 | `CodexExternalAdapter`, `apps/server/src/runtime.ts`, `evidence/receipts/codex-product-builder-run-2026-09-26.json` | 真实只读 Product Builder Run：`running → succeeded`，5 条 provider 事件进入项目事件流 | VERIFIED |
| Fixture 无 Key 演示 | MASTER 6/10 | `FixtureAdapter`, `scripts/demo.ts` | demo + tests | DONE |
| 中文三档权限 | MASTER 4/6 | `tool-policy.ts`, Web UI | permission test | DONE |
| 强制审批 | MASTER 4/6 | `tool-policy.ts`, workflow | permission test + approval resolve/restart/reconcile | VERIFIED_ALPHA |
| Product Builder 交接 | MASTER 7 | `packages/workflow/src/product-builder.ts` | 4 handoffs test | DONE |
| Source 关联 | MASTER 4/7 | workflow Artifact | 5 artifacts test | DONE |
| HTTP control plane | MASTER 3/8 | `apps/server/src/index.ts` | handler smoke、API smoke；live listener 受当前沙箱限制 | VERIFIED_HANDLER_PARTIAL |
| Web UI | MASTER 9 | `apps/web/src` | Vite production build + Computer Use 回读 | VERIFIED_ALPHA |
| Electron | MASTER 9 | `apps/desktop` | arm64 directory/DMG 构建与回读；签名/clean-room 未完成 | PARTIAL |
| SQLite persistence | MASTER 10 | `persistence.ts` | schema、typed CRUD、事务幂等、重启/并发/备份/规模测试 | VERIFIED_ALPHA |
| clean-room 安装 | MASTER 10/11 | README/SPEC | registry blocked | BLOCKED |
| DeepSeek 真实验证 | MASTER 11 | adapter + validation plan | 无真实 Key | BLOCKED |
| 10 任务消融 | MASTER 11 | backlog M8-04 | `validation/m8-04-aggregate-summary.json` | PARTIAL：机械执行收口，质量证据阻断 |
| 3 个现实任务 | MASTER 11 | backlog M8-05 | 三次窄范围本地任务与 recovery smoke；无人工 baseline/复用意愿 | PARTIAL |

## 证据等级

- `DONE`：代码 + 专项测试或可观察结果。
- `PARTIAL`：代码或静态验证存在，但真实环境、集成或边界缺证据。
- `BLOCKED`：当前环境不能完成，不能用计划代替结果。
- `TODO`：尚未开始。
