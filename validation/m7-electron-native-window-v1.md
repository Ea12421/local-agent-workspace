# M7 Electron 原生窗口验证记录

日期：2026-09-28（Asia/Shanghai）

## 已验证

- `electron-builder --mac --dir` 可以生成 arm64 `.app`。
- 桌面启动链已修复为：Server 根路径提供打包 Web shell；Electron 使用系统 Node 启动 Server；Server 数据目录使用 Electron 用户数据目录；Server、packages、Web dist 和 fixtures 配置为 `asarUnpack`。
- Server 根路径、CORS preflight、Web Bot 管理和持久化回读均已通过专项/Computer Use Web 回归。

## 原始崩溃证据

旧 `appId=com.localagentworkspace.desktop` 的临时 arm64 `.app` 在 macOS Electron 初始化原生菜单栏/LaunchServices 阶段产生 `SIGABRT`，窗口尚未进入可读取状态。系统回执：

`~/Library/Logs/DiagnosticReports/Local Agent Workspace-2026-09-28-173800.ips`

崩溃线程位于 macOS `NSApplication`/`NSMenuBarPresentationInstance` 初始化路径；没有证据表明 React 页面或本地 Server 逻辑触发崩溃。最小 Electron 窗口和未打包桌面入口均能运行，说明不是本机所有 Electron GUI 或业务入口都崩溃。

## 修正与复验

- 通过 electron-builder 正规生成临时唯一 `appId=com.localagentworkspace.smoke` 的包，窗口和 Server 可持续运行。
- 将正式尚未公开发布的初始 app id 改为 `com.localagentworkspace.desktop.v1`，避开本机旧同名包/LaunchServices 身份冲突。
- 重新打包 `/private/tmp/local-agent-workspace-release-v5`；新包 `com.localagentworkspace.desktop.v1` 启动 8 秒仍运行，`GET http://127.0.0.1:4315/api/health` 返回 `{"ok":true,"service":"local-agent-workspace","mode":"fixture-first"}`。
- Computer Use 读取到原生窗口 `Agent Workspace · 项目工作台`，并进入 `Bots 管理`；Product Builder、Research Bot、Architecture Bot、Evaluation Bot 和已持久化的验收 Bot 卡片均可见。

## 当前限制

- 当前包仍为未签名目录包；DMG 的 Developer ID 签名和干净机器安装仍未验证，本机安装后启动已单独通过。
- 自定义图标已接入并通过打包元数据检查：`apps/desktop/assets/icon.svg` → `icon.icns`，新包不再使用默认 Electron 图标。
- 带自定义图标的 arm64 DMG 已生成：`/private/tmp/local-agent-workspace-release-v6-dmg/Local Agent Workspace-0.1.0-arm64.dmg`；封装命令成功，Developer ID 未签名，安装后启动已通过。
- 当前项目的可交付副本为 `release/Local Agent Workspace-0.1.0-arm64.dmg`；`release/` 只保留这一版 DMG、blockmap 和构建诊断文件。
- 安装后验收已完成：通过 Finder 将 DMG 应用复制到 `/Applications/Local Agent Workspace.app`，核对 bundle id `com.localagentworkspace.desktop.v1` 与 `icon.icns`；停止旧的 4310 Server 后重新启动安装版，`GET /` 返回 Web shell，Computer Use 已进入 `Bots 管理` 并读取四个内置 Bot。
- 安装版审批与运行记录回归已完成（Computer Use）：从 `工作台概览` 打开本地 Demo 的运行记录，点击 `确认并继续` 后界面回显“已确认，Architecture Bot 将继续工作”；再次打开 `运行记录` 可读到 `用户确认生成执行计划` 与 `生成 Product Brief 与执行计划` 两条后续事件。该回执证明安装版能执行审批→事件时间线，不等于 DeepSeek 或真人提效验证。

## 判定

`PASS（窗口启动、Computer Use 可见性、自定义图标、DMG 构建与安装后启动） / PARTIAL（签名交付）`：原生窗口崩溃已通过更换未发布初始 app id 修复并在本机复验；旧测试包、旧进程和旧 4310 Server 已停止/归档；Developer ID 签名和 clean-room 安装仍未完成。
