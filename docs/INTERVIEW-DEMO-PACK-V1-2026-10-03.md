# Local Agent Workspace 面试演示包 v1

配套的可视化掌握包（包含简历描述、30 秒/2 分钟/5 分钟项目讲法和追问答案）见 [`docs/INTERVIEW-MASTERY-PACK-V1.html`](./INTERVIEW-MASTERY-PACK-V1.html)。

这份材料是给本人使用的口述和演示脚本。它只引用当前项目已经落盘的代码与验证证据。

## 30 秒介绍

Local Agent Workspace 是一个本地优先的 Agent 工作台。用户按项目管理 Bot；每次运行都会留下状态、事件、工具回执、审批、上下文恢复和产物。首个流程 Product Builder 把一个产品想法推进为澄清、计划、研究、技术方案、评测和执行计划。

关键点是：模型只是 Provider，业务状态由项目自己的 `packages/core`、SQLite 和 append-only `RunEvent` 控制，所以换 Fixture、DeepSeek 或 Codex 时，运行状态、权限和审计边界不跟着模型漂移。

## 5 分钟演示

### 1. 先展示产品边界

打开 Web 或当前 arm64 DMG，先指出：

- 数据保存在本机；
- 当前默认权限是“只读”；
- Fixture 是流程演示，不代表模型效果。

### 2. 跑一次主流程

1. 点击“新建一次运行”。
2. 保持“本地演示（无需 Key，仅验证流程）”。
3. 输入：`设计一个面向独立开发者的 AI 视频产品`。
4. 提交后展示澄清项、4 个 Bot 交接、5 个 Artifact 和“等待人工确认”。
5. 说明未知项不会被模型补成事实，审批通过前不会释放正式产物。

### 3. 展示真实 Provider 的边界

1. 再打开“DeepSeek Product Builder 草稿（真实模型，待审阅）”。
2. 没有 Key 时，页面会留下失败 Run，并显示 `deepseek_api_key_missing`；刷新后仍能回读。
3. 有 Key 时，真实请求只生成固定 Schema 草稿，展示实际模型、usage/cache 回执，仍保持 `pending_user_approval`，不会自动替换 Fixture 正式产物。

### 4. 展示为什么需要控制面

打开运行记录，指向：

```text
run.created
→ run.started
→ provider.event
→ tool.invoked / tool.completed
→ artifact.created
→ run.succeeded 或 run.failed
```

说明每一步都有事件和回执，失败也会被记录；刷新页面不是状态源，SQLite 才是状态源。

## 10 分钟追问答案

### “这是不是几个 Prompt 串起来？”

不是。Prompt 只产生候选输出；控制面决定谁负责、允许读什么、什么时候审批、失败从哪里恢复、产物能不能晋级。证据是 Run 状态机、ToolRuntime policy、approval endpoint 和 append-only event replay。

### “为什么不默认多 Bot？”

因为多 Bot 必须用固定任务证明价值。当前机械门只证明结构和边界，`qualityEligibleCount=0`；多 Bot 延迟和人工修改量还没有通过现实验证，所以默认结构化单 Bot，专门 Bot 保留为可比较路径。

### “DeepSeek 和 Codex 是什么关系？”

DeepSeek 是 ModelProvider，负责模型响应；Codex CLI 是 ExecutionAgent，负责本机只读执行。两者的 `authMode`、`billingSource` 和 `ProviderIdentity` 分开记录，不把订阅额度伪装成 API 额度。

### “提示词缓存怎么做？”

系统对稳定 system messages、constraints、output schema 和工具定义计算 `stablePrefixSha256`，只作为本地比较键。只有 Provider 报告 cached token 或 cache hit，UI 才写成命中；没有报告时就是未知。当前基线证据是 `validation/context-cost-baseline-v1-2026-10-03.json`。

### “上下文窗口满了怎么办？”

系统按阈值生成带哈希的 `ContextSnapshot`，保留 durable facts、决策、未知项、来源、审批和最近事件尾部；恢复时创建新的 segment，继续同一逻辑 Run。快照被篡改、事件有缺口或跨项目恢复都会失败。

### “现在能不能说已经提升效率？”

不能。当前证明的是本地控制面、权限、回执、恢复和真实 Provider 草稿链；模型质量、多 Bot 优势、真人耗时和再次使用意愿仍没有通过现实验证。

## 可引用证据

| 说法 | 证据 |
| --- | --- |
| SQLite 状态、事务和恢复 | `validation/m10-07-persistence-reconciliation-2026-09-30.json` |
| Provider 身份边界 | `validation/provider-boundary-v1.json` |
| 真实 DeepSeek Product Builder 草稿 | `validation/deepseek-product-builder-draft-v1-2026-10-03.json` |
| 无 Key 失败和刷新回读 | `validation/deepseek-product-builder-web-no-key-cua-v2-2026-10-03.json` |
| Fixture 与真实失败并存 | `validation/web-main-and-failure-cua-v1-2026-10-03.json` |
| 上下文/缓存/回放基线 | `validation/context-cost-baseline-v1-2026-10-03.json` |
| Web/Electron 本地体验门 | `validation/r6-web-electron-closure-v1-2026-10-03.json` |
| 当前 DMG、诊断和签名边界 | `validation/r7-delivery-reproduction-v1-2026-10-03.json` |

## 不能说成已完成的事

- “多 Bot 已经更快或更好”；
- “DeepSeek 一定优于或劣于 Codex”；
- “Codex 原生 resume 已接通”；
- “DMG 可以在任意 Mac 无警告安装”；
- “真实用户已经节省了多少时间”。
