# Local Agent Workspace：真实 Provider 与工具执行增量 v1

日期：2026-10-08
状态：执行中

## 目标

把已经验证的有界 Orchestrator 控制面接到真实模型和真实本地只读工具，形成可复核的真实闭环：

```text
用户目标
→ 真实 Provider 生成结构化计划
→ 计划白名单校验
→ 真实文件/Git/测试工具
→ RunEvent、receipt、Artifact 回写
→ 失败、审批和恢复
```

## In Scope

- Codex 作为首选真实计划 Provider；DeepSeek 保留为可选真实 Provider。
- 复用 `orchestrator.plan.v1`，不允许 Provider 直接改变权限或注册能力。
- 本轮真实总控只把 `kind=tool` 的能力交给执行器；Skill/Bot 仍可作为领域元数据，待各自的调度运行时接入后再开放为可执行步骤。
- 真实 `filesystem.read`、Git 状态/差异和受控测试/构建只读路径。
- 真实工具调用复用现有 ToolRuntime、workspace scope、脱敏、幂等和 RunEvent。
- Web 显示 Provider 身份、计划、工具调用、等待原因和结果。
- 固定非敏感任务、clean-room 构建、Electron/macOS 打包和公开快照审计。

## Out of Scope

- 任意电脑控制、全局监听、无人值守后台任务。
- 模型自行创建 Bot、Skill、Tool、权限或无限递归计划。
- 默认工作区写入、删除、外发、发布、支付或生产部署。
- 用单次真实模型结果证明模型质量或多 Bot 生产力提升。

## Provider 契约

真实 Provider 必须输出可解析的 `orchestrator.plan.v1`，至少包含 `objective`、`intent`、`steps` 或 `clarification`。输出必须经过现有 Planner 校验：

- step 能力必须来自当前项目 Skill/Tool 白名单；
- 依赖无环且步数不超过上限；
- 非只读步骤必须标记 `approvalRequired=true`；
- 解析、校验或 Provider 失败不得创建成功计划。

Provider receipt 保存 harness、provider、model、authMode、billingSource、isMock、usage/hash；不保存 API Key 原文。

## Tool 契约

第一批真实能力：

1. `filesystem.read`：只能读取当前项目允许路径，拒绝路径穿越、符号链接逃逸和 Secret 明文外泄。
2. `git.status` / `git.diff_stat`：只读、固定 argv，不接受 shell 拼接。
3. `project.test` / `project.build`：先以受控 profile 预览，执行仍按命令审批策略处理。

每次调用必须写 Tool 调用事件和 receipt；重复 call/step 不重复外部副作用。

## 验收任务

- 任务 A：检查项目结构和 Git 状态（只读，自动完成）。
- 任务 B：读取指定项目文档并生成摘要（只读，自动完成，保留 Artifact/Source 引用）。
- 任务 C：运行固定 Web typecheck/build 预览（命令路径，展示审批边界；批准后才执行）。

每个任务都要区分真实 Provider/Tool 与 Fixture，记录状态、耗时、事件数量、receipt 和失败原因。

## 发布边界

公开发布前必须完成：

- 只从干净公开快照发布，不直接推送当前混杂工作树；
- 排除个人面试、聊天恢复、原始验证、运行账本、本机数据库和凭据；
- Secret/路径扫描、clean-room 安装、测试、Web/Electron 构建和 macOS 包验证；
- 形成 Prepare 记录后再执行外部 GitHub 发布。
