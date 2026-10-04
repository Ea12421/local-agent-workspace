# Context + Codex 恢复验证 v1

## 目的

使用当前可用的 Codex 订阅执行通道，验证本项目自己的 `ContextSnapshot` / `ContextPacket` 是否能在长任务中恢复关键状态。此阶段不比较 DeepSeek、OpenRouter、GPT-4o 或其他 Harness。

## 运行方式

1. 构造一个带固定关键状态和大量历史噪声的 `ContextLedger`。
2. 生成带 hash 和事件范围的 `ContextSnapshot`，再生成 `ContextPacket`。
3. 用同一 `CodexExternalAdapter`、同一只读沙箱和同一提示词执行两次：
   - `full_context`：输入完整账本；
   - `verified_context_packet`：只输入经过校验的恢复包。
4. 要求 Codex 原样返回目标、约束、事实、决定、未知项、审批、交接、Artifact 和下一步。
5. 用确定性检查确认 12 个固定关键标记全部出现，并记录 Provider 回执、usage、耗时和 hash。

## 通过条件

- 两条 Codex Run 都正常完成；
- JSON 结构可解析；
- 12 个固定关键标记全部恢复；
- 恢复包的项目、Run、snapshot hash 和事件覆盖范围可回读；
- 不修改项目文件、不读取凭据、不产生外部副作用。

## 结果

2026-10-02 曾有一轮成功回执：完整状态估算 4,195 tokens，恢复包估算 774 tokens，估算缩减 81.5%；两条 Run 均通过。这是历史成功证据，不代表当前环境已经复现。

2026-10-03 第一次按同一脚本复测时，`full_context` 和 `verified_context_packet` 都在 Codex CLI 初始化 in-process app-server 阶段收到 `Operation not permitted`，因此当时没有生成恢复质量结论。随后通过一次受控权限探针恢复 Codex CLI 自身状态目录的启动条件，再运行同一脚本：两条 Run 均完成，12/12 个关键字段全部读回，当前结果为 `passed`。机器证据写入 `validation/context-codex-recovery-v1-2026-10-03.json`，并保留了成功回执中的 usage、cache 字段和 snapshot hash。

## 边界

Codex CLI 的公开回执没有稳定暴露其内部压缩策略或提示词缓存命中语义，所以本验证不声称测到了 Codex 原生压缩，也不声称自由聊天全文无损、Provider 原生 resume 或真实账单成本下降。它只证明：本项目生成的结构化恢复包可以交给同一个 Codex 执行器读取并恢复关键状态。
