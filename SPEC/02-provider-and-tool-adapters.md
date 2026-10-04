# Provider and Tool Adapters

> 底层可移植性、模型消息、工具调用、上下文注入、用量和提示词缓存的统一契约见 [`SPEC/09-provider-portability-and-tool-contract.md`](./09-provider-portability-and-tool-contract.md)。本文件保留 Adapter 边界和当前实现状态；它不表示不同 Provider 可以只替换名称后直接互换。

## Three boundaries

1. `ModelProviderAdapter`: raw model/API calls. DeepSeek remains the first external API channel.
2. `ExecutionAgentAdapter`: local execution agents. The installed official Codex CLI is the first usable execution path; the optional `@openai/codex-sdk` package can be added after npm access is restored. It is not a drop-in raw model provider.
3. `ToolRuntime/SandboxAdapter`: filesystem, Git, shell, search and artifact tools under a permission policy.

`ProviderIdentity` must record harness, provider, model, auth mode, billing source and `isMock`. Capabilities include streaming, tool calling, structured output, cancellation, resume and provider-specific reasoning-content behavior.

## DeepSeek boundary

OpenAI/Anthropic-compatible request shapes do not imply identical behavior. Thinking plus tool calling must preserve the provider's reasoning content and tool-call fields. Capability probes and receipts record what was actually available. 当前 `DeepSeekApiAdapter` 仍是 one-shot 请求；另有独立的 `DeepSeekToolLoopProvider` 供控制面显式调用，只开放受控的 `filesystem.read`。它把内部的 `filesystem.read` 映射为 DeepSeek 接受的 `filesystem_read` 函数名，再把返回名映射回领域契约；这不是把所有工具权限都开放给模型。streaming、JSON Schema 输出、崩溃后跨进程 provider 历史恢复仍未完成。

Prompt caching is an optional provider-reported optimization. The control plane may calculate a stable-prefix hash, but a cache hit, write, or cached-token count is only recorded when the provider exposes it. Codex CLI currently has no stable cache metric in the public receipt, so its cache state remains `unknown`.

The current DeepSeek request contract also renders `input`, `inputRefs`, `constraints`, `outputSchema`, and verified recovery context into the provider message instead of silently dropping them. Offline fake-fetch coverage proves request fidelity and explicit HTTP/JSON failures; it does not prove a real key, network, provider quality, or cache hit.

## Codex boundary and current route

Probe and execute only through the installed public CLI/SDK path. Do not read credentials or cookies, and do not infer plan or subscription quota from model style or API usage. The current verified route is `codex exec --json` with a read-only sandbox. The adapter records `authMode=subscription` when `codex login status` reports a ChatGPT login, but keeps `billingSource=unknown` because the CLI does not expose billing proof. If login or capability state is unavailable, report `experimental/blocked` and keep Fixture/DeepSeek usable.

The adapter emits the CLI's JSONL events as `RunEvent` records, supports cancellation, and deliberately reports `resume=false` until a saved Codex session ID is wired to `codex exec resume`. A successful CLI probe is evidence for the execution bridge only; it does not prove DeepSeek availability, UI packaging, or user productivity.

## Tool permissions

Chinese UI labels map to `read_only`, `workspace_write`, and `full_access`. External sends, important deletion/overwrite, sensitive paths, production configuration, payment/publish and credential access always require a one-off approval.

## M3-06 sandbox boundary status

The first sandbox unit is implemented as pure guards in `packages/adapters/src/sandbox.ts`:

- `resolveSandboxPath` rejects absolute paths, `..` traversal, project-outside paths and symlink escape; an explicitly allowed symlink still has to resolve inside the real workspace root.
- `isAllowedCommand` matches the complete argv vector against `ToolPolicy.allowedCommands`. The executable string is matched exactly, so an absolute path must be explicitly allowlisted. Shell interpreters, `-c`/`--command`, shell metacharacters and unlisted arguments are rejected.
- `canUseSandboxOperation` enforces `filesystem`/`shell` allowlists and prevents `read_only` from writing.

The first controlled ToolRuntime slice now exists in `packages/adapters/src/tool-runtime.ts`. `FixtureToolRuntime` only validates policy/path/argv boundaries and returns deterministic dry-run/fixture receipts. `LocalToolRuntime` supports explicitly selected local execution for workspace-bounded filesystem reads, bounded atomic writes with approval, and the two read-only Git commands `git status --short` and `git diff --stat`. It records idempotent receipts, redacts common credential-shaped values from read/command output, and never enables delete, arbitrary Shell, or external access. The Tool Loop defaults to `fixture`; callers must explicitly select `toolRuntimeMode=local`, so the Web/Product Builder path remains fixture/read-only unless a controlled local route is intentionally invoked. Complete secret redaction, broader timeout/error classification, and real Provider Tool Loop remain deferred.

### M3-06 real read-only filesystem increment (2026-09-29)

- `mode=local` + `filesystem/read` is the only real execution path;
- `read_only` policy and `allowedTools: ['filesystem']` are required;
- `..`, absolute paths, symlink escapes, directories, and unsupported operations fail with a `tool_*` error code;
- reads are capped at 256 KB (default 64 KB) and return relative path, byte count, truncation flag, redacted content and hashes;
- repeated `requestId` returns the original result without a second read;
- this increment is a controlled capability proof, not permission to expose arbitrary credentials or modify the workspace.

### M3-07d explicit local Tool Loop bridge (2026-09-30)

- `runToolLoop` accepts an explicit `toolRuntimeMode`; the default remains `fixture` and `local` is opt-in.
- The local slice is limited to a workspace-bounded `filesystem.read` under a `read_only` policy; the model → tool call → real file read → tool result → next model → artifact event sequence is covered by a focused test.
- This does not expose workspace writes, delete, arbitrary Shell, DeepSeek calls, or a real model Tool Loop through the Web UI.

### M3-07e real DeepSeek read-only Tool Loop (2026-10-02)

- `deepseek-tool-loop` is a separate Web/API route; it reads `DEEPSEEK_API_KEY` from the server process environment and never persists or displays the key.
- The control plane exposes only `filesystem.read` under `read_only`; the real `LocalToolRuntime` performs the read and emits `tool.invoked`/`tool.completed` events before the next model segment.
- A real smoke run completed with `provider.event → tool.invoked → tool.completed → provider.event → artifact.created → run.succeeded`. The requested label was `deepseek-chat`, while the provider response reported `deepseek-flash`; receipts preserve both requested and actual model metadata.
- The provider-reported prompt-cache fields are recorded as `miss` for this run. This is an observation, not a cost-saving or long-task cache guarantee. The observed response did not include `reasoning_content`; the replay path is covered offline but a thinking-model replay remains a separate verification item.
- Evidence: [`validation/deepseek-tool-loop-v1-2026-10-02.json`](../validation/deepseek-tool-loop-v1-2026-10-02.json). This proves one real read-only loop, not model quality, cost efficiency, or cross-process recovery.
