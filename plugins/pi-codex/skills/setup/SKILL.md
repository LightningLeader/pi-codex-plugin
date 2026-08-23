---
name: setup
description: "Check Pi CLI installation, provider configuration, models, and pi-subagents readiness for pi-codex-plugin. Use for setup and troubleshooting, not for running a task."
---

# Pi Setup

Treat the directory containing this `SKILL.md` as `<skill-root>`. Resolve `<plugin-root>` as `<skill-root>/../..`. Do not assume a fixed checkout path.

Run `node <plugin-root>/scripts/pi-companion.mjs setup` with the user's options.

If the check reports `spawnSync ... EPERM`, treat it as a sandbox execution failure rather than evidence that Node or Pi is missing. Retry with the required sandbox permission when available; otherwise verify `command -v node`, `node --version`, `command -v pi`, and `pi --version` and report the check as inconclusive.

Return the verified setup report.
