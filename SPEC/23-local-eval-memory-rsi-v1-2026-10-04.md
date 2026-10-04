# 本地评测与记忆接入 v1

状态：`implementation-complete`

## 目标

把 RSI（递归式自我改进）从“生成候选并回滚”推进到“固定评测、保存评分、记录反馈、下次运行可召回历史经验”。本阶段只使用现有 SQLite、RunEvent（运行事件）和 Artifact（产物）事实源，不引入 Inspect AI 或 Hindsight 运行时。

## 本阶段范围

- `EvalTask（评测任务）`：任务编号、版本、输入、评测器版本和来源。
- `Score（评分）`：总分、维度分、通过状态和证据引用。
- `FeedbackEvent（反馈事件）`：评测观察或修正意见，关联任务、分数和来源。
- `MemoryAdapter（记忆适配器）`：本地 SQLite 的 retain（保存）、recall（召回）、reflect（复盘）接口。
- RSI 运行将评分和反馈写进 `improvement.evaluation_completed`，并把反馈保存到项目级记忆。

## 设计边界

1. `EvalTask`、`Score` 和 `FeedbackEvent` 先作为版本化结构写入 RunEvent/评测 Artifact，不新增专用表。
2. 记忆沿用现有 `memory_items` 表，按 `projectId` 隔离；相同项目、范围、内容和来源生成相同 ID，重复保存不产生第二条。
3. 召回首版使用有界关键词匹配，按相关度和更新时间排序；不宣称语义向量检索或 Hindsight 的完整能力。
4. `reflect` 只生成带记忆引用的摘要，不自动修改 Skill、Prompt、权限或代码。
5. RSI 仍然只有一次候选生成；高风险目标继续逐次审批，低风险目标的发布策略不改变。

## 验收

- [x] 核心类型可以被 `packages/core` 导出并通过类型检查。
- [x] SQLite 记忆保存、重复提交、项目隔离、召回、复盘和重启读回通过测试。
- [x] RSI 评测 Artifact 同时包含 EvalTask、Score、FeedbackEvent。
- [x] RSI 启用 MemoryAdapter 后会保存评测反馈；下一次运行可读取历史记忆引用。
- [x] 既有 RSI 回放、审批、回滚和全量测试不回归。

## 实际验证结果（2026-10-04）

- `npm run typecheck`：通过。
- 专项测试：记忆适配器、RSI 运行时和核心投影共 6/6 通过。
- `npm run test:all`：104/104 通过。
- 本阶段没有新增 SQLite migration；现有 schema version 保持 2。
- 这证明本地记录、召回、复盘和 RSI 证据链可运行；不证明语义向量召回、真实模型质量提升或真人提效。

## 用户可见闭环（2026-10-04）

评测结果已接入现有 Web 的“受控自动更新”卡片，而不是只写在数据库里：

- Improvement API（改进接口）的创建、详情和回滚响应都返回 `evaluationBundle`（评测包）。
- Web 卡片展示评分、评测任务、历史记忆引用条数和反馈摘要。
- 详情回读仍以 RunEvent/Artifact 为事实源；刷新或按运行 ID 回放不会退回成静态演示文案。
- `npm run build:web` 通过，Improvement HTTP 测试 4/4 通过，全量测试保持 104/104。

用户可见闭环的证据见 `validation/local-eval-memory-rsi-ui-v1-2026-10-04.json/.md`。

## 暂不包含

- 向量数据库、Embedding、图检索或自动遗忘。
- 自动生成或自动发布代码、Bot、Routine、ToolPolicy 或 Provider 变更。
- 真实模型质量提升、真人提效和跨模型比较证明。
