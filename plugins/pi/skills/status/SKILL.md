---
name: status
description: "List active and recent Pi jobs or inspect one Pi job in the current repository. Use for Pi progress, running-state, PID, or wait requests."
---

# Pi Status

Treat the directory containing this `SKILL.md` as `<skill-root>`. Resolve `<plugin-root>` as `<skill-root>/../..`. Do not assume a fixed checkout path.

Run `node <plugin-root>/scripts/pi-companion.mjs status` with an optional job ID and requested `--all`, `--json`, or `--wait` options. `--wait` requires a job ID.

Return stdout without paraphrasing.
