# Local Agent Workspace

一个本地优先的 Agent Workspace：按项目管理 Bot、Skill、工具权限、运行记录、审批和产物。

当前公开快照包含一个有界总控：真实 Codex CLI 可以生成结构化执行计划，计划经过项目白名单校验后，可调用真实的文件读取和 Git 只读工具；受控测试/构建仍需要逐次审批。Fixture 模式用于无 Key 演示，不能代表真实模型质量。

## 快速开始

```bash
pnpm install
pnpm setup
pnpm build:web
pnpm demo
pnpm dev
```

打开 `http://127.0.0.1:4310/`。Web 页面默认使用本地 Fixture；在项目 Provider 设置中绑定可用的 Codex CLI 后，才能选择真实规划。

## macOS 打包

```bash
pnpm package:mac
```

输出位于 `release/`。未配置 Developer ID 时，macOS 可能显示未签名提示；这不影响本地开发验证。

## 能力边界

- 项目数据保存在本机 SQLite；Web 与 Electron 共用同一套服务逻辑。
- 所有 Provider、工具和审批动作写入 RunEvent，并保留可诊断 receipt。
- 真实总控当前只执行已审计的 `filesystem.read`、`git.status`、`git.diff_stat`。
- `npm run test` 与 `npm run build:web` 是固定受控命令，执行前需要一次性批准。
- 不自动上传、不监听全局桌面、不读取凭据、不自动发布，也不允许模型自行扩大权限。

详细边界见 `SPEC/30-orchestrator-mvp-v1-2026-10-07.md` 和 `SPEC/31-real-provider-tool-execution-v1-2026-10-08.md`。
