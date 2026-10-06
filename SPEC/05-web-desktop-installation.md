# Web, Desktop and Clean-room Installation

Stack: pnpm workspace, TypeScript, React + Vite, Node local server, SQLite persistence boundary, and a thin Electron shell. Web and Desktop call the same local control plane; business logic is not duplicated.

Required commands:

```text
pnpm install
pnpm setup
pnpm demo
pnpm dev
pnpm package:mac
```

The repository must include a no-key fixture path, DeepSeek configuration instructions, Codex capability probe, environment diagnostics, privacy/permission notes, known limitations and a clean-room checklist. Until dependencies are installed and the app is launched on a real machine, packaging remains `built` or `verified`, not reality-validated.
