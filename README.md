# pi-plugin-cc — drive the Pi coding agent from Claude Code 🥧

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Agents365-ai/pi-plugin-cc?style=flat&logo=github)](https://github.com/Agents365-ai/pi-plugin-cc/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/Agents365-ai/pi-plugin-cc?style=flat&logo=github)](https://github.com/Agents365-ai/pi-plugin-cc/network/members)
[![Latest Release](https://img.shields.io/github/v/release/Agents365-ai/pi-plugin-cc?logo=github)](https://github.com/Agents365-ai/pi-plugin-cc/releases/latest)
[![Last Commit](https://img.shields.io/github/last-commit/Agents365-ai/pi-plugin-cc?logo=github)](https://github.com/Agents365-ai/pi-plugin-cc/commits/main)

[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-plugin-8a2be2)](https://docs.claude.com/en/docs/claude-code/plugins)
[![Pi Coding Agent](https://img.shields.io/badge/Pi-coding%20agent-0a7d4a)](https://github.com/earendil-works/pi)
[![DeepSeek](https://img.shields.io/badge/DeepSeek-V4-1f6feb)](https://platform.deepseek.com/)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/79JF5Atuk)

**English** · [中文](README_CN.md)

External references: [Pi coding agent](https://github.com/earendil-works/pi) · [Pi RPC mode](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md) · [DeepSeek API](https://platform.deepseek.com/)

A Claude Code plugin that delegates reviews and coding tasks to the [Pi coding agent](https://github.com/earendil-works/pi), defaulting to DeepSeek V4 (Flash for everyday review, Pro for adversarial review). 1:1 fork of [`codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) with the runtime swapped from Codex to Pi.

- **Code review** against the working tree or a branch base, with structured findings
- **Adversarial review** that challenges the design — not just spell-checks the diff
- **Task delegation** for diagnoses, refactors, and longer rescues, foreground or background
- **Background job control** — `status`, `result`, `cancel`, and stop-time review gate
- **No OAuth** — pi authenticates by API key (`DEEPSEEK_API_KEY`, etc.), no `codex login` needed

Plays well with [`pi-subagents`](https://github.com/nicobailon/pi-subagents): if installed, it works inside `/pi:rescue` runs without configuration.

## 🔄 How it works

```
Claude Code  ─►  /pi:review · /pi:rescue · /pi:status ...
                    │
                    ▼
            pi-companion.mjs (Node)
                    │  one pi --mode rpc subprocess per task
                    ▼
              Pi coding agent ─► DeepSeek (or any pi-configured provider)
                    │
                    ▼
               JSONL events + final assistant message
                    │
                    ▼
        job state files (status / result / cancel)
```

Codex's broker layer is gone — Pi is one-conversation-per-process, so the plugin spawns a fresh `pi --mode rpc` for each task. Background jobs are tracked in workspace-scoped state files. Review prompts inline the JSON schema since Pi has no `outputSchema` knob.

## Slash commands

| Command | Default model | What it does |
|---|---|---|
| `/pi:setup` | — | Verifies `pi` is installed + a provider is configured; toggles the stop-time review gate |
| `/pi:review` | `deepseek-v4-flash` | Standard code review of local git state |
| `/pi:adversarial-review` | `deepseek-v4-pro` | Steerable challenge review — questions the approach itself |
| `/pi:rescue` | user's pi default | Delegate investigation or implementation to a Pi run via the `pi:pi-rescue` subagent |
| `/pi:status [job-id]` | — | List active / recent Pi jobs in this repository |
| `/pi:result <job-id>` | — | Show the stored final output for a finished job |
| `/pi:cancel <job-id>` | — | Terminate a running background job |

## Quick Start

```bash
# 1. Install pi
npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# 2. Provide a provider key (DeepSeek by default)
export DEEPSEEK_API_KEY=sk-your-key-here

# 3. Verify
pi --list-models deepseek   # should show deepseek-v4-flash and -pro
```

Install the plugin in Claude Code:

```text
> /plugin marketplace add Agents365-ai/pi-plugin-cc
> /plugin install pi@agents365-pi
> /reload-plugins
> /pi:setup
```

`/pi:setup` returns a readiness report and offers to install Pi for you if it's missing and `npm` is on PATH.

## Usage

```text
> /pi:review
> /pi:review --base main
> /pi:adversarial-review focus on the new auth middleware
> /pi:rescue investigate why the Windows CI build is failing
> /pi:rescue --background refactor src/payments/ to remove the polling loop
> /pi:status
> /pi:status task-mpgyiwb9-e3k641 --wait
> /pi:result task-mpgyiwb9-e3k641
> /pi:cancel task-mpgyiwb9-e3k641
```

`--effort <off|minimal|low|medium|high|xhigh>` is passed through to Pi via `set_thinking_level`. Models that don't support thinking silently ignore it.

## Configure DeepSeek

The minimum config is just an env var — Pi ships built-in DeepSeek models:

```bash
export DEEPSEEK_API_KEY=sk-your-key-here
```

For a full custom config, write `~/.pi/agent/models.json`:

```json
{
  "providers": {
    "deepseek": {
      "apiKey": "sk-your-deepseek-key"
    },
    "openai": {
      "apiKey": "sk-your-openai-key"
    },
    "openrouter-deepseek": {
      "api": "openai-completions",
      "apiKey": "sk-or-v1-...",
      "baseUrl": "https://openrouter.ai/api/v1",
      "models": [
        {
          "id": "deepseek/deepseek-chat",
          "name": "DeepSeek (via OpenRouter)",
          "contextWindow": 128000,
          "maxTokens": 8192,
          "input": ["text"]
        }
      ]
    }
  }
}
```

See [pi providers docs](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md) for every supported provider and field.

## Stop-time review gate

Opt in with `/pi:setup --enable-review-gate`. When a Claude session ends, the plugin runs a Pi adversarial review of the previous turn and can block the stop if it finds material issues. Disable with `/pi:setup --disable-review-gate`.

## 🔗 Related projects

| Project | Niche | When to use |
|---|---|---|
| [codex-plugin-cc](https://github.com/openai/codex-plugin-cc) | Same surface, runs Codex | When you want OpenAI's Codex agent + ChatGPT auth |
| [pi (earendil-works)](https://github.com/earendil-works/pi) | The coding agent this plugin drives | If you want to use Pi directly without Claude Code |
| [pi-subagents](https://github.com/nicobailon/pi-subagents) | Pi extension adding `subagent` tool + `/run` / `/chain` / `/parallel` | Lets `/pi:rescue` delegate to specialized child agents |

## 💬 Community

- **Discord:** https://discord.gg/79JF5Atuk
- **WeChat:** scan the QR code below

<p align="center">
  <img src="https://raw.githubusercontent.com/Agents365-ai/images_payment/main/qrcode/agents365ai_wechat_1.png" width="200" alt="WeChat Community Group">
</p>

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
