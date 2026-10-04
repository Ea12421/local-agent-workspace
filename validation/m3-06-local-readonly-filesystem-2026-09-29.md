# M3-06 真实只读 filesystem/read 验证（2026-09-29）

## 目的

把 ToolRuntime 从“只检查边界的 fixture”推进为第一个真实但低风险的能力：只读当前项目目录内的文件。

## 范围

- `LocalToolRuntime`；
- `mode=local`、`filesystem/read`；
- `read_only` 权限；
- 256 KB 最大读取量（默认 64 KB）；
- 常见 `api_key`、`token`、`password`、`secret` 和 `sk-...` 形态脱敏；
- append-only RunEvent、幂等 requestId 和 `tool.execution-receipt.v1`。

明确不包含：文件写入、删除、Git、Shell、完整 secret 扫描、DeepSeek。

## 工程验证

- 适配器/服务器相关测试：`16/16 PASS`；
- TypeScript workspace typecheck：`PASS`；
- Vite production build：`PASS`；
- Electron arm64 目录包：`PASS`。

## Computer Use 验证

安装版工作台中选择“本地只读 ToolRuntime（读取 fixture 文件）”并提交默认目标：

- Run：`run_mulickfo`；
- 实际读取：`fixtures/demo-project.json`；
- 结果：`succeeded`；
- UI 标记：`真实执行`；
- 事件：创建运行、开始运行、调用受控工具、工具调用完成、运行完成，共 5 个；
- 输出包含相对路径、`bytesRead=2371`、`truncated=false` 和读取内容；
- 运行记录页刷新后仍从本地 SQLite 回读 Run、事件和 receipt。

## 结论

`PASS_M3_06_LOCAL_READONLY_FILESYSTEM`。

这证明底座已经能做一个受控的真实读取动作，仍不能证明它已经是完整的本地 Agent 产品。下一步是只读 Git status：精确 argv 白名单、固定 workspace cwd、超时和失败回执。
