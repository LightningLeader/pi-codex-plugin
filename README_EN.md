# Pi for Codex 🥧

[中文](README.md) | **English**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![Codex Plugin](https://img.shields.io/badge/Codex-plugin-111827)](https://github.com/LightningLeader/pi-codex-plugin)

`pi-codex-plugin` is a Codex-only plugin that delegates investigations and implementation work to the [Pi coding agent](https://github.com/earendil-works/pi). It supports foreground work, tracked background jobs, parallel delegation, and live continuation through a local RPC Control Center.

## Requirements

- Node.js 18.18 or later
- A working `pi` CLI installation with at least one configured model provider
- Optional: [`pi-subagents`](https://github.com/nicobailon/pi-subagents) for parallel tasks

Pi can use any provider it supports. Provider names or model IDs such as Anthropic Claude are Pi configuration choices; the host integration itself targets Codex only.

## Install in Codex

Clone the repository, register its local marketplace, then install the plugin:

```bash
git clone https://github.com/LightningLeader/pi-codex-plugin.git ~/pi-codex-plugin
codex plugin marketplace add ~/pi-codex-plugin
codex plugin add pi-codex@lightningleader
```

Start a new Codex thread after installation so the skills are loaded. Run `$pi-codex:setup` to verify Node.js, Pi, provider configuration, available models, and optional `pi-subagents` support.

## Skills

| Skill | Purpose |
| --- | --- |
| `$pi-codex:setup` | Check the local Pi installation and configuration |
| `$pi-codex:task` | Delegate an investigation or implementation task |
| `$pi-codex:continue` | Continue a task in its original live Pi RPC process |
| `$pi-codex:parallel-task` | Fan out explicitly independent tasks through pi-subagents |
| `$pi-codex:status` | Inspect tracked Pi jobs |
| `$pi-codex:watch` | Attach a lightweight Codex watcher to a background job |
| `$pi-codex:result` | Retrieve a completed job's stored result |
| `$pi-codex:cancel` | Cancel a running background job |
| `$pi-codex:ui` | Start, inspect, or stop the local Control Center |

Examples:

```text
$pi-codex:task Investigate performance bottlenecks in the current implementation
$pi-codex:task --write --background Implement the requested parser
$pi-codex:status task-...
$pi-codex:result task-...
```

Task supports read-only or `--write` work, foreground/background execution, model selection, effort settings, output files, and model races.

## Background jobs and live continuation

Background work is persisted and can be inspected with `status`, monitored with `watch`, retrieved with `result`, or stopped with `cancel`. The watcher uses a lightweight Codex subagent and leaves the main conversation free for other work.

`$pi-codex:ui --background` starts the local Pi RPC Control Center. It binds to loopback by default and prints a token-bearing authenticated URL. Keep that URL private. `$pi-codex:continue` uses this Control Center to send a follow-up to the exact original live Pi process; it does not silently replace that process with a history-based resume.

## Pi configuration

Configure Pi itself before using the plugin. Typical commands are:

```bash
pi --version
pi
pi install npm:pi-subagents   # optional
```

Model selection follows explicit command options first, then Pi's own configured defaults. This repository does not embed provider credentials. Keep API keys in the provider configuration mechanism recommended by Pi.

## Runtime data

Set `PI_CODEX_DATA_DIR` to override the runtime data directory. Otherwise the plugin uses:

- Linux: `$XDG_STATE_HOME/pi-codex-plugin`, or `~/.local/state/pi-codex-plugin`
- macOS: `~/Library/Application Support/pi-codex-plugin`
- Windows: `%LOCALAPPDATA%\pi-codex-plugin`

State directories are created with owner-only permissions where the platform supports them. Workspace-specific records are stored below this root.

## Development

```bash
npm run check-version
npm test
```

The Codex manifest is at `plugins/pi-codex/.codex-plugin/plugin.json`; public skills live under `plugins/pi-codex/skills/`; the Node.js runtime is under `plugins/pi-codex/scripts/`; and the personal marketplace entry is `.agents/plugins/marketplace.json`.

When changing the plugin during local development, refresh the Codex cachebuster version and reinstall or update the marketplace plugin before testing it in a new thread.

## Security

- The plugin runs Pi with access appropriate to the delegated task. Use write mode only when file changes are intended.
- The Control Center is loopback-only unless remote access is explicitly enabled.
- Authenticated Control Center URLs contain a secret token and should not be shared.
- Review generated changes before committing or pushing them.

## License and attribution

Licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for the upstream attribution chain. This project is maintained by [LightningLeader](https://github.com/LightningLeader).
