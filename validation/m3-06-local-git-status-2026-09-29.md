# M3-06 只读 Git status 验证（2026-09-29）

## 已通过的部分

- `LocalToolRuntime` 只接受精确命令 `git status --short`；
- 使用 `shell: false`，固定 workspace cwd，超时上限 30 秒；
- 非白名单命令、Shell 组合和超时会留下失败 receipt；
- 临时 Git 仓库工程测试通过，能读到 untracked 文件；
- 工程测试总数：`17/17 PASS`。

## 安装版发现

Computer Use 在安装版选择“只读 Git status（查看改动）”后，Run `run_muliqifg` 返回：

- status：`failed`；
- errorCode：`tool_process_exit`；
- stderr：`fatal: not a git repository ...`；
- 没有生成 `run.succeeded`。

这是正确的失败结果：当前内置 Product Builder fixture 是打包示例目录，没有 `.git`。问题在于 Project 的 `workspacePath` 还没有成为 ToolRuntime 的 cwd 来源，不是把失败冒充成功。

## 重测：项目工作区绑定后的安装版成功路径

- 新桌面包启动自己的本地服务，页面端口为动态端口 `61488`；不再复用旧实例的 `4310`。
- 页面 API 改为跟随桌面服务当前 origin，Computer Use 通过“新建一次运行 → 只读 Git status（查看改动）→ 开始运行”完成真实入口。
- Run：`run_mulk7kis`。
- 结果：`succeeded`，5 个事件，`run.created → run.started → tool.invoked → tool.completed → run.succeeded`。
- 工具回执：`tool-request:run_mulk7kis`；`git status --short` 返回当前项目改动，`exitCode=0`，`timedOut=false`。
- 运行后 UI 显示“只读 Git status / 已完成”，并提示“运行已完成，可查看执行回执”。
- 服务归属专项测试：`2/2 PASS`；端口占用时不会把旧服务健康响应当成新服务启动成功。

## 当前结论

`PASS_M3_06_LOCAL_GIT_STATUS`。

现在项目绑定已成为 ToolRuntime 的 cwd 来源，桌面包也能从自己的本地服务执行真实只读 Git status。下一步可以继续做 Git diff 的只读摘要，仍不开放写入、删除、任意 Shell 或 DeepSeek。

## 后续增量：只读 Git diff 摘要

- `LocalToolRuntime` 只新增精确命令 `git diff --stat`，仍使用 `shell: false`、项目绑定 cwd、超时和脱敏 receipt。
- 工程测试覆盖：允许的 `git diff --stat`、未允许的 `git log`、输出和失败分类；HTTP smoke 通过。
- 安装版 Computer Use 通过 Web 运行入口完成 Run `run_mulkr9p7`。
- 结果：`succeeded`，5 个事件，输出 `argv=[git,diff,--stat]`、`exitCode=0`、`timedOut=false`；UI 显示“只读 Git diff 摘要运行已完成，可查看执行回执”。

当前可用的只读工具能力是：项目文件读取、Git status、Git diff 摘要。写入、删除、任意 Shell 和 DeepSeek 仍未开放。
