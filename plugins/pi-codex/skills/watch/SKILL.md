---
name: watch
description: "Attach a lightweight Codex subagent to an existing Pi background job so the main conversation can continue while completion is monitored."
---

# Pi Watch

Treat the directory containing this `SKILL.md` as `<skill-root>`. Resolve `<plugin-root>` as `<skill-root>/../..`. Do not assume a fixed checkout path.

Require an explicit Pi Job ID. Accept an optional `--poll-interval-ms <milliseconds>` and require a finite integer of at least 100; when omitted, the watcher CLI checks every 10000 milliseconds. Resolve the current workspace root. Use the collaboration agent listing to count active agents whose task name starts with `pi_watch_`; allow at most two concurrent Pi watchers.

Spawn one subagent with `fork_turns: "none"` and a task name beginning `pi_watch_`. Give it only `<plugin-root>`, the workspace root, and the Job ID. Its task is to run:

`node <plugin-root>/scripts/pi-companion.mjs watch <job-id> --cwd <workspace-root> --json [--poll-interval-ms <milliseconds>]`

Invoke the blocking watcher command exactly once and let its Node process perform all polling. Do not repeatedly call `status`, emit periodic commentary, or use model turns between checks. The watcher must not edit files, cancel or retry the job, start another Pi process, or retrieve a large result. At terminal status it should report only the Job ID, final status, summary, and `resultAvailable`; when collaboration messaging is available, it should send that compact notice to `/root` before returning it.

Do not wait for the subagent from the parent conversation. Return the watcher agent ID and effective polling interval immediately. If no slot is available or spawning fails, report that no watcher was attached; do not alter the Pi job.
