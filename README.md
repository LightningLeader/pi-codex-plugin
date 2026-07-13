# pi-plugin-cc — drive the Pi coding agent from Claude Code and Codex 🥧

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Agents365-ai/pi-plugin-cc?style=flat&logo=github)](https://github.com/Agents365-ai/pi-plugin-cc/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/Agents365-ai/pi-plugin-cc?style=flat&logo=github)](https://github.com/Agents365-ai/pi-plugin-cc/network/members)
[![Latest Release](https://img.shields.io/github/v/release/Agents365-ai/pi-plugin-cc?logo=github)](https://github.com/Agents365-ai/pi-plugin-cc/releases/latest)
[![Last Commit](https://img.shields.io/github/last-commit/Agents365-ai/pi-plugin-cc?logo=github)](https://github.com/Agents365-ai/pi-plugin-cc/commits/main)

[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-plugin-8a2be2)](https://docs.claude.com/en/docs/claude-code/plugins)
[![Pi Coding Agent](https://img.shields.io/badge/Pi-coding%20agent-0a7d4a)](https://github.com/earendil-works/pi)
[![Model agnostic](https://img.shields.io/badge/Model-agnostic-555)](#pick-your-model)

**English** · [中文](README_CN.md)

External references: [Pi coding agent](https://github.com/earendil-works/pi) · [Pi RPC mode](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md) · [Pi providers](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md)

A Claude Code plugin that delegates reviews and coding tasks to the [Pi coding agent](https://github.com/earendil-works/pi). Adapted from [`codex-plugin-cc`](https://github.com/openai/codex-plugin-cc), runtime swapped from Codex to Pi. Also usable from OpenAI's Codex CLI — see [Use from Codex](#-use-from-codex).

**The hard dependency is pi, not any particular LLM.** Pi can be configured for DeepSeek, OpenAI, Anthropic, Google, Ollama, LM Studio, or any OpenAI-compatible endpoint via `~/.pi/agent/models.json`. The plugin defers all model selection to pi unless you override per command.

- **Code review** against the working tree or a branch base, with structured findings
- **Adversarial review** that challenges the design — not just spell-checks the diff
- **Task delegation** for diagnoses, refactors, and longer rescues, foreground or background
- **Parallel fan-out** — `/pi:parallel-rescue` runs multiple independent tasks concurrently via [`pi-subagents`](https://github.com/nicobailon/pi-subagents)
- **Background job control** — `status`, `result`, `cancel`, and stop-time review gate
- **No OAuth** — pi authenticates by API key (provider-specific), no `codex login` required

Integrates with [`pi-subagents`](https://github.com/nicobailon/pi-subagents) (`pi install npm:pi-subagents`): `/pi:setup` detects it and lists the agent profiles, `/pi:rescue` prompts advertise the `subagent` tool to Pi, and `/pi:parallel-rescue` fans multiple tasks out to parallel child agents (scout, researcher, planner, worker, reviewer, …).

## 🔄 How it works

<img src="docs/pi-plugin-cc-workflow.png" alt="pi-plugin-cc workflow" width="80%">

Codex's broker layer is gone — Pi is one-conversation-per-process, so the plugin spawns a fresh `pi --mode rpc` for each task. Background jobs are tracked in workspace-scoped state files. Review prompts inline the JSON schema since Pi has no `outputSchema` knob.

## Slash commands

| Command | What it does |
|---|---|
| `/pi:setup` | Verifies `pi` is installed + a provider is configured; toggles the stop-time review gate |
| `/pi:review` | Standard code review of local git state |
| `/pi:adversarial-review` | Steerable challenge review — questions the approach itself |
| `/pi:rescue` | Delegate investigation or implementation to a Pi run via the `pi:pi-companion-forwarder` subagent |
| `/pi:parallel-rescue` | Run multiple independent tasks in parallel via pi-subagents (`subagent({ tasks })` fan-out) |
| `/pi:status [job-id]` | List active / recent Pi jobs in this repository |
| `/pi:result <job-id>` | Show the stored final output for a finished job |
| `/pi:cancel <job-id>` | Terminate a running background job |

Every command accepts `--model <id>` to pin a specific model just for that run. With no `--model` and no env override (see [Pick your model](#pick-your-model)), pi falls back to whatever it has configured by default.

## Quick Start

```bash
# 1. Install pi (required)
npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# 2. Configure a provider — pick one
export OPENAI_API_KEY=sk-...           # OpenAI
export ANTHROPIC_API_KEY=sk-ant-...    # Anthropic
export GOOGLE_API_KEY=...              # Google
export DEEPSEEK_API_KEY=sk-...         # DeepSeek
# or run a local model: see https://github.com/earendil-works/pi (Ollama / LM Studio)

# 3. Verify pi sees a model
pi --list-models | head
```

Install the plugin in Claude Code:

```text
> /plugin marketplace add Agents365-ai/pi-plugin-cc
> /plugin install pi@agents365-pi
> /reload-plugins
> /pi:setup
```

`/pi:setup` returns a readiness report. If `pi` is missing and `npm` is on PATH, it offers to install it for you.

## Usage

```text
> /pi:review
> /pi:review --base main
> /pi:review --model claude-sonnet-4
> /pi:adversarial-review focus on the new auth middleware
> /pi:rescue investigate why the Windows CI build is failing
> /pi:rescue --background --model gpt-4o refactor src/payments/
> /pi:parallel-rescue "audit the auth module" "benchmark the db queries" "update the API docs"
> /pi:status
> /pi:status task-mpgyiwb9-e3k641 --wait
> /pi:result task-mpgyiwb9-e3k641
> /pi:cancel task-mpgyiwb9-e3k641
```

`--effort <off|minimal|low|medium|high|xhigh>` is passed through to Pi via `set_thinking_level`. Models that do not support thinking silently ignore it (the plugin logs a one-line note to stderr when this happens).

## 🧩 Use from Codex

The core of this plugin is a harness-agnostic CLI (`pi-companion.mjs`) — any coding agent that can run shell commands can drive it. For OpenAI's Codex CLI, install the bundled [custom prompts](codex-prompts/):

```bash
# 1. Clone the repo (anywhere; ~/pi-plugin-cc is the default the prompts assume)
git clone https://github.com/Agents365-ai/pi-plugin-cc ~/pi-plugin-cc

# 2. Install the Codex custom prompts
mkdir -p ~/.codex/prompts
cp ~/pi-plugin-cc/codex-prompts/*.md ~/.codex/prompts/

# 3. If you cloned somewhere else, point the prompts at it
echo 'export PI_PLUGIN_ROOT="$HOME/path/to/pi-plugin-cc"' >> ~/.zshrc
```

Then inside Codex: `/pi-review`, `/pi-adversarial-review`, `/pi-rescue`, `/pi-parallel-rescue`, `/pi-status`, `/pi-result`, `/pi-cancel`, `/pi-setup` (note `-` instead of `:` — Codex prompt names cannot contain colons).

Not available under Codex: the stop-time review gate and session-resume prompts (both rely on Claude Code hooks / subagents). Everything else — including pi-subagents parallel fan-out — works the same.

## Pick your model

The plugin keeps three layers of model resolution:

| Priority | Source | Example |
|---|---|---|
| 1 | `--model <id>` on the slash command | `/pi:review --model gpt-4o` |
| 2 | Env var (review / adversarial-review only) | `export PI_PLUGIN_REVIEW_MODEL=deepseek-v4-flash`<br>`export PI_PLUGIN_ADVERSARIAL_REVIEW_MODEL=deepseek-v4-pro` |
| 3 | Pi's own configured default | whatever your `~/.pi/agent/models.json` has, or `/model` last picked in pi TUI |

Layer 1 wins over layer 2 wins over layer 3. **None of the layers are required** — leave them all unset and pi picks for you.

### Suggested settings by provider

These are opinions, not requirements. Pick what fits your latency / cost / quality budget.

| Provider | Everyday review (`/pi:review`) | Adversarial review (`/pi:adversarial-review`) |
|---|---|---|
| DeepSeek | `deepseek-v4-flash` | `deepseek-v4-pro` |
| OpenAI | `gpt-4o-mini` or `gpt-5-mini` | `o1` or `gpt-5` |
| Anthropic | `claude-haiku-4-5` | `claude-sonnet-4-6` or `claude-opus-4-7` |
| Google | `gemini-2.5-flash` | `gemini-2.5-pro` |
| Local (Ollama) | `qwen2.5-coder:7b` | `qwen2.5-coder:32b` or `deepseek-r1` |

To make these defaults sticky:

```bash
export PI_PLUGIN_REVIEW_MODEL=claude-haiku-4-5
export PI_PLUGIN_ADVERSARIAL_REVIEW_MODEL=claude-sonnet-4-6
```

## Configure pi

The minimum is a single env var with your API key. For richer setups, write `~/.pi/agent/models.json`:

```json
{
  "providers": {
    "deepseek": { "apiKey": "sk-..." },
    "openai":   { "apiKey": "sk-..." },
    "anthropic":{ "apiKey": "sk-ant-..." },
    "google":   { "apiKey": "..." },
    "openrouter": {
      "api": "openai-completions",
      "apiKey": "sk-or-v1-...",
      "baseUrl": "https://openrouter.ai/api/v1",
      "models": [
        {
          "id": "deepseek/deepseek-chat",
          "name": "DeepSeek via OpenRouter",
          "contextWindow": 128000,
          "maxTokens": 8192,
          "input": ["text"]
        }
      ]
    }
  }
}
```

Built-in providers (`anthropic`, `openai`, `google`, `deepseek`, `ollama`, `lmstudio`) only need `apiKey` (and optional `baseUrl`); pi ships their model lists. For custom OpenAI-compatible endpoints, set `api: "openai-completions"` and declare the `models` you want exposed.

Full reference: [pi providers docs](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md).

## Stop-time review gate

Opt in with `/pi:setup --enable-review-gate`. When a Claude session ends, the plugin runs a Pi adversarial review of the previous turn and can block the stop if it finds material issues. If pi is unavailable while the gate is enabled, the hook blocks (it does **not** silently let the session end). Disable with `/pi:setup --disable-review-gate`.

## 🔗 Related projects

| Project | Niche | When to use |
|---|---|---|
| [codex-plugin-cc](https://github.com/openai/codex-plugin-cc) | Same surface, runs Codex | You want OpenAI's Codex agent + ChatGPT auth |
| [pi (earendil-works)](https://github.com/earendil-works/pi) | The coding agent this plugin drives | You want to use Pi directly without Claude Code |
| [pi-subagents](https://github.com/nicobailon/pi-subagents) | Pi extension adding `subagent` tool + `/run` / `/chain` / `/parallel` | Powers `/pi:parallel-rescue` and lets `/pi:rescue` delegate to specialized child agents |

## ❤️ Support

If this plugin helps you, consider supporting the author:

<table>
  <tr>
    <td align="center">
      <img src="https://raw.githubusercontent.com/Agents365-ai/images_payment/main/qrcode/wechat-pay.png" width="180" alt="WeChat Pay">
      <br>
      <b>WeChat Pay</b>
    </td>
    <td align="center">
      <img src="https://raw.githubusercontent.com/Agents365-ai/images_payment/main/qrcode/alipay.png" width="180" alt="Alipay">
      <br>
      <b>Alipay</b>
    </td>
    <td align="center">
      <img src="https://raw.githubusercontent.com/Agents365-ai/images_payment/main/qrcode/buymeacoffee.png" width="180" alt="Buy Me a Coffee">
      <br>
      <b>Buy Me a Coffee</b>
    </td>
    <td align="center">
      <img src="https://raw.githubusercontent.com/Agents365-ai/images_payment/main/awarding/award.gif" width="180" alt="Give a Reward">
      <br>
      <b>Give a Reward</b>
    </td>
  </tr>
</table>

## 👤 Author

**Agents365-ai**

- GitHub: https://github.com/Agents365-ai
- Bilibili: https://space.bilibili.com/441831884

## 📄 License

[Apache License 2.0](LICENSE). Forked from [`codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) (Apache-2.0, OpenAI) — see [NOTICE](NOTICE).
