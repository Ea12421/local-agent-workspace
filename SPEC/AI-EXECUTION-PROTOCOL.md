# AI Execution Protocol

这份文件是给后续 Codex/AI 执行者看的。它不是产品说明，而是执行规则：每次只能推进一个明确的 Backlog 项，完成后留下可核对证据。

## 1. 恢复顺序

```text
1. 读取根目录 AGENTS.md
2. 读取 RUN_STATE.json
3. 读取 HANDOFF.md
4. 读取 SPEC/PROGRESS.md
5. 只打开当前 Backlog 项指定的文件
6. 检查 Git/文件状态，不覆盖已有用户改动
```

如果 `RUN_STATE.status=blocked_environment`：

- 先读 `blocked_reason`；
- 只做一次有边界的环境修正；
- 如果没有新证据，不重复相同命令；
- 环境恢复后再把状态改为 `running`，同时填写唯一 `next_action`。

## 2. 每个任务的输入和输出

每个 Backlog 任务必须能回答：

```text
任务 ID：
目标：
输入文件/接口：
要改的文件：
不改的文件：
依赖任务：
验收命令：
预期证据：
失败停止条件：
```

任务结束时必须更新：

- `RUN_STATE.phase`；
- `RUN_STATE.progress`；
- `RUN_STATE.last_evidence`；
- `RUN_STATE.next_action`；
- `HANDOFF.md`（如果改变了恢复路径）。

## 3. 标准执行循环

```text
Inspect
→ 读取目标文件和相关测试
→ 说明最小改动

Implement
→ 只改当前任务需要的范围
→ 不顺手重构无关模块

Verify
→ 运行最小专项测试
→ 运行相关 typecheck/build
→ 检查实际输出或 receipt

Checkpoint
→ 原子更新 RUN_STATE
→ 写入可观察证据
→ 选择一个 next_action
```

## 4. 什么时候可以写 DONE

只有满足以下条件才能把 Backlog 项写成 `DONE`：

1. 目标文件存在；
2. 接口和行为与 MASTER-SPEC 一致；
3. 至少有一个专项验证命令；
4. 验证输出可被另一个 AI 或人重新执行；
5. 没有把 mock、fixture、静态检查写成真实环境通过。

如果代码存在但依赖、真实 Provider、浏览器或用户验证未完成，写 `PARTIAL`，不是 `DONE`。

## 5. 错误和重试

同一错误只能执行一次：

```text
一次定位
→ 一个最小修正
→ 一次专项验证
→ 一次真实重试
```

第二次遇到同一 fingerprint 时：

- 不扩大范围；
- 不追加新的 reviewer；
- 不把错误改名；
- 标记 `blocked_environment`、`blocked_user` 或 `failed`。

## 6. Provider 证据规则

每次真实 Provider 调用必须保存 receipt 的非敏感字段：

```json
{
  "harness": "deepseek-http | codex-cli | fixture",
  "provider": "deepseek | openai-codex | fixture",
  "model": "...",
  "authMode": "api_key | subscription | cli | local | unknown",
  "billingSource": "api | subscription | local | unknown",
  "isMock": false,
  "capabilities": {},
  "startedAt": "...",
  "endedAt": "...",
  "error": null
}
```

不要保存 Key、Cookie、Token 或完整敏感请求。

## 7. AI 能力和真实效果的分层

执行者必须把以下四种证据分开写：

- `built`：代码或文档存在；
- `verified`：机器检查通过；
- `reality_validated`：真实环境/真实输入达到冻结阈值；
- `user_accepted`：用户完成主观验收。

Fixture 只能支持前两级。模型自己的评分不能直接支持后两级。

## 8. 当前恢复任务

当前 `RUN_STATE` 是 `blocked_environment`，但本机 Codex CLI 已可用。先完成 Codex 执行桥与控制面接入；解除 registry/DNS 和依赖条件后，再按以下顺序执行：

```text
M8-03 Codex 真实执行桥接入 Product Builder
→ M6-06 Web build
→ M7-01/M7-02 Desktop 启动与 health-ready
→ M7-03 macOS dmg
→ M8-01 clean-room install
→ M8-02 DeepSeek 真实调用（可选对比）
→ M8-04 10 个固定任务消融
→ M8-05 3 个现实任务
→ M8-06 面试掌握包
```

不得因为旧聊天里说过“技术可行”就跳过这些门。
