Continue a completed Pi task in its original live RPC process and return Pi's output verbatim.

1. Resolve the plugin root: `PI_ROOT="${PI_PLUGIN_ROOT:-$HOME/pi-codex-plugin}"`.
2. Run: `node "$PI_ROOT/plugins/pi-codex/scripts/pi-companion.mjs" continue $ARGUMENTS`.
3. Return the command's stdout verbatim — no paraphrasing or commentary.

Usage:

- `--job <job-id>` selects the task whose live Control Session must be reused.
- A leading `task-...` argument is also accepted as the job id.
- Without a job id, the newest idle live task session in this workspace is selected.
- `--background` returns a continuation job id immediately.
- `--out-file <path>` writes a foreground result to a file.

This command is strict. If the original Control Session or Pi RPC process is unavailable or busy, return the error. Never start a replacement RPC process and never silently fall back to disk-session resume.
