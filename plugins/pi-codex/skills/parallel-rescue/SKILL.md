---
name: parallel-rescue
description: "Run multiple independent Pi tasks in parallel through pi-subagents. Use when the user explicitly provides separable tasks for parallel delegation."
---

# Pi Parallel Rescue

Treat the directory containing this `SKILL.md` as `<skill-root>`. Resolve `<plugin-root>` as `<skill-root>/../..`. Do not assume a fixed checkout path.

Confirm `~/.pi/agent/npm/node_modules/pi-subagents` exists. If it does not, tell the user to run `pi install npm:pi-subagents` and stop.

Read `<plugin-root>/prompts/parallel-rescue.md`, replace `{{TASKS_LIST}}` with the user's enumerated independent tasks, then run:

`node <plugin-root>/scripts/pi-companion.mjs task --write "<constructed prompt>"`

Return Pi's output without paraphrasing.
