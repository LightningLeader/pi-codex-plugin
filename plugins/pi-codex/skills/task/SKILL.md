---
name: task
description: "Delegate an investigation or implementation task to the Pi coding agent. Use when the user asks Codex to hand work to Pi, including foreground, background, supervised-background, and effort modes."
---

# Pi Task

Treat the directory containing this `SKILL.md` as `<skill-root>`. Resolve `<plugin-root>` as `<skill-root>/../..`. Do not assume a fixed checkout path.

Run `node <plugin-root>/scripts/pi-companion.mjs task` with the user's task as the prompt. Translate the user's natural-language execution preferences into CLI options; do not require them to spell out flags.

- Add `--write` for implementation or file-changing work. Omit it for investigation, explanation, diagnosis, review, or any explicitly read-only request. The runtime default without this flag is read-only.
- Add `--background` when the user asks to run asynchronously or in the background.
- Treat requests for supervision, a watcher, or completion notification as supervised background mode even when the user does not name `--supervised`.
- Translate an explicit request for low, normal, high, or maximum reasoning into the closest supported `--effort` value; otherwise leave Pi's default unchanged.
- Use `--resume-last` when the user explicitly wants the newest persisted Pi task history for the current repository, but not when they require the exact original live process.
- Pass through requested `--effort`, `--out-file`, `--fresh`, or legacy resume options.
- Prefer the `pi-codex:continue` skill when the user wants to reuse the exact original live RPC process. Legacy `--resume-last` starts a replacement RPC from persisted Pi history.

Return Pi's output without paraphrasing. A background launch should return its job ID for later status checks.

## Supervised background mode

Treat `--supervised` as a Codex orchestration option, not as a CLI flag:

1. Accept an optional `--poll-interval-ms <milliseconds>` alongside `--supervised`. Require a finite integer of at least 100; if omitted, use the watcher CLI default of 10000 milliseconds. Remove both orchestration options before launching Pi so they are not included in the task prompt or passed to the task CLI.
2. Add `--background --json` and launch the Pi task normally. Parse the exact `jobId` from its JSON output and retain the resolved workspace root used for the launch.
3. Use the collaboration agent listing to count active agents whose task name starts with `pi_watch_`. Allow at most two such watchers. If there is no slot, report that the Pi job is running unsupervised and include its Job ID; do not cancel or relaunch it.
4. Spawn one subagent with `fork_turns: "none"` and a task name beginning `pi_watch_`. Give it only the resolved `<plugin-root>`, workspace root, Job ID, and optional polling interval. Instruct it to:
   - run `node <plugin-root>/scripts/pi-companion.mjs watch <job-id> --cwd <workspace-root> --json`, appending `--poll-interval-ms <milliseconds>` when the user supplied it;
   - invoke that blocking watcher command exactly once and let its Node process perform all polling; do not repeatedly call `status`, emit periodic commentary, or use model turns between checks;
   - wait for that command to finish, without editing files, cancelling, retrying, or starting Pi;
   - report only the Job ID, terminal status, summary, and whether a stored result is available; do not retrieve or restate the full result. When collaboration messaging is available, send the same compact completion notice to `/root` before returning it.
5. Do not call the parent-side agent wait function. Return immediately with the Pi Job ID, watcher agent ID, and effective polling interval. If spawning fails, say explicitly that the already-started Pi job is unsupervised.

The watcher sidecar is durable and visible in Pi Control Center, so completion remains discoverable even when an unsolicited chat notification cannot be displayed. This single-command design keeps waiting token-light: polling happens in Node without repeated model inference.
