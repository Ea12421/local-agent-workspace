# Orchestrator MVP（总控 Agent 最小版本）v1

## 1. 目标

让用户可以用自然语言给当前项目下达一个目标，由一个项目范围内的总控 Agent：

1. 判断任务类型；
2. 生成有限步骤的执行计划；
3. 从已登记的 Skill 和工具中选择能力；
4. 逐步执行并保存每一步的状态、事件和回执；
5. 在需要写入、外发、删除、访问敏感路径或其他高风险动作时暂停并请求审批；
6. 汇总结果、产物和未完成事项。

本阶段的目标是验证“自然语言目标 → 计划 → 受控执行 → 可恢复结果”这条链路，不承诺无限制自主操作，也不把一个模型调用包装成通用 Agent。

## 2. 当前问题与推荐解法

当前产品已经有 Session、Run、RunEvent、Provider、ToolPolicy、Approval、Artifact 和 Product Builder，但用户仍需要在界面上选择固定 Provider 或固定运行入口。缺少的是一层把自然语言目标转换为可执行计划的总控层。

推荐采用混合模型：

- **动态部分**：由模型根据用户目标生成任务类型、步骤顺序和下一步建议；
- **固定部分**：每个步骤必须引用已经登记的 Skill 或工具，工具参数、项目边界、权限和审批仍由本地控制面校验；
- **人工边界**：高风险动作不能由计划自动放行，必须逐次审批；
- **恢复边界**：计划和步骤写入 SQLite，重启后从最后一个已确认步骤继续，不能重复已经成功的外部副作用。

## 3. MVP 支持的任务类型

第一版只支持四类，避免一开始变成无法验收的通用 Agent：

| 类型 | 例子 | 默认能力 |
|---|---|---|
| `conversation` | “解释这个项目的架构” | 当前会话与项目记忆，只读 |
| `inspect_project` | “检查项目结构和 Git 状态” | 文件读取、Git 只读工具 |
| `product_builder` | “把这个想法整理成产品方案” | 现有 Product Builder Workflow |
| `controlled_task` | “运行项目测试并汇报结果” | 已登记的白名单命令，逐次审批 |

无法安全归类时，必须进入 `waiting_user`，提出一个最小澄清问题，不得自行猜测高影响目标。

## 4. 领域契约

### 4.1 ExecutionPlan

```ts
type ExecutionPlan = {
  id: string;
  projectId: string;
  sessionId?: string;
  runId: string;
  objective: string;
  intent: "conversation" | "inspect_project" | "product_builder" | "controlled_task";
  status: "queued" | "running" | "waiting_user" | "succeeded" | "failed" | "cancelled";
  steps: ExecutionPlanStep[];
  maxSteps: number;
  createdAt: string;
  updatedAt: string;
};

type ExecutionPlanStep = {
  id: string;
  planId: string;
  order: number;
  skillId?: string;
  toolId?: string;
  objective: string;
  inputRefs: string[];
  outputRefs: string[];
  status: "queued" | "running" | "waiting_user" | "succeeded" | "failed" | "cancelled";
  approvalRequired: boolean;
  attempt: number;
  error?: string;
};
```

### 4.2 计划约束

- 计划必须属于一个 Project；
- Step 只能引用该 Project 可用的 Bot、Skill、Provider 和工具；
- `maxSteps` 默认 8，硬上限 12；
- 不允许循环引用、递归创建 Bot 或自动提升权限；
- 计划生成失败或 Schema 不通过时，不创建正式 Artifact；
- 计划与每个 Step 都留下 `RunEvent`；
- 同一个 `stepId + attempt` 只能产生一次成功副作用；
- 重放时优先读取已完成 Step 的结果，不重复调用工具或外部 Provider。

## 5. 权限和审批

### 自动执行

- 读取当前 Project 工作区内文件；
- 读取 Git 状态和差异摘要；
- 生成草稿、计划和分析；
- 调用已经绑定且允许使用的 Provider。

### 必须逐次审批

- 写入或覆盖项目文件；
- 运行测试、构建或其他命令；
- 删除重要数据；
- 访问项目外敏感路径；
- 读取凭据、Cookie 或 Token；
- 外发消息、发布、支付或修改权限。

总控 Agent 只能提出这些动作，不能绕过现有 ToolPolicy、ApprovalRequest 和授权回执。

## 6. 用户体验

用户只需要看到一条主线：

```text
用户目标
  → 系统理解
  → 执行计划
  → 当前步骤
  → 需要确认时暂停
  → 结果与产物
```

界面首屏只展示：目标、计划、当前步骤、等待用户的原因、最终结果。Provider、缓存、receipt 和调试字段放进技术详情，不干扰日常使用。

## 7. 不在本阶段做

- 无限制的全局桌面控制；
- 后台监听；
- 自动发消息、自动发布、自动支付；
- 模型自行创建并启用 Bot；
- 自我提升权限或无限递归；
- 云端多用户和团队权限；
- 为了展示而增加架构师、QA、运维等固定角色。

## 8. 验收标准

1. Fixture 模式下，输入四类固定自然语言目标，均能生成合法计划并完成或明确等待；
2. 只读检查任务能真实调用项目范围内的只读工具并回写结果；
3. 测试/构建任务在执行前产生一个审批请求，拒绝后不启动进程；
4. 未知或高影响目标不会猜测执行，会提出澄清或进入审批；
5. 重启后计划和 Step 状态可恢复，成功 Step 不重复产生副作用；
6. 重复提交同一消息或幂等键不会创建第二个计划或第二次工具副作用；
7. Provider 身份、模型、费用和缓存语义保持可追溯，Fixture 不冒充真实模型；
8. Web 时间线能看懂计划、步骤、等待原因和最终产物；
9. 现有 `pnpm typecheck`、`pnpm test:all`、Web/Electron 构建和既有权限测试继续通过。

## 9. 实施顺序

1. `packages/core` 增加计划和步骤类型、状态转换与事件类型；
2. SQLite 增加计划/步骤的幂等持久化和恢复读取；
3. 增加结构化计划生成器，先支持 Fixture，再接项目绑定 Provider；
4. 增加总控调度器，把计划步骤映射到现有 Product Builder、ToolRuntime 和受控命令；
5. 增加 Session API 入口，让普通消息可以进入总控，而不是让用户手选固定运行器；
6. Web 增加计划时间线和等待审批展示；
7. 用固定任务跑回归、重启、拒绝、重复提交和越权测试；
8. 只有这条链路稳定后，才考虑更多 Skill 或更复杂的自动任务。

## 10. 完成层级

本阶段完成后可以说：

> 用户可以用自然语言给项目下达有限范围的任务，系统能生成计划、调用受控能力、在高风险动作前暂停，并留下可恢复的执行记录。

不能说：

> 它已经等同于 Grok Bot，可以无限制地替用户完成任意电脑任务。
