# 项目范围运行投影 v1

更新时间：2026-10-03（Asia/Shanghai）
状态：**已实现并通过专项、HTTP 与全量回归**

## 1. 目标

当本地工作区同时存在多个 Project 时，Project A 的运行状态、事件、交接、产物和 Provider receipt 不能出现在 Project B 的读取结果中。这个单元只处理读取投影，不改变重试、事件幂等或权限策略。

## 2. 已实现的读取契约

### 2.1 Runtime Run

- `GET /api/core/runs?projectId=<id>` 只返回该项目的 Run；缺少范围返回 400；
- `GET /api/core/runs/:runId?projectId=<id>` 必须带项目范围，Run 所属项目不匹配时返回 404；
- Run 详情中的 receipts 和 model receipt 回放链接都带同一个 `projectId`，不能从无范围链接绕回全局读取。

### 2.2 RunEvent

- `GET /api/runs/:runId/events?projectId=<id>` 必须带项目范围，并先校验 Runtime Run 的项目归属；
- Product Builder 只有连续性事件、没有 Runtime Run 时，使用已持久化的 `productBuilderState.projectId` 校验；
- 项目不匹配统一返回 `run_events_not_found`，不透露另一个项目的事件内容；
- Fixture 兼容事件只允许映射到默认 Product Builder 项目。

### 2.3 Entity 与 Provider receipt

- `GET /api/persistence/entities?projectId=<id>` 的 Artifact、Source、Handoff、Approval、Memory 继续按项目过滤；
- `/api/persistence/entities`、`/api/persistence/bots` 的读取缺少 `projectId` 时返回 400；
- Bot 详情与停用必须同时提供 `projectId`，项目不匹配返回 404；Bot 复制先用带范围的详情读取，再提交同一项目 ID；
- Provider receipt 增加 `listReceiptsByProject()`：通过 Runtime Run、Artifact 或 Approval 的项目归属过滤，不新增数据库字段、不做迁移；
- Web 的最近运行、运行列表、事件详情和实体回读均传递当前项目 ID。

## 3. 重启和隔离策略

运行时在 Node 测试模式下可能使用独立的内存 Store，因此测试分两条路径：

1. 若 Runtime Store 使用 SQLite，关闭另一个 SQLite 连接后重新读取同一数据库，确认 A 的 Run 可恢复且 B 不会混入；
2. 若 Runtime Store 为测试内存路径，单独在 SQLite RunStore 写入 A/B，再关闭并重开同一 SQLite 文件验证项目过滤；连续性实体则始终执行关闭/重开验证。

这避免把“测试模式的内存降级”误报成生产持久化能力。

## 4. 验证结果

`apps/server/src/http-smoke.test.ts` 新增并通过：

- A/B 两个项目的 Runtime Run 列表隔离；
- 用 A 的 `projectId` 读取 B 的 Run 返回 404；
- 用 A 的 `projectId` 读取 B 的事件返回 404；
- A 的 Artifact/Handoff/Provider receipt 出现在 A 投影，B 投影为空；
- 关闭并重开 SQLite 后，A/B Run 和 Product Builder Artifact 仍按项目恢复。

本轮命令结果：

| 检查 | 结果 |
|---|---|
| `node --experimental-strip-types --test apps/server/src/http-smoke.test.ts` | 2/2 通过 |
| `node --experimental-strip-types --test apps/server/src/persistence.test.ts` | 12/12 通过 |
| `node --experimental-strip-types --test apps/server/src/product-builder-continuity.test.ts` | 7/7 通过 |
| `npm run build:web` | 通过 |
| `npm run typecheck` | 通过 |
| `npm run validate:state` | 通过 |
| `git diff --check` | 通过 |

## 5. 保留的边界

- `/api/ui-snapshot` 是启动时的 workspace bootstrap，返回项目目录和静态首屏外壳；真实 Run、Bot、Artifact、Source、Approval 和 receipt 仍必须通过带 `projectId` 的项目接口读取；
- `projects` 与 `skills` 是工作区级资源，不伪装成项目私有数据；Bot、Run、Artifact 等项目资源不能借这两个列表绕过项目范围；
- 本轮没有给 `provider_receipts` 增加 `project_id`，避免未经设计的数据库迁移；当前通过已有 Run/Artifact/Approval 归属过滤；
- 不改变已实现的重试上限、Provider 事件语义幂等或动态权限撤销。

## 6. 下一步

bounded retry、Provider/RunEvent 语义幂等、动态权限撤销与本项目范围投影均已实现并验证，分别详见 `SPEC/18-bounded-retry-v1-2026-10-03.md`、`SPEC/19-semantic-event-idempotency-v1-2026-10-03.md`、`SPEC/20-dynamic-permission-revoke-v1-2026-10-03.md` 和本文件。后续如果要做自动后台 retry，必须另开设计单元，不能借本次项目投影变更隐式启用。
