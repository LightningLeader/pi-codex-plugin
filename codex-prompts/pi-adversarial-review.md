Run a Pi adversarial review — one that challenges the approach itself — and return its output verbatim.

1. Resolve the plugin root: `PI_ROOT="${PI_PLUGIN_ROOT:-$HOME/pi-codex-plugin}"`.
2. Run: `node "$PI_ROOT/plugins/pi-codex/scripts/pi-companion.mjs" adversarial-review $ARGUMENTS`
3. Return the command's stdout verbatim — no paraphrasing, no commentary, no fixes.

Any non-flag text in the arguments is treated as the review focus. Pass-through flags: `--base <ref>`, `--scope`, `--model <id>`, `--effort <level>`.
Panel mode: `--models <m1,m2,...>` (2+ models) runs the adversarial review with every listed model in parallel and merges the findings, consensus first.
