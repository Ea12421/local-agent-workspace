# Local Agent Workspace

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

无 Key 也可以运行 Fixture 演示。当前优先的真实执行路径是本机已登录的官方 Codex CLI；它走 ChatGPT 登录态，不需要 npm 包或 DeepSeek Key。需要 API 模型对比时，再复制 `.env.example` 配置 `DEEPSEEK_API_KEY`；不要把真实 Key 写入仓库。

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

限额或上下文中断后运行 `pnpm run recover`；不要从聊天记录猜测下一步。这里必须使用 `pnpm run setup`，不要把 pnpm 自带的 `pnpm setup` 当作项目初始化命令。

## 权限

界面使用“只读 / 工作区写入 / 完全访问”。外发、重要删除、敏感路径、生产配置、支付/发布和凭据访问始终逐次审批。

## 诚实边界

Fixture 是确定性演示，不代表模型质量。Codex 适配器只通过官方本地 CLI/SDK 路径执行，不读取凭据文件；当前已完成一次真实只读 Product Builder Run。当前仓库尚未宣称通过真实 DeepSeek 运行或真实用户提效。M8-04 已完成 PB-01 的 Codex 试跑和受控复测，目前有 9 条真实 provider 记录，全部处于 `quality_eligible=false`，因为人工复核和真人使用门尚未完成；查看 `validation/m8-04-validation-summary.json` 和 `validation/m8-04-manual-review-PB-01.json`。arm64 macOS DMG 已生成，但当前机器没有 Developer ID 签名，桌面窗口的 Computer Use 可见性仍待专项验证。这些结果要按 `SPEC/06` 单独验证。

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
