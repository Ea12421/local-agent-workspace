# 模型限额/中断恢复协议

模型限额、临时容量、上下文压缩或网络失败可能只中断当前助手回合；已经写入磁盘的文件和已经通过的命令不会因为对话中断而回滚。风险在于回合停在增量中间，下一回合重复做、漏做或误把活动状态当成完成。

## 项目内解决方案

1. `RUN_STATE.json` 是唯一机器状态源，`HANDOFF.md` 是人类恢复摘要。
2. 每个阶段只允许一个 `next_action`。恢复时先执行 `npm run recover`，再检查相关文件，不从旧聊天重猜。
3. `npm run checkpoint -- --phase <phase> --next <next> --evidence <evidence> --completed <n>` 以临时文件加原子 rename 更新状态，避免半写文件。
4. `npm run validate:state` 阻止缺少下一步、进度倒退、失败状态无原因或已完成状态仍有下一步的假状态。
5. 核心 Run 使用状态机、append-only event sequence 和 `idempotencyKey`，同一动作重放不会再追加事件。
6. Provider receipt 记录 harness、provider、model、认证/计费来源、是否 mock；限额失败不能被写成模型质量结论。

## 恢复流程

```text
npm run recover
npm run validate:state
# 只执行 RUN_STATE.next_action 指向的一个增量
npm run checkpoint -- --phase <new-phase> --next <one-next-action> --evidence <observable-result> --completed <n>
```

同一错误只做一次“定位 → 最小修正 → 专项验证 → 一次重试”。如果仍是外部限额、网络或权限问题，设置 `blocked_environment` 并保留证据，不循环重试、不自动消耗账户 reset credit。

## 当前账户观测

2026-09-26 观测到 Codex 普通调用允许，Codex 周窗口 usedPercent 约 34%，`rateLimitReachedType` 为空。这个快照会变化，不能当作项目完成条件；实时状态以 Codex usage 工具为准。
