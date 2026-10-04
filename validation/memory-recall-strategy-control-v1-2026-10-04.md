# RSI 记忆策略可控运行验证

日期：2026-10-04（Asia/Shanghai）

## 这次完成了什么

受控自动更新（RSI）现在可以为单次运行选择两种历史记忆召回方式：

- **关键词模式（lexical，默认）**：保持原有行为。
- **混合模式（hybrid）**：在关键词覆盖之外加入短语连续性和时间新鲜度。

选择只对这一次运行生效。实际选择会同时写入 `improvement.run_started`、候选提案和 Web 回读结果，所以之后可以知道这次运行到底用了哪种方式。

## 验证结果

- 请求 `hybrid`：接受，候选提案回读为 `hybrid`。
- RunEvent 回放：`improvement.run_started.data.memoryStrategy` 回读为 `hybrid`。
- 非法策略：HTTP 400 拒绝，不会创建 RSI 运行。
- 同一幂等键：仍然只产生一次副作用。
- 高风险目标：仍然停在逐次审批边界，没有因为增加策略选择而自动发布。
- Web：出现“关键词模式（默认）/混合模式”选择器；构建通过。本单元没有重复做 Computer Use 视觉回归。

## 证据边界

这一步证明“策略可以被选择、记录、回放和拒绝非法输入”。它没有证明混合模式已经在真实项目中整体更好，也没有把固定基准的排序改善升级为模型质量或真人提效结论。默认仍为关键词模式，后续只有在真实项目样本或新的固定评测证据支持时，才讨论切换默认值。

可重跑检查：

```text
npm run typecheck
node --experimental-strip-types --test apps/server/src/memory-adapter.test.ts apps/server/src/improvement-runtime.test.ts apps/server/src/improvement-http.test.ts
npm run test:all
npm run build:web
```
