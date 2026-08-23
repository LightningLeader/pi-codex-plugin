---
name: continue
description: "Continue a completed Pi task in its exact original live Control Session and RPC process. Use for follow-up work that must reuse the same Pi process rather than resume history in a new process."
---

# Pi Live Continue

Treat the directory containing this `SKILL.md` as `<skill-root>`. Resolve `<plugin-root>` as `<skill-root>/../..`. Do not assume a fixed checkout path.

Run `node <plugin-root>/scripts/pi-companion.mjs continue` with the follow-up instruction.

When Codex invokes this command through its shell execution tool, request sandbox escalation for the
command (`sandbox_permissions: require_escalated`) with a concise justification that live continuation
must connect to the user's local Pi Control Center over loopback. The ordinary Codex sandbox can deny
`127.0.0.1` with `EPERM` even while the Control Center and RPC process are healthy.

- Pass `--job <job-id>` when supplied. A leading `task-...` or `session-...` reference is also accepted.
- Without a reference, the command selects the newest idle live task for the current caller and workspace.
- Pass through `--background` and `--out-file` when requested.
- This operation is strict. If the original Control Session is missing, busy, disconnected, or its RPC process exited, return the error. Never start a replacement RPC or fall back to disk-session resume.

Return Pi's output without paraphrasing.
