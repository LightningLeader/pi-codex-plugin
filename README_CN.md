# pi-plugin-cc — 在 Claude Code 里驱动 Pi 编码 agent 🥧

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Agents365-ai/pi-plugin-cc?style=flat&logo=github)](https://github.com/Agents365-ai/pi-plugin-cc/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/Agents365-ai/pi-plugin-cc?style=flat&logo=github)](https://github.com/Agents365-ai/pi-plugin-cc/network/members)
[![Latest Release](https://img.shields.io/github/v/release/Agents365-ai/pi-plugin-cc?logo=github)](https://github.com/Agents365-ai/pi-plugin-cc/releases/latest)
[![Last Commit](https://img.shields.io/github/last-commit/Agents365-ai/pi-plugin-cc?logo=github)](https://github.com/Agents365-ai/pi-plugin-cc/commits/main)

[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-plugin-8a2be2)](https://docs.claude.com/en/docs/claude-code/plugins)
[![Pi Coding Agent](https://img.shields.io/badge/Pi-coding%20agent-0a7d4a)](https://github.com/earendil-works/pi)
[![DeepSeek](https://img.shields.io/badge/DeepSeek-V4-1f6feb)](https://platform.deepseek.com/)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/79JF5Atuk)

[English](README.md) · **中文**

外部参考：[Pi 编码 agent](https://github.com/earendil-works/pi) · [Pi RPC 模式](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md) · [DeepSeek API](https://platform.deepseek.com/)

一个把代码评审与编码任务从 Claude Code 转交给 [Pi 编码 agent](https://github.com/earendil-works/pi) 的插件，默认使用 DeepSeek V4（日常评审用 Flash，对抗式评审用 Pro）。从 [`codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) 1:1 fork，把底层 runtime 从 Codex 换成 Pi。

- **代码评审**：针对 working tree 或基于分支的 diff，输出结构化 findings
- **对抗式评审**：质疑设计本身，而不是只挑改动里的拼写错误
- **任务转交**：诊断、重构、长流程救援，前台或后台执行
- **后台作业控制**：`status`、`result`、`cancel`，以及可选的 stop-time 评审守门
- **无 OAuth 登录**：Pi 用 API key（`DEEPSEEK_API_KEY` 等），不需要 `codex login`

兼容 [`pi-subagents`](https://github.com/nicobailon/pi-subagents)：如果你装了它，`/pi:rescue` 跑的过程中会自然可用，无需任何额外配置。

## 🔄 工作流程

```
Claude Code  ─►  /pi:review · /pi:rescue · /pi:status ...
                    │
                    ▼
            pi-companion.mjs (Node)
                    │  每个任务起一个独立的 pi --mode rpc 子进程
                    ▼
              Pi 编码 agent ─► DeepSeek（或任何 pi 已配置的 provider）
                    │
                    ▼
               JSONL 事件流 + 最终 assistant 消息
                    │
                    ▼
        作业状态文件（status / result / cancel 读它）
```

Codex 的 broker 层被去掉了 —— Pi 是"一进程一会话"模型，所以插件给每个任务直接 spawn 一个新的 `pi --mode rpc`。后台作业用工作区作用域的状态文件追踪。Pi 没有 `outputSchema` 这种参数，所以评审 prompt 直接把 JSON schema 内联进去。

## 斜杠命令

| 命令 | 默认模型 | 作用 |
|---|---|---|
| `/pi:setup` | — | 检查 `pi` 是否安装、provider 是否配置；切换 stop-time 评审守门 |
| `/pi:review` | `deepseek-v4-flash` | 针对本地 git 状态的标准代码评审 |
| `/pi:adversarial-review` | `deepseek-v4-pro` | 可指定 focus 的对抗式评审 —— 质疑实现方案本身 |
| `/pi:rescue` | 你的 pi 默认值 | 把任务转交给 `pi:pi-rescue` 子代理跑一个 Pi 会话 |
| `/pi:status [job-id]` | — | 列出本仓库正在运行 / 最近完成的 Pi 作业 |
| `/pi:result <job-id>` | — | 查看一个已完成作业的最终输出 |
| `/pi:cancel <job-id>` | — | 终止一个正在运行的后台作业 |

## 快速开始

```bash
# 1. 安装 pi
npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# 2. 配置 provider key（默认走 DeepSeek）
export DEEPSEEK_API_KEY=sk-your-key-here

# 3. 验证
pi --list-models deepseek   # 应该能看到 deepseek-v4-flash 和 -pro
```

在 Claude Code 里安装插件：

```text
> /plugin marketplace add Agents365-ai/pi-plugin-cc
> /plugin install pi@agents365-pi
> /reload-plugins
> /pi:setup
```

`/pi:setup` 会给出就绪报告；如果 `pi` 没装但有 `npm`，它会问你要不要替你装。

## 使用方式

```text
> /pi:review
> /pi:review --base main
> /pi:adversarial-review focus on the new auth middleware
> /pi:rescue 调研一下 Windows CI 为什么编译失败
> /pi:rescue --background 重构 src/payments/，去掉轮询循环
> /pi:status
> /pi:status task-mpgyiwb9-e3k641 --wait
> /pi:result task-mpgyiwb9-e3k641
> /pi:cancel task-mpgyiwb9-e3k641
```

`--effort <off|minimal|low|medium|high|xhigh>` 会经 `set_thinking_level` 传给 Pi。不支持 thinking 的模型会静默忽略。

## 配置 DeepSeek

最简单的方式就是设环境变量 —— Pi 自带 DeepSeek 内置模型：

```bash
export DEEPSEEK_API_KEY=sk-your-key-here
```

如果想细配，写 `~/.pi/agent/models.json`：

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

完整字段与所有支持的 provider 见 [pi providers 文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md)。

## Stop-time 评审守门

用 `/pi:setup --enable-review-gate` 开启。每次结束 Claude 会话时，插件会对上一轮 Claude 的输出做一次 Pi 对抗式评审；若发现重要问题会阻止退出。用 `/pi:setup --disable-review-gate` 关闭。

## 🔗 相关项目

| 项目 | 定位 | 适用场景 |
|---|---|---|
| [codex-plugin-cc](https://github.com/openai/codex-plugin-cc) | 同样的命令面，底层跑 Codex | 想用 OpenAI Codex agent + ChatGPT 账号时 |
| [pi (earendil-works)](https://github.com/earendil-works/pi) | 本插件驱动的编码 agent 本体 | 想直接用 Pi、不经 Claude Code 时 |
| [pi-subagents](https://github.com/nicobailon/pi-subagents) | Pi 扩展，加 `subagent` 工具 + `/run` / `/chain` / `/parallel` | 让 `/pi:rescue` 在内部进一步转交给专门的子代理 |

## 💬 社区

- **Discord:** https://discord.gg/79JF5Atuk
- **微信:** 扫描下方二维码

<p align="center">
  <img src="https://raw.githubusercontent.com/Agents365-ai/images_payment/main/qrcode/agents365ai_wechat_1.png" width="200" alt="微信交流群">
</p>

## ❤️ 支持

如果这个插件对你有帮助，欢迎打赏支持作者：

<table>
  <tr>
    <td align="center">
      <img src="https://raw.githubusercontent.com/Agents365-ai/images_payment/main/qrcode/wechat-pay.png" width="180" alt="微信支付">
      <br>
      <b>微信支付</b>
    </td>
    <td align="center">
      <img src="https://raw.githubusercontent.com/Agents365-ai/images_payment/main/qrcode/alipay.png" width="180" alt="支付宝">
      <br>
      <b>支付宝</b>
    </td>
    <td align="center">
      <img src="https://raw.githubusercontent.com/Agents365-ai/images_payment/main/qrcode/buymeacoffee.png" width="180" alt="Buy Me a Coffee">
      <br>
      <b>Buy Me a Coffee</b>
    </td>
    <td align="center">
      <img src="https://raw.githubusercontent.com/Agents365-ai/images_payment/main/awarding/award.gif" width="180" alt="打赏">
      <br>
      <b>打赏</b>
    </td>
  </tr>
</table>

## 👤 作者

**Agents365-ai**

- GitHub: https://github.com/Agents365-ai
- Bilibili: https://space.bilibili.com/441831884

## 📄 License

[Apache License 2.0](LICENSE)。从 [`codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) (Apache-2.0, OpenAI) fork —— 见 [NOTICE](NOTICE)。
