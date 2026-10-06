# Provider、项目绑定与会话契约 v1

日期：2026-10-06（Asia/Shanghai）
状态：`implemented-v1`

## 1. 为什么需要这组契约

当前 BotProfile 里只有一次运行策略：Provider 名称、模型和 fallback。它不能表达：

- 这个项目到底连接了哪个 Provider；
- 这个连接是 Codex 订阅、DeepSeek API、CLI 还是本地模型；
- 当前选择的模型是什么、上次探针是否成功；
- 运行失败后是否允许 fallback，以及 fallback 到哪里；
- 一个项目里的连续会话、消息、Run 和恢复摘要如何关联。

如果现在只改 Web 下拉框，仍然会得到“看起来能选、实际上每次调用都从环境变量和固定常量取值”的假功能。

## 2. 最小领域对象

### ProviderConnection

只保存非敏感元数据和 Secret 引用，不保存 API Key 原文：

```ts
type ProviderConnection = {
  id: string;
  label: string;
  provider: 'codex' | 'deepseek' | 'fixture';
  harness: 'codex-cli' | 'deepseek-api' | 'fixture';
  authMode: 'subscription' | 'api_key' | 'cli' | 'local' | 'unknown';
  billingSource: 'subscription' | 'api' | 'local' | 'unknown';
  secretRef?: { kind: 'env'; name: string } | { kind: 'cli'; profile: string };
  status: 'unconfigured' | 'available' | 'blocked' | 'error';
  capabilities?: JsonObject;
  lastProbeAt?: string;
  createdAt: string;
  updatedAt: string;
};
```

### ProjectProviderBinding

项目选择 Provider；Bot 可覆盖模型，但不能越过项目连接：

```ts
type ProjectProviderBinding = {
  id: string;
  projectId: ProjectId;
  connectionId: string;
  model: string;
  role: 'primary' | 'fallback';
  priority: number;
  enabled: boolean;
  fallbackPolicy: 'never' | 'on_retryable_failure';
  revision: number;
  createdAt: string;
  updatedAt: string;
};
```

### Session / Message

Run 是一次执行记录，Session 是用户持续工作的容器：

```ts
type Session = {
  id: string;
  projectId: ProjectId;
  botId: BotId;
  title: string;
  status: 'active' | 'archived';
  contextSnapshotId?: string;
  createdAt: string;
  updatedAt: string;
};

type Message = {
  id: string;
  sessionId: string;
  sequence: number;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  runId?: RunId;
  provider?: ProviderIdentity;
  createdAt: string;
};
```

## 3. Resolver 规则

1. 先校验 `projectId → binding → connection` 的所有权，不能拿项目 A 的连接跑项目 B。
2. 本人路径先探测公开 Codex CLI/订阅执行能力；这只代表 ExecutionAgent，不把订阅当成 API 额度。
3. 他人路径第一次打开必须配置自己的 Provider；Fixture 只能从“诊断/离线测试”进入。
4. fallback 只有在 binding 明确允许且失败原因可重试时发生；每次选择和 fallback 都写 RunEvent 与 receipt。
5. DeepSeek API Key 只能来自 env/受控 Secret 引用，HTTP 回读只返回 `configured/available/error` 和模型元数据。

## 4. SQLite additive migration Prepare 范围

当前 `schema_meta` 版本为 2。实现本契约需要一次向后兼容的版本 3 加表迁移：

- `provider_connections`：连接元数据、secretRef、探针状态；不存 Key 原文。
- `project_provider_bindings`：项目到连接/模型的绑定，唯一约束为 project + role + priority。
- `sessions`：项目、Bot、标题、状态、最新 snapshot 引用。
- `session_messages`：session + sequence 唯一，append-only 消息记录。
- `policy_audit`：Bot 策略审批的结构化审计索引（RunEvent 仍是事实事件）。

迁移只使用 `CREATE TABLE IF NOT EXISTS`、索引和 `schema_meta` 版本递增，不删除、重命名或覆盖现有表，不修改现有行。失败时事务回滚，启动时拒绝半完成版本。

## 5. 验收

- 两个项目绑定不同连接后，resolver、Run、receipt 和 Session 不能串项目。
- Key 原文不出现在 SQLite 回读、RunEvent、receipt、Artifact、日志或导出中。
- 无连接时首屏明确要求配置；Fixture 诊断仍能离线运行。
- Session 重启可读，Message 顺序稳定；Run 与 Message 通过 runId 关联。
- 迁移前后旧的 projects/runs/artifacts/approvals 全部可读，已有 105 条测试不回归。

## 6. v1 实施结果与剩余边界

已执行并验证 schema 3 additive migration，备份副本为 `<local-backup>`。Provider/项目绑定/Session/Message 的 SQLite 与 HTTP 持久化、项目 resolver、审批审计和“使用当前项目绑定的 Provider”运行入口已接入；真实页面已用 Fixture 绑定运行一次并回读完成状态。

本单元补齐了首次使用页上的 Provider 连接卡、项目绑定运行入口和 Session/Message 时间线；在全新临时数据目录中完成了 Fixture 连接 → 项目绑定 → 创建会话 → 保存消息 → 进程重启读回 → 绑定运行的闭环。Electron 服务进程测试通过，`npm run package:mac` 生成了本机 arm64 DMG。

剩余边界：DeepSeek 真实调用仍需要用户自己的 API Key；Codex CLI 只做公开能力探针和执行桥，当前本机探针显示可用，但不把订阅额度当作公开 API。真实 Provider 的质量、成本和长期稳定性仍需单独的固定任务验证。macOS DMG 未做 Apple Developer ID 签名，首次打开可能需要 macOS 的常规安全允许；源码、Fixture 诊断和本地 Web 启动路径已验证。
