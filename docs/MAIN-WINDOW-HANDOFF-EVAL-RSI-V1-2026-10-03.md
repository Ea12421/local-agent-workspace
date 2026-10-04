# 主窗口交接：Independent Evaluation + Controlled RSI v1

状态：design-ready / implementation-not-started

日期：2026-10-03（Asia/Shanghai）

## 交接目的

将“SPEC 可能过时、Agent 需要最新上下文、需要独立评测和受控自我迭代”的设计，
交给主窗口继续推进。

这不是新的产品总方案，也不是要求重做现有交付版本。

## 当前事实

- 当前项目已有本地 Alpha 控制面；
- SQLite-first 是运行时事实源；
- RunEvent、审批、Artifact、Provider receipt、ContextSnapshot 和受控 Tool Loop 已存在；
- RUN_STATE.json 当前为 complete / delivery-ready-v1；
- DeepSeek 证据仍不能证明通用质量、多 Bot 优势或长期成本收益；
- 本交接只新增设计，不改变当前 RUN_STATE 的终态。

## 唯一设计入口

主方案：

SPEC/12-evaluation-rsi-context-freshness-v1.md

现有总路线仍然有效：

SPEC/ROADMAP-EXECUTION-V1-2026-10-03.md

## 主窗口第一步

先做一次规格合并检查：

~~~text
现有 SPEC / RUN_STATE
    +
SPEC/12-evaluation-rsi-context-freshness-v1.md
    ↓
一份差异清单
    ↓
EVAL-01 Core 契约
~~~

不要重新设计产品，不要创建第二套总架构，不要先引入第三方 Agent 框架。

## 实施顺序

~~~text
EVAL-01 Core 契约
→ EVAL-02 SQLite 持久化
→ EVAL-03 独立评测引擎
→ EVAL-04 Dynamic Context Freshness
→ RSI-01 改进提案
→ RSI-02 审批、发布、回滚
→ MEM-01 MemoryAdapter 预留
~~~

## 第一阶段必须看到的结果

无 Key Fixture 也能运行：

1. Schema 校验；
2. 来源和未知项校验；
3. 工具权限校验；
4. 审批后单次执行；
5. 中断恢复和 Artifact 幂等；
6. 跨项目读取拒绝；
7. Provider usage/cache/reasoning 的 unknown 语义；
8. 过期事实和 SPEC 冲突阻止静默执行。

## 主窗口不可做的事

- 不自动修改正式代码、权限、状态机或 Provider；
- 不自动注册或启用 Bot；
- 不自动启用 Routine；
- 不自动外发、发布或支付；
- 不将 Fixture、模型自评或单次 HTTP 200写成质量证明；
- 不修改 /Users/m4air/AI产品经理工作台；
- 不读取凭据、Cookie、Token 或项目外敏感路径；
- 不把 proposal 改写成 DONE。

## 每个实现单元的交付格式

~~~text
实现：改了哪些文件
验证：运行了什么测试/回放
证据：validation、receipt、hash 或报告路径
边界：哪些仍未验证
下一步：只有一个明确动作
~~~

## 当前交接结论

本交接已经把研究结论转成可实施的增量方案，但代码尚未开始修改。
主窗口接手后的第一项不是增加更多 Agent，而是建立可独立证明结果好坏的评测底座；
只有评测底座稳定后，才允许受控 RSI 生成候选改进。
