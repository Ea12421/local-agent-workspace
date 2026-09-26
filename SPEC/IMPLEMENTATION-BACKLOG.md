# Implementation Backlog / 推进清单

状态值：

- `DONE`：代码和专项验证已有证据；
- `PARTIAL`：代码存在，但缺集成、真实环境或边界验证；
- `BLOCKED`：外部环境阻塞；
- `TODO`：尚未实现；
- `NEXT`：解除阻塞后唯一优先任务。

## Milestone M0：范围和证据冻结

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M0-01 | 确认产品定义和反目标 | `SPEC/00`, `AGENTS.md` | 无 | DONE | 用户、场景、边界写清 |
| M0-02 | 将旧聊天结论降级为假设 | `SPEC/00`, `HANDOFF.md` | 无 | DONE | 没有未验证的“通过”结论 |
| M0-03 | 建立模型来源核验门 | `SPEC/02`, receipts | M0-02 | PARTIAL | Provider、harness、billing、mock 可追溯 |
| M0-04 | 建立中断恢复协议 | `RUN_STATE.json`, `scripts/*` | 无 | DONE | checkpoint、recover、validate 可执行 |

## Milestone M1：Core Domain

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M1-01 | 定义领域类型 | `packages/core/src/types.ts` | M0 | DONE | Project/Bot/Run/Handoff/Approval/Source/Artifact 类型存在 |
| M1-02 | 实现 Run 状态机 | `packages/core/src/state-machine.ts` | M1-01 | DONE | 合法/非法迁移有测试 |
| M1-03 | 实现 append-only RunStore | `packages/core/src/run-store.ts` | M1-02 | DONE | sequence、重复事件、幂等有测试 |
| M1-04 | 统一 ID 和品牌类型 | `packages/core/src/ids.ts` | M1-01 | DONE | 不同实体 ID 不混用 |
| M1-05 | 增加 crash/replay 测试 | `packages/core/src/*.test.ts` | M1-03 | PARTIAL | 内存回放通过；进程重启待 SQLite 集成 |

## Milestone M2：Persistence

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M2-01 | 定义 SQLite schema | `apps/server/src/persistence.ts` | M1 | PARTIAL | schema 和唯一约束已写 |
| M2-02 | 实现 SQLite EventLog | `apps/server/src/persistence.ts` | M2-01 | PARTIAL | 代码有 optional import；native 安装待完成 |
| M2-03 | JSONL clean-checkout fallback | `apps/server/src/persistence.ts` | M2-01 | DONE | 无 native 依赖测试通过 |
| M2-04 | Run 重启恢复 | `apps/server/src/runtime.ts` | M2-02 | TODO | 进程重启后 Run/Event 一致 |

## Milestone M3：Provider 与工具

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M3-01 | FixtureAdapter | `packages/adapters/src/provider-adapters.ts` | M1 | DONE | `isMock=true`，固定输出 |
| M3-02 | DeepSeekApiAdapter | 同上 | M1 | PARTIAL | 请求/receipt 代码已写；真实 API 未跑 |
| M3-03 | reasoning/tool 字段保留 | DeepSeek adapter | M3-02 | PARTIAL | 代码保留字段；真实 thinking/tool case 待跑 |
| M3-04 | Codex CLI/SDK 执行桥 | 同上 | M1 | PARTIAL | `codex exec --json` 已真实跑通；适配器已转发 JSONL，resume 仍待接通 |
| M3-05 | ToolPolicy 和强制审批 | `tool-policy.ts` | M1 | DONE | allowlist 与 always-approval 测试通过 |
| M3-06 | FS/Git/Shell sandbox | `packages/adapters` | M3-05 | TODO | 路径穿越、symlink、命令白名单测试 |

## Milestone M4：Product Builder

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M4-01 | Clarify/Planner 数据契约 | `SPEC/04`, workflow | M1 | PARTIAL | Fixture 采用简化版本 |
| M4-02 | Research 输出 Source | `packages/workflow` | M3-01 | DONE | Source refs 存在 |
| M4-03 | Product Brief | 同上 | M4-02 | DONE | 用户/MVP/边界产出 |
| M4-04 | Architecture Proposal | 同上 | M4-03 | DONE | 选项、取舍、风险产出 |
| M4-05 | Evaluation Plan | 同上 | M4-04 | DONE | 指标和 Bad Case 产出 |
| M4-06 | Handoff depth/cycle guard | `packages/core`, workflow | M1 | PARTIAL | depth 字段存在；循环专项测试待补 |
| M4-07 | Conflict Check | workflow | M4-05 | TODO | 冲突阻塞 Artifact |
| M4-08 | User Approval gate | `apps/server`, workflow | M4-07 | PARTIAL | Fixture pending approval 已有；持久化待补 |
| M4-09 | Artifact Writer | workflow | M4-08 | DONE | 5 个来源关联 Artifact |

## Milestone M5：Server/API

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M5-01 | HTTP server | `apps/server/src/index.ts` | M1 | PARTIAL | 代码已写；受限环境无法监听 |
| M5-01a | 无端口 request handler smoke test | `apps/server/src/http-smoke.test.ts` | M5-01 | DONE | health 和 Product Builder preview 可在不监听端口时验证 |
| M5-02 | Workspace/UI snapshot | 同上 | M5-01 | PARTIAL | API 转换代码存在 |
| M5-03 | Run create/cancel | 同上 | M1 | PARTIAL | 路由存在；集成请求待跑 |
| M5-04 | Approve/retry | 同上 | M4-08 | PARTIAL | 路由存在；事件落盘待跑 |
| M5-05 | Product Builder preview | 同上 | M4 | DONE | 原生 workflow 测试通过 |
| M5-06 | API 错误格式和 correlation | 同上 | M5-01 | TODO | 所有失败统一 JSON 错误 |

