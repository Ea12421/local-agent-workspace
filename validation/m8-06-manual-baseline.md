# TECH-01 手工 baseline（controller proxy）

> 本记录是 Codex controller 的代理基线，不是用户本人计时或接受证明。

## 任务

判断 ContextSnapshot 持久化继续采用 JSONL 事实源加可选 SQLite 索引，还是在 v1 前迁移为 SQLite-first。

## 固定输入

- `AGENTS.md`
- `RUN_STATE.json`
- `HANDOFF.md`
- `SPEC/MASTER-SPEC.md`
- `packages/core/src/context.ts`
- `apps/server/src/persistence.ts`
- `validation/m9-context-continuity-results.json`

## 手工步骤记录

1. 从 `RUN_STATE.json` 和 `HANDOFF.md` 提取当前目标、卡点和唯一下一步。
2. 从 `SPEC/MASTER-SPEC.md` 提取事实源、崩溃恢复、限额中断和 SQLite/JSONL 边界。
3. 检查 `packages/core/src/context.ts` 的 snapshot、hash、event range、tail 和 ContextPacket 行为。
4. 检查 `apps/server/src/persistence.ts` 的 append-only JSONL、重复 ID 拒绝、latest 查询和 SQLite fallback 边界。
5. 对照 `validation/m9-context-continuity-results.json` 区分已验证事实与未验证项。
6. 手工建立 JSONL-first 与 SQLite-first 的 options/trade-offs/dependencies/risks/rollback 矩阵。
7. 手工补 source_refs、unknowns、推荐结论和唯一 next_action。

## 决策结果

### 推荐

保留 JSONL-first：ContextSnapshot 和 RunEvent 继续以 append-only JSONL 作为事实源；SQLite 只作为可选索引或查询加速层，暂不把 SQLite-first 设为 v1 前置条件。

### 选项比较

| 选项 | 优点 | 代价与风险 |
|---|---|---|
| JSONL-first + 可选 SQLite 索引 | clean checkout 可运行、无原生依赖也能恢复、原始事件可回读、事实源简单 | 大日志查询需要扫描；行级写入和多进程并发仍需专项测试；部分写入需要明确损坏恢复策略 |
| SQLite-first | 查询和事务边界更清晰，可建立索引并支持更复杂过滤 | native 依赖安装和 clean-room 复现风险更高；需要迁移、schema 版本、导入导出和双写一致性；可能把可恢复事实源绑定到数据库状态 |

### 依赖

- JSONL-first：当前 `JsonlContextSnapshotStore`、append-only event log、hash/event-range 校验即可继续。
- SQLite 索引：需要稳定 schema/version、从 JSONL 重建索引、索引损坏后的 fail-closed 回退、parity 检查和性能基线。

### 风险与回滚

- 主要风险是 JSONL 文件增长、并发 append、进程崩溃造成尾行不完整，以及线性查询变慢。
- 回滚路径是停止使用 SQLite 索引，保留 JSONL 事实源并从日志重建内存查询；不删除既有 snapshot/event。

### 来源与未知项

- 来源：`AGENTS.md`、`RUN_STATE.json`、`HANDOFF.md`、`SPEC/MASTER-SPEC.md`、`packages/core/src/context.ts`、`apps/server/src/persistence.ts`、`validation/m9-context-continuity-results.json`。
- UNKNOWN：真实项目规模下的日志增长曲线、多进程并发写入表现、部分写入恢复策略、SQLite 索引带来的实际查询收益。

### 唯一 next_action

先增加 JSONL 尾行损坏、并发 append 和重建索引的故障注入/性能基线；没有实际瓶颈证据前，不迁移为 SQLite-first。

## 计量边界

- `manual_edit_steps`: 7 个固定步骤。
- `elapsed_ms`: UNKNOWN；本次没有把 controller 的思考/文件编辑时间冒充为用户手工时间。
- `rework_count`: 0 个已观察的重大返工；不等于真人使用结果。
- `owner_willingness_to_reuse`: UNKNOWN。
