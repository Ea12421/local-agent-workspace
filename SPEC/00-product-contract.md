# Product Contract v1

## Product

Local Agent Workspace is a local-first workspace for projects and configurable Bots. A Bot has a responsibility, input/output schemas, tools, permission tier, provider policy, memory policy and observable Runs. The first built-in Bot is Product Builder.

## Primary user and job

Primary user: an AI builder or AI product manager working alone. Job: turn a product idea into a traceable research packet, product brief, technical proposal, evaluation plan and executable next steps.

## In scope

- Local project and Bot management.
- Explicit Run state machine and append-only events.
- Structured Bot handoff, approvals, sources and artifacts.
- Fixture execution without a key.
- DeepSeek as a real model channel when configured.
- Official Codex CLI/SDK as an optional local execution bridge, with separate provenance.
- Web UI and thin Electron shell over one local control plane.

## Out of scope

Cloud multi-user, background monitoring, automatic external messaging/publishing, credential-file reading, self-escalating Bots, unknown dependency installation, and Computer Use as a v1 acceptance requirement.

## Done means

A clean checkout can run the fixture demo, start the local server, inspect a Run timeline, see an approval boundary and Artifact references, and run the focused domain tests. Real-provider and desktop packaging results must be labeled separately from fixture evidence.
