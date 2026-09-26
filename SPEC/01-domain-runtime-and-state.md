# Domain, Runtime and State

## Single source of truth

The TypeScript control plane owns Project, BotProfile, Run, RunEvent, Handoff, ApprovalRequest, Source, Artifact and MemoryItem contracts. Third-party orchestration libraries may execute nodes but may not own business state.

## Run state machine

`queued -> running -> waiting_user -> running -> succeeded|failed|cancelled`.
`running -> failed|cancelled`; `failed -> queued` only through an explicit retry action. Every transition appends one immutable event with sequence, actor, timestamp and correlation id.

## Recovery

The runtime must support cancellation, retry, replay and restart recovery. v1 includes an in-memory store for deterministic tests and an append-only JSONL fallback. The persistence boundary includes a SQLite schema with a unique `(run_id, sequence)` constraint; switching storage must not change HTTP or domain contracts.

## Acceptance

- Illegal transitions fail with a typed error.
- Events cannot be reordered, duplicated or silently overwritten.
- A resumed Run has a receipt containing status, provider identity, tool calls, approvals and artifact refs.
