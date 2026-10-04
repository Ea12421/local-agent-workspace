# Local Agent Workspace 当前阶段状态校准

更新时间：2026-09-28（Asia/Shanghai）

## 总判断

当前项目是：

> **可运行的本地 Alpha / 面试演示版，核心运行时完成；产品完整度和现实效果仍为 PARTIAL。**

这不是“全部做完”，也不是“项目卡死”。已经完成的部分可以继续使用；未完成的部分有明确的工程或证据路径。

## 阶段状态

| 阶段 | 当前状态 | 人话说明 |
|---|---|---|
| M0 证据与路线冻结 | PARTIAL | 产品边界、权限和证据规则已冻结；模型实际路由/计费来源仍不能仅靠界面标签证明。 |
| M1 Core Domain | DONE | Project、Bot、Run、Event、Handoff、Approval、Artifact 等核心类型和状态机已有测试。 |
| M2 Persistence 基础层 | DONE（以 M10 结果为准） | SQLite-first、迁移、事务、恢复、并发、备份和规模验证已完成；早期 backlog 的 PARTIAL 是旧状态。 |
| M3 Provider 与工具 | PARTIAL/BLOCKED | Fixture 和 Codex 执行桥可用；DeepSeek 还没有真实 Key；Codex 原生 resume 和完整 FS/Git/Shell 工具仍未完成。 |
| M4 Product Builder | PARTIAL（guard/replay/reconcile 已补） | Fixture 流程、Handoff、Artifact、Approval 可运行；图校验、Conflict Check、release state replay 和批准后的显式 Artifact promotion/reconcile 已完成，完整用户流程和真实工具执行仍待补。 |
| M5 Server/API | PARTIAL | 本地 API、Run、取消、重试、审批、持久化、Artifact/Source 详情和统一错误 correlation 已有 smoke；完整网络集成仍需补。 |
| M6 Web UI | PARTIAL | Web 可展示 Project、Bot、Run、Approval、Artifact 和真实 Codex 回执；Artifact 点击预览及 Bot 创建/复制/停用 API/UI 已接入，Computer Use 已验证 Web 回归和刷新回读；Electron 原生窗口已形成窗口级回执。 |
| M7 Electron/Desktop | PARTIAL（运行/安装 PASS，签名 PARTIAL） | 新 `com.localagentworkspace.desktop.v1` arm64 DMG 已复制到 Applications；安装版通过 health、原生窗口和 Computer Use Bots 管理回执；Developer ID 签名和 clean-room 安装仍未验证。 |
| M8 验证与交付 | PARTIAL | 机器对照和三次窄范围现实任务已完成；内容质量、多 Bot 价值、真人提效和 DeepSeek 仍未证明。 |
| M9 Context Continuity | DONE | ContextSnapshot、压缩、segment、fallback recovery、幂等和隔离已有专项验证。 |
| M10 SQLite-first | DONE | SQLite 运行时事实源、JSONL 导入导出、崩溃恢复、多进程和 100k 事件规模已有证据。 |

## 已经可以认为完成的核心能力

- 本地 Server + Web UI 可启动；
- Fixture 无 Key 演示；
- Codex 订阅执行桥真实只读调用；
- Run 状态机和 append-only RunEvent；
- Provider receipt 和 Artifact 追踪；
- SQLite 持久化与重启恢复；
- 取消、重试、审批和幂等；
- ContextSnapshot 和中断后 fallback recovery；
- Product Builder 的基础 Fixture 工作流；
- macOS arm64 DMG 构建产物；
- 固定任务的直接调用 vs Workspace 机器代理对照。

## 仍然没有完成的核心能力

### 1. Product Builder 完整性

- 更完整的 Research/Product/Architecture/Evaluation 真实工具执行；
- 更完整的真实工具权限和沙箱能力。

### 2. 产品交付完整性

- Artifact 和 Source 正文预览已接入，但仍需完整用户流程验收；
- Bot 创建、复制、停用的 API/UI 与 Web Computer Use 回归已通过；Electron 原生窗口已通过新 appId 的 Computer Use 复验；
- Electron DMG 签名、安装后的人工验收与 clean-room 安装；
- literal clean-room GitHub clone 复现。

### 当前下一步（2026-09-28 22:55）

M6-04 审批/重试真实 UI 回读已完成：安装版刷新后能从 SQLite 回读 `run.retry_requested`，事件数从 11 增至 12；Electron 子服务退出清理也已补齐并验证端口释放。M3-06 第一小单元已完成路径/symlink/精确 argv/权限 guard；下一条可自主工程单元是受控 ToolRuntime 的 dry-run/fixture receipt。签名、literal clean-room、DeepSeek Key、真人 A/B 仍按外部条件后置。

### 3. AI 效果证据

- 36 条 M8-04 记录中仍有 9 条严格回放失败；
- 人工编辑量、返工量、真实用户耗时没有来源；
- 多 Bot 没有达到默认阈值，且在多个任务上明显更慢；
- DeepSeek 还没有真实 API 调用；
- Codex 原生 resume 尚未接通，但控制面 fallback recovery 已可用。

## 当前推荐推进顺序

1. 做 Electron DMG 签名、安装后人工验收和 clean-room 安装；
2. 做 literal clean-room GitHub clone 复现（需要 remote/公开仓库边界）；
3. 保持结构化 single-Bot/Codex 为默认，继续保留多 Bot 为实验路径；
4. 有 DeepSeek Key 后再做真实通道对比；
5. 最后再用固定任务做现实使用验收，不能用机器代理替代真人主观复用意愿。

## 停止条件

- 不为了“阶段完成”强行把 PARTIAL 写成 DONE；
- 不把沙悟净宠物样本当成 Product Builder 效果证明；
- 不把模型自评、机器耗时或截图当成真人提效证据；
- 不在没有 Key 时伪造 DeepSeek 结果；
- 不因旧文档状态落后而重复已完成的 SQLite、Context Continuity 或同一固定任务调用。
