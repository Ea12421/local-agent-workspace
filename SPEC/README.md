# Local Agent Workspace 规格入口

这套规格分成两层：

- **主说明书**：`MASTER-SPEC.md`，解释产品、架构、数据、接口、运行流程和验收。
- **工程推进清单**：`IMPLEMENTATION-BACKLOG.md`，把说明书拆成可执行任务，每项都有文件、依赖、完成标准和验证命令。
- **追踪矩阵**：`TRACEABILITY.md`，把目标映射到 SPEC、代码、测试和证据。
- **当前进度**：`PROGRESS.md`，只记录当前阶段、已完成、阻塞和唯一下一步。
- **AI 执行协议**：`AI-EXECUTION-PROTOCOL.md`，规定每次如何恢复、实现、验证和更新状态。
- **长窗口恢复契约**：`07-context-compaction-and-recovery.md`，规定 Snapshot、segment、压缩、交接和 fallback resume。

## 推荐阅读顺序

### 人先看

1. `MASTER-SPEC.md` 第 1–5 节：产品目标、用户旅程、架构和技术栈。
2. `MASTER-SPEC.md` 第 6–10 节：数据、接口、Product Builder、权限和失败恢复。
3. `IMPLEMENTATION-BACKLOG.md`：按 Milestone 看工程推进顺序。
4. `TRACEABILITY.md`：核对每条承诺有没有代码和测试。

### AI 恢复时看

1. 根目录 `RUN_STATE.json`。
2. 根目录 `HANDOFF.md`。
3. 本文件的 `PROGRESS.md`。
4. 只执行 Backlog 中当前 `TODO/NEXT` 的一项。

## 规格语言

- **MUST**：没有它不能进入下一阶段。
- **SHOULD**：默认实现；若改变必须写 Decision Log。
- **MAY**：可选增强，不阻塞首版。
- **DONE**：有文件和验证证据。
- **PARTIAL**：代码存在，但缺真实运行或完整边界验证。
- **BLOCKED**：外部环境阻塞，不能用猜测替代。
