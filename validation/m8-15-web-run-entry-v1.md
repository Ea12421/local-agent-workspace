# M8-15 Web Run Entry Validation v1

日期：2026-09-28（Asia/Shanghai）
阶段：`m8-15-web-run-entry`

## 目标

把 Web 的“新建一次运行”从提示文案接成可选择 Provider 的真实入口，并让用户能看到执行状态、Run ID、事件数和 Provider receipt。

## 实现

- `apps/web/src/lib/api.ts`
  - 新增 `ProviderChoice`、`StartRunRequest`、`StartRunResult`。
  - `fixture` 调用 `POST /api/product-builder/preview`。
  - `codex` 调用 `POST /api/provider/codex-run`。
  - 失败不会静默回退成 Fixture；`getSnapshot` 的离线回退保持原有行为。
  - 按真实返回结构读取 `run.id`、`run.status`、顶层 `receiptId`、`providerEvents` 和 Product Builder 的 `approval.runId`。
- `apps/web/src/App.tsx`
  - 新增“新建一次运行”对话框、目标输入、Provider 选择和忙状态。
  - 新增执行回执卡，区分“演示数据”和“真实执行”。
- `apps/web/src/styles.css`
  - 新增对话框、执行回执和错误状态样式。

## Computer Use 证据

通过 Chrome 打开 `http://localhost:5173/?v=run-entry-4`，完成：

1. 点击“新建一次运行”；
2. 输入固定只读目标“列出两个首要验证缺口。只输出两条短句。”；
3. 选择“Codex 订阅执行桥（只读）”；
4. 点击“开始运行”；
5. 页面返回可见回执：
   - Run：`run_mukqh9uy`
   - 事件：`5`
   - 回执：`run_mukqh9uy:codex:segment:1`
   - 标识：`真实执行`

这次运行通过本机 `codex-cli 0.155.1` 订阅路径完成；没有读取凭据、没有修改项目文件、没有外发消息。

Fixture 入口也通过浏览器走通。首次联调发现 Product Builder 返回 `approval.runId` 和 `waiting_user`，前端旧映射误显示“未创建/0 事件”；已按真实返回结构修正，未把 Fixture 结果写成真实模型效果。

## 工程验证

- `node scripts/typecheck.mjs`：PASS
- `git diff --check`：PASS
- Core/adapter/workflow/server Node tests：29/29 PASS
- Codex receipt SQLite 回读：PASS；最新 receipt 位于 `data/workspace.db` 的 `provider_receipts` 表，schema 为 `provider.execution-receipt.v1`。

## 结论

`M8-15 Web Run Entry`：PASS（入口和回执链路）。

仍未证明：

- Product Builder 内容质量优于单次模型调用；
- 多 Bot 降低人工修改量；
- 真人 A/B 提效和再次使用意愿；
- DeepSeek API parity；
- Codex native resume；
- Electron Computer Use 可见性。

下一步：按 `validation/m8-13-user-baseline-card-v1.md` 使用同一固定任务记录真人 A/B：耗时、手工步骤、修改量、返工、可追溯性、中断恢复和再次使用意愿。
