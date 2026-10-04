# Local Agent Workspace / Project Bot OS
# 连续执行路线表 v1

日期：2026-10-03（Asia/Shanghai）  
事实源：`RUN_STATE.json`、`SPEC/IMPLEMENTATION-BACKLOG.md`、`SPEC/PROGRESS.md`、`validation/` 证据

## 当前校准（2026-10-04）

`RUN_STATE.json` 当前为 `complete / memory-recall-strategy-control-v1 / 4/4`。在本路线表原有 R1–R8 本地交付基线之上，已经完成本地 `EvalTask`（评测任务）、`Score`（评分）、`FeedbackEvent`（反馈事件）和 `MemoryAdapter`（记忆适配器）接入，并完成 11 条记忆、6 条查询的 `lexical`/`hybrid`（关键词/混合）比较；受控自动更新卡片现在可以为单次运行选择策略，并显示评分、评测任务、反馈摘要和历史记忆引用，实际选择可从 RunEvent/Artifact 回放。

这次校准不把旧表格中的历史 PARTIAL 记录直接改写成 DONE：历史表保留原始阶段证据，当前状态以 `RUN_STATE.json`、`SPEC/PROGRESS.md` 和 2026-10-04 的 validation 文件为准。当前仍不能宣称语义向量检索、真实模型质量提升、真人提效或多 Bot 优势；混合召回在固定合成样例中更好，但仅作为单次可选策略，暂不替换默认关键词模式。

## 1. 这张表解决什么问题

这不是另一个产品设想，也不是把旧聊天重新抄一遍。它是当前项目从“已经能运行的本地 Alpha”继续走到“可以稳定交付、可以解释、可以持续开发”的唯一执行路线。

执行规则：

1. `RUN_STATE.json` 是机器可恢复的当前状态；本表是人和 AI 都能读的路线图。
2. 代码、测试、运行回执和 `validation/` 证据优先于聊天中的判断。
3. Fixture 只能证明控制面能工作；真实 Provider 只能在有真实回执时写成真实调用；质量、成本和提效必须分别验证。
4. 普通工程单元连续执行，不逐项向用户请求确认。
5. 只有以下情况暂停：缺少必须的外部权限/密钥、不可逆或破坏性操作、外发/发布/支付、真实用户数据边界、或同一阻断已按一次定位和一次最小修正仍无法解决。
6. 每个阶段都要留下可回放证据，并更新 `RUN_STATE.json`、`DEVLOG.md` 和相关 SPEC；不能只在聊天里报告“做完了”。

## 2. 当前一句话结论

项目已经有一个可以在本机运行的控制面：SQLite-first 状态、RunEvent、审批、Artifact、Fixture Product Builder、Codex 执行桥和一次真实 DeepSeek 只读 Tool Loop 都已经存在并通过专项验证。

当前还不能说“模型效果已经证明”或“多 Bot 已经更好”。控制面和 Provider 身份边界已补齐，真实 Product Builder 草稿链也已跑通：真实模型只产生可审阅草稿，不能替换正式 Artifact。本版本已经达到本地交付条件；后续只在用户明确选择时进入 R9 真人现实验证或新的功能迭代。

## 3. 当前基线（已完成与未完成）

| 区域 | 当前状态 | 已有证据 | 仍然不能宣称 |
|---|---|---|---|
| 核心领域与状态机 | `DONE` | `packages/core` 测试、RunEvent、状态迁移 | 不能替代真实模型质量 |
| SQLite-first 持久化 | `DONE` | M10-01～M10-06 证据、重启/并发/备份/规模验证 | 不能证明外部 Provider 原生恢复 |
| Fixture Product Builder | `DONE`（控制面） | Product Builder、Handoff、Approval、Artifact 回放 | 不能当成真实模型输出 |
| 只读 ToolRuntime | `DONE`（受控范围） | filesystem.read、Git status/diff、路径和符号链接隔离 | 未开放任意 Shell、删除、默认写入 |
| Codex 执行桥 | `PARTIAL` | `codex exec --json`、控制面取消和只读 Run | 原生 resume、订阅额度/API 额度等价 |
| DeepSeek API | `PARTIAL → 草稿通道已真实跑通` | `validation/deepseek-product-builder-draft-v1-2026-10-03.json`、`validation/deepseek-tool-loop-v1-2026-10-02.json` | 不能宣称质量、成本优势、长期缓存命中或多 Bot 优势 |
| Web / Electron | `READY_FOR_USER_ACCEPTANCE` | Computer Use、Web build、arm64 包、回读 | 未签名公证、literal clean-room clone |
| 多 Bot 质量 | `BLOCKED_FOR_CLAIM` | 10 题机械记录和审计 | 不能设为默认路径，不能宣称更快/更好 |
| 真人提效 | `PENDING_USER_EXECUTION` | M8-13 基线卡 | 不能代替用户填写真实耗时、修改和复用意愿 |

## 4. 全流程图

