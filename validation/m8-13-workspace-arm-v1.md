# M8-13 Workspace Arm v1

日期：2026-09-28（Asia/Shanghai）
固定输入：`validation/m8-13-fixed-input-v1.md`
候选项目：`personal-knowledge-mcp-mvp`

## 执行结果

通过 Chrome Computer Use 在 Web 工作台中选择“Codex 订阅执行桥（只读）”，使用固定输入完成一次真实执行：

- Run：`run_mukr3edw`
- Provider：`codex-cli` / `openai-codex`
- 认证方式：`subscription`
- `isMock=false`
- Provider events：5
- Receipt：`run_mukr3edw:codex:segment:1`
- 输出模式：严格 JSON，可解析为固定字段对象
- 原始输出 SHA-256 与 receipt 已写入 `validation/m8-13-workspace-run-mukr3edw.json`

## 结构化结果覆盖

输出包含：

- `summary`
- `evidence[]`，每项有 `source`、`fact`、`confidence`
- `unknowns[]`
- `boundary[]`
- `plan[]`，每项有 `step`、`why`、`acceptance`
- `next_action`
- `stop_conditions[]`
- `risks[]`

结果明确保持 fixture-only、localhost-only、只读边界，并把历史 PASS 与本轮未复核事实区分开。它没有运行命令、读取其他路径、启动服务或访问网络。

## 这次能证明什么

- Workspace 可以把固定输入交给真实 Codex 订阅执行桥。
- 输出可以通过固定 Schema 进入可追溯 Artifact/receipt 链路。
- unknowns、停止条件和边界可以被明确保留，不需要补猜。

## 这次不能证明什么

- 不能填充 ChatGPT→手工整理→Codex 的真人基线时间；
- 不能填充人工编辑、返工次数和再次使用意愿；
- 不能把 synthetic fixture 结果当作真实知识库效果；
- 不能单凭一次输出证明多 Bot 优于单 Bot。

## 状态

`PARTIAL / HUMAN_BASELINE_REQUIRED`

下一步是由用户在同一固定输入下完成基线 A，并记录真实耗时、手工步骤、修改量、返工和再次使用意愿；如果不提供这些真人字段，M8-13 不能升级为现实提效结论。
