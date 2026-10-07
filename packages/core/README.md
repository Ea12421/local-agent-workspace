# `@agent-workspace/core`

Framework-free domain contracts for the local Agent Workspace.

The package owns the `Run` state machine and append-only `RunEvent` stream. Provider adapters, tools, the SQLite repository, and the Web/Electron shells depend on these contracts; none of them may silently replace the state machine as the source of truth.

## Run lifecycle

```text
queued -> running -> waiting_user -> running
                 \-> succeeded
                 \-> failed -> queued (retry)
queued/running/waiting_user -> cancelled
```

`transitionRun` is pure. `InMemoryRunStore` is a fixture/test repository and keeps event sequences append-only. A later SQLite repository should implement `RunStore` and preserve the same transition and event semantics.
