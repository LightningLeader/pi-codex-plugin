Run multiple independent tasks in parallel through Pi using pi-subagents.

1. Check pi-subagents is installed: `test -d ~/.pi/agent/npm/node_modules/pi-subagents && echo installed`.
   If not installed, tell the user to run `pi install npm:pi-subagents` and stop.
2. Resolve the plugin root: `PI_ROOT="${PI_PLUGIN_ROOT:-$HOME/pi-codex-plugin}"`.
3. Read the template: `cat "$PI_ROOT/plugins/pi-codex/prompts/parallel-rescue.md"`.
4. Each quoted string in the arguments is one task. Replace `{{TASKS_LIST}}` in the template with the enumerated list (`Task 1: ...`, `Task 2: ...`).
5. Run: `node "$PI_ROOT/plugins/pi-codex/scripts/pi-companion.mjs" task --write "<the constructed prompt>"`
6. Return the command's stdout verbatim — no paraphrasing, no commentary.

Arguments: $ARGUMENTS
