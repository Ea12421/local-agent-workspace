# Local Agent Workspace 协作规则

- 业务事实源是 `packages/core` 的版本化类型、状态机和 append-only 事件；Web 与 Electron 不复制业务逻辑。
- 任何 Provider、工具调用和审批都必须留下 `RunEvent` 与可诊断 receipt。
- `FixtureAdapter` 只用于无 Key 演示，不得标成真实模型效果；DeepSeek 是 ModelProvider，Codex SDK/CLI 是 ExecutionAgent。
- 默认中文 UI 权限为“只读 / 工作区写入 / 完全访问”。外发、删除重要数据、访问敏感路径、生产配置、支付/发布和凭据读取始终逐次审批。
- 不自动监听、不上传、不修改旧工作台；真实效果要用固定任务和真人使用证据验证。
