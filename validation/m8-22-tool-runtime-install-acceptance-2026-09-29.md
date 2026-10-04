# M8-22 ToolRuntime 安装版验收记录

日期：2026-09-29（Asia/Shanghai）

## 范围

验证 `SPEC/DELIVERY-CHECKLIST-V0.1` 的 P0-5 最小 ToolRuntime 单元和桌面生命周期，不验证真实文件读取、Shell 执行、DeepSeek 或模型质量。

## 环境

- 应用：`/Applications/Local Agent Workspace.app`
- App ID：`com.localagentworkspace.desktop.v1`
- 运行地址：`http://127.0.0.1:4310/`
- 模式：`FixtureToolRuntime`
- 本地持久化：SQLite

## 观察结果

### 成功路径

Computer Use 在安装版中完成：

1. 打开“新建一次运行”；
2. 选择“受控 ToolRuntime（dry-run / fixture）”；
3. 提交目标；
4. 概览显示 `受控 ToolRuntime（Fixture）` 和 receipt；
5. 运行记录显示：

```text
创建运行
→ 开始运行
→ 调用受控工具
→ 工具调用完成
→ 运行完成
```

成功 Run：`run_mulgevc0`

- receipt：`tool-request:run_mulgevc0`
- eventCount：5
- receipt status：`succeeded`
- tool：`filesystem`
- operation：`read`
- relativePath：`fixtures/demo-project.json`
- fixture only：未读取真实文件内容

### 刷新回读

点击运行记录页“刷新”后仍显示：

- Run `run_mulgevc0`；
- 5 个事件；
- ToolRuntime receipt；
- `已从本地 SQLite 刷新运行状态`。

### 关闭和重新打开

- 关闭窗口后，4310 端口释放；
- 重新激活应用后，Server 重新启动；
- 工作台重新打开；
- SQLite 中的 ToolRuntime Run、事件和 receipt 仍然存在；
- `activate` 生命周期修复已通过 Computer Use 回读。

### 负向路径

提交 `../outside.txt` 后：

- Run：`run_mulge9rt`
- Run status：`failed`
- event：`tool.failed`
- receipt status：`failed`
- errorCode：`tool_path_traversal`
- 没有生成 `run.succeeded`

## 首次失败和修正

本轮第一次安装版启动没有打开窗口，原因是 GUI 环境没有继承终端的 Node 路径。修正为 Electron 在常见本机 Node 路径中自动解析后，安装版 Server 能正常启动。

随后发现关闭窗口后 macOS 进程仍在，重新激活不会重新启动 Server。补充 `app.on('activate')` 生命周期后，关闭窗口、端口释放、重新激活和数据恢复全部通过。

## 工程验证

- 适配器/服务器相关测试：`15/15`
- TypeScript typecheck：PASS
- Vite production build：PASS
- `RUN_STATE` 校验：PASS
- `git diff --check`：PASS
- Electron arm64 目录包：PASS
- Electron arm64 DMG：PASS，产物 `release/Local Agent Workspace-0.1.0-arm64.dmg`；本机没有 Developer ID 证书，因此保持未签名

## 结论

`PASS_ALPHA_TOOLRUNTIME_INSTALL_ACCEPTANCE`

这只证明本地 Alpha 的 ToolRuntime 控制面、事件回读、SQLite 持久化和桌面生命周期达到交付清单要求。真实 FS/Git/Shell、超时、错误分类、secret 脱敏、DeepSeek 和模型质量仍然是后续门。
