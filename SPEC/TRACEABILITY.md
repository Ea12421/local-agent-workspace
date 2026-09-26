# Requirements Traceability

| 需求 | 规格来源 | 代码/文件 | 当前证据 | 状态 |
|---|---|---|---|---|
| 本地项目管理 | MASTER 1/2 | `apps/server`, `apps/web`, `packages/core` | Fixture + 类型 | PARTIAL |
| Bot Profile | MASTER 4 | `packages/core/src/types.ts` | 类型存在 | PARTIAL |
| Run 状态机 | MASTER 5 | `packages/core/src/state-machine.ts` | `npm run test:all` | DONE |
| Append-only events | MASTER 4/5 | `packages/core/src/run-store.ts` | sequence/duplicate 测试 | DONE |
| 幂等恢复 | MASTER 5 | `run-store.ts`, `scripts/checkpoint.mjs` | 原生测试 + state validator | DONE |
| DeepSeek 模型通道 | MASTER 6 | `packages/adapters/src/provider-adapters.ts` | 代码审查，未真实调用 | PARTIAL |
| Codex 执行桥 | MASTER 6 | `CodexExternalAdapter`, `apps/server/src/runtime.ts`, `evidence/receipts/codex-product-builder-run-2026-09-26.json` | 真实只读 Product Builder Run：`running → succeeded`，5 条 provider 事件进入项目事件流 | VERIFIED |
| Fixture 无 Key 演示 | MASTER 6/10 | `FixtureAdapter`, `scripts/demo.ts` | demo + tests | DONE |
| 中文三档权限 | MASTER 4/6 | `tool-policy.ts`, Web UI | permission test | DONE |
| 强制审批 | MASTER 4/6 | `tool-policy.ts`, workflow | permission test + pending approval | PARTIAL |
| Product Builder 交接 | MASTER 7 | `packages/workflow/src/product-builder.ts` | 4 handoffs test | DONE |
| Source 关联 | MASTER 4/7 | workflow Artifact | 5 artifacts test | DONE |
| HTTP control plane | MASTER 3/8 | `apps/server/src/index.ts` | syntax/runtime imports | PARTIAL |
| Web UI | MASTER 9 | `apps/web/src` | Bun external bundle | PARTIAL |
| Electron | MASTER 9 | `apps/desktop` | source files | PARTIAL |
| SQLite persistence | MASTER 10 | `persistence.ts` | schema + fallback test | PARTIAL |
| clean-room 安装 | MASTER 10/11 | README/SPEC | registry blocked | BLOCKED |
| DeepSeek 真实验证 | MASTER 11 | adapter + validation plan | 无真实 Key | BLOCKED |
| 10 任务消融 | MASTER 11 | backlog M8-04 | `validation/m8-04-aggregate-summary.json` | PARTIAL：机械执行收口，质量证据阻断 |
| 3 个现实任务 | MASTER 11 | backlog M8-05 | 尚未运行 | TODO |

## 证据等级

- `DONE`：代码 + 专项测试或可观察结果。
- `PARTIAL`：代码或静态验证存在，但真实环境、集成或边界缺证据。
- `BLOCKED`：当前环境不能完成，不能用计划代替结果。
- `TODO`：尚未开始。
