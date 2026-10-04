# Local Agent Workspace 规格对照表（2026-10-02）

## 这份文件解决什么问题

这不是新的产品方案，也不是把“代码能跑”写成“产品已经证明有效”。它把当前冻结的 SPEC 与实际代码、验证文件、外部阻塞逐项对齐，作为本轮继续开发的事实清单。

状态含义：

- `DONE`：代码和专项验证已经覆盖，当前没有已知缺口。
- `VERIFIED_ALPHA`：本地控制面或界面已经通过验证，但还不是生产或真实模型证据。
- `PARTIAL`：有代码或局部证据，集成、边界或真实环境仍缺证据。
- `BLOCKED`：当前外部条件阻止验证，不能用计划代替结果。
- `TODO`：尚未开始。

## A. 产品契约与核心运行时

| 契约 | 规格来源 | 当前实现 | 证据 | 状态 | 下一步 |
|---|---|---|---|---|---|
| 本地项目与项目隔离 | `SPEC/00`, `SPEC/01` | `packages/core`, `apps/server`, `apps/web` | SQLite round-trip、项目边界回读、Computer Use | `VERIFIED_ALPHA` | 用第二个项目做跨项目读取回归 |
| Bot Profile | `SPEC/00`, `SPEC/03` | Bot 创建、复制、停用 API/UI 与 SQLite | `validation/m6-02-bot-management-cua-v1.md` | `VERIFIED_ALPHA` | 补完整字段编辑和恢复能力 |
| Run 状态机 | `SPEC/01` | `packages/core/src/state-machine.ts` | core/runtime tests | `DONE` | 保持契约冻结 |
| Append-only RunEvent | `SPEC/01` | `packages/core/src/run-store.ts`, SQLite events | sequence、幂等和回放测试 | `DONE` | 补异常迁移注入测试 |
| Retry / cancel / replay | `SPEC/01` | server runtime、RunStore | test:all、SQLite smoke | `VERIFIED_ALPHA` | 继续验证 Provider 中断后的真实恢复 |
| SQLite-first 事实源 | `SPEC/08` | `apps/server/src/persistence.ts` | migration、重启、并发、备份、规模测试 | `VERIFIED_ALPHA` | clean-room 重新安装后回读 |
| JSONL portable/export | `SPEC/08` | `scripts/import-export/` | `validation/m10-04-jsonl-import-export-results.json` | `DONE` | 不提升为默认运行时事实源 |

## B. Provider、上下文和工具

| 契约 | 规格来源 | 当前实现 | 证据 | 状态 | 下一步 |
|---|---|---|---|---|---|
| Fixture 无 Key 演示 | `SPEC/02`, `SPEC/06` | `FixtureAdapter`、demo、Tool Loop fixture | `npm run demo`, test:all | `DONE` | 继续作为默认可复现路径 |
| Codex 订阅执行桥 | `SPEC/02`, `SPEC/11` | `CodexExternalAdapter`、JSONL envelope、receipt | 历史只读 receipt、离线回放 | `PARTIAL` | 仅在 Codex state 可写时重做真实 smoke；不读取凭据 |
| DeepSeek Model Provider | `SPEC/02` | one-shot `DeepSeekApiAdapter` + 独立 `DeepSeekToolLoopProvider`；真实 loop 只开放 `filesystem.read` | `validation/deepseek-one-shot-smoke-v1-2026-10-02.json`, `validation/deepseek-tool-loop-v1-2026-10-02.json` | `VERIFIED_ALPHA` | 只证明一次真实只读 loop；质量、thinking-model reasoning 回放和跨进程恢复仍未验证 |
| ProviderResponseEnvelope | `SPEC/09` | Codex collector、DeepSeek one-shot/Tool Loop response、receipt；保留 actualModel、usage/cache 和 providerFields | provider-envelope tests、真实 DeepSeek one-shot/Tool Loop | `VERIFIED_ALPHA` | reasoning_content 真实返回仍未观察到；cache/cost 只记录 provider 回执，不作收益证明 |
| Prompt Cache 语义 | `SPEC/09` | `PromptCachePolicy` + DeepSeek provider-reported hit/miss receipt；稳定前缀只存 hash | `validation/deepseek-tool-loop-v1-2026-10-02.json` | `PARTIAL` | 只有一次 miss 观察，不能宣称命中率、成本节省或长任务收益 |
| ContextSnapshot / 压缩恢复 | `SPEC/07`, `SPEC/09` | snapshot、tail、continuation instruction | `validation/m9-context-continuity-results.json` | `VERIFIED_ALPHA` | 验证真实 Provider 的中断后恢复质量 |
| Fixture Tool Loop | `SPEC/02`, `SPEC/06` | model → tool → result → next model → artifact；Web 高级诊断入口 | `validation/m3-07d-local-tool-loop-2026-09-30.json`, `validation/provider-tool-loop-v1-2026-10-02.json` | `VERIFIED_ALPHA` | 继续保持 Fixture 与真实 Provider 标签分离 |
| 本地只读 Tool Loop 入口 | `SPEC/02`, `SPEC/06`, `SPEC/09` | Web/API `tool-loop-local`：Fixture 决策 → `LocalToolRuntime` 读取真实项目文件 → 回传 → Artifact；路径越权返回失败事件 | `validation/local-tool-loop-web-v1-2026-10-02.json` | `VERIFIED_ALPHA` | 继续保持模型来源与工具执行来源分离 |
| 真实 Provider Tool Loop | `SPEC/02`, `SPEC/09` | `deepseek-tool-loop` 真实模型 → `filesystem.read` → 本地结果 → 下一模型 → Artifact；写入、Shell、外发仍无入口 | `validation/deepseek-tool-loop-v1-2026-10-02.json` | `VERIFIED_ALPHA` | 只证明一次真实只读 loop；不把它写成模型质量、成本收益或崩溃恢复证明 |
| Shell / workspace write / full access | `SPEC/03` | policy 与 sandbox 契约 | tool operation guard | `PARTIAL` | 保持关闭；需要单独权限与逐次审批设计 |

