# pi-plugin-cc — 在 Claude Code 和 Codex 里驱动 Pi 编码 agent 🥧

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Agents365-ai/pi-plugin-cc?style=flat&logo=github)](https://github.com/Agents365-ai/pi-plugin-cc/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/Agents365-ai/pi-plugin-cc?style=flat&logo=github)](https://github.com/Agents365-ai/pi-plugin-cc/network/members)
[![Latest Release](https://img.shields.io/github/v/release/Agents365-ai/pi-plugin-cc?logo=github)](https://github.com/Agents365-ai/pi-plugin-cc/releases/latest)
[![Last Commit](https://img.shields.io/github/last-commit/Agents365-ai/pi-plugin-cc?logo=github)](https://github.com/Agents365-ai/pi-plugin-cc/commits/main)

[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-plugin-8a2be2)](https://docs.claude.com/en/docs/claude-code/plugins)
[![Pi Coding Agent](https://img.shields.io/badge/Pi-coding%20agent-0a7d4a)](https://github.com/earendil-works/pi)
[![Model agnostic](https://img.shields.io/badge/Model-agnostic-555)](#选模型)

[English](README.md) · **中文**

外部参考：[Pi 编码 agent](https://github.com/earendil-works/pi) · [Pi RPC 模式](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md) · [Pi providers](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md)

把代码评审与编码任务从 Claude Code 转交给 [Pi 编码 agent](https://github.com/earendil-works/pi) 的插件。改编自 [`codex-plugin-cc`](https://github.com/openai/codex-plugin-cc)，把底层 runtime 从 Codex 换成 Pi。也可以在 OpenAI Codex CLI 里使用 —— 见[在 Codex 里使用](#-在-codex-里使用)。

**硬依赖是 pi 本身，不是某个具体的大模型。** Pi 可以配置成 DeepSeek、OpenAI、Anthropic、Google、Ollama、LM Studio，或者任何 OpenAI 兼容端点 —— 通过 `~/.pi/agent/models.json`。插件默认把模型选择完全交给 pi，除非你单次 `--model` 覆盖。

- **代码评审**：针对 working tree 或基于分支的 diff，输出结构化 findings
- **对抗式评审**：质疑设计本身，而不是只挑改动里的拼写错误
- **任务转交**：诊断、重构、长流程救援，前台或后台执行
- **并行分发**：`/pi:parallel-rescue` 通过 [`pi-subagents`](https://github.com/nicobailon/pi-subagents) 并发跑多个独立任务
- **分片并行评审**：`/pi:review --shards <N>` 把大 diff 改动的文件拆成 N 个并行评审任务，再合并 findings
- **后台作业控制**：`status`、`result`、`cancel`，以及可选的 stop-time 评审守门
- **本地 RPC 控制台**：在浏览器中实时查看 text/thinking、工具调用和终端输出，并发送消息、steer、follow-up 或 abort
- **无 OAuth 登录**：Pi 用 provider 的 API key 认证，不需要 `codex login`

深度集成 [`pi-subagents`](https://github.com/nicobailon/pi-subagents)（`pi install npm:pi-subagents`）：`/pi:setup` 会检测安装状态并列出 agent 档案，`/pi:rescue` 的 prompt 会告知 Pi 可用 `subagent` 工具，`/pi:parallel-rescue` 把多个任务分发给并行子代理（scout、researcher、planner、worker、reviewer 等）。

## 🔄 工作流程

<img src="docs/pi-plugin-cc-workflow_CN.png" alt="pi-plugin-cc 工作流程" width="80%">

Pi 是“一进程一会话”模型，因此每个任务仍会拥有独立的 `pi --mode rpc` 进程。控制中心运行时，Codex 发起的前台和后台任务都会接入它的实时会话列表，可以在网页中完整查看并继续交互；控制中心不可达时才回退为 direct 进程。后台作业还会使用工作区作用域的状态文件追踪。Pi 没有 `outputSchema` 这种参数，所以评审 prompt 直接把 JSON schema 内联进去。

## Claude Code 斜杠命令

| 命令 | 作用 |
|---|---|
| `/pi:setup` | 检查 `pi` 是否安装、provider 是否配置；切换 stop-time 评审守门 |
| `/pi:review` | 针对本地 git 状态的标准代码评审 |
| `/pi:adversarial-review` | 可指定 focus 的对抗式评审 —— 质疑实现方案本身 |
| `/pi:rescue` | 把任务转交给 `pi:pi-companion-forwarder` 子代理跑一个 Pi 会话 |
| `/pi:continue [--job <job-id>]` | 在原任务仍在线的 Control Session 和 RPC 进程中继续执行新一轮任务 |
| `/pi:parallel-rescue` | 通过 pi-subagents 并行跑多个独立任务（`subagent({ tasks })` 分发） |
| `/pi:status [job-id]` | 列出本仓库正在运行 / 最近完成的 Pi 作业 |
| `/pi:result <job-id>` | 查看一个已完成作业的最终输出 |
| `/pi:cancel <job-id>` | 终止一个正在运行的后台作业 |
| `/pi:ui [--background\|--status\|--stop]` | 启动、查看或停止本地 Pi RPC Web 控制台 |

每个命令都接受 `--model <id>` 临时指定模型。不传 `--model`、也没配 env 覆盖（见[选模型](#选模型)）时，pi 用它自己默认的模型。

## 快速开始

```bash
# 1. 装 pi（必需）
npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# 2. 配一个 provider —— 任选其一
export OPENAI_API_KEY=sk-...           # OpenAI
export ANTHROPIC_API_KEY=sk-ant-...    # Anthropic
export GOOGLE_API_KEY=...              # Google
export DEEPSEEK_API_KEY=sk-...         # DeepSeek
# 或本地跑：见 https://github.com/earendil-works/pi (Ollama / LM Studio)

# 3. 验证 pi 看到了模型
pi --list-models | head
```

在 Claude Code 里安装插件：

```text
> /plugin marketplace add Agents365-ai/pi-plugin-cc
> /plugin install pi@agents365-pi
> /reload-plugins
> /pi:setup
```

`/pi:setup` 给出就绪报告；如果 `pi` 没装但 `npm` 在 PATH，它会问你要不要替你装。

## 使用方式

```text
> /pi:review
> /pi:review --base main
> /pi:review --model claude-sonnet-4
> /pi:review --out-file review.md
> /pi:adversarial-review focus on the new auth middleware
> /pi:rescue 调研一下 Windows CI 为什么编译失败
> /pi:rescue --background --model gpt-4o 重构 src/payments/
> /pi:continue --job task-mpgyiwb9-e3k641 修复代码审阅发现的问题
> /pi:parallel-rescue "审计 auth 模块" "给 db 查询做基准测试" "更新 API 文档"
> /pi:status
> /pi:status task-mpgyiwb9-e3k641 --wait
> /pi:result task-mpgyiwb9-e3k641
> /pi:cancel task-mpgyiwb9-e3k641
> /pi:ui --background
> /pi:ui --status
```

### Pi Control Center

`/pi:ui --background` 会在 `127.0.0.1:43120` 启动本地控制台并返回带随机访问令牌的 URL。最新启动且可访问的控制台也会注册为当前用户的全局控制中心：Codex 从其他工作目录启动的前台或后台 `task` 会自动接入，同时保留各自的实际 cwd。因此这些任务会像网页中新建的会话一样显示完整的实时 `text_delta`、`thinking_delta`、工具调用及增量输出，并支持普通消息、`steer`、`follow_up`、`abort` 和扩展 UI 确认。如果没有可访问的控制中心，后台任务仍保留 direct worker 降级路径。服务默认不监听局域网；描述文件仅允许当前用户读取。

控制台运行时，新的 `/pi:rescue --background` 会自动交给守护进程，因此可以直接在网页中继续控制。控制台启动前已经运行的旧式后台作业也会列出并显示日志，但其 RPC 管道由原 worker 持有，不能中途转交。`--race` 仍使用隔离 worktree worker。使用 `/pi:ui --stop` 关闭服务及其管理的会话。

`/pi:continue --job <job-id> <指令>` 会在处理原任务的同一个在线 Control Session 中创建新的可追踪 Job，严格复用原 `controlSessionId`、`piSessionId` 和 RPC PID。不传 `--job` 时，选择当前调用方和工作区中最新的空闲在线任务会话。该操作是严格模式：原会话不存在、进程已退出或断开、会话正忙时都会报错，绝不会新建替代进程，也不会静默退回磁盘会话恢复。RPC 完成后保持空闲，直到用户在控制台手动结束。

`--effort <off|minimal|low|medium|high|xhigh|max>` 会经 `set_thinking_level` 传给 Pi。不支持 thinking 的模型会静默忽略（插件会往 stderr 写一行提示）。

`--out-file <path>`（用于 `/pi:review`、`/pi:adversarial-review`、`/pi:rescue`、`/pi:continue`、`/pi:result`）把 Pi 的完整输出写到文件，只返回一段简短摘要——verdict、findings 计数、每条一行。繁重推理本就跑在更便宜的模型上；这一步还把大段结果挡在调用方的上下文之外，大型评审就不会在"转述"上烧 Claude Code 的 token。要看全文就打开那个文件。

`--incremental`（用于 `/pi:review`、`/pi:adversarial-review`）只评审当前分支上自上次评审以来的新提交，靠一份按分支缓存的"上次评审提交"记录来实现——跳过已经审过的代码，省下 Pi 的输入 token 和时间。没有可用缓存时会自动回退为全量评审。

## 🧩 在 Codex 里使用

当前版本是原生 Codex 插件：`plugins/pi/.codex-plugin/plugin.json` 与 Claude manifest 共置，各项能力位于 `plugins/pi/skills/`。安装仓库内 marketplace：

```bash
# 1. 克隆仓库
git clone https://github.com/Agents365-ai/pi-plugin-cc ~/pi-plugin-cc

# 2. 注册仓库 marketplace 并安装插件
codex plugin marketplace add ~/pi-plugin-cc
codex plugin add pi@agents365-pi

# 3. 新开一个 Codex 线程，让插件 skills 进入能力目录
```

安装后可显式调用：`$pi:review`、`$pi:adversarial-review`、`$pi:rescue`、`$pi:continue`、`$pi:parallel-rescue`、`$pi:status`、`$pi:watch`、`$pi:result`、`$pi:cancel`、`$pi:setup`、`$pi:ui`。Codex 也可以根据请求自动选择对应 skill。

Codex 专用的 `$pi:rescue --supervised <任务>` 会先按后台方式启动 Pi，再创建一个轻量子智能体监督该 Job；主对话无需等待，可以继续处理别的事情。也可以用 `$pi:watch <job-id>` 给已经运行的后台任务补挂监督器。监督器只等待状态，不改文件、不取消或重试任务；结束后会向主智能体报告简短状态，同时将监督状态持久化并显示在 Pi Control Center。最多同时保留两个 Pi 监督子智能体；槽位不足时任务照常运行，但会明确标记为未监督。

监督器默认每 10 秒检查一次任务状态。两种调用都可以通过 `--poll-interval-ms <毫秒>` 单次覆盖，例如 `$pi:watch task-xxx --poll-interval-ms 5000` 或 `$pi:rescue --supervised --poll-interval-ms 5000 <任务>`；最小值为 100 毫秒。

轮询由单个阻塞的 Node 命令在本地完成，不会让子智能体每次检查都重新推理或重复调用模型。子智能体只在启动监督和最终发送简短状态时产生少量 token，并且不会自动读取或转述完整任务结果。

底层的 `node plugins/pi/scripts/pi-companion.mjs watch <job-id> --json` 是确定性的等待命令。它本身不会创建 Codex 子智能体；子智能体编排由上述 Codex skills 完成。

`codex-prompts/` 仅为仍支持 `~/.codex/prompts` 的旧版 Codex 客户端保留；Codex CLI 0.149 及之后应使用插件 skills，不再依赖复制 prompt 文件。

Codex 下不可用的部分：stop-time 评审守门和会话恢复询问（两者依赖 Claude Code 的 hooks / 子代理）。其余功能 —— 包括 pi-subagents 并行分发 —— 行为一致。

## 🧑‍⚖️ 多模型评审团

单个评审者有盲区，评审团的盲区不重叠。给任一评审命令传 `--models`，同一份 diff 会**并行**发给多个模型评审，findings 自动合并——被 2 个以上模型同时报告的问题排在最前，并带 `found by:` 标注：

```text
> /pi:review --models deepseek-v4-flash,claude-sonnet-4-6,gpt-5-mini
> /pi:adversarial-review --models deepseek-v4-pro,o1 focus on concurrency
```

- 共识 findings（2+ 模型）排最前，单模型 findings 紧随其后。
- 同文件 + 行区间带容差匹配去重；严重度取各模型报告的最高档，不同表述的标题会保留为备注。
- 某个成员失败（provider 报错、返回非法 JSON）只按成员如实报告，不影响整体——只要有一个模型返回有效评审，评审团就算成功。
- 评审团成员不走 `PI_PLUGIN_FALLBACK_MODELS` 降级链——评审团本身就是冗余机制。
- 这个能力只有 Pi 这种多供应商 agent 才做得到：单一供应商的 CLI 无法召集跨厂商评审团。

## 🛟 模型故障自动降级

配置一次降级链，之后任何失败的运行——provider 宕机、鉴权错误、自动重试耗尽——都会自动换下一个模型重跑：

```bash
export PI_PLUGIN_FALLBACK_MODELS=deepseek-v4-flash,MiniMax-M3
```

评审和 rescue 任务都生效。当结果来自降级模型时，输出末尾会附 `Model fallback:` 说明（JSON payload 里带 `modelAttempts`）。`/pi:setup` 会显示当前配置的降级链。

## 🏁 模型竞速

硬骨头任务可以让多个模型**并行**跑同一个任务，然后选出赢家：

```text
> /pi:rescue --race deepseek-v4-pro,claude-sonnet-4-6 fix the flaky retry logic in src/queue.mjs
> /pi:rescue --race deepseek-v4-flash,gemini-2.5-pro why does the Windows CI build fail?
```

- **写竞速**（`--write`，`/pi:rescue` 默认带）：每个 racer 在独立的 git worktree（从 `HEAD` 创建）里干活——racer 之间以及和你的工作树完全隔离。每个 racer 的成果捕获为 patch；审阅后用 `git apply <patch>` 应用其中一个。
- **只读竞速**（排查类任务）：racer 分析同一份代码，输出并排展示各自答案——多模型结论一致是强信号。
- 某个 racer 失败或没产生改动会被如实标注；只要有一个 racer 完成，竞速就算成功。
- 不能与 `--model` 或 `--resume` 同用（每个 racer 都是全新 session）。racer 从 `HEAD` 出发，任务涉及未提交改动时先 commit 或 stash。

## 选模型

模型解析三层优先级：

| 优先级 | 来源 | 例子 |
|---|---|---|
| 1 | 斜杠命令上的 `--model <id>` | `/pi:review --model gpt-4o` |
| 2 | Env var（仅 review / adversarial-review） | `export PI_PLUGIN_REVIEW_MODEL=deepseek-v4-flash`<br>`export PI_PLUGIN_ADVERSARIAL_REVIEW_MODEL=deepseek-v4-pro` |
| 3 | pi 自己配置的默认模型 | 你 `~/.pi/agent/models.json` 里的，或 pi TUI `/model` 上次选的 |

层 1 > 层 2 > 层 3。**三层都可以不设** —— 全空就让 pi 自己决定。

### 各 provider 的建议默认

只是建议，不强制。按延迟 / 成本 / 质量预算自己挑：

| Provider | 日常 review（`/pi:review`） | 对抗式 review（`/pi:adversarial-review`） |
|---|---|---|
| DeepSeek | `deepseek-v4-flash` | `deepseek-v4-pro` |
| OpenAI | `gpt-4o-mini` 或 `gpt-5-mini` | `o1` 或 `gpt-5` |
| Anthropic | `claude-haiku-4-5` | `claude-sonnet-4-6` 或 `claude-opus-4-7` |
| Google | `gemini-2.5-flash` | `gemini-2.5-pro` |
| 本地（Ollama） | `qwen2.5-coder:7b` | `qwen2.5-coder:32b` 或 `deepseek-r1` |

想让这些选择粘住：

```bash
export PI_PLUGIN_REVIEW_MODEL=claude-haiku-4-5
export PI_PLUGIN_ADVERSARIAL_REVIEW_MODEL=claude-sonnet-4-6
```

### 性价比档 —— 比 Claude/GPT 便宜、依然能打

驱动 Pi 的意义就在于你不被 Claude 或 GPT 锁死。下面这些模型的成本只是 Claude/GPT 顶配的零头，性能虽然没那么强，但用于日常 review 和 rescue 绰绰有余。在 `~/.pi/agent/models.json` 里配置它们（大多是 OpenAI 兼容端点），并用你的 provider 实际暴露的 id —— 用 `pi --list-models` 核对。

| Provider | 建议模型 |
|---|---|
| DeepSeek | `deepseek-v4-flash`（日常）· `deepseek-v4-pro`（对抗式） |
| xAI | `grok-4.5` |
| 智谱（GLM） | `glm-5.1` · `glm-5.2`（更重） |
| 月之暗面（Kimi） | `kimi-k3`（或 `kimi-k2.6`） |
| MiniMax | `MiniMax-M3` |
| 字节（Seed） | `doubao-seed-2.1-pro` |
| 小米（MiMo） | `mimo-v2.5`（日常）· `mimo-v2.5-pro`（更重） |
| Meta | `muse-spark-1.1` |

……以及任何你配置的 OpenAI 兼容端点。可用性和确切 id 取决于你的 `~/.pi/agent/models.json`。

> 不是每个模型都能为结构化 review 命令吐出干净 JSON。如果某个模型在 `/pi:review` 上解析报错，它用于 `/pi:rescue`（自由格式）仍然没问题 —— 或者把它加进 `PI_PLUGIN_FALLBACK_MODELS` 链，坏成员会自动重试下一个。（已观察到：部分 MiniMax 和本地模型会回显 prompt 而非返回 JSON。）

## 配置 pi

最简就是一个环境变量装 API key。要细配就写 `~/.pi/agent/models.json`：

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

内置 provider（`anthropic`、`openai`、`google`、`deepseek`、`ollama`、`lmstudio`）只要 `apiKey` 和可选 `baseUrl`，pi 自带模型清单。OpenAI 兼容端点用 `api: "openai-completions"` 并写自定义 `models`。

完整字段见 [pi providers 文档](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/providers.md)。

## Stop-time 评审守门

用 `/pi:setup --enable-review-gate` 开启。每次结束 Claude 会话时，插件会对上一轮 Claude 的输出做一次 Pi 对抗式评审；若发现重要问题会阻止退出。开了守门但 pi 不可用时 hook 会 block（**不会**静默放行）。用 `/pi:setup --disable-review-gate` 关闭。

## 🔗 相关项目

| 项目 | 定位 | 适用场景 |
|---|---|---|
| [codex-plugin-cc](https://github.com/openai/codex-plugin-cc) | 同样的命令面，底层跑 Codex | 想用 OpenAI Codex agent + ChatGPT 账号时 |
| [pi (earendil-works)](https://github.com/earendil-works/pi) | 本插件驱动的编码 agent 本体 | 想直接用 Pi、不经 Claude Code 时 |
| [pi-subagents](https://github.com/nicobailon/pi-subagents) | Pi 扩展，加 `subagent` 工具 + `/run` / `/chain` / `/parallel` | 驱动 `/pi:parallel-rescue`，也让 `/pi:rescue` 能转交给专门的子代理 |

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

[Apache License 2.0](LICENSE)。改编自 [`codex-plugin-cc`](https://github.com/openai/codex-plugin-cc) (Apache-2.0, OpenAI) —— 见 [NOTICE](NOTICE)。