```text
路线表与状态冻结
        ↓
固定任务质量门（真实 DeepSeek 小批量 + 离线硬约束）
        ↓
失败、取消、重试、恢复、回放边界
        ↓
Provider 互换与计费/模型身份边界
        ↓
Product Builder 真实 Provider 接入（只在质量门通过后扩大）
        ↓
Web / Electron 用户体验和交付收口
        ↓
clean-room / 安装 / 面试展示材料
        ↓
真人三任务验证（需要用户实际使用）
        ↓
交付：可运行包 + 文档 + 证据 + 已知限制
```

## 5. 连续执行任务表

状态值：

- `DONE`：实现和专项证据都齐；
- `RUNNING`：当前连续执行单元；
- `PARTIAL`：部分实现或缺真实边界；
- `BLOCKED`：外部条件未满足；
- `DEFERRED`：当前版本明确不做，不能误报为完成。

| 顺序 | 阶段 ID | 阶段名称 | 当前状态 | 具体工作 | 完成标准 | 证据/产物 |
|---:|---|---|---|---|---|---|
| 0 | R0 | 路线与恢复状态冻结 | `DONE` | 生成本表；将 `RUN_STATE` 从上一阶段 `complete` 重新打开到本阶段；固定唯一下一步和停止条件 | 本表可读；`RUN_STATE.status=running`；不再有两套路线 | 本文件、`RUN_STATE.json` |
| 1 | R1 | 固定任务质量门 | `DONE（机械门）` | 冻结 3 个无敏感数据任务；检查结构、来源、未知项、工具边界、Artifact 完整性；完成小批量真实 DeepSeek | 三条任务硬约束 3/3 通过；两条成功链、一条越权拒绝链均可回放；质量资格仍保持 0 | `validation/fixed-task-quality-tasks-v1.json`、`validation/fixed-task-quality-gate-v1-2026-10-03.json`、`validation/fixed-task-quality-results-v1.jsonl` |
| 2 | R2 | 失败、取消与恢复 | `DONE（控制面门）` | 覆盖 HTTP/JSON 失败契约、非法工具参数、路径越权、用户取消、重复提交、进程重启；确认 RunEvent、receipt、ContextSnapshot 和重试幂等 | 75/75 工程测试通过；失败可见且可诊断；重试和回放不重复 Artifact；同一 Run 的分段恢复有证据 | `validation/failure-recovery-gate-v1.json`、专项测试 |
| 3 | R3 | Provider 互换边界 | `DONE（契约门）` | 对 Fixture、DeepSeek、Codex 执行桥统一检查 `ProviderIdentity`、billing source、actual model、usage/cache、mock 标记；补 capability probe 和不支持能力的清晰提示 | 换 Provider 不改变业务状态机；API 与订阅账单不混写；不支持能力会显式降级，不静默伪装 | `validation/provider-boundary-v1.json`、`packages/adapters/src/provider-boundary.test.ts` |
| 4 | R4 | Product Builder 真实接入 | `DONE（真实草稿链）` | 真实 DeepSeek 只生成固定 Schema 的可审阅草稿；保存 Provider receipt、usage/cache、actual model 和 draft Artifact；Web 高级诊断入口能运行并明确展示失败/待审阅边界；正式 Product Builder 仍由 Fixture/确定性控制面负责 | 真实请求能形成 `RunEvent → provider receipt → schema validation → draft Artifact → pending approval`；解析或 Schema 错误不得产生可发布 Artifact；无 Key 时 Web 明确失败；不把单次 200 写成质量证明 | `validation/deepseek-product-builder-draft-v1-2026-10-03.json`、`validation/deepseek-product-builder-web-no-key-cua-v1-2026-10-03.json`、`POST /api/product-builder/provider-draft` |
| 5 | R5 | 长任务上下文与成本 | `DONE（基线门）` | 已固化 ContextSnapshot、稳定 prefix hash、usage/cache receipt、reasoning_content 回放和分段恢复契约；补可重跑成本/上下文基线；本地 hash 不宣称命中 | 压缩阈值可预测；恢复包保留约束、来源、尾部事件和同一 Run；Provider 回放保留 reasoning/cache 事实；未报告成本保持 unknown | `validation/context-cost-baseline-v1-2026-10-03.json`、`packages/core/src/context.test.ts`、`packages/adapters/src/adapters.test.ts` |
| 6 | R6 | Web / Electron 体验收口 | `DONE（本地体验门）` | 已从用户角度检查首屏、Run、失败、刷新回读、Fixture 主流程、Provider/权限语义；修正 Fixture 覆盖真实失败的问题；Computer Use 复跑关键旅程 | 新用户能看懂当前 Provider、权限、状态和失败原因；失败记录刷新后仍一致；不显示假按钮；Electron 子服务只连接自己的子进程 | `validation/r6-web-electron-closure-v1-2026-10-03.json`、Web build、Computer Use |
| 7 | R7 | 安装与交付复现 | `DONE（本地交付）` | 已固定 `setup/demo/diagnose/dev/package:mac`；补齐无 Key Fixture、DeepSeek 配置、限制说明；当前源码 DMG 生成、校验和只读挂载通过 | 本机能启动 Web/Electron；目录包可运行；当前 DMG 完整性通过；签名和 clean-room 限制明确写出 | `docs/USER-GUIDE.md`、`docs/DELIVERY-REPORT-V0.1.md`、`validation/r7-delivery-reproduction-v1-2026-10-03.json` |
| 8 | R8 | 面试与掌握材料 | `DONE` | 已整理架构、权限、事件链、Provider 边界、失败恢复和真实证据；对外演示与本人掌握内容分开 | 5 分钟能讲清产品、10 分钟能演示主流程、追问时能指出证据和限制 | `docs/INTERVIEW-DEMO-PACK-V1-2026-10-03.md`、`docs/interview-playbook.md`、`validation/r8-interview-pack-v1-2026-10-03.json` |
| 9 | R9 | 真人现实验证 | `DEFERRED（按用户决定后置）` | 未来可用 M8-13 同一任务比较 ChatGPT→手工整理→Codex 与 Workspace；当前不把真人提效作为本版本交付条件 | 没有用户本人真实记录前，只能写“未验证”；不影响本地可运行交付版 | `validation/m8-13-*`（历史/待后置） |

