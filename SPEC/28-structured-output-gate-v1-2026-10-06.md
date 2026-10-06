# 结构化输出校验门 v1

## 决策

本项目区分两类结果：

- `text`：给人阅读的自然语言或 Markdown，不强制 JSON。
- `structured`：要交给下一个 Bot、Artifact（产物）流程或程序继续消费的结果，必须有 `outputSchema`（输出结构定义）并通过校验。

这道门是结果交接边界，不是所有聊天的统一格式要求。

## 校验顺序

```text
Provider 输出
→ JSON 解析（exact / fenced / embedded）
→ 单对象检查
→ outputSchema 必填字段、类型和额外字段检查
→ provider.output-validation 回执
→ 通过：允许下游继续
→ 失败：Run failed，不生成下游 Artifact
```

`embedded` 允许模型在唯一 JSON 对象外带少量说明，但回执必须记录解析模式。后续如果某个外部协议要求“整段只能是 JSON”，再把该入口升级为 exact-only；不把这个限制扩散到人看型任务。

## 当前实现

- `RunRequest.outputMode` 标记 `text` 或 `structured`。
- `CodexExecutionOptions` 传递结构模式和 schema；结构模式会把“只返回一个 JSON 对象”的约束加入模型请求。
- 通用校验支持 object、array、string、number、integer、boolean、null、required、properties、items、additionalProperties=false 和 enum。
- 校验结果追加为 `provider.output-validation` 事件；失败使用 `provider_output_schema_invalid`，并阻止 Run 成功。
- 现有 Product Builder DeepSeek 草稿继续使用自己的领域 schema 校验，不被替换。

## 验收

1. 普通 `text` Run 的自然语言结果仍可成功。
2. 合法 `structured` JSON 通过并记录校验事件。
3. 缺必填字段、类型错误、未知字段、多对象、数组根结果或破损 JSON 不能进入下游。
4. 校验失败有 RunEvent 和 receipt（运行回执），且没有 `run.succeeded` 或下游 Artifact。
5. 真实 Codex 固定任务只验证受控结构和来源，不把格式通过写成模型质量证明。
