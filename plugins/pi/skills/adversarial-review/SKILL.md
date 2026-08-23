---
name: adversarial-review
description: "Run a Pi adversarial code review that challenges the implementation approach itself. Use for requested skeptical, architectural, or assumption-focused reviews; do not implement fixes."
---

# Pi Adversarial Review

Treat the directory containing this `SKILL.md` as `<skill-root>`. Resolve `<plugin-root>` as `<skill-root>/../..`. Do not assume a fixed checkout path.

Run `node <plugin-root>/scripts/pi-companion.mjs adversarial-review`, passing the user's focus text and any supplied `--base`, `--scope`, `--model`, `--models`, `--effort`, `--shards`, `--incremental`, or `--out-file` options.

Return Pi's output without paraphrasing or applying fixes.
