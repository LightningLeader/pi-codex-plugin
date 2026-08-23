Start, inspect, or stop the local Pi RPC web control center.

1. Resolve the plugin root: `PI_ROOT="${PI_PLUGIN_ROOT:-$HOME/pi-codex-plugin}"`.
2. Run: `node "$PI_ROOT/plugins/pi-codex/scripts/pi-companion.mjs" ui $ARGUMENTS`
3. Return stdout verbatim. Do not open the browser automatically.

Use `--background` to keep it running, `--status` to print the authenticated URL,
and `--stop` to terminate it. The default address is local-only on port 43120.
