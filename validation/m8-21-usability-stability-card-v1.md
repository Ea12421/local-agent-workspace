# M8-21 可用性与稳定性验收卡 v1

## 当前目标

暂时跳过“是否真的节省用户时间”的真人提效判断，先确认本地 Alpha：

1. 能完整跑通核心工作流；
2. 刷新、重启和审批后状态可回读；
3. 主要页面和操作足够清楚，适合继续测试和演示。

本卡不判断：真实提效、多 Bot 优势、DeepSeek 效果或公开分发资格。

## 固定检查项

| 编号 | 检查 | 通过标准 |
|---|---|---|
| U1 | 安装版启动 | `/Applications/Local Agent Workspace.app` 能打开窗口并显示本地服务正常 |
| U2 | 工作台概览 | 项目、当前 Run、Provider 和需要决定的审批卡可见 |
| U3 | 审批继续 | 点击“确认并继续”后有明确回执，Architecture Bot 后续事件出现 |
| U4 | 运行记录回读 | 切换到运行记录后能看到审批事件和执行计划事件 |
| U5 | Bot 管理 | Product Builder、Research、Architecture、Evaluation Bot 可见，停用状态可展示 |
| U6 | Artifact/来源 | Artifact 列表和正文/来源入口可访问；失败时有可诊断提示 |
| U7 | 刷新/重开 | 页面刷新或应用重开后，项目、Run 和事件不丢失 |
| U8 | 安全边界 | 仍显示本地数据/隐私模式；不自动外发、不读取凭据、不修改候选项目 |
| U9 | Fixture 新建 Run | 无 Key Fixture 路径能创建 Run，并能回读 RunEvent/receipt 或明确演示回执 |
| U10 | Codex 只读入口 | 本机 Codex 可用时显示 `isMock=false`、订阅身份和 receipt；不可用时明确显示条件未满足 |

## 静态工程门

以下检查必须通过：

- `node scripts/validate-state.mjs`
- `node scripts/typecheck.mjs`
- `node --experimental-strip-types --test ...` 全套 Node tests
- `node_modules/.bin/vite build apps/web --config apps/web/vite.config.ts`
- `git diff --check`

如果 `pnpm` 只因 Corepack 缓存权限失败，不把它误判成代码失败；必须使用等价的本地 Node/Vite 命令完成同一检查，并记录原始错误。

## 判定

- `PASS`：U1–U8 全部有用户可见或可回读证据；可以继续做演示和下一轮功能。
- `PARTIAL`：核心链路可用，但某个页面或恢复项仍缺证据；继续补对应项，不宣称稳定完成。
- `NO-GO`：启动、审批、持久化或权限边界出现阻断；停止扩展功能，先修复。

正式结果另存为 `validation/m8-21-usability-stability-result-v1.json`。只有在新鲜证据覆盖 U1–U10 和静态工程门后，才能写 `PASS_ALPHA_USABLE_STABLE`。

## 延后项目

- `validation/m8-13-user-baseline-card-v1.md` 的真人 A/B 暂时延期，不删除、不伪造数据。
- DeepSeek Key、Developer ID 签名、GitHub clean-room 和多 Bot 质量对比仍是独立后续门。
