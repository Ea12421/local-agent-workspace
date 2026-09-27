# M8-13 真人基线卡 v1

## 目的

验证 Agent Workspace 是否真的减少你把一个真实项目想法推进成下一步计划时的整理工作。

这张卡只测一个非敏感、fixture-only 任务：

> 为 `personal-knowledge-mcp-mvp` 设计“可重复的离线验证报告”下一步计划，保持只读、fixture-only、localhost-only，不接真实知识库、不启动公网服务。

## 两条路径

### A. 当前基线：ChatGPT → 手工整理 → Codex

1. 从一个新的普通 ChatGPT 对话开始，粘贴上面的固定任务和同一份项目事实摘要。
2. 记录从开始到得到可用计划的总时间。
3. 记录手工复制、删改、整理和转交给 Codex 的步骤数。
4. 保存最终计划，并标出你实际修改过的地方。

### B. Agent Workspace 路径

1. 使用同一固定任务和同一事实摘要。
2. 让 Workspace 生成带来源、边界、未知项和 next_action 的结构化计划。
3. 记录你修改了几处、花了多少时间，以及是否愿意下次继续使用。

## 记录字段

- `elapsed_minutes`
- `manual_steps`
- `manual_edits`
- `rework_count`
- `artifact_traceability`: 是否能从结果回到输入来源
- `interruption_recovery`: 中断后是否能继续
- `willing_to_reuse`: `yes / no / unsure`
- `notes`

## 最低判断门

- 两条路径都必须完成同一个计划任务；
- Workspace 路径的来源、未知项和边界不能少于基线；
- 只有当手工整理步骤或返工明显下降，且你愿意再次使用时，才记录为现实提效；
- 否则保留 `PARTIAL`，不把模型自评、机械测试或截图当作提效证据。

## 停止条件

- 任务开始读取真实知识库、凭据或项目外敏感目录；
- 需要启动公网服务、发送消息或修改候选项目；
- 两条路径输入不再一致；
- 你无法提供真实时间或修改记录。

## 当前状态

`PENDING_USER_EXECUTION`

这张卡已冻结，但还没有代替你的真实操作填写任何时间、修改量或再次使用意愿。
