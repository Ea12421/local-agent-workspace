# 当前推进进度

更新时间：2026-09-27

## 总状态

`context-continuity-jsonl-verified-m9-02-desktop-partial`

这表示：代码实现单元已完成，但项目最终验收没有完成。

## 已完成

- 产品定义和边界
- 领域类型与 Run 状态机
- append-only event 和幂等
- Provider/Fixture/Codex 探针
- Codex CLI 订阅执行桥最小真实调用；receipt 已落盘，默认 read-only
- Codex 子进程取消和控制面取消竞态专项测试通过（10 tests passed）
- CodexExternalAdapter 已接入 control plane；真实 Product Builder Run 从 `running` 到 `succeeded`，5 条 provider 事件已进入项目事件流
- 中文权限策略
- Product Builder Fixture workflow
- 4 个 Handoff、5 个 Artifact、1 个 Approval
- Server/API 源代码
- Web UI 源代码
- Electron 薄壳源代码
- 限额/上下文中断恢复机制
- 10 个原生测试（包含 Codex 适配器和控制面取消专项）
- 无端口 HTTP handler smoke test
- Electron health-ready 轮询
- npm workspace 安装回退入口
- Web 明确显示本地服务或 Fixture 数据来源
- Fixture demo
- 受控主机网络下 `pnpm install` 已完成；没有修改 VPN、DNS、代理或防火墙
- Web Vite production build 已通过
- arm64 Electron DMG 已生成：`release/Local Agent Workspace-0.1.0-arm64.dmg`
- Firefox Computer Use 已打开本地 Web，确认项目、Run 时间线、审批卡、Bot 管理和 Codex probe；审批按钮交互后显示“已确认，Architecture Bot 将继续工作”
- 去除 Web 对 Google Fonts 的运行时依赖，断网时不再等待外部字体
- 隔离 clean-room 源码副本从零 `pnpm install`、`pnpm run setup`、`pnpm test:all` 通过（10 tests passed）
- M8-04 10 题固定任务集、统一记录字段和单/多 Bot 判定阈值已冻结
- M8-04 PB-01 已用真实 Codex subscription execution bridge 跑通 `single_call`、`single_bot`、`multi_bot`；multi Bot 成功记录形成 4 个结构化阶段，单次记录为 19–29 条 provider 事件
- M8-04 自动校验已完成：9 条真实 provider 记录（其中 8 条完成、1 条 provider_incomplete）均有 JSON/schema 校验结果；当前有效完成记录为 `single_call` 7/8、`single_bot` 两次 8/8、旧 `multi_bot` 拼接/前缀输出被严格拒绝、可解析的 `multi_bot` 记录为 7/8；没有记录被提升为质量证据
- M8-04 试跑、重试和校验均写入 `validation/m8-04-results.jsonl`、`validation/m8-04-validation-summary.json` 和 `evidence/receipts/m804-*.json`
- Context Continuity v1 纯函数已完成：软/硬阈值、结构化摘要、事件范围、hash、tail 和恢复 Packet 均有专项测试。
- `JsonlContextSnapshotStore` 已完成：快照追加、重启读取、重复 ID 拒绝、按 project/run 查询 latest，并保持原始 RunEvent 不变。

## 当前卡点

1. 本次依赖安装通过了受控主机网络；普通 Codex 沙箱仍会出现 registry DNS 失败。没有修改 VPN。后续安装应继续使用明确的受控网络命令，不能把网络恢复写成永久环境保证。
2. Electron arm64 App 已启动并被系统登记为运行中，但 Computer Use 读取其窗口连续超时，因此“进程启动”已验证，“桌面窗口可见性”仍是 PARTIAL。
3. DeepSeek 尚未真实调用；它是可选对比通道，需要用户提供 Key 后才能做真实模型验证。
4. Codex Run 的 resume、10 个固定任务真实运行和 3 个现实任务验证仍未完成。
5. 当前工作区和隔离源码副本安装已通过；literal GitHub clone 仍待仓库 remote。
6. M8-04 的长批次在第一次 `--path all` 运行中只完成了 `single_call`，随后外层执行会话结束；按单路径重试后成功，说明下一批必须拆成小批并依赖 JSONL/receipt 恢复，不能把一次长会话当作唯一状态。
7. 2026-09-27 重打包时 `.app` 编译成功，但 `hdiutil create` 因系统 DiskManagement framework 不可用而失败；已有 DMG 保留，不把本次封装失败写成应用代码失败。
8. multi Bot 校验器已修正为严格单 JSON 对象；旧的拼接/前缀输出被拒绝，3 个晚到的受控复测 receipt 以唯一 `receipt_id` 追踪；可解析记录因缺少完整 replay 证据仍为 7/8，不能升格质量证据。

## 当前唯一下一步

实现 Run segment 与 fallback resume：同一逻辑 Run 在 provider 超限或中断后追加 segment 事件，使用已验证 ContextPacket 重新启动执行，并补专项恢复测试。完成后再恢复 M8-04 小批次真实任务验证。

## 网络恢复后的下一步

```bash
pnpm run recover
pnpm run validate:state
pnpm install
pnpm --filter @agent-workspace/web build
pnpm package:mac
```

随后按 `IMPLEMENTATION-BACKLOG.md` 的 M8 顺序继续，不重新设计产品。
