# Context Continuity v1：长窗口、压缩与恢复

## 目标

让一个逻辑 Bot/Run 在模型窗口、限额、进程或外层 Codex 会话中断后继续工作。用户看到的仍是同一个 Project、Bot 和 Run；底层可以轮换多个 provider execution segment。

本机制不承诺“无限上下文”或“压缩零损失”。它提供四个可验证保证：

1. 原始 `RunEvent` 只追加、不因压缩删除；
2. 每个不可变 `ContextSnapshot` 带事件范围、项目/Run 归属和内容 hash；
3. 恢复时使用 `Snapshot + 最近事件尾部 + Artifact/Source/Approval/Handoff 引用` 重建上下文；
4. Provider 不支持原生 resume 时，使用保存的 `RunRequest + ContextPacket` 启动新的 execution segment，逻辑 Run 不变。

## 核心概念

```text
逻辑 Run（不变）
  ├─ segment-1：Codex/DeepSeek/Fixture 执行
  ├─ ContextSnapshot-1：覆盖事件 1..N
  ├─ segment-2：使用 Snapshot-1 + event tail 继续
  └─ ContextSnapshot-2：覆盖事件 1..M
```

- `Run`：用户可见的长期任务身份。
- `segment`：一次具体 Provider handle；Provider 重启或换窗口不创建新 Bot/Run。
- `ContextSnapshot`：结构化摘要，不是事实源；它必须引用原始事件、Artifact 和 Source。
- `ContextPacket`：恢复时交给 Provider 的有限上下文包。
- `RunEvent`：完整审计事实，永不被摘要替代。

## 必须保留的内容

每次压缩都必须保留：

- 用户原始目标和硬约束；
- 已确认决策及其 actor；
- 未知项和未决问题；
- 待处理 Approval；
- 活跃 Handoff；
- 工具调用结果和失败；
- Artifact/Source 引用；
- 当前唯一下一步；
- 最近事件尾部。

不保存 hidden chain-of-thought。模型生成的摘要只能是可替换的派生物，不能覆盖事件、Artifact 或用户决定。

## 压缩触发

Provider 能提供窗口上限时，按该能力计算；未知上限时使用安全配置，不猜测模型窗口。

- `softThreshold`：默认预算约 65–70%，先生成 Snapshot；
- `hardThreshold`：默认预算约 80–85%，必须 Snapshot 或切换 segment；
- Handoff、Approval、Artifact、工具完成、provider limit、进程恢复和用户手动请求也触发 checkpoint；
- Snapshot 写入、hash 校验和 `context.snapshot_created` 事件全部成功后，才能切换 active snapshot；失败时保留旧 Snapshot 并追加 `context.compaction_failed`。

## 恢复顺序

```text
读取 Run
→ 读取最新合法 Snapshot
→ 校验 projectId / runId / hash / event range
→ 读取 Snapshot 覆盖范围后的事件和最近 tail
→ 加载待处理 Approval、Handoff、Artifact、Source
→ 生成 ContextPacket
→ append run.resume_requested
→ 原生 resume，或 fallback startRun 新 segment
→ append segment/receipt
```

恢复不能重复已完成的工具调用或 Artifact 写入。所有动作使用 `runId + snapshotId + action` 作为幂等边界。

## v1 实现范围

### 本阶段

- `packages/core/src/context.ts`：token 估算、阈值判断、Snapshot 构造、hash、事件范围和 Packet 恢复；
- `packages/core/src/context.test.ts`：稳定性、篡改、缺失事件、跨项目隔离和 tail 顺序；
- JSONL fallback 的数据契约和恢复文档；
- Fixture/Codex 的 synthetic limit 测试入口预留。

### 后续

- `context_snapshots`、`run_segments` SQLite 表和进程重启 hydration；
- Server context service 和 runtime 自动触发；
- Provider `resume(request)` 上下文参数；
- Codex/DeepSeek fallback restart receipt；
- Web UI 展示 logical Run、segment、Snapshot 范围和恢复原因；
- M8-07 限额、崩溃、重试和 replay 现实验证。

## 验收标准

- 同一事件日志生成的 Snapshot 字节和 hash 稳定；
- 事件范围缺失、重排、跨项目时拒绝恢复；
- 原始事件数量不因压缩减少；
- Packet 能包含 summary、tail、待审批和引用；
- 重复 compaction/resume 不重复写 Artifact；
- provider limit 后能在同一逻辑 Run 下创建新 segment；
- 不把 Fixture 或模型自评写成 reality validation。
