# Local Agent Workspace 使用说明

## 1. 这是什么

Local Agent Workspace 是一个本地优先的 Agent 工作台。

你按项目管理 Bot。每次运行都会留下：

- Run 状态；
- append-only 事件时间线；
- 工具调用回执；
- Handoff 交接；
- Approval 审批；
- Artifact 和来源。

首个内置流程是 Product Builder：把一个产品想法推进成研究、产品定义、技术方案、评测计划和执行计划。

当前交付版优先保证**可运行、可追踪、可恢复和权限边界清楚**。Fixture 是演示数据，不代表真实模型质量。

## 2. 怎么打开

### macOS 桌面版

使用项目里的 DMG：

```text
release/Local Agent Workspace-0.1.0-arm64.dmg
```

打开 DMG，把 `Local Agent Workspace.app` 拖到 Applications，再启动应用。

当前 DMG 未使用 Developer ID 签名。macOS 如果提示无法验证开发者：在 Finder 中对应用右键，选择“打开”，然后再次确认。

应用启动后会自动：

1. 启动本地 Server；
2. 为本次应用分配本地端口；
3. 打开 Web UI；
4. 关闭窗口时终止自己创建的 Server。

### Web 开发模式

在项目根目录运行：

```bash
pnpm install
npm run setup
npm run dev
```

如果 pnpm 因本地缓存或 registry 条件不可用，才使用仓库提供的 `npm run install:fallback`；它是回退路径，不是首选复现命令。

另开一个终端运行：

```bash
npm run dev:web
```

无 Key 也能运行 Fixture。`npm run demo` 可单独检查完整 Fixture 主流程。

## 3. 第一次使用

打开后按这个顺序操作：

1. 在左侧选择项目。
2. 在概览页先看“当前项目边界”。这里会显示工具实际读取的 `workspacePath`。
3. 查看“只读”标签和允许/禁止的动作。
4. 点击“新建一次运行”。
5. 输入一个目标，例如：

   ```text
   设计一个面向独立开发者的 AI 视频产品
   ```

6. 选择执行入口。
7. 点击“开始运行”。
8. 在“最近一次真实入口”和“当前运行”中查看事件、receipt 和输出。
9. 打开“运行记录”查看完整时间线。
10. 刷新页面，确认状态仍从本地 SQLite 回读。

## 4. 执行入口怎么选

| 入口 | 适合做什么 | 真实程度 | 当前权限 |
| --- | --- | --- | --- |
| Fixture 本地演示 | 无 Key 查看 Product Builder 流程 | 确定性演示 | 不碰真实文件 |
| 受控 ToolRuntime | 查看工具权限、事件和 receipt | 只验证控制面 | 不读取文件、不执行 Shell |
| Fixture Tool Loop | 查看模型响应→工具→结果→下一模型→Artifact 的完整回放 | 确定性控制面演示 | 不调用真实模型，不修改文件 |
| 本地只读 Tool Loop | 让 Fixture 决策真实读取当前项目文件，再回传并生成 Artifact | 工具执行是真实的，模型仍是 Fixture | 只读、路径受限 |
| DeepSeek 只读 Tool Loop | 真实 DeepSeek 提议 `filesystem.read`，本地执行后回传并生成 Artifact | 一次真实模型闭环已验证；质量仍未验证 | 只读、只读文件、Key 仅在服务进程环境 |
| 本地只读 ToolRuntime | 读取项目内指定文件 | 真实本地读取 | 只读、路径受限 |
| 只读 Git status | 查看当前项目有哪些改动 | 真实命令 | 只运行固定命令 |
| 只读 Git diff 摘要 | 查看变更量 | 真实命令 | 只运行固定命令 |
| Codex 订阅执行桥 | 使用本机已登录 Codex CLI 做只读执行 | 能力路径已实现；当前环境需先通过只读探针 | 不读取凭据文件 |

其中，Codex 订阅不是 DeepSeek API。界面和 receipt 会分别记录 harness、provider、model、认证方式和计费来源。
如果探针显示 `blocked_environment`，表示本机 Codex 自身状态目录当前不可写；这时保留历史 receipt 和 Fixture 路径，不把它写成当前可重跑。

要单独检查 Tool Loop，可对本地 Server 发起：

```bash
curl -sS -X POST http://127.0.0.1:4310/api/runs \
  -H 'content-type: application/json' \
  -d '{"provider":"tool-loop-fixture","goal":"验证模型工具结果循环","scenario":"normal"}'
```

