# M8-05 现实验证复核

## 结论

`PASS（窄范围）`。本次只验证两件事：

1. 三个真实、非敏感的本地项目状态任务能否产出可回读的结构化简报；
2. 一个真实 Codex provider segment 被中断后，控制面能否用同一逻辑 `runId`、一个 `ContextSnapshot` 和一个 resume segment 收口。

这不是 Product Builder 业务质量通过，也不是人工提效、多 Bot 优势、DeepSeek 等价或 Electron 完整验收。

## 证据

- `validation/m8-05-reality-results.json`
- `validation/m8-05-raw/REAL-01.json`
- `validation/m8-05-raw/REAL-02.json`
- `validation/m8-05-raw/REAL-03.json`
- 实现版本：`513fae88a43f46d8b6034d174f4438cc4793d0de`
- 运行身份：`codex-cli / openai-codex / codex-managed-session / subscription / isMock=false`

## 观察到的事实

- REAL-01、REAL-02、REAL-03 均有单个 JSON 对象、完整必填键、白名单内 `source_refs`、显式 `unknowns` 和单一 `next_action`。
- Recovery smoke 的事件顺序包含：第一段 provider event → `context.snapshot_created` → `run.resume_requested` → 第二段 provider event → `run.succeeded`。
- 所有 recovery 事件的 `runId` 相同；没有把一次恢复伪装成 Codex 原生 `resume`。
- Recovery smoke 的第二段模型内容明确返回了 blocked，原因是提示要求“不执行读取命令”，因此只把“运行链恢复”计为 PASS，不把该段内容计为业务任务完成。

## 未验证项

- 没有记录手工 baseline、人工修改步骤、重复使用意愿、成本或长期时延。
- 没有证明模型输出正确、三条路径中多 Bot 更好，或 ContextSnapshot 不会在更长任务中丢失关键信息。
- DeepSeek 仍未调用；Codex 原生 resume 仍未接通。

## 下一步

冻结一个真实 Product Builder 或技术路线任务的 paired baseline card，再比较手工流程与结构化 Run 的人工整理步骤、耗时、返工和证据可追溯性。阈值在执行前冻结；没有 baseline 就不写“提效”。
