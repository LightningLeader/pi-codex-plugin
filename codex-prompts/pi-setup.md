Check whether the Pi CLI is installed and configured, and report readiness.

1. Resolve the plugin root: `PI_ROOT="${PI_PLUGIN_ROOT:-$HOME/pi-plugin-cc}"`.
2. Run: `node "$PI_ROOT/plugins/pi/scripts/pi-companion.mjs" setup $ARGUMENTS`
3. Return the command's stdout verbatim.

The report covers: node, pi version, configured providers/models, pi-subagents status. The stop-time review gate flags (`--enable-review-gate`) only affect Claude Code sessions — ignore them here.
