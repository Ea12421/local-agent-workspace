# M8-04 固定任务消融

## 目的

比较同一题集在三条路径上的结果：

1. `single_call`：一次结构化模型调用，不创建状态交接。
2. `single_bot`：一个 Bot，使用固定 Schema、审批和 receipt。
3. `multi_bot`：Research → Product → Architecture → Evaluation 的结构化交接。

Fixture 只能验证契约、事件、回放和审批边界，不能作为模型质量或真实提效证据。当前 DeepSeek 尚未真实调用；在真实 provider 可用前，M8-04 只能标为未执行或 PARTIAL。

## 固定记录

每次结果写入 `validation/m8-04-results.jsonl`，一行一个 `task_id × path × attempt`。至少记录：

- `task_id`、题集版本、输入 hash；
- path、provider、model、harness、`isMock`、billing source；
- 开始/结束时间、耗时、token/cost（未知写 `null`）；
- Artifact id/字节数、receipt id；
- `schema_pass`、逐条 `hard_constraints`、`hard_pass_count`；
- 人工修改步数和字符数（同一编辑规则）；
- 失败类型、traceability score、recovery 结果、approval/event/handoff depth；
- reviewer rubric（1–5）和备注。

## 判定

- Schema 错误不得进入正式 Artifact。
- Research 外部事实必须有 Source，或明确写 `unknown`。
- 每条路径先按 10 题汇总硬约束通过数。
- 多 Bot 只有同时满足以下条件才允许成为默认路径：
  - 至少 8/10 题通过硬约束；并且
  - 人工修改量下降至少 20%，或 reviewer rubric 提高至少 1 级；并且
  - 成本和延迟不超过 single_bot 的 2 倍。
- 任一条件缺失时，保留结构化 single_bot 作为默认路径，并把 multi_bot 记录为实验结果。

## 现实边界

这套题集证明的是工程和 AI 能力的可重复比较，不等于现实用户提效。现实验证另用 3 个非敏感真实任务记录耗时、整理步骤、返工、可追溯性、中断恢复和再次使用意愿。

## Pilot runner

可以先跑一题三路径的受控 pilot：

```bash
pnpm run m804:pilot -- --task PB-01 --path all --dry-run
```

去掉 `--dry-run` 才会调用本机 Codex CLI。Pilot 结果默认 `quality_eligible=false`，因为还没有独立 JSON/schema 校验和人工复核；它只能验证调用、事件、receipt、耗时和结果账本链路。最终 Artifact 的文本必须完整解析为一个 JSON 对象；multi Bot 的各阶段输出保存在 receipt/handoff 中，不能拼接后当作一个 Artifact。只有完成校验后，才允许把 `hard_pass_count` 纳入 M8-04 聚合。

PB-01 的人工复核记录在 `validation/m8-04-manual-review-PB-01.json`。它只记录证据缺口和下一步补证，不会把模型自评或自动校验结果提升为质量结论。结果账本按 `receipt_id` 追踪；如果外层会话并发结束，`attempt` 数字可能重复，不能替代 receipt 唯一标识。
