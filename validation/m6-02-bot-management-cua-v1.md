# M6-02 Bot 管理 Computer Use 回归

日期：2026-09-28（Asia/Shanghai）

## 环境

- Web：本地 Vite 预览，连接本地 Server `127.0.0.1:4311`。
- 数据：临时 SQLite 目录 `/private/tmp/law-data-4311`，不触碰旧工作台。
- 任务：通过 Computer Use 操作 Bot 管理页面。

## 步骤与结果

1. 创建 `验收 Bot`，职责为“用于验证桌面与 Web 管理闭环”：PASS。
2. 复制为 `验收 Bot 副本`：PASS。
3. 停用副本：PASS；页面显示“已停用”，复制/停用按钮灰化。
4. 刷新页面并重新进入 Bot 管理：PASS；两个持久化 Bot 仍显示，副本保持“已停用”。

## 结论

M6-02 的 Web/API/SQLite 回读链路通过 Computer Use 回归。该证据不等于 Electron 原生窗口验收；原生窗口另见 `m7-electron-native-window-v1.md`。
