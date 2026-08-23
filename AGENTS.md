# AGENTS.md

pi-codex-plugin drives the [Pi coding agent](https://github.com/earendil-works/pi) to review code
and delegate tasks. The core is a harness-agnostic CLI, `plugins/pi-codex/scripts/pi-companion.mjs` —
any coding agent that can run shell commands can drive it directly, not just Claude Code.

Full behavior, flags, and usage examples: see [README.md](README.md) (English) /
[README_CN.md](README_CN.md) (中文). This file only orients a coding agent working in this repo.

## Using pi-codex-plugin from an agent

- **Claude Code**: install as a plugin (`/plugin marketplace add LightningLeader/pi-codex-plugin`,
  `/plugin install pi-codex@lightningleader`) and use the `/pi-codex:*` slash commands documented in
  `plugins/pi-codex/commands/*.md`.
- **Codex CLI**: install the repository marketplace's `pi-codex` plugin (see README.md §
  "Use from Codex"). Its commands are skills such as `$pi-codex:review`, `$pi-codex:rescue`, and
  `$pi-codex:continue`. `codex-prompts/` is retained only for
  compatibility with older Codex clients that still support custom prompts.
- **Any other agent**: call `node plugins/pi-codex/scripts/pi-companion.mjs <subcommand> [args]`
  directly. Run `node plugins/pi-codex/scripts/pi-companion.mjs help` for the full command list
  (`review`, `adversarial-review`, `task`, `continue`, `status`, `watch`, `result`, `cancel`, `setup`). Pass `--json`
  for machine-readable output.

## Working on this repo

- Requires Node.js >= 18.18 (`"engines"` in `package.json`). No build step; plain ESM (`.mjs`).
- Tests: `npm test` (Node's built-in test runner, `tests/*.test.mjs`). Run this after any change
  under `plugins/pi-codex/scripts/`.
- Source of truth for CLI behavior is `plugins/pi-codex/scripts/pi-companion.mjs` and
  `plugins/pi-codex/scripts/lib/*.mjs`; `plugins/pi-codex/commands/*.md` are the Claude Code slash-command
  wrappers and `skills/*/SKILL.md` are the Codex plugin wrappers around that same CLI.
- Version/changelog conventions: `plugins/pi-codex/CHANGELOG.md`, versions in `package.json`,
  `plugins/pi-codex/.codex-plugin/plugin.json`, and `plugins/pi-codex/.claude-plugin/plugin.json` stay in sync
  (`npm run check-version`).
- Licensed under Apache-2.0 and derived from
  [`pi-plugin-cc`](https://github.com/Agents365-ai/pi-plugin-cc), which was derived from
  [`codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) — see `NOTICE`.