返回中的 `events` 应能看到 `provider.event → tool.invoked → tool.completed → provider.event → artifact.created`；`schema-error`、`approval`、`failure`、`duplicate` 和 `max-loop` 是边界演示场景。

要检查“真实本地读取 + Tool Loop”入口：

```bash
curl -sS -X POST http://127.0.0.1:4310/api/runs \
  -H 'content-type: application/json' \
  -d '{"provider":"tool-loop-local","goal":"读取项目说明","path":"README.md"}'
```

这个入口会真实读取项目内文件，但模型决策仍是 Fixture；回执会明确显示“Fixture 决策 + 真实工具”，不能当作 DeepSeek/Codex 质量证明。

要运行一次真实 DeepSeek 只读 Tool Loop，先在启动本地 Server 的同一进程环境中临时设置 `DEEPSEEK_API_KEY`，再调用：

```bash
DEEPSEEK_API_KEY='你的 Key' pnpm run dev
curl -sS -X POST http://127.0.0.1:4310/api/runs \
  -H 'content-type: application/json' \
  -d '{"provider":"deepseek-tool-loop","goal":"读取项目说明","path":"fixtures/demo-project.json"}'
```

它只允许 `filesystem.read`，不会写入、删除、执行 Shell 或发送消息。Key 不应写入仓库；回执会记录实际返回模型、usage、缓存字段和完整事件链。一次成功回归不等于模型质量或成本收益已经证明。

## 5. 当前权限边界

### 已开放

- 读取当前项目目录内的普通文件；
- 读取 `git status --short`；
- 读取 `git diff --stat`；
- 生成运行记录、receipt 和草稿 Artifact；
- 查看 SQLite 中保存的运行状态。

### 当前没有开放

- 任意 Shell；
- 删除文件；
- 覆盖重要数据；
- 访问项目外敏感路径；
- 外发消息；
- 发布、支付或修改权限；
- 工作区写入。

补充：底层 `LocalToolRuntime` 已有受控 workspace_write 契约，但当前 Product Builder 默认入口仍是只读；覆盖已有文件必须逐次审批，删除和任意 Shell 没有实现。

路径穿越、绝对路径、符号链接逃逸和非白名单命令会产生失败事件，不会被当成成功。

## 6. 怎么判断一次运行是否可信

先看四件事：

1. 顶部是否显示“本地服务正常”或明确的 Fixture 模式；
2. Provider 是否和你选择的入口一致；
3. 时间线是否包含 `run.created`、`run.started`、工具事件和最终状态；
4. receipt 是否显示 request id、工具、操作、状态和输出 hash。

如果是外部事实，必须有来源；如果只是 Fixture 输出，只能当作流程演示。

## 7. 数据保存在哪里

默认运行数据在：

```text
data/workspace.db
data/agent-workspace.sqlite
```

SQLite 是运行时事实源。JSONL 文件用于 portable/demo/export/灾备，不与 SQLite 并列作为默认事实源。

中断、限额或上下文压缩后，恢复入口是：

```text
RUN_STATE.json
HANDOFF.md
DEVLOG.md
```

不要只根据聊天记录猜测项目状态。

## 8. 常见问题

### 页面显示 Fixture

这表示本地 API 不可用，Web 使用了离线演示数据。先确认 Server 是否运行：

```bash
curl http://127.0.0.1:4310/api/health
```

### Git status 失败

先看“当前项目边界”里的 `workspacePath`。如果这个目录不是 Git 仓库，失败是正确结果；不要把 Fixture 目录的失败改写成成功。

### macOS 不允许打开应用

当前 DMG 未签名。用 Finder 右键应用并选择“打开”。

### DeepSeek 的边界

DeepSeek 是可选 API 通道，不是本地 Fixture 的前置条件。真实 Tool Loop 只读取服务端进程环境中的 `DEEPSEEK_API_KEY`，不读取 Keychain、Cookie 或 Token 文件，也不把 Key 写入仓库。当前只验证过一次只读闭环；thinking-model 的 `reasoning_content`、模型质量、成本收益和跨进程恢复仍需单独验证。

## 9. 现在适合拿它做什么

- 演示本地 Agent control plane；
- 展示 SQLite、RunEvent、receipt、权限和恢复设计；
- 用真实项目做只读文件/Git 检查；
- 继续开发 Product Builder 的真实工具能力；
- 面试时解释为什么业务状态不交给第三方 Agent 框架托管。

现在不适合把它介绍成已经证明多 Bot 更快、更好或已经完成生产发布的产品。
