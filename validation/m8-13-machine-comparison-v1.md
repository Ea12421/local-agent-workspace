# M8-13 机器版 A/B 对照（2026-09-28）

## 这次实际比较的是什么

这是同一份固定任务的两种机器执行路径：

- **A：直接单次 GPT/Codex 调用**：一次独立 Codex CLI 调用，要求输出可读 Markdown；没有读取候选项目、没有工具调用、没有修改文件。
- **B：Local Agent Workspace**：`run_mukr3edw`，通过 Workspace 的 Codex 执行桥运行，同一固定输入，要求 exact JSON；Run、事件和 receipt 已落 SQLite，并能在页面刷新后恢复。

它不是真人 A/B。两条路径都没有测出“用户手工整理多久、修改多少、返工几次、愿不愿意再次使用”。

## 结果对照

| 维度 | A：直接单次调用 | B：Workspace Run |
|---|---|---|
| 输入 | `validation/m8-13-fixed-input-v1.md` 的同一事实摘要，转成自然语言提示 | 同一固定输入文件 |
| 输出 | Markdown，自由格式；原文见 `validation/m8-13-baseline-a-single-call.md` | exact JSON；原文见 `validation/m8-13-workspace-run-mukr3edw.json` |
| 模型/通道 | `gpt-5.6-luna`，subscription；默认路由先因容量不可用而回退（错误回执见 `validation/m8-13-baseline-a-capacity-failure.json`） | `openai-codex`，subscription，`isMock=false` |
| 机器墙钟 | 103,033 ms；CLI JSONL 4 行、1 条 agent message | 83,194 ms（SQLite `created_at`→`completed_at`；不含 UI 交互，不能等同真人耗时） |
| 工具/项目访问 | 0 tool calls；提示明确禁止读文件、命令、网络和改动 | Workspace Provider events 5 条；保存了 Run 事件和 receipt |
| 结构化程度 | 需要把标题和表格人工映射到固定字段；映射记录见 `validation/m8-13-baseline-a-manual-normalization.json` | 直接满足固定字段：evidence、unknowns、boundary、plan、next_action、stop_conditions、risks |
| 可追溯性 | 只有 CLI 原始 JSONL 和本地保存的 Markdown；没有 Workspace receipt | receipt `run_mukr3edw:codex:segment:1`，event digest、usage 和 provider identity 已保存 |
| 中断/刷新恢复 | CLI 原始输出可人工保存，但没有项目 Run 状态或页面恢复 | 已验证刷新后恢复最近 Run、5 个 provider events、结构化输出和 receipt |
| 内容质量 | 覆盖目标、事实、步骤、验收、未知、停止条件和风险，读起来更自然 | 覆盖固定字段更严格，便于程序校验和审计 |
| 真人效果 | 未知 | 未知 |

## 机器层结论

1. **Workspace 在可追溯性、结构化约束和恢复方面明显更完整。** 它把一次模型输出变成可查询的 Run、事件和 receipt，刷新后仍能恢复。
2. **直接单次调用更轻量、可读性更自然，但需要额外整理，且原生 CLI 结果不会自动进入项目事实源。**
3. **这次没有证明多 Bot 更好。** B 是一次结构化 Codex 执行桥，不应写成多 Bot 质量证明。
4. **当前默认路径建议保留 Workspace 的结构化单 Bot/Codex 执行。** 是否值得继续拆成多 Bot，仍要等固定任务质量、人工修改量和真人复用证据；不能为了展示而默认增加并发和延迟。

## 尚未完成的现实证据

- 真人基线 A/B 的真实耗时、手工整理、人工修改、返工和再次使用意愿。
- 内容质量的独立 reviewer rubric，以及 36 条 receipt 中 9 条无效输出的修复结论。
- DeepSeek 真实 API、Electron Computer Use、literal clean-room GitHub clone 和 Codex 原生 resume。
- `codex-pet-studio` 等更接近真实项目的现实任务验证。
