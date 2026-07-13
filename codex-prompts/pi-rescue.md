Delegate an investigation or implementation task to the Pi coding agent and return its output verbatim.

1. Resolve the plugin root: `PI_ROOT="${PI_PLUGIN_ROOT:-$HOME/pi-plugin-cc}"`.
2. Run: `node "$PI_ROOT/plugins/pi/scripts/pi-companion.mjs" task --write $ARGUMENTS`
   - For a read-only investigation (user asked not to change files), drop `--write`.
   - For a follow-up on the previous Pi session, add `--resume-last` and send only the delta instruction.
3. Return the command's stdout verbatim — no paraphrasing, no commentary.

Pass-through flags: `--model <id>`, `--effort <level>`, `--background` (then check with `/pi-status`).
