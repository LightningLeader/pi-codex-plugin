List active and recent Pi jobs in this repository.

1. Resolve the plugin root: `PI_ROOT="${PI_PLUGIN_ROOT:-$HOME/pi-plugin-cc}"`.
2. Run: `node "$PI_ROOT/plugins/pi/scripts/pi-companion.mjs" status $ARGUMENTS`
3. Return the command's stdout verbatim.

Optionally pass a job id, and `--wait` to block until it finishes.
