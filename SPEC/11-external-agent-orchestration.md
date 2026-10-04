# 外部开发 Agent 协作协议 v1

状态：`frozen / applies-from-next-unit`

本文件定义“开发 Local Agent Workspace 时，外部协作 Agent 如何分工”的规则。

它和产品运行时里的 `Product Builder`、Research Bot、Architecture Bot 是两套不同的东西：

- 本文件约束开发过程中的总控、架构、实现、QA、安全、恢复和发布角色；
- `SPEC/10-agent-role-map-and-lifecycle.md` 约束产品运行时将来如何组织 Bot 和 Workflow。

## 1. 总决策

采用“总控 + 按需专门角色 + 确定性质量门”的混合模式：

```text
                         用户
                          ↓
                 Chief Orchestrator（总控）
                          ↓
       ┌──────────┬──────────┬──────────┬──────────┐
       ↓          ↓          ↓          ↓          ↓
   架构契约    Runtime/   Security/   QA/      Persistence/
   Agent       Provider   Tool        Test     Recovery
               Agent      Agent       Agent    Agent
                          ↓
                 Release / Evidence Gate
```

总控长期存在；专门角色只在当前阶段需要时激活；测试、哈希、状态校验、路径扫描和构建优先使用确定性检查器。

不采用两个极端：

- 一个 Agent 同时负责需求、架构、实现和自我验收；
- 所有角色常驻并自由讨论、同时修改代码。

## 2. 外部角色清单

| ID | 角色 | 类型 | 主要职责 | 默认权限 | 是否可改正式代码 |
|---|---|---|---|---|---|
| `orchestrator` | Chief Orchestrator | 总控 Agent | 冻结目标、派发角色、合并结论、裁决冲突、维护状态和向用户报告 | 读全项目；按当前授权调度 | 可以，但应尽量把具体实现交给 Implementer |
| `architecture` | Architecture & Contract Agent | 专门 Agent | 设计边界、依赖方向、接口、状态机和取舍 | 只读 | 否，除非总控明确把它指定为 Implementer |
| `runtime-provider` | Runtime / Provider Agent | 专门 Agent | Provider、Tool Loop、上下文、取消、恢复和 receipt 实现建议 | 只读或指定代码范围 | 默认否 |
| `security-tool` | Security / Tool Policy Agent | 专门 Agent | 权限、路径、命令、secret 脱敏、审批和越权边界 | 只读审计 | 否 |
| `persistence-recovery` | Persistence / Recovery Agent | 专门 Agent | SQLite、事件回放、幂等、重启、恢复和数据隔离 | 只读审计 | 否 |
| `implementer` | Runtime Implementer | 唯一写入角色 | 按已批准方案修改指定代码和测试 | 只写分配的文件范围 | 是 |
| `qa-evidence` | QA / Evidence Agent | 专门 Agent | 运行测试、检查回执、验证声明边界和生成证据摘要 | 读；运行白名单命令 | 默认否 |
| `release-ops` | Release / Operations Agent | 专门 Agent | 构建、安装、环境诊断、版本和交付限制 | 白名单构建/诊断 | 否 |

角色可以由同一个模型在不同上下文中承担，但每次运行必须明确当前 `roleId`，不能把一个角色的结论伪装成另一个角色的独立复核。

## 3. 总控的职责和输出

总控每个工程单元只冻结一个：

- objective：本轮要解决的问题；
- scope：允许修改的文件和模块；
- anti-goals：本轮明确不做的事情；
- done definition：完成条件；
- stop conditions：必须停止并报告的情况；
- review budget：本轮允许的独立审查和修正次数；
- next action：唯一下一步。

总控必须给用户一份人话版报告，至少包含：

1. 当前完成了什么；
2. 哪些结论有测试或运行回执；
3. 哪些只是设计或假设；
4. 发生了哪些冲突以及如何裁决；
5. 还剩哪些阻塞；
6. 下一步具体改哪些文件、验收什么。

## 4. 专门角色的统一交接格式

任何角色都必须返回结构化交接，不用自由聊天作为事实源：

```ts
type ExternalRoleHandoff = {
  handoffId: string;
  roleId: string;
  objective: string;
  inputRefs: string[];
  filesRead: string[];
  filesChanged: string[];
  findings: Array<{
    kind: "fact" | "inference" | "proposal" | "risk" | "blocker";
    statement: string;
    evidenceRefs: string[];
  }>;
  conflicts: Array<{
    withRole?: string;
    topic: string;
    options: string[];
    recommendation?: string;
  }>;
  outputRefs: string[];
  acceptanceChecks: string[];
  unknowns: string[];
  stopConditions: string[];
  nextAction: string;
};
```

