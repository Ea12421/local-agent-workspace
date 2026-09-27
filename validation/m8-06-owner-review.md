# M8-06 人话版判断卡

## 这次到底在比较什么？

我们不是在比较两个 AI 模型，也不是在要求你阅读 JSON。

我们只是在决定：项目保存运行记录时，第一版采用哪种存储方式。

- **JSONL-first**：把每条运行记录按顺序写进普通文本日志。日志是事实源；以后可以加 SQLite 做查询加速。
- **SQLite-first**：从第一版开始就把 SQLite 数据库作为主要事实源。

## 长期架构决定

**采用 SQLite-first。SQLite 是运行时唯一事实源；JSONL 保留为 portable、demo、export 和灾备格式。**

原因是这个项目后续要长期管理多项目、多 Bot、长时间 Run、审批、交接、Artifact、Memory，并同时服务 Web 和 Electron。长期需要：

1. 多进程写入和锁；
2. 事务、唯一约束和幂等；
3. 跨项目分页和检索；
4. 长期数据留存、备份和恢复；
5. Run、Approval、Artifact、Memory 等多实体的一致性。

JSONL 继续保留，但不再与 SQLite 并列为两个事实源。SQLite 不可用时，系统必须明确显示 `mode=portable` 和原因。

具体实施方案已经写入 [`SPEC/08-persistence-architecture-decision.md`](../SPEC/08-persistence-architecture-decision.md)。

## 这次测试已经证明什么？

- 损坏的 JSONL 尾行不会被悄悄忽略，会明确失败。
- 同一个进程里同时写入 20 个快照，记录没有丢失。
- 重启后仍能按项目和 Run 找到最新快照。
- 核心测试 19/19 通过。
- 当前代码已让 SQLite 成为默认运行时后端；Node 22 使用 `node:sqlite`，`better-sqlite3` ABI 不匹配时会被诊断并切换到兼容驱动。

## 这次测试没有证明什么？

- 没有证明多个进程同时写入时一定安全。
- 没有证明大规模日志下 JSONL 一定比 SQLite 快。
- 没有证明这个 Agent 产品已经比手工流程更高效。

## `structured-run.json` 是什么？

它是一次真实 Codex 订阅执行的**机器审计回执**，用来记录：

- 模型给出的建议；
- 它读取了哪些文件；
- 是否返回了完整 JSON；
- 是否出现越权来源；
- 执行耗时和 Run ID。

它不是最终用户界面，也不是要求你以后手工阅读的格式。

## 当前推进状态

这个决定已经由总控采用，下一步是继续补齐 SQLite schema、迁移、导入导出、跨进程并发、崩溃恢复和备份恢复测试。
