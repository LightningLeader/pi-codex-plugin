Terminate a running background Pi job.

1. Resolve the plugin root: `PI_ROOT="${PI_PLUGIN_ROOT:-$HOME/pi-plugin-cc}"`.
2. Run: `node "$PI_ROOT/plugins/pi/scripts/pi-companion.mjs" cancel $ARGUMENTS`
3. Return the command's stdout verbatim.

Requires a job id (get one from `/pi-status`).