## C. Product Builder 与 Agent 角色

| 契约 | 规格来源 | 当前实现 | 证据 | 状态 | 下一步 |
|---|---|---|---|---|---|
| Product Builder 固定计划 | `SPEC/04` | planner、clarification、handoff、approval、artifact | workflow tests、M4-02 | `VERIFIED_ALPHA` | 用真实 Provider 替换 fixture 后做一轮回放 |
| Clarification 阻塞项 | `SPEC/04` | 本地输入、checkpoint、计划重算 | `validation/m4-02-clarification-resolution-2026-09-30.json` | `DONE` | 保持用户决定与审批分离 |
| Research/Product/Architecture/Evaluation 交接 | `SPEC/04` | 结构化 handoff 与 artifact refs | workflow tests | `DONE` | 不扩展为常驻多 Agent |
| Agent 角色分层与生命周期 | `SPEC/10` | 角色地图和质量门文档 | `docs/AGENT-ROLE-MATRIX-AND-QUALITY-GATES-V1.md` | `PARTIAL` | 先启用 Product Builder + 必要节点，暂缓全团队化 |
| Skill / Routine / Bot 自我创建 | `SPEC/00`, `SPEC/10` | 仅有候选模型与边界 | 无完整实现证据 | `TODO` | 等核心运行链路稳定后再做审核草稿 |
| 多 Bot 质量优势 | `SPEC/06` | 机械对照和若干 receipt | 质量 rubric、真人基线未闭环 | `PARTIAL` | 不以“有多个 Bot”作为完成标准 |

## D. Web、Electron 与交付

| 契约 | 规格来源 | 当前实现 | 证据 | 状态 | 下一步 |
|---|---|---|---|---|---|
| Web 控制面 | `SPEC/05` | React/Vite + Node HTTP；新建运行可选真实 DeepSeek 只读 Tool Loop | build、Computer Use、HTTP smoke | `VERIFIED_ALPHA` | 完成第二轮信息层级与错误路径收口 |
| 运行时间线、审批、产物、来源 | `SPEC/03`, `SPEC/05` | 概览、Runs、Artifacts、Approval UI；DeepSeek 入口权限说明 | CUA 回归与 API smoke、`validation/deepseek-tool-loop-web-v1-2026-10-02.json` | `VERIFIED_ALPHA` | 加强产物来源和失败下一步文案 |
| 移动导航与基础可访问性 | `SPEC/05` | drawer、Escape、aria-label | UX hardening evidence | `VERIFIED_ALPHA` | 运行窄 viewport 截图回归 |
| Electron thin shell | `SPEC/05` | 启动 server、health-ready、同一 Web UI | arm64 directory build、安装回读 | `PARTIAL` | 保持单一业务逻辑；补 clean-room 证据 |
| macOS DMG | `SPEC/05` | 已有带图标 DMG | hdiutil/安装后证据 | `PARTIAL` | Developer ID、签名和公证仍未完成 |
| GitHub clean-room 复现 | `SPEC/05`, `SPEC/06` | setup/diagnose 文档和脚本 | 当前工作区安装通过 | `BLOCKED` | 需要可用 remote/registry 条件后再验证 |

## E. 现实效果与交付边界

| 目标 | 规格来源 | 当前证据 | 状态 | 不能声称的内容 |
|---|---|---|---|---|
| 10 个固定任务质量门 | `SPEC/06` | 机械执行和 receipt 已有，人工 rubric/成本/质量仍不完整 | `PARTIAL` | 不能声称多 Bot 已优于单 Bot |
| 3 个现实任务 | `SPEC/06` | 三次窄范围本地状态任务 | `PARTIAL` | 不能声称真实提效或再次使用意愿已验证 |
| 真实 DeepSeek 连通性 | `SPEC/02`, `SPEC/06` | one-shot 与一次真实只读 Tool Loop 均 HTTP 200；Tool Loop 产生完整事件和 Artifact | `validation/deepseek-one-shot-smoke-v1-2026-10-02.json`, `validation/deepseek-tool-loop-v1-2026-10-02.json` | `VERIFIED_ALPHA` | 不能声称模型质量、成本收益、长期 cache 命中或 thinking-model reasoning 已验证 |
| 本地 Alpha 可交付 | `SPEC/DELIVERY-CHECKLIST-V0.1.md` | Web/Electron、Fixture、SQLite、回放和权限边界 | `VERIFIED_ALPHA` | 不能包装成生产级 Agent 平台 |

## 本轮结论

1. 核心运行时和本地控制面已经达到 `VERIFIED_ALPHA`。
2. Provider 可移植性、真实工具调用、Skill/Routine、多 Bot 质量和现实提效仍不是完成项。
3. 第二方向（SPEC 对照）本文件已经落盘，但“对照表完成”不等于表中所有项目完成；它明确了剩余工程。
4. 本轮已把同一受控 loop 接到真实 DeepSeek，并完成一次真实只读回归；下一工程门是用固定任务评估输出质量与失败恢复，仍不接入写工具、不读取凭据、不重复做无证据的全量多 Agent 扩展。
