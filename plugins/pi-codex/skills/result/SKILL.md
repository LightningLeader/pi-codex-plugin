---
name: result
description: "Show the stored final output of a completed Pi job. Use when the user asks to retrieve a Pi result by job ID."
---

# Pi Result

Treat the directory containing this `SKILL.md` as `<skill-root>`. Resolve `<plugin-root>` as `<skill-root>/../..`. Do not assume a fixed checkout path.

Run `node <plugin-root>/scripts/pi-companion.mjs result <job-id>` with requested `--json` or `--out-file` options. If no job ID was provided, ask for one or use the status skill to discover it.

Return stdout without paraphrasing.
