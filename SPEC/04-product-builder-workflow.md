# Product Builder Workflow

```text
idea -> clarify unknowns -> plan -> Research -> Product -> Architecture -> Evaluation -> conflict check -> user approval -> artifacts + execution plan
```

## Clarify/Planner contract v1

The fixture workflow exposes two deterministic projections before the four Bot handoffs:

- `clarifications`: `target_user`, `primary_scenario`, `success_metric`, and
  `external_evidence`. Each item records `status` (`provided` or `unknown`), `sourceRefs`,
  and whether it is blocking. Unknowns are questions to resolve; they are not external
  facts and must not create a `Source` entity.
- `plan`: fixed steps for `clarify -> research -> product -> architecture -> evaluation ->
  approval -> release`. Each step has a stable id, owner Bot, dependencies, and status.
  Missing blocking clarifications set downstream steps to `blocked` and add
  `clarification_pending` to `releaseBlockers`. The approval gate remains explicit and
  remains `waiting_user` when the clarifications are complete.

An empty idea is rejected before a user-input Source is created. The plan id and step ids,
clarification ids, and checkpoint idempotency keys are stable for the same logical input, so
replay can compare the structure without relying on random Artifact or Handoff ids.

Each node consumes versioned input references and emits a schema-checked output. Research facts require a Source or are marked unknown. Product output contains user, scenario, pain, value proposition and MVP boundary. Architecture output contains options, trade-offs, dependencies, cost/complexity risks and a recommended path. Evaluation output contains success metrics, fixed test tasks and bad cases.

Before final Artifact release, the workflow validates the Handoff graph. A missing parent, parent cycle, or depth above the configured maximum blocks release and leaves the generated artifacts as drafts. It also checks that every Handoff input and Artifact source reference resolves, and that two artifacts with the same kind disagree only through an explicit conflict record. Unresolved conflicts or a pending approval leave `artifactRelease=blocked` and `finalArtifactIds=[]`.

The release projection is persisted inside Product Builder checkpoint events as `product-builder.release-state.v1`. It includes `artifactRelease`, `finalArtifactIds`, `conflicts`, `handoffValidation`, and `releaseBlockers`, so a SQLite reopen or HTTP replay can distinguish drafts from final Artifacts. Checkpoint replay is idempotent. For legacy checkpoint events that predate this projection, the next bounded replay appends one `product_builder.state_checkpoint` event with `source=legacy_backfill`; it does not infer a release state from missing data. Approval resolution alone does not promote drafts: a future reconcile step must explicitly verify the approval and write a new released state.

The first evaluation compares: direct single call, one structured Bot workflow, and structured multi-Bot handoffs. Multi-Bot remains default only if ten fixed tasks achieve at least eight hard-constraint passes and either reduce human edits by 20% or improve the rubric by one level without more than 2x cost/latency.

## Real Provider draft boundary (R4)

真实 Provider 第一步只允许生成 **draft**，不直接替换确定性 Product Builder 结果：

1. Provider 请求使用固定的 `PRODUCT_BUILDER_DRAFT_OUTPUT_SCHEMA`；
2. 输出必须包含用户、场景、痛点、价值、MVP、未知项、成功指标、来源引用和 `approval_required=true`；
3. 结构化解析或字段校验失败时，Run 失败且不创建正式 Artifact；
4. 通过校验的结果只作为可审阅草稿，仍需进入现有 Approval/Conflict Check；
5. `ProductBuilderResult`、Handoff 图和 release projection 继续由本地 workflow 控制，模型不能自我注册 Bot、扩大权限或绕过审批；
6. Fixture 仍是无 Key 的正式演示路径，真实 Provider 只能作为可切换的草稿来源。

当前已落地 Provider draft 类型、固定输出 Schema 和 fail-closed validator；真实 API 草稿端到端接入和批准后 promotion 仍是后续增量。
