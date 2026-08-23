---
name: review
description: "Run a Pi code review of the current local Git state. Use when the user asks Pi to review code, a working tree, or a branch; do not implement fixes unless separately requested."
---

# Pi Review

Treat the directory containing this `SKILL.md` as `<skill-root>`. Resolve `<plugin-root>` as `<skill-root>/../..`. Do not assume the plugin lives under `$HOME` or use a separate source checkout.

Run `node <plugin-root>/scripts/pi-companion.mjs review` with any user-supplied `--base`, `--scope`, `--model`, `--models`, `--effort`, `--shards`, `--incremental`, or `--out-file` options.

Return Pi's output without paraphrasing and do not apply fixes. If Pi is unavailable or unconfigured, recommend the `pi-codex:setup` skill.
