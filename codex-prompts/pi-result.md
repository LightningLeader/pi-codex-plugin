Show the stored final output of a finished Pi job.

1. Resolve the plugin root: `PI_ROOT="${PI_PLUGIN_ROOT:-$HOME/pi-codex-plugin}"`.
2. Run: `node "$PI_ROOT/plugins/pi-codex/scripts/pi-companion.mjs" result $ARGUMENTS`
3. Return the command's stdout verbatim.

Requires a job id (get one from `/pi-status`).
