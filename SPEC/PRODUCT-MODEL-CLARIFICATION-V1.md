# Product Model Candidate v1

> 状态：候选解释，未冻结，不改变当前 Product Contract、RUN_STATE 或交付范围。
>
> 这份文件记录一种可能的长期产品抽象，供后续评估。除非用户明确接受，否则不得把它当作当前实现要求。

## 候选产品抽象

一种可能的长期方向，是把 Local Agent Workspace 发展成**能力工作流操作层**：

> 把一项可以重复使用的能力封装成可运行、可审计、可迭代的 Skill/Workflow，再由 Bot 在项目上下文中调用它。

## 五个概念的边界

### Project

项目是事实和权限边界，拥有：

- 项目文件和工作区；
- Bot；
- Skill 版本；
- Run、Event、Approval、Source、Artifact；
- 项目级 Memory。

一个项目的 Bot 不应默认读取另一个项目的内容。

### Skill

Skill 是一项可复用能力的版本化定义，不只是 Prompt。

一个 Skill 至少要声明：

- 目标和职责；
- 输入 Schema；
- 输出 Schema；
- Workflow 步骤；
- 哪些步骤是确定性代码，哪些步骤调用 Agent；
- 可用工具；
- 权限档位；
- Provider 策略；
- 失败、停止和审批条件；
- 固定测试题和评测规则；
- 版本、变更记录和兼容性。

例如“产品研究 Skill”可以固定为：

```text
输入产品想法
→ 补齐未知项
→ 搜索公开来源
→ 保留来源引用
→ 生成研究报告
→ 检查事实和引用完整性
→ 输出结构化 Research Report
```

### Workflow

Workflow 是 Skill 的实际执行图。

它可以包含：

- 确定性步骤：解析、校验、格式转换、文件读取；
- Agent 步骤：需求判断、方案比较、冲突解释；
- Tool 步骤：搜索、文件、Git、Shell；
- 人工节点：审批、补充信息、冲突选择。

Workflow 是系统可以回放、暂停、恢复和审计的执行对象。

### Bot

Bot 是项目中的一个工作角色，不等于 Skill 本身。

Bot 包含：

- 名称和职责；
- 绑定的 Skill；
- 项目上下文；
- Provider 策略；
- Memory 策略；
- 工具权限；
- 审批规则；
- Run 历史。

因此，同一个 Skill 可以被多个不同 Bot 使用；同一个 Bot 也可以按规则调用多个 Skill。

### Agent

Agent 是 Workflow 中负责判断或执行某个节点的智能执行单元。

Agent 可以承担：

- Planner；
- Research；
- Product；
- Architecture；
- Evaluation；
- Manager/Orchestrator。

Agent 不拥有业务事实源。Run、RunEvent、Approval 和 Artifact 仍由本地控制面管理。

## “把 Skill 画成 Bot”的准确理解

用户界面上可以把一个大型 Skill 显示成一个可选择的 Bot，但底层应保持两层：

```text
Bot Profile
  └── 绑定 Skill Version
        └── 执行 Workflow
              ├── Agent Node
              ├── Tool Node
              ├── Approval Node
              └── Artifact Node
```

这样做的好处是：

- 用户看到的是容易理解的 Bot；
- 工程上可以单独升级 Skill；
- 同一能力可以复用；
- 每次运行可以锁定具体 Skill 版本；
- 评测可以比较 Skill v1 和 v2；
- 不会因为改了一个 Bot 就破坏所有项目。

## 自优化的边界

Skill 可以“提出改进”，不能直接自我升级。

允许的闭环是：

```text
运行记录
→ 失败/返工/人工修改证据
→ 生成 Skill 改进草稿
→ 固定题集回放
→ 评测差异
→ 用户批准
→ 注册新 Skill Version
```

禁止的行为是：

- 自动提升权限；
- 自动绑定新工具；
- 自动读取项目外数据；
- 自动注册无限 Bot；
- 自动开启无人值守任务；
- 把模型自评当作升级依据。

## 当前版本和目标模型的关系

当前 Alpha 已经验证的是底层控制面：

- Project、Bot、Run、Handoff、Approval、Artifact；
- Fixture Product Builder Workflow；
- SQLite 事件和 receipt；
- Codex 执行桥；
- 最小 ToolRuntime 边界。

当前还没有完成完整的 Skill Registry、Skill Version 发布、Skill 评测和 Skill 自优化闭环。

这不是当前 Alpha 的阻塞项，但它是产品从“可运行控制面”进入“能力平台”的下一阶段主线。

## 推荐演进顺序

```text
当前 Alpha 控制面
→ Skill Manifest 和版本锁定
→ 一个 Product Builder Skill 的完整 Workflow
→ Bot 绑定和选择 Skill
→ Skill 固定题集评测
→ 生成改进草稿
→ 用户批准后注册新版本
→ 再考虑 Manager Agent 和自动 Skill 组合
```

先稳定一项可复用能力，再做“创建 Bot 的 Bot”或自动 Skill 组合。否则会先得到很多角色，却无法证明每个角色的能力边界和实际价值。
