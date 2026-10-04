# P0 差异审计与最小修正 v1

更新时间：2026-10-03（Asia/Shanghai）  
状态：**审计完成；路径、项目详情、事件幂等、重试和动态权限撤销已修正；剩余公共契约项保留为独立工程单元**

## 1. 本轮要回答的问题

本轮只检查运行时最容易造成越权、重复副作用或错误展示的控制面差异：

- `ToolPolicy.allowedPaths` 是否真的限制了文件读写；
- Artifact、Source、Handoff 的查询是否绑定项目；
- 审批、事件、重试和恢复是否会重复执行或无界重试；
- Web 投影是否可能把一个项目的运行结果展示到另一个项目。

本轮不引入第三方 Agent 框架，不做数据库迁移，不重新调用 OpenRouter/DeepSeek，也不把 Fixture 或机械 PASS 写成真实模型效果。

## 2. 审计结果

| 编号 | 差异 | 影响 | 当前结论 |
|---|---|---|---|
| P0-01 | `allowedPaths` 类型已经存在，但 ToolRuntime 原先只检查工作区根目录，没有执行项目内子路径白名单 | Bot 可能读写超出其声明范围的项目内路径 | **已修正**：Fixture/Local filesystem read/write 在路径解析、遍历和 symlink 检查后，再执行项目相对路径 allowlist；失败留下 `tool_path_not_allowlisted` 回执 |
| P0-02 | Artifact/Source 详情原先可以只按 ID 查询；Handoff 查询也没有可靠的项目过滤锚点 | 已知 ID 或混合项目数据时，详情可能跨项目泄露 | **已修正**：Artifact/Source 详情必须带 `projectId`；SQLite 查询同时按 ID 和项目过滤；Handoff 列表按项目 Bot 档案过滤；Product Builder 首次运行只补齐缺失的内置 Bot 档案，不覆盖用户修改 |
| P0-03 | 动态撤销权限没有运行时可观察契约；调用方传入的 `approvalGranted` 仍是静态布尔值 | 审批被撤销或策略更新后，正在运行的调用可能继续使用旧快照 | **已修正**：调用前重新核对 policy/approval、版本号和撤销事件；撤销后的调用 fail closed，详见 `SPEC/20-dynamic-permission-revoke-v1-2026-10-03.md` |
| P0-04 | 事件只有 event ID/sequence 幂等；没有稳定的 provider source event 或语义幂等键 | Provider 重放或并发回调可能写入语义重复事件 | **已修正**：Provider/Tool/Artifact/Approval/segment 事件按稳定语义键去重；当前 attempt 的终态受保护；冲突 receipt 保留为稳定变体，详见 `SPEC/19-semantic-event-idempotency-v1-2026-10-03.md` |
| P0-05 | `failed → queued` 没有最大重试次数；HTTP retry 使用固定 `retry:${runId}` 键，第二次重试可能只返回第一次结果 | 失败任务可能无界重试，且用户以为重新执行了实际没有执行 | **已修正**：默认最多 2 次 retry，配置受硬上限 5；每次 `run.retry_requested` 记录 attempt、模式、失败分类和幂等键；成功、取消、不可重试失败和耗尽预算均拒绝，详见 `SPEC/18-bounded-retry-v1-2026-10-03.md` |
| P0-06 | `/api/core/runs`、实体 receipts 和 Bot 详情仍有全局查询路径；provider receipt 表没有稳定 `project_id` | 多项目同时使用时，运行列表、回执或 Bot 详情可能混入其他项目 | **设计任务**：所有读路径要求 project scope；receipt 通过 run/project 归属过滤；Bot duplicate/detail API 一并改为带 projectId |
| P0-07 | SQLite 重开后的 Run/Event/Artifact 回放、Tool callId 去重和审批重复解析已有证据 | 进程中断后可能重复工具调用或产物 | **已通过现有验证**：恢复回放保持同一 Run，工具完成 1 次、Artifact 1 个，审批解析可重复读取 |
| P0-08 | 路径遍历、绝对路径、symlink escape 和 shell 解释器/元字符已有拒绝路径 | 本地文件与受控 Shell 的越权风险 | **已通过现有测试** |

## 3. 本轮实际修改

### 3.1 路径白名单

新增 `isAllowedWorkspacePath()`，语义固定为：

