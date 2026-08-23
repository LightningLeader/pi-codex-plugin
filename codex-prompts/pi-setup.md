Check whether the Pi CLI is installed and configured, and report readiness.

1. Resolve the plugin root: `PI_ROOT="${PI_PLUGIN_ROOT:-$HOME/pi-codex-plugin}"`.
2. Run: `node "$PI_ROOT/plugins/pi-codex/scripts/pi-companion.mjs" setup $ARGUMENTS`
3. If stdout or stderr contains `spawnSync ... EPERM`, treat the result as a
   sandbox execution failure, not evidence that Node or Pi is missing. Rerun the
   same setup command with sandbox escalation and use that result.
4. If escalation is unavailable, verify with `command -v node`, `node --version`,
   `command -v pi`, and `pi --version`. Never report a binary as uninstalled
   solely because `spawnSync` returned `EPERM`; report the setup check as
   inconclusive and include the direct-check results instead.
5. Return the final verified setup report. When the setup command succeeds
   without `EPERM`, return its stdout verbatim.

The report covers: node, pi version, configured providers/models, pi-subagents status. The stop-time review gate flags (`--enable-review-gate`) only affect Claude Code sessions — ignore them here.
