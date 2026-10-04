# Evaluation / RSI / Context Freshness 增量差异清单

日期：2026-10-03（Asia/Shanghai）  
基线：`RUN_STATE.json=complete / delivery-ready-v1`、`SPEC/MASTER-SPEC.md`、`SPEC/ROADMAP-EXECUTION-V1-2026-10-03.md`  
增量方案：`SPEC/12-evaluation-rsi-context-freshness-v1.md`

## 结论

这是对现有本地 Control Plane 的增量，不替换现有总 SPEC、Run 状态机、SQLite 事实源、Provider 边界或权限模型。现有 R1-R8 交付继续作为基线；本轮把“结果好不好”“事实是否过期”“候选改进能否安全发布”变成可持久化、可回放的对象。

## 已有能力，可直接复用

| 方案需要 | 现有实现 | 处理结论 |
|---|---|---|
| Run / RunEvent / 幂等 | `packages/core` 状态机、SQLite EventLog | 不改状态迁移；新对象引用现有 `runId` 与事件 |
| ProviderIdentity / usage / cache / reasoning | `ProviderResponseEnvelope` 与 receipt | 评测只引用 receipt，不复制 Provider 事实 |
| Tool / Approval / Artifact | ToolRuntime、审批恢复、Artifact release | 评测报告引用事件和 Artifact，不绕过审批 |
| ContextSnapshot / ContextPacket | `packages/core/src/context.ts`、SQLite snapshot | EVAL-04 在其上增加 SpecRef/ProjectFact，而不是新建第二套上下文 |
| Bot / Skill / Policy | `BotProfile`、`Skill`、`ToolPolicy` | RSI 只产生候选版本，不能直接改这些正式对象 |

## 新增差异

| 缺口 | 本轮新增 | 不做什么 |
|---|---|---|
| 没有统一评测对象 | `EvalTask`、`EvalRun`、`Score`、报告引用 | 不把模型自评或 Fixture PASS 升级成质量证明 |
| 失败与质量失败混在一起 | 明确 `failed / unscored / partial / passed` | 不改变 Run 的执行状态语义 |
| 静态 SPEC 可能过时 | `SpecRef`、`ProjectFact`、过期/冲突检查 | 不自动改写 SPEC |
| 用户修改无法进入回归 | `FeedbackEvent`、`ImprovementProposal` | 不自动发布 Prompt/Skill/权限 |
| 记忆边界不清 | 后续 `MemoryAdapter` 接口 | 不引入 Hindsight/Letta 运行时依赖 |

## 实施顺序与当前边界

```text
EVAL-01 Core 契约
→ EVAL-02 SQLite 持久化
→ EVAL-03 Fixture-first 独立评测引擎
→ EVAL-04 Dynamic Context Freshness
→ RSI-01 候选改进草稿
→ RSI-02 审批、发布、回滚
→ MEM-01 MemoryAdapter 预留
```

每一步都必须留下实现、测试、validation 证据和唯一下一步。方案文件本身只是设计输入，不能写成已实现。

## 当前唯一动作

实现 `EVAL-01 Core 契约`：在 `packages/core` 增加带 `schemaVersion` 的评测、反馈和改进提案类型，提供纯函数校验/稳定序列化，并保持现有 Run 状态机不变。
