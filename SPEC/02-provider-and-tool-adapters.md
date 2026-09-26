# Provider and Tool Adapters

## Three boundaries

1. `ModelProviderAdapter`: raw model/API calls. DeepSeek remains the first external API channel.
2. `ExecutionAgentAdapter`: local execution agents. The installed official Codex CLI is the first usable execution path; the optional `@openai/codex-sdk` package can be added after npm access is restored. It is not a drop-in raw model provider.
3. `ToolRuntime/SandboxAdapter`: filesystem, Git, shell, search and artifact tools under a permission policy.

`ProviderIdentity` must record harness, provider, model, auth mode, billing source and `isMock`. Capabilities include streaming, tool calling, structured output, cancellation, resume and provider-specific reasoning-content behavior.

## DeepSeek boundary

OpenAI/Anthropic-compatible request shapes do not imply identical behavior. Thinking plus tool calling must preserve the provider's reasoning content and tool-call fields. Capability probes and receipts record what was actually available.

## Codex boundary and current route

Probe and execute only through the installed public CLI/SDK path. Do not read credentials or cookies, and do not infer plan or subscription quota from model style or API usage. The current verified route is `codex exec --json` with a read-only sandbox. The adapter records `authMode=subscription` when `codex login status` reports a ChatGPT login, but keeps `billingSource=unknown` because the CLI does not expose billing proof. If login or capability state is unavailable, report `experimental/blocked` and keep Fixture/DeepSeek usable.

The adapter emits the CLI's JSONL events as `RunEvent` records, supports cancellation, and deliberately reports `resume=false` until a saved Codex session ID is wired to `codex exec resume`. A successful CLI probe is evidence for the execution bridge only; it does not prove DeepSeek availability, UI packaging, or user productivity.

## Tool permissions

Chinese UI labels map to `read_only`, `workspace_write`, and `full_access`. External sends, important deletion/overwrite, sensitive paths, production configuration, payment/publish and credential access always require a one-off approval.
