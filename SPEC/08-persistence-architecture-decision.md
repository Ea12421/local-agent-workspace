# 持久化架构决策：SQLite-first

## 决策

从长期产品形态看，Local Agent Workspace 采用：

```text
SQLite = 运行时唯一事实源
JSONL  = portable / demo / export / 灾备格式
```

JSONL 不再与 SQLite 并列为两个运行时事实源，也不能在没有提示的情况下静默降级。

## 为什么现在就按长期路线选 SQLite

项目后续不是一次性 Demo，而是要持续管理：

- 多个项目和工作区；
- 多个 Bot、Skill、ToolPolicy 和 Provider；
- 长时间运行的 Run、segment 和 ContextSnapshot；
- Handoff、Approval、Source、Artifact、Memory 和 Provider receipt；
- Web 与 Electron 同时访问本地 Server；
- 中断恢复、取消、重试、幂等重放和跨项目查询。

这些场景需要事务、唯一约束、索引、分页、跨进程锁和可预测的崩溃恢复。SQLite 更适合作为长期运行时存储。

JSONL 仍然保留，因为它适合：

- clean-room 或没有可用 SQLite 驱动的 portable 模式；
- Fixture 演示；
- 人工检查、导出和灾备；
- 从事实记录重建 SQLite 投影。

## 关键约束

1. Domain、Workflow、Web 和 Electron 不直接依赖 SQLite API，只依赖 storage-neutral interface。
2. `RunEvent` 仍然是 append-only；SQLite 表中的事件行不可更新覆盖。
3. `UNIQUE(run_id, sequence)`、事件 ID、幂等键和项目隔离由数据库约束保护。
4. ContextSnapshot、Run segment、Handoff、Approval、Artifact、Source 和 Memory 都进入版本化 schema。
5. 大型 Artifact 内容可以放在 content-addressed 文件中，SQLite 保存路径、hash、大小和关联元数据。
6. SQLite 打不开时，系统必须返回 `mode=portable` 和原因；不能伪装成完整模式。
7. 不做 SQLite 与 JSONL 的默认双写。导入、导出和重建必须是显式操作。

## 驱动策略

按以下顺序探测：

1. `better-sqlite3`；
2. Node 22 可用的 `node:sqlite`；
3. 两者都不可用时进入显式 JSONL portable 模式。

当前本机已经验证：Node 22.23.1 的 `node:sqlite` 可以打开数据库、启用 WAL、执行参数化 SQL 并读回记录。当前 `better-sqlite3` 二进制存在 Node ABI 不匹配，因此运行时会使用 `node:sqlite`，并把能力写进 API 回执。

## 实施顺序

### M10-01：持久化接口冻结

- `EventLog`、`ContextSnapshotStore` 和后续实体 Store 保持存储中立；
- runtime 和 Product Builder 只通过 factory 注入；
- 删除硬编码的 JSONL 默认路径。

### M10-02：SQLite schema 与迁移

新增版本化迁移和 `schema_meta`，至少覆盖：

```text
projects
bot_profiles
skills
runs
run_segments
run_events
handoffs
approval_requests
sources
artifacts
memory_items
provider_receipts
context_snapshots
idempotency_keys
```

### M10-03：事务和恢复

- WAL、foreign keys、busy timeout；
- RunEvent 追加与 Run 状态变化使用事务；
- 重启、kill、重复提交和数据库锁测试；
- SQLite 备份与恢复测试。

### M10-04：JSONL 导入导出

- 导入前校验 project/run/sequence/idempotency/hash；
- 事务导入后回读比对；
- 导出 JSONL 可重建 SQLite；
- 导入导出不改变 Domain 和 HTTP 契约。

### M10-05：规模和并发验证

- 跨进程 append 竞争；
- 10k / 100k 事件查询和分页；
- ContextSnapshot latest 查询；
- approval 和 artifact 幂等；
- portable 模式的能力限制提示。

## 回滚策略

如果 SQLite 集成或跨平台打包仍然阻塞：

1. 保留 storage-neutral interface；
2. 启用显式 portable JSONL 模式；
3. 保留 SQLite schema 和导入导出代码；
4. 不把 portable 模式宣传成完整并发能力；
5. 只在有新的环境证据后重新尝试 SQLite full mode。

这不是回到“JSONL 和 SQLite 两个事实源”，而是同一套产品在能力不足时的降级运行模式。