- `allowedPaths` 缺失或为空：保持原有“工作区范围内”的兼容行为；
- 非空：只允许精确路径及其后代；
- 检查发生在 `resolveSandboxPath()` 之后，因此不能绕过绝对路径、`..`、符号链接和工作区根限制；
- Shell 当前只允许精确 argv 白名单，暂不把任意路径参数交给 Shell，因此不把 filesystem allowlist 误套到 Shell。

修改文件：

- `packages/adapters/src/sandbox.ts`
- `packages/adapters/src/tool-runtime.ts`
- `packages/adapters/src/adapters.test.ts`

### 3.2 项目范围详情与交接

- `/api/persistence/artifacts/:id` 与 `/api/persistence/sources/:id` 缺少 `projectId` 时返回 400；项目不匹配时返回 404；
- Web 详情请求显式传递当前项目 ID；
- `listHandoffs(projectId)` 不再直接返回全局交接；
- Product Builder 首次落盘时只创建缺失的内置 Bot Profile，后续不会覆盖用户修改，保证交接可以有项目归属锚点。

修改文件：

- `apps/server/src/persistence.ts`
- `apps/server/src/index.ts`
- `apps/server/src/http-smoke.test.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/App.tsx`

## 4. 验证证据

本轮定向验证：

| 命令 | 结果 |
|---|---|
| `node --experimental-strip-types --test packages/adapters/src/adapters.test.ts` | 22/22 通过；含 `allowedPaths` 拒绝测试 |
| `node --experimental-strip-types --test apps/server/src/http-smoke.test.ts` | 2/2 通过；含缺少项目范围、跨项目 Artifact/Source 404 |
| `node --experimental-strip-types --test apps/server/src/persistence.test.ts` | 12/12 通过 |
| `node --experimental-strip-types --test apps/server/src/product-builder-continuity.test.ts apps/server/src/tool-loop.test.ts packages/core/src/context-multipass.test.ts` | 17/17 通过 |
| `npm run typecheck` | 通过 |
| `npm run validate:state` | 通过（运行状态仍为 `running`，不是完成声明） |
| `git diff --check` | 通过 |

已有恢复证据继续有效：

- `validation/context-deep-recovery-v1-2026-10-03.json`：SQLite 重开、Tool callId 回放和 Artifact 去重；
- `validation/context-codex-recovery-v1-2026-10-03.{json,md}`：同一 Codex 执行器读取完整账本与结构化恢复包；
- `validation/context-benchmark-v1-2026-10-03.{json,md}`：结构化字段保留和恢复包体积基准。

## 5. 尚未实现的公共契约项

这两项不能靠继续堆测试掩盖，下一步需要单独冻结接口：

1. **有界重试的自动调度**：attempt 计数、最大次数、手动重试与自动重试区分已经完成，详见 SPEC18；退避与自动后台调度仍未实现。
2. **全量项目投影**：runs、receipts、Bot detail/duplicate 和 Web snapshot 都必须携带并校验 `projectId`。

它们涉及公共数据契约或迁移设计，不能在本轮通过局部 if 语句伪装完成；当前实现仍可运行，但多项目生产使用前不能把剩余两项标成已完成。

## 6. 后续顺序

同一 Codex/Text 执行通道的固定 `ContextPacket` 验证已经有可回读证据，本轮不重复跑横向模型比较。项目范围投影、bounded retry、语义事件幂等和动态权限撤销均已有对应实现与证据，分别见 `SPEC/17-project-scoped-projection-v1-2026-10-03.md`、`SPEC/18-bounded-retry-v1-2026-10-03.md`、`SPEC/19-semantic-event-idempotency-v1-2026-10-03.md` 和 `SPEC/20-dynamic-permission-revoke-v1-2026-10-03.md`。下一工程单元优先补齐仍保留兼容全局路径的项目投影，再考虑自动后台 retry；上下文验证继续固定同一个 Codex/Text 执行通道。

上下文压缩的验证边界保持用户最新决定：暂不做不同模型或 Harness 横向比较；若继续验证，只用同一 Codex/Text 执行通道读取同一固定恢复包，分别记录控制面恢复结果、关键字段召回、重复副作用和 usage/cache 可见性，不能把 Codex 内部原生压缩或缓存命中写成已测事实。
