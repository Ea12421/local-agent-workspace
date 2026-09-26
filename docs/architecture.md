# Architecture Notes

The core is an explicit state machine and versioned workspace schema. LangGraph or Agents SDK may be added behind an execution interface after a spike; they are not the source of truth. Pi, Hermes and OpenHands are audited as optional runtimes, not v1 dependencies. This keeps the product portable and makes provider, permission and recovery behavior inspectable.

The most important distinction is between a model channel and an execution agent. DeepSeek answers model calls. Codex SDK/CLI can run a local agent with workspace access. They produce different receipts and have different billing/auth semantics.
