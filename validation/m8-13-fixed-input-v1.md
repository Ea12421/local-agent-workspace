# M8-13 固定输入：personal-knowledge-mcp-mvp

这份文字是两条路径必须使用的同一事实摘要。它只包含非敏感项目文档事实，不包含真实知识库、凭据或账号数据。

## 任务

为 `personal-knowledge-mcp-mvp` 设计“可重复的离线验证报告”下一步计划。要求保持 `fixture-only`、`localhost-only`、只读，不接入真实知识库、不启动公网服务、不修改候选项目。

## 已知事实

- 项目目标：验证 ChatGPT 可通过官方 Node MCP SDK 的只读工具检索一组虚拟 Markdown，并返回可核对来源。
- 当前实现：只搜索项目 `fixtures/notes/` 中三份 synthetic Markdown；搜索先返回服务端生成的 16 位 `note_id`，再按 `note_id` 读取正文；工具不接受任意文件路径。
- 已记录结果：2026-07-17 项目记录中有本地 `npm test` 9 项机械检查 PASS，以及一次普通 ChatGPT Web 的 `search_knowledge` / `read_knowledge` 记录。它们是历史记录，不是本轮重新复核结果。
- 当前运行状态：MCP 服务和临时 HTTPS tunnel 按项目记录已停止；没有可访问后端；项目只允许 `fixtures/notes/`。
- 安全边界：不读取真实 Obsidian、其他项目目录、用户目录、账号数据或 secret；不写入、修改、删除、上传资料；不保存请求正文；默认只监听 `127.0.0.1`；没有生产鉴权，不得作为长期公网服务。
- 尚未证明：真实资料接入、生产鉴权、长期 tunnel、GPT-Live 直接调用和真实用户效果。

## 要求的结构化输出

请只输出一个 JSON 对象，字段必须为：

- `summary`
- `evidence[]`：每项包含 `source`、`fact`、`confidence`
- `unknowns[]`
- `boundary[]`
- `plan[]`：每项包含 `step`、`why`、`acceptance`
- `next_action`
- `stop_conditions[]`
- `risks[]`

禁止运行命令、读取其他路径、修改文件、启动服务或访问网络。事实不足时写入 `unknowns`，不要猜测。
