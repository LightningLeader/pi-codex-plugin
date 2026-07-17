Run a Pi code review of the local git state and return its output verbatim.

1. Resolve the plugin root: `PI_ROOT="${PI_PLUGIN_ROOT:-$HOME/pi-plugin-cc}"`.
2. Run: `node "$PI_ROOT/plugins/pi/scripts/pi-companion.mjs" review $ARGUMENTS`
3. Return the command's stdout verbatim — no paraphrasing, no commentary, no fixes.

Pass-through flags: `--base <ref>`, `--scope <auto|working-tree|branch>`, `--model <id>`, `--effort <off|minimal|low|medium|high|xhigh|max>`.
Panel mode: `--models <m1,m2,...>` (2+ models) reviews the same diff with every listed model in parallel and merges the findings, consensus first.
If the command reports pi is missing or unconfigured, tell the user to run the `/pi-setup` prompt.