## 6. 固定任务质量门（R1）具体怎么测

固定任务先使用项目自带的非敏感 fixture，不读取旧工作台和项目外敏感路径：

1. **事实读取任务**：读取 `fixtures/demo-project.json`，输出结构化项目摘要，并列出来源路径。
2. **未知项任务**：输入缺失用户/场景的产品想法，必须保留未知项并阻止正式 Artifact。
3. **边界拒绝任务**：请求 `../outside.txt`、写文件或运行 Shell；只读 Tool Loop 必须拒绝并留下失败事件。
4. **结构化计划任务**：从同一固定输入生成带 `objective / constraints / sources / unknowns / next_action` 的计划。
5. **故障回放任务**：使用离线 fake provider 注入超时、非法 JSON 和 429，检查控制面是否可恢复。

比较路径：

```text
Fixture（控制面基线）
        vs
DeepSeek 只读 Tool Loop（真实 Provider）
        vs
Codex 执行桥（执行 Agent，不冒充 API Provider）
```

这一步只回答“是否满足硬约束、是否可回放、是否稳定失败”，不回答“哪个模型更聪明”。

## 7. 每阶段统一验收模板

每个阶段完成时，必须同时更新：

```text
实现：改了哪些文件，业务状态是否仍由 packages/core 控制
验证：跑了什么命令/Computer Use/真实调用，结果是什么
证据：validation 文件、receipt、hash、截图或回放入口
边界：哪些没有验证，哪些不能宣称
下一步：RUN_STATE.next_action 中只有一个具体动作
```

阶段不能以以下内容单独宣称完成：

- 代码能编译；
- Fixture 返回了漂亮文本；
- 模型自己说“已完成”；
- 单次真实调用返回 HTTP 200；
- UI 截图看起来正常。

## 8. 真实外部阻塞与处理方式

| 阻塞 | 影响 | 当前处理 |
|---|---|---|
| Codex `~/.codex` / `state_5.sqlite` 不可写 | 不能证明原生 resume 或再次改变订阅运行态 | 保留 `blocked_environment` 诊断；不读取数据库、不修改权限、不重复同一 smoke |
| Developer ID 不存在 | DMG 无法签名/公证 | 交付包可继续本机使用；在交付材料中明确“未签名” |
| literal GitHub remote/clean-room 条件不存在 | 不能声称从 GitHub 新 clone 完整复现 | 用隔离源码副本验证；远端存在后再做一次独立门 |
| DeepSeek Key | 真实模型质量门需要短时 API 调用 | 只通过环境变量传入；不写入 repo、不写 receipt、不打印；本阶段只做小批量 |
| 真人耗时/复用意愿 | 不能由 AI 代填 | 保留 `PENDING_USER_EXECUTION`，不把机械证据升级为提效 |

## 9. 停止/交付定义

### 本轮“可以交给用户继续使用”的门

- Web 或 Electron 能独立启动；
- Fixture 主流程、只读 Tool Loop、RunEvent、Artifact 和刷新回读稳定；
- 真实 DeepSeek 入口若配置 Key，可以明确显示 actual model、usage/cache 和失败原因；
- 失败、取消、重试不会静默丢状态；
- README、用户指南、限制和恢复入口齐全；
- 所有未完成项仍标为 `PARTIAL / BLOCKED / PENDING_USER_EXECUTION`。

### “可以对外展示为成熟项目”的更高门

- 固定任务质量门通过；
- Provider 互换和权限边界有证据；
- clean-room 安装或其限制有证据；
- 对外演示材料与本人掌握包分离；
- 不再把多 Bot 速度/质量优势写成假设；
- 真人验证完成，或明确承认尚未完成。

## 10. 当前唯一下一步

当前路线已达到本版本交付条件：R1 机械质量门通过但质量资格仍为 0；R2 控制面失败恢复门通过；R3 Provider 契约门已通过；R4 真实草稿链、R5 上下文/成本基线、R6 本地体验门、R7 本地交付门和 R8 掌握材料已完成。R9 真人现实验证按用户决定后置，因此仍明确标记为未验证，不把它写成产品效果证明。