## Milestone M6：Web UI

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M6-01 | 工作台概览 | `apps/web/src/App.tsx` | M5 | PARTIAL | Fixture/HTTP fallback 代码存在 |
| M6-01a | 标记数据来源 | `apps/web/src/App.tsx`, `lib/api.ts` | M6-01 | DONE | 本地服务和 Fixture 显示不同状态 |
| M6-02 | Bot 管理 | 同上 | M5 | PARTIAL | 展示界面存在；创建 API 待接 |
| M6-03 | Run 时间线 | 同上 | M5 | PARTIAL | 视觉结构存在；真实 API 待跑 |
| M6-04 | 审批/重试 | `apps/web/src/lib/api.ts` | M5-04 | PARTIAL | 请求代码存在；端到端待跑 |
| M6-05 | Artifact/Source 预览 | 同上 | M4 | PARTIAL | Artifact 列表存在；正文预览待补 |
| M6-06 | Vite build | workspace | M6-01 | DONE | `pnpm --filter @agent-workspace/web build` 已通过 |

## Milestone M7：Desktop

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M7-01 | Electron 启动 Server | `apps/desktop/src/main.ts` | M5 | PARTIAL | 已生成并启动 arm64 App；窗口可见性仍待 Computer Use 绑定验证 |
| M7-02 | health-ready 后开窗 | 同上 | M7-01 | PARTIAL | health-ready 轮询逻辑已生成；打包进程已运行，窗口 AX 读取超时 |
| M7-03 | macOS dmg | `electron-builder.yml` | M6-06, M7-01 | PARTIAL | arm64 DMG 已生成；当前机器无 Developer ID，且尚未完成可见安装验收 |

## Milestone M8：验证和交付

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M8-01 | clean-room install | README/SPEC | M6-06 | PARTIAL | 当前工作区 `pnpm install`、`pnpm run setup` 已通过；全新 clone 仍待验证 |
| M8-02 | DeepSeek 真实调用 | `.env`（不提交） | M3-02 | BLOCKED | receipt 和失败诊断存在 |
| M8-03 | Codex 真实执行桥 | Adapter + receipt | M3-04 | PARTIAL | 真实只读 Product Builder Run、适配器取消和控制面取消竞态已通过；resume 与 Web 端到端仍待验证 |
| M8-04 | 10 任务消融实验 | `validation/` | M4 | PARTIAL | 题集和评分规则已冻结；PB-01 三条路径已真实执行并自动校验（5 条真实记录，0 条质量证据），剩余 9 题与人工复核待完成 |
| M8-05 | 3 个现实任务 | `validation/` | M8-01, M8-02 | TODO | reality-card，不能用模型自评替代 |
| M8-06 | 面试掌握包 | `docs/interview-playbook.md` | M8-04 | PARTIAL | 初稿存在；需要真实证据映射 |

## Milestone M9：Context Continuity

| ID | 任务 | 文件/区域 | 依赖 | 状态 | 完成标准 |
|---|---|---|---|---|---|
| M9-01 | ContextSnapshot 纯函数契约 | `packages/core/src/context.ts`, `types.ts` | M1 | DONE | 阈值、结构化摘要、事件范围、hash、tail 和恢复 Packet 有专项测试 |
| M9-02 | JSONL Snapshot 持久化 | `apps/server/src/persistence.ts` | M9-01 | DONE | snapshot 写入、读取、重复拒绝、latest 隔离和重启 hydration |
| M9-03 | Run segment 与 fallback resume | `packages/adapters`, `apps/server/src/runtime.ts` | M9-01 | DONE | Provider limit/中断后同一 Run 创建新 segment，snapshot + tail 传入下一段，事件可追溯 |
| M9-04 | Product Builder 长窗口接入 | `packages/workflow`, `apps/server` | M9-02, M9-03 | TODO | Handoff、Approval、Artifact 后自动 checkpoint，恢复不重复工作 |
| M9-05 | Context Continuity 验证 | `validation/`, `SPEC/07` | M9-04 | TODO | synthetic limit、崩溃恢复、重复提交、跨项目隔离通过 |

## 当前唯一优先级

当前执行顺序先走已可用的 Codex CLI，再补网络依赖；M8-04 采用小批次执行，每批最多 3 条 provider 路径，批后立即校验和 checkpoint，执行顺序固定为：

```text
M3-04/M8-03（Codex CLI bridge）
→ M6-06 → M7-01/M7-02 → M7-03 → M8-01
→ M9-01/M9-02（ContextSnapshot 与恢复基础）→ M8-04（PB-01 已完成试跑，剩余 9 题分批）→ M9-03/M9-04 → M8-05 → M8-06 → M8-02（DeepSeek 可选对比）
```

在 registry/DNS 未恢复前，不重复 `pnpm install`，继续补不依赖外部包的测试或文档时，必须先更新 `RUN_STATE.next_action`。
