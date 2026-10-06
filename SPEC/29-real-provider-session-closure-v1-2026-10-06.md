# 真实 Provider 会话闭环 v1

## 目标

让用户在项目会话里发送消息时，可以使用当前项目绑定的真实 Provider（模型服务通道），并把真实模型回复写回同一个 Session（会话）。

## 选择

- 会话入口接受 `fixture` 或 `bound`。
- 默认仍为 Fixture，保证无 Key 也能演示。
- 项目绑定 Codex 时，Web 会话自动选择 `bound`。
- 当前只读 Bot 才能从会话调用 Codex。
- DeepSeek 暂不接入通用会话；它继续走 Product Builder 专用草稿路径。
- Provider 失败时直接失败并保留 RunEvent/receipt，不降级到 Fixture。

## 运行链路

```text
用户发送消息
→ Session / Project / Bot 校验
→ 读取项目 primary Provider binding
→ Codex CLI 执行只读任务
→ 保存 RunEvent 与 receipt
→ 提取真实 assistant 文本
→ 回写同一个 Session
→ 重复 messageId 返回原 Run
```

## 安全边界

Codex 会话首版固定附加只读约束：

- 只能读取和分析当前项目；
- 不得写文件；
- 不得安装依赖；
- 不得发送消息；
- 不得读取凭据；
- 不得访问项目外路径。

如果 Bot 不是只读权限，会话入口直接拒绝，不自动提升权限。

## 验收

1. Session、Project、Bot、Run 的 ID 保持一致。
2. 真实 Codex 的 `isMock=false、Provider 身份和 receipt 可回读。
3. assistant 消息写回真实模型文本，而不是固定占位语句。
4. 相同 `messageId` 重试返回同一个 Run，不重复调用模型。
5. 刷新或重启后可以从 SQLite 回读消息。
6. Provider 失败明确失败，不切换 Fixture。
7. Fixture 默认路径和既有测试不受影响。

## 边界

这一步证明产品的真实会话链路可以使用，不证明模型回答质量、长期成本收益或多 Bot 价值。下一步应先做一次 UI 端到端回归，再决定是否需要继续扩展。
