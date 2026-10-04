# M8-14 Computer Use + Codex execution bridge 联调记录

状态：`PARTIAL / 可继续开发`

日期：2026-09-28（Asia/Shanghai）

## 目的

用 Computer Use 操作本地 Web 工作台，并用同一套本地 control plane 的 Codex execution endpoint 做只读真实调用。验证范围是“页面能用、审批能走、运行与产物可见、Codex 订阅桥能执行并留下事件”，不把 Fixture 或模型自评写成产品效果证明。

## 环境与边界

- Web：`http://localhost:5173/`，Chrome Computer Use。
- API：`http://127.0.0.1:4310`，本机监听。
- Codex 探针：`codex-cli 0.155.1`，`authMode=subscription` 被探针识别。
- 未安装新依赖，未访问凭据/Cookie/Token，未修改旧工作台，未改变 VPN，未启动公网服务。
- Web 启动时遇到 Vite/Rolldown 的 React refresh `Missing field moduleType`；关闭开发 HMR 后页面恢复。根 `dev:web` 同时修正为明确使用 `apps/web` 作为 Vite root。

## Computer Use 结果

1. 打开工作台后页面显示 `本地服务正常`，Project、Bots、当前 Run、审批卡和 Artifacts 均可见。
2. 点击“确认并继续”后审批卡消失，页面出现“已确认，Architecture Bot 将继续工作”的提示。
3. 进入“运行记录”可看到 `run-fixture-001` 的六段事件时间线，状态为“已完成”。
4. 进入“Artifacts”可看到 `Product Brief.md` 与 `Execution Plan.md`，状态为“已生成”。

结论：Web 控制面和 Fixture 审批/回放链路可操作；当前页面数据的 Provider 仍显示 `Fixture Adapter`，不是 Codex。

## Codex 真实调用结果

`GET /api/provider/codex-probe` 返回：

```json
{"status":"available","version":"codex-cli 0.155.1","harness":"codex-cli","role":"execution_agent"}
```

带只读目标的调用通过 `POST /api/provider/codex-run` 完成，SQLite `runs` 和 `run_events` 可回读：

| Run | 状态 | 事件 | Provider 身份 | usage |
|---|---|---:|---|---|
| `run_mukpml8l` | `succeeded` | 41 | `codex-cli / openai-codex / authMode=subscription / isMock=false` | input 189,946；output 2,189 |
| `run_mukpnxhl` | `succeeded` | 49 | `codex-cli / openai-codex / authMode=subscription / isMock=false` | input 243,386；output 1,933 |

两条 Run 的事件均包含 `run.created`、`run.started`、`run.segment_started`、多条 `provider.event`（含 thread/turn/agent_message/usage）、`run.segment_completed` 和 `run.succeeded`。Codex 实际只读检查了本项目文件，并返回了三步验证清单。

## 结论

### 已证明

- Codex 订阅执行桥可用，且不是 Fixture：`authMode=subscription`、`isMock=false`。
- 本地 control plane 能把 Codex 的 JSONL 事件写入 SQLite RunEvent，并保存 usage 与最终状态。
- Computer Use 能操作 Web 的 Project/Bot/Run/Approval/Artifact 页面。
- 代码检查通过：TypeScript typecheck、核心/适配器/工作流/服务器测试共 29 项通过。

### 已补齐

- 在本回合补上 Codex execution receipt 持久化：`run_mukpy6pf` 成功，返回 `receiptId=run_mukpy6pf:codex:segment:1`。
- SQLite `provider_receipts` 已能按 `run_id + segment` 回读，包含 `provider` 身份、`status=succeeded`、事件数、usage 和事件摘要 SHA-256；不保存模型原文。

### 尚未证明 / 当前阻塞

- Web 的“新建一次运行”按钮仍只是提示文案，没有调用 `/api/provider/codex-run`；页面默认展示 Fixture。
- Codex 运行当前主要通过 API/脚本触发，尚未在页面中选择 Provider、提交目标、流式展示真实 Codex 事件。
- 没有证明输出质量优于单次模型调用，也没有真人耗时、手工修改、返工和再次使用意愿数据。`validation/m8-13-user-baseline-card-v1.md` 仍需真人执行。
- `billingSource` 对 Codex 仍为 `unknown`；订阅身份已识别，但不把它写成 API 额度。

## 唯一下一步

先把 Web “新建一次运行”接成显式的 Codex/Fixture Provider 选择和真实 Run 创建入口，再用同一固定任务在浏览器中重跑，最后才进入质量和真人提效比较。
