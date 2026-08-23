---
description: Continue a completed Pi task in its original live RPC process
argument-hint: "[--background] [--job <job-id>] [--out-file <path>] [follow-up instruction]"
allowed-tools: Bash(node:*)
---

Continue an existing Pi task in the exact Control Session and RPC process that handled its previous job.

Run exactly one command:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/pi-companion.mjs" continue $ARGUMENTS
```

Return the command's stdout verbatim. Do not paraphrase or add commentary.

Rules:

- With `--job <job-id>`, continue the Control Session associated with that job.
- A leading `task-...` argument is also accepted as the job id.
- Without a job id, continue the newest idle live task session for the current Claude session and workspace.
- `--background` returns immediately with the new continuation job id; foreground is the default.
- The operation is strict: if the original Control Session or RPC process is unavailable, return the error. Never fall back to spawning a new Pi process or loading only the disk session.
- If the original session is busy, return the conflict. Do not queue, steer, or follow up implicitly.
- If no instruction is supplied, ask the user what Pi should continue doing.
