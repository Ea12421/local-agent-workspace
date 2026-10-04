# Local Agent Workspace

> **当前交付状态（2026-10-03）：** `RUN_STATE.json` 已收口为 `complete / project-scoped-projection-v1 / 7/7`。R1-R8 的工程、Provider、失败恢复、Web/Electron、本地打包和面试掌握材料，以及 P0 项目范围、动态权限、事件幂等和有界重试修正均已落盘并有验证证据；R9 真人提效按当前决定后置。恢复或继续开发时，先读 `RUN_STATE.json`，不要从聊天记录猜状态。

> 当前版本：Local Agent Workspace v0.1 本地交付版（ready for user acceptance）。

先看：

- [使用说明](docs/USER-GUIDE.md)
- [交付报告](docs/DELIVERY-REPORT-V0.1.md)
- [简历与面试掌握包（HTML）](docs/INTERVIEW-MASTERY-PACK-V1.html)
- [当前执行状态](RUN_STATE.json)

本项目是一个本地优先的 Agent Workspace：按项目管理 Bot，给每次 Run 留下状态、事件、交接、审批和 Artifact。首个内置流程是 Product Builder。

## 快速开始

```bash
pnpm install
pnpm run setup
pnpm run demo
pnpm run dev
# 另一个终端
pnpm run dev:web
```

无 Key 也可以运行 Fixture 演示。当前可用的真实本地入口包括文件只读、`tool-loop-local`（Fixture 决策 + 真实文件读取）、`deepseek-tool-loop`（真实 DeepSeek 决策 + 只读文件读取）、`git status --short` 和 `git diff --stat`。官方 Codex CLI 执行路径已实现并有历史只读 receipt；每次使用前仍需通过只读环境探针，如果显示 `blocked_environment`，就表示 Codex 自身状态目录当前不可写，不能把历史 receipt 当成当前可重跑。需要 API 模型对比时，再复制 `.env.example` 配置 `DEEPSEEK_API_KEY`；不要把真实 Key 写入仓库。

## 目录

- `packages/core`：版本化领域契约、Run 状态机和事件仓储
- `packages/adapters`：DeepSeek 模型通道、Fixture 通道、Codex CLI 执行桥和权限策略
- `packages/workflow`：Product Builder 结构化交接、来源、审批和 Artifact workflow
- `apps/server`：本地 HTTP control plane
- `apps/web`：React/Vite 中文工作台
- `apps/desktop`：启动同一 control plane 的 Electron 薄壳
- `SPEC/`：产品、状态、Provider、Bot、工作流、安装和验证契约
- `validation/`：M8-04 固定任务题集、评分规则、JSONL 结果账本和自动校验摘要
- `HANDOFF.md`、`RUN_STATE.json`、`DEVLOG.md`：中断后的恢复入口和事实日志

## 当前 macOS 交付包

已生成并完成 `hdiutil verify` 与只读挂载检查：

```text
release/Local Agent Workspace-0.1.0-arm64.dmg
SHA-256: 671d111e21b9de714fc3f143897a68ef3bab1ce341c286decaadfef4dd6953fa
```

当前包未使用 Developer ID 签名；安装和限制说明见 [docs/USER-GUIDE.md](docs/USER-GUIDE.md)，面试演示和证据索引见 [docs/INTERVIEW-DEMO-PACK-V1-2026-10-03.md](docs/INTERVIEW-DEMO-PACK-V1-2026-10-03.md)，简历描述、项目讲法和追问答案见 [docs/INTERVIEW-MASTERY-PACK-V1.html](docs/INTERVIEW-MASTERY-PACK-V1.html)。

限额或上下文中断后运行 `pnpm run recover`；不要从聊天记录猜测下一步。这里必须使用 `pnpm run setup`，不要把 pnpm 自带的 `pnpm setup` 当作项目初始化命令。

## 权限

界面使用“只读 / 工作区写入 / 完全访问”。外发、重要删除、敏感路径、生产配置、支付/发布和凭据访问始终逐次审批。

## 诚实边界

Fixture 是确定性演示，不代表模型质量。Codex 适配器只通过官方本地 CLI/SDK 路径执行，不读取凭据文件；当前已完成真实只读 Product Builder Run。当前仓库已完成一次真实 DeepSeek 只读 Tool Loop 回归，但仍未宣称模型质量、成本收益或真实用户提效。M8-04 的 provider 记录全部保持 `quality_eligible=false`，因为人工复核和真人使用门尚未完成；查看 `validation/m8-04-validation-summary.json` 和对应人工复核文件。arm64 macOS DMG 已生成，但当前机器没有 Developer ID 签名。Product Builder 默认仍是只读；底层 `LocalToolRuntime` 已实现受控的 workspace_write 最小契约（项目内、限字节、原子写、覆盖逐次审批、正文不进审计事件），但当前 Web/Electron 默认入口没有开放它；删除、任意 Shell 和 `full_access` 仍不在本次交付范围。

## 面试演示

1. `pnpm demo` 展示无 Key 运行。
2. 用 Codex CLI 执行一个只读 Product Builder Run，展示订阅执行 receipt 和 Run 事件。
3. 打开 Web，演示 Run 时间线、结构化交接、审批卡片和 Artifact。
4. 打开 `SPEC/02` 说明 DeepSeek 与 Codex 的不同边界。
5. 打开 `packages/core/src/state-machine.ts` 说明为什么业务状态不交给第三方 Agent 框架托管。

## 安装故障回退

首选 pnpm workspace。如果 Corepack 无法下载 pnpm，但 npm registry 恢复，可以使用：

```bash
npm run install:fallback
```

如果 registry/DNS 仍不可用，先运行 `pnpm run diagnose` 和 `pnpm run demo`；Fixture 和原生 Core 测试不依赖前端安装。不要把安装失败写成应用功能失败。普通 Codex 沙箱可能无法解析 registry；应使用不修改 VPN 的受控主机网络执行一次安装，或等待网络恢复，不要反复重试同一条失败命令。
