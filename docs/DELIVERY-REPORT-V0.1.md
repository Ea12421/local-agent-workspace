# Local Agent Workspace v0.1 交付报告

日期：2026-09-29（Asia/Shanghai）

## 交付结论

**Local Agent Workspace v0.1 已达到本地交付版标准，可以交给用户独立打开、运行和继续开发。**

交付级别是：

```text
built → verified → ready_for_user_acceptance
```

它不是生产级 SaaS，也不宣称多 Bot 或 DeepSeek 已经带来质量/效率优势。

## 交付内容

### 应用

- macOS arm64 Electron 应用；
- 同一套 Web UI；
- 自定义应用图标；
- 动态本地 Server 端口；
- 关闭应用后回收自己创建的 Server。

最新 DMG：

```text
release/Local Agent Workspace-0.1.0-arm64-fixed-v3.dmg
```

SHA-256：

```text
92cfd1f034533e300fdee5cbe42d80917d85db9493174b65ad41861531b47130
```

DMG 未签名，因为当前机器没有 Developer ID 证书。

### 已实现能力

- Project、Bot、Run、RunEvent、Handoff、Approval、Source、Artifact、Memory 的核心契约；
- SQLite-first 持久化；
- Run 状态机和 append-only 事件；
- 幂等重试、崩溃恢复和 ContextSnapshot；
- Fixture Product Builder 全流程；
- Codex CLI 订阅执行桥和能力探针；
- 真实只读文件读取；
- 真实只读 `git status --short`；
- 真实只读 `git diff --stat`；
- 路径、符号链接、命令白名单和凭据形态脱敏；
- LocalToolRuntime 受控 workspace_write 底层契约：项目内 bounded UTF-8 原子写、覆盖逐次审批、正文不进审计事件；默认 Product Builder 仍不开放；
- 项目 `workspacePath` 和只读权限可见；
- Web、Electron 和本地 HTTP control plane；
- Artifact、Source、Approval、Run receipt 的本地回读。

## 验证证据

### 自动验证

- `npm run test:all`：66/66 通过（当时的历史快照；当前复核为 73/73，见本文开头）；
- Server/Web/Desktop TypeScript：通过；
- Web Vite production build：通过；
- `npm run demo`：Fixture demo 通过；
- `npm run diagnose`：Node、npm、pnpm、Codex CLI 和 Fixture 均有诊断输出；
- `node scripts/validate-state.mjs`：通过；
- `git diff --check`：通过。

### Computer Use 验证

- 安装版 Fixture ToolRuntime 成功路径通过；
- SQLite 刷新回读通过；
- 关闭并重新打开后的状态恢复通过；
- 越权路径产生 `tool.failed`，没有伪造成成功；
- Git status 安装版 Run：`run_mulk7kis`；
- Git diff 安装版 Run：`run_mulkr9p7`；
- 最新 UI 显示真实 workspacePath、只读权限、允许动作和禁止动作。

## 用户现在可以怎么用

1. 打开 DMG 并启动应用；
2. 查看项目目录和权限边界；
3. 用 Fixture 跑完整 Product Builder 演示；
4. 用本地只读 ToolRuntime 读取项目文件；
5. 用 Git status/diff 查看项目改动；
6. 用 Codex 订阅执行桥跑只读任务；
7. 刷新或重启应用后检查 Run、事件和 receipt 是否恢复。

完整操作说明见 [`docs/USER-GUIDE.md`](./USER-GUIDE.md)。

## 明确未完成的能力

- DeepSeek 真实 API Key 调用；
- Web/Electron 默认工作区写入入口；底层 LocalToolRuntime workspace_write 契约已实现，但尚未作为默认 Product Builder 能力开放；
- 任意 Shell；
- 自动发布、外发消息和无人审批；
- Codex 原生 resume；
- 多 Bot 质量和效率优势证明；
- GitHub clean-room clone 安装；
- Developer ID 签名和公证；
- Skill Registry、自我迭代和 Bot 自我扩张。

这些属于下一阶段，不影响本地只读交付版的使用。底层 workspace_write 只作为受控执行层契约存在，不能被当前界面当成已开放权限。

## 唯一推荐的后续方向

下一阶段先做**受控的测试/构建命令适配器**：

- 只允许固定命令；
- 保持项目根目录限制；
- 有超时、取消、输出上限和 receipt；
- 默认仍需用户确认；
- 不开放任意 Shell。

工作区写入、DeepSeek Key 和外部发布继续单独设确认门。

## 事实源

- 当前执行状态：[`RUN_STATE.json`](../RUN_STATE.json)
- 人类恢复入口：[`HANDOFF.md`](../HANDOFF.md)
- 实施日志：[`DEVLOG.md`](../DEVLOG.md)
- 总体进度：[`SPEC/PROGRESS.md`](../SPEC/PROGRESS.md)
- 交付清单：[`SPEC/DELIVERY-CHECKLIST-V0.1.md`](../SPEC/DELIVERY-CHECKLIST-V0.1.md)
# 交付报告当前复核补充（2026-09-30）

本文件主体保留 v0.1 交付时的历史快照。当前工作区在本轮复核中重新通过：`npm run test:all` 73/73、`npm run typecheck`、Web production build、`node scripts/validate-state.mjs` 和 `git diff --check`。同时补上了 DeepSeek 请求字段保真回归、项目 workspace 路径绑定回归和 Web 权限标签校正。

这次复核仍不等于真实 DeepSeek/API 质量验证、Codex native resume、clean-room 网络安装、签名安装或真人提效证明；这些限制以 `RUN_STATE.json`、`HANDOFF.md` 和 `validation/` 中的当前证据为准。

# 当前交付复现补充（2026-10-03）

本轮按连续执行路线重新验证当前源码：

- `npm run setup`、`npm run demo`、`npm run diagnose`：通过；
- `npm run build:web`、`npm run build:desktop`：通过；
- `npm run package:mac`：通过，生成当前源码对应的 arm64 DMG；
- `hdiutil verify`：通过；DMG 只读挂载后能看到 `Local Agent Workspace.app`，随后已卸载；
- Electron `server-process`：2/2 通过；
- 当前 DMG：`release/Local Agent Workspace-0.1.0-arm64.dmg`；
- 当前 SHA-256：`671d111e21b9de714fc3f143897a68ef3bab1ce341c286decaadfef4dd6953fa`；
- 当前没有 Developer ID 证书，因此 DMG/app 未签名；
- 当前仓库没有 Git remote，GitHub clean-room clone 仍是外部条件缺口；
- Codex 诊断显示本机 `codex-cli 0.155.1` 的自身状态目录不可写，标为 `blocked_environment`，没有把订阅执行桥写成可重跑成功。

完整机器回执：`validation/r7-delivery-reproduction-v1-2026-10-03.json`。
