# Local Agent Workspace v0.1 交付清单

> 当前状态：`READY_FOR_USER_ACCEPTANCE`（2026-09-29）。本清单描述的是可独立运行的本地 Alpha 交付版，不把后续真实模型质量和写入能力混入本次完成定义。

## 这次交付的定位

本次交付定义为 **Local Alpha / 可继续开发的本地可用版本**。

它要证明：

> 这个项目已经成为一个可以在本机安装、启动、运行、查看状态、恢复和继续开发的 Agent Workspace 控制面。

它不宣称：

- DeepSeek 已经接通；
- 多 Bot 已经证明比单 Bot 更好；
- 已经完成生产级 Shell、Git、搜索和文件写入；
- 已经完成 GitHub clean-room 安装；
- 已经完成 macOS Developer ID 签名；
- 已经证明真实生产效率提升。

这些属于后续验收门，不混入本次 Alpha 的完成定义。

## 交付给用户的东西

交付时应包含以下四类内容：

### 1. 可以打开的应用

- macOS Electron 应用：`Local Agent Workspace.app`；
- 同一套 Web UI 的本地启动方式；
- 本地 SQLite 数据文件和可诊断的运行记录；
- 自定义应用图标；
- 应用关闭后不会残留本地 Server 端口。

### 2. 可以实际走通的主流程

用户能够完成：

```text
打开工作台
→ 选择项目
→ 查看 Bot
→ 新建一次运行
→ 选择 Fixture / ToolRuntime / Codex 只读入口
→ 查看 Run 时间线
→ 查看工具调用和 receipt
→ 刷新或重新打开后回读状态
→ 查看 Artifact、来源和审批状态
```

### 3. 可以检查的本地证据

- `RUN_STATE.json`：当前唯一执行状态；
- `SPEC/00-06`：产品、架构、权限和验证边界；
- `SPEC/IMPLEMENTATION-BACKLOG.md`：任务状态；
- 本清单：交付范围和验收标准；
- `validation/`：运行、持久化、Computer Use 和限制证据；
- `DEVLOG.md`：实现历史和已知问题。

### 4. 清楚标注的限制

界面和文档必须明确区分：

- Fixture 演示数据；
- Codex 订阅执行桥；
- 真实 API Provider；
- 尚未执行的工具调用；
- 草稿 Artifact 和最终 Artifact；
- 已验证事实和待验证假设。

## 必须通过的交付门

### P0-1：可以启动

- 本机能够启动 Web 或 Electron；
- `/api/health` 返回正常；
- 页面能加载项目、Bot、Run 和 Artifact；
- 退出 Electron 后默认端口被释放；
- 不能依赖聊天窗口继续保持上下文。

### P0-2：Fixture 主流程可用

- 无任何 API Key 也能运行；
- 能完成一次 Product Builder Fixture 流程；
- 结果、事件、审批和 Artifact 可见；
- Fixture 明确标记为演示数据，不写成真实模型效果。

### P0-3：状态可以持久化和恢复

- RunEvent 是 append-only；
- 刷新页面后事件数量和内容不丢失；
- 重新打开应用后仍能读取同一 Run；
- 重复 retry 不会重复写入同一幂等事件；
- 中断后可以从 `RUN_STATE.json` 和 SQLite 继续。

### P0-4：审批和失败路径可见

- pending approval 能在界面显示；
- 用户批准后能看到 `approval.resolved` 和 release 状态；
- retry 会留下 `run.retry_requested`；
- 失败能显示原因和 correlation id；
- 失败不会静默变成成功。

### P0-5：受控 ToolRuntime 最小纵向单元

- 提供 dry-run / fixture 入口；
- 只验证权限和路径边界；
- 默认 Fixture 不读取真实文件；另有显式 `local + read_only + filesystem.read` 的受控本地验证入口；
- 默认不执行 Shell；仅允许已审计的只读 Git 命令走显式本地入口；
- 产生 `tool.invoked`、`tool.completed` 或 `tool.failed`；
- receipt 内含 schema version、request id、工具、操作、状态和 hash；
- 刷新后仍能从 RunEvent 回读；
- 重复 request id 不产生第二份不同结果。

### P0-6：Codex 订阅桥边界清楚

- 能通过公开 CLI 路径探测 Codex；
- 只读执行可以形成真实 receipt；
- 记录 `authMode=subscription` 时不把它写成 API 额度；
- 不读取 Cookie、Token 或私有凭据；
- resume 尚未完成时必须显示为限制。

### P0-7：工程可复现

- 类型检查通过；
- 相关 Node 测试通过；
- Web production build 通过；
- Electron 目录包至少能在当前机器启动；
- `git diff --check` 通过；
- 诊断命令和已知限制有记录。

## 交付前的实际验收步骤

交付前我会执行一次固定的 Computer Use 验收：

1. 启动安装版应用；
2. 打开工作台概览；
3. 打开 Bots 管理，确认内置 Bot 可见；
4. 新建一次 `受控 ToolRuntime（dry-run / fixture）` 运行；
5. 在运行记录中看到工具调用开始和完成事件；
6. 打开事件详情，确认 receipt 字段可读；
7. 刷新页面；
8. 关闭并重新打开应用；
9. 再次确认 Run、事件和 receipt 仍在；
10. 故意提交一个越权路径，确认得到失败事件，而不是执行成功。

以上步骤全部通过，才把本地 Alpha 标为 `READY_FOR_USER_ACCEPTANCE`。

## 本次明确不作为交付阻塞项

以下内容保留在 backlog，不阻塞本地 Alpha 交付：

- DeepSeek Key 和真实 thinking/tool call；
- 完整真实 FS/Git/Shell 执行器；
- Shell 超时、错误分类和 secret 脱敏的完整实现；
- Codex native resume；
- GitHub remote 和 clean-room clone；
- Developer ID 签名和公证；
- 多 Bot 质量比较；
- 真人效率、手工修改量和再次使用意愿；
- 云端多用户、后台监听、自动发布和无人审批。

## 交付时用户会收到的说明

交付说明必须按下面的结构写：

1. 已完成什么；
2. 你现在可以怎么打开和操作；
3. 哪些证据证明它能用；
4. 哪些能力还只是 PARTIAL；
5. 哪些限制来自外部条件；
6. 下一步只保留一个推荐动作。

## 用户验收选项

交付后用户只需要做一个判断：

- **接受当前 Alpha**：进入下一阶段，补真实工具执行和外部验收；
- **接受但调整参数**：指出要改变的交付门、默认 Provider、权限或 UI 行为；
- **不接受**：指出哪一个 P0 门没有达到，按该门修正；
- **继续观察**：保留当前版本，不扩展范围，先补证据。

在用户做出判断前，不把 Alpha 写成完整生产产品，也不自动扩大交付范围。
