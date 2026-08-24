---
name: setup
description: "Check Pi CLI installation, provider configuration, models, Windows Bash, and pi-subagents readiness for pi-codex-plugin. Use for setup and troubleshooting, not for running a task."
---

# Pi Setup

Treat the directory containing this `SKILL.md` as `<skill-root>`. Resolve `<plugin-root>` as `<skill-root>/../..`. Do not assume a fixed checkout path.

Run `node <plugin-root>/scripts/pi-companion.mjs setup` with the user's options. Setup starts or reuses the Pi Control Center for the resolved workspace by default. Pass `--no-ui` only when the user explicitly opts out of automatic Control Center startup.

If the check reports `spawnSync ... EPERM`, treat it as a sandbox execution failure rather than evidence that Node or Pi is missing. Retry with the required sandbox permission when available; otherwise verify `command -v node`, `node --version`, `command -v pi`, and `pi --version` and report the check as inconclusive.

Return the verified setup report and the authenticated Control Center URL exactly as emitted. Do not open a browser automatically. Remind the user to keep the token private when a URL is returned.
