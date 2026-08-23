# Pi for Codex 🥧

[![许可证：Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![Codex 插件](https://img.shields.io/badge/Codex-plugin-111827)](https://github.com/LightningLeader/pi-codex-plugin)

`pi-codex-plugin` 是一个只面向 Codex 的插件，用于把代码评审、调查和实现任务交给 [Pi 编码 agent](https://github.com/earendil-works/pi)。它支持前台任务、可追踪的后台任务、并行分发，以及通过本地 RPC Control Center 在原 Pi 进程中继续工作。

## 运行要求

- Node.js 18.18 或更高版本
- 已安装并配置至少一个模型提供商的 `pi` CLI
- 可选：使用 [`pi-subagents`](https://github.com/nicobailon/pi-subagents) 进行并行分发

Pi 可以使用其支持的任意模型提供商。Anthropic Claude 等提供商名称或模型 ID 只是 Pi 的配置选择；本插件的宿主集成只面向 Codex。

## 在 Codex 中安装

克隆仓库、注册本地 marketplace，然后安装插件：

```bash
git clone https://github.com/LightningLeader/pi-codex-plugin.git ~/pi-codex-plugin
codex plugin marketplace add ~/pi-codex-plugin
codex plugin add pi-codex@lightningleader
```

安装后新建一个 Codex 对话，让 skills 被重新加载。运行 `$pi-codex:setup` 检查 Node.js、Pi、模型提供商、可用模型和可选的 `pi-subagents`。

## Skills

| Skill | 用途 |
| --- | --- |
| `$pi-codex:setup` | 检查本地 Pi 安装和配置 |
| `$pi-codex:review` | 评审当前 Git 工作区或分支 |
| `$pi-codex:adversarial-review` | 质疑架构、假设和实现路线 |
| `$pi-codex:rescue` | 委派调查或实现任务 |
| `$pi-codex:continue` | 在原来的在线 Pi RPC 进程中继续任务 |
| `$pi-codex:parallel-rescue` | 通过 pi-subagents 并行执行明确独立的任务 |
| `$pi-codex:status` | 查看已追踪的 Pi 任务 |
| `$pi-codex:watch` | 用轻量 Codex 子代理监控后台任务 |
| `$pi-codex:result` | 获取已完成任务保存的结果 |
| `$pi-codex:cancel` | 取消正在运行的后台任务 |
| `$pi-codex:ui` | 启动、查看或停止本地 Control Center |

示例：

```text
$pi-codex:review --scope working-tree --wait
$pi-codex:adversarial-review 重点检查持久化设计
$pi-codex:rescue --write --background 实现所需的解析器
$pi-codex:status task-...
$pi-codex:result task-...
```

评审命令支持 `--base`、`--scope`、`--model`、`--models`、`--effort`、`--shards`、`--incremental` 和 `--out-file` 等选项。Rescue 支持只读或 `--write` 任务、前台/后台运行、模型选择、推理强度和多模型竞速。

## 后台任务与在线继续

后台任务会被持久化，可以用 `status` 查看、用 `watch` 监控、用 `result` 取回结果，或用 `cancel` 停止。Watcher 使用轻量 Codex 子代理，不会占住主对话。

`$pi-codex:ui --background` 会启动本地 Pi RPC Control Center。默认只监听回环地址，并输出带认证 token 的 URL；请勿分享该 URL。`$pi-codex:continue` 通过 Control Center 把后续指令发送给原来的在线 Pi 进程，不会静默退化为新建进程读取历史记录。

## Pi 配置

使用插件前先配置 Pi。常见命令如下：

```bash
pi --version
pi
pi install npm:pi-subagents   # 可选
```

模型选择优先使用命令中显式指定的选项，其次使用 Pi 自己的默认配置。本仓库不保存模型提供商凭据；请按 Pi 推荐的方式保存 API key。

## 运行数据

可以设置 `PI_CODEX_DATA_DIR` 覆盖运行数据目录，否则插件默认使用：

- Linux：`$XDG_STATE_HOME/pi-codex-plugin`，未设置时为 `~/.local/state/pi-codex-plugin`
- macOS：`~/Library/Application Support/pi-codex-plugin`
- Windows：`%LOCALAPPDATA%\pi-codex-plugin`

在平台支持时，状态目录会使用仅当前用户可访问的权限；每个工作区的数据存放在该根目录之下。

## 开发

```bash
npm run check-version
npm test
```

Codex manifest 位于 `plugins/pi-codex/.codex-plugin/plugin.json`，公开 skills 位于 `plugins/pi-codex/skills/`，Node.js runtime 位于 `plugins/pi-codex/scripts/`，个人 marketplace 配置位于 `.agents/plugins/marketplace.json`。

本地开发中修改插件后，需要刷新 Codex cachebuster 版本，并重新安装或更新 marketplace 插件，然后在新对话中测试。

## 安全说明

- Pi 会按委派任务所需的权限运行；只有确实需要修改文件时才使用 write 模式。
- Control Center 默认只监听本机回环地址，除非显式允许远程访问。
- Control Center 的认证 URL 含有秘密 token，请勿分享。
- 提交或推送前请检查生成的修改。

## 许可证与来源

本项目使用 [Apache License 2.0](LICENSE)。上游来源链见 [NOTICE](NOTICE)。项目由 [LightningLeader](https://github.com/LightningLeader) 维护。
