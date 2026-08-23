# Repository guidance

This repository contains the Codex-only `pi-codex` plugin. Do not add host integrations, manifests, hooks, slash commands, or compatibility layers for other coding-agent hosts.

## Layout

- `.agents/plugins/marketplace.json`: personal Codex marketplace entry
- `plugins/pi-codex/.codex-plugin/plugin.json`: Codex plugin manifest
- `plugins/pi-codex/skills/`: public Codex skills
- `plugins/pi-codex/scripts/`: Node.js runtime and Control Center
- `plugins/pi-codex/prompts/`: runtime prompt templates used by the skills
- `tests/`: Node.js test suite

Keep skill paths relative to the installed plugin root. User-facing invocations use `$pi-codex:<skill>`. The `$pi-codex:task` command uses Pi's configured default model and must not expose `--model` or `--race` options.

## Checks

Run `npm run check-version` and `npm test` after changes. Validate the Codex manifest and every public `SKILL.md` when changing plugin layout or metadata. Refresh the manifest cachebuster before testing an updated local installation.

Preserve the Apache-2.0 license and the attribution chain in `NOTICE`.
