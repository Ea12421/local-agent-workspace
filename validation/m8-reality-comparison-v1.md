# M8 三次现实任务对照

## 结论

当前已经证明的是：**本地 Codex 订阅执行桥可以读取受控真实项目状态，生成可追溯结果，并把原始输出、解析模式和证据引用落盘。**

当前还没有证明：**Product Builder 内容质量更好、整体流程真的节省时间，或多 Bot 比单 Bot 更值得默认启用。**

## 三次任务

| 任务 | 做了什么 | 当前结论 | 仍缺什么 |
| --- | --- | --- | --- |
| M8-07 `codex-pet-studio` | 读取真实项目状态，做宠物包预检和安装 smoke | 窄范围 PASS；用户确认 Codex 已显示沙悟净 | 通用产品质量、审美接受、重复使用、分发 |
| M8-08 `personal-knowledge-mcp-mvp` | 读取 fixture-only MCP 状态，提出可重复验证增量 | 内容可用，但原始严格 JSON 门 PARTIAL；候选 smoke 9/9 | 真实知识库、真人基线、提效、用户复用 |
| M8-11 `local-agent-workspace` | 对 SQLite-first 和 receipt 集成做技术路线判断 | 窄范围 PASS；12/12 字段、4/4 来源、无副作用 | 技术建议正确性、人工对照、真实工程结果 |

## 证据分层

### 已有

- Codex subscription execution bridge 的真实运行记录；
- 固定白名单、只读边界、原始事件和 Artifact；
- `provider.output-receipt.v1`：原文 hash、解析模式、提取 hash、拒绝原因；
- 候选项目自己的 fixture-only smoke 证据。

### 没有

- 独立 reviewer rubric；
- ChatGPT→手工整理→Codex 的用户本人基线；
- 人工修改量、返工次数、总耗时和成本对照；
- 真人再次使用意愿；
- DeepSeek parity、Codex native resume、Electron 窗口可见性。

## 决策

保留当前 SQLite-first、只读白名单、receipt 和现实验证卡。下一步做一个由用户本人完成的非敏感固定任务，冻结两条路径的真实测量，再决定是否继续多 Bot 或接 DeepSeek。
