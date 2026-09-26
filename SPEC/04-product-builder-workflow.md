# Product Builder Workflow

```text
idea -> clarify unknowns -> plan -> Research -> Product -> Architecture -> Evaluation -> conflict check -> user approval -> artifacts + execution plan
```

Each node consumes versioned input references and emits a schema-checked output. Research facts require a Source or are marked unknown. Product output contains user, scenario, pain, value proposition and MVP boundary. Architecture output contains options, trade-offs, dependencies, cost/complexity risks and a recommended path. Evaluation output contains success metrics, fixed test tasks and bad cases.

The first evaluation compares: direct single call, one structured Bot workflow, and structured multi-Bot handoffs. Multi-Bot remains default only if ten fixed tasks achieve at least eight hard-constraint passes and either reduce human edits by 20% or improve the rubric by one level without more than 2x cost/latency.
