> **后续校准（2026-10-03）：** 本报告中关于 Codex/Text `Operation not permitted` 的描述属于 RSI 阶段当时的历史边界。随后已在受控主机权限下升级 Codex CLI 到 `0.160.0`，并由 `npm run context:codex` 复测通过；最新证据见 `validation/context-codex-recovery-v1-2026-10-03.json/.md`。

# RSI 受控自动更新闭环验证

日期：2026-10-03  证据类型：本地控制面 / SQLite / HTTP / 构建 / Computer Use

## 结论

服务端闭环、新构建 UI 和 Computer Use 回归均通过，当前 RSI 控制面状态为 **PASS_CONTROL_PLANE_AND_UI**。
此前点击失败的原因是：打包文件已经更新，但旧 Node 服务进程仍在内存中，60630 对同一个路由返回通用 `not_found`。清理旧实例、从当前 release 包全新启动后，接口和按钮都恢复正常。

## 已验证

- 低风险 `prompt`：Run → proposal → 固定结构检查 → publish → SQLite 重启回读 → rollback。
- 同一个幂等键重复提交不会产生第二个候选或第二个发布事件。
- HTTP 接口按项目隔离；错误项目读取返回 404。
- 高风险 `provider` 候选停在待审批，不会自动发布。
- `npm run test:all`：96/96。
- `npm run typecheck`、`npm run build:web`、`npm run build:desktop`、目录包构建、`npm run validate:state`、`git diff --check`：通过。
- 从当前 release 包临时启动的 60631 服务，`POST /api/improvements/run` 返回 `201 Created`，生成 `run_ea1257c2-9070-4224-b84e-3c3e5481a266`。
- 新 Electron 包端口 65498 经 Computer Use 点击“开始自动更新”，页面显示“固定检查 通过 / 候选版本 prompt:v3 / 处理方式 自动记录”，并出现“回滚这次更新”按钮；没有再次出现 `not_found`。

## 证据边界

这证明的是本地控制面、事件回放、审批边界和构建链路。它没有证明模型回答质量变好，也没有证明 Codex 内部压缩、提示词缓存命中或账单成本下降。上下文验证仍固定使用同一 Codex/Text 通道，不做 provider 或 Harness 横向比较。

## 仍然保留的边界

- 这证明的是控制面、回放、权限边界和新构建用户路径，不证明真实模型质量、Codex 原生压缩、prompt cache 命中或成本下降。
- `npm run context:codex` 的当前 Text/Codex 复测仍受 `Operation not permitted` 环境错误阻断；按用户决定不做 DeepSeek、OpenRouter、GPT-4o 或不同 Harness 横向比较。
- 后续若重新打包，必须退出旧 Electron 实例再启动新包；否则可能继续看到旧内存服务返回的路由结果。