交接必须引用实际文件、测试、receipt 或事件。没有证据的判断必须标为 `inference`、`proposal` 或 `unknown`。

## 5. 执行流程

### 阶段 A：总控冻结

总控先更新 `RUN_STATE.json` 的目标、范围、唯一下一步和预算，再派发角色。

### 阶段 B：独立设计

架构、Runtime/Provider、安全或恢复角色分别读取同一事实源；它们不能读取彼此尚未审核的结论来制造“独立审查”。

### 阶段 C：总控合并

总控按以下顺序合并：

```text
事实和可执行测试
→ 当前 SPEC 和 AGENTS.md
→ 用户已确认目标
→ 角色建议
→ 未解决偏好
```

冲突必须写入合并报告，不能悄悄选择一个结论。

### 阶段 D：唯一实现者修改

只有 `implementer` 可以修改正式代码。它必须收到：

- 已合并设计；
- 明确文件范围；
- 接口和不变量；
- 测试清单；
- 不可扩展范围。

如果实现中发现设计缺口，暂停实现并回交 `architecture` 或 `runtime-provider`，不能顺手扩大范围。

### 阶段 E：质量门

按需要激活 QA、Security、Persistence/Recovery 和 Release。它们默认只读，输出 findings，不直接覆盖生产代码。

### 阶段 F：总控收口

总控核对测试输出、状态文件、Git diff、用户可见产物和声明边界，然后更新：

- `RUN_STATE.json`；
- `SPEC/PROGRESS.md`；
- `DEVLOG.md`；
- `HANDOFF.md`；
- 必要的 validation 证据。

## 6. 写入和并发规则

1. 同一时间只有一个角色写正式代码。
2. 角色必须声明自己的文件白名单；白名单外只读。
3. 不允许两个角色同时修改同一文件。
4. 设计角色可以写 `SPEC/`、`docs/` 或自己的审查报告，但不能覆盖其他角色的原始证据。
5. QA、安全和恢复角色不能修改测试结果来消除失败。
6. 总控不能为了让状态变绿而删除失败事件、降低验收标准或改写历史 receipt。
7. 任何新依赖、数据库迁移、外发、发布、删除或凭据相关动作继续遵守项目 `AGENTS.md` 的人工确认边界。

## 7. 冲突解决规则

冲突按照以下流程处理：

1. 先确认双方读取的是同一个 `RUN_STATE`、SPEC 和代码版本；
2. 由 QA 或确定性检查器复现争议；
3. 优先选择能通过硬约束、权限和恢复测试的方案；
4. 如果仍有多个可行方案，由总控记录取舍、风险和回滚方式；
5. 需要产品偏好、不可逆操作或超出授权时，进入 `waiting_user`；
6. 不让角色通过继续讨论无限消耗额度。

## 8. 额度、上下文和中断规则

- 每个角色只接收完成当前任务所需的最小上下文，并引用状态文件，而不是复制整段聊天；
- 长任务使用唯一 `RUN_STATE.json`，必要时使用 `HANDOFF.md` 续接；
- 发生模型限额、上下文压缩或窗口中断时，先保存当前证据和唯一下一步，再恢复；
- 恢复后重新核对 Git diff、状态文件和最近回执，不从记忆推测已经完成；
- 同一个错误只允许一次定位、一次最小修正和一次专项重试；
- review 预算属于总控，不由每个子 Agent 单独重新获得。

## 9. 当前项目的启用方案

从下一个工程单元开始启用：

```text
总控：当前主 Codex
架构/契约：审 M3-07d 真实 Provider 接入边界
Runtime/Provider：实现真实 Provider 消费 ProviderResponseEnvelope
Persistence/Recovery：验证 SQLite receipt/approval 回读和恢复
Security/Tool：检查审批、权限、路径和无副作用边界
QA/Evidence：执行专项、全量测试和声明审计
实现者：只由总控或明确指定的单一写入上下文修改代码
```

这不是立即启动七个长期窗口。总控按依赖分批派发，并把每批结果合并后再进入下一批。

## 10. 冻结后的验收条件

外部协作协议只有满足以下条件，才可以称为“有效”：

- 每个重要阶段都能找到唯一总控、唯一实现者和对应质量门；
- 角色结论能区分事实、推断、建议和未知；
- 冲突有记录、有裁决、有证据；
- 上下文中断后能从 `RUN_STATE` 和产物恢复；
- 不会因为角色数量增加而绕过权限、审批、幂等或安全检查；
- 用户能用一页人话报告看懂当前状态和下一步；
- 未证明的模型质量、成本和真人效果不会被包装成完成。

