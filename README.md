# Pi for Codex 🥧

**中文** | [English](README_EN.md)

[![许可证：Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![Codex 插件](https://img.shields.io/badge/Codex-plugin-111827)](https://github.com/LightningLeader/pi-codex-plugin)

`pi-codex-plugin` 是一个只面向 Codex 的插件，用于把问题调查和实现任务交给 [Pi 编码 Agent](https://github.com/earendil-works/pi)。它支持前台任务、可追踪的后台任务、并行分发，以及通过本地 RPC 控制中心在原来的 Pi 进程中继续工作。

## 功能特点

- 委派只读调查或可修改文件的实现任务
- 在后台运行、查看、监控、取消任务并获取结果
- 通过 `pi-subagents` 并行处理多个相互独立的任务
- 通过本地 RPC 控制中心继续原来的在线 Pi 会话
- 支持 Pi 已配置的任意模型提供商和模型

## 运行要求

- Node.js 18.18 或更高版本
- 已安装 `pi` CLI，并至少配置一个模型提供商
- 可选：安装 [`pi-subagents`](https://github.com/nicobailon/pi-subagents) 以使用并行分发

Pi 可以使用其支持的任意模型提供商。Anthropic Claude 等提供商名称或模型 ID 只是 Pi 的配置选项；本插件的宿主集成只面向 Codex。

## 在 Codex 中安装

克隆仓库、注册本地 marketplace，然后安装插件：

```bash
git clone https://github.com/LightningLeader/pi-codex-plugin.git ~/pi-codex-plugin
codex plugin marketplace add ~/pi-codex-plugin
codex plugin add pi-codex@lightningleader
```

安装后请新建一个 Codex 对话，让插件 skills 被重新加载。运行 `$pi-codex:setup` 可以检查 Node.js、Pi、模型提供商、可用模型以及可选的 `pi-subagents`。

> 当前仓库为私有仓库时，克隆操作需要使用已获得访问权限的 GitHub 账号或 SSH 密钥。

## Skills

| Skill | 用途 |
| --- | --- |
| `$pi-codex:setup` | 检查本地 Pi 安装和配置 |
| `$pi-codex:task` | 委派调查或实现任务 |
| `$pi-codex:continue` | 在原来的在线 Pi RPC 进程中继续任务 |
| `$pi-codex:parallel-task` | 通过 pi-subagents 并行执行明确独立的任务 |
| `$pi-codex:status` | 查看已追踪的 Pi 任务 |
| `$pi-codex:watch` | 使用轻量 Codex 子代理监控后台任务 |
| `$pi-codex:result` | 获取已完成任务保存的结果 |
| `$pi-codex:cancel` | 取消正在运行的后台任务 |
| `$pi-codex:ui` | 启动、查看或停止本地 RPC 控制中心 |

## 使用示例

```text
$pi-codex:task 调查当前实现中的性能瓶颈
$pi-codex:task --write --background 实现所需的解析器
$pi-codex:status task-...
$pi-codex:result task-...
```

Task 支持只读或 `--write` 任务、前台或后台运行、模型选择、推理强度、结果输出文件和多模型竞速。

## 后台任务

后台任务会被持久化，可以使用：

- `$pi-codex:status` 查看状态
- `$pi-codex:watch` 在不占用主对话的情况下等待完成
- `$pi-codex:result` 获取完整结果
- `$pi-codex:cancel` 取消正在运行的任务

Watcher 使用轻量 Codex 子代理监控指定任务，主对话可以同时继续处理其他工作。

## RPC 控制中心与在线继续

运行 `$pi-codex:ui --background` 会启动本地 Pi RPC 控制中心。它默认只监听本机回环地址，并输出一个带认证 token 的 URL，请勿分享该 URL。

`$pi-codex:continue` 通过控制中心把后续指令发送给原来的在线 Pi 进程，不会静默退化为新建进程读取历史记录。如果 Codex 沙箱阻止访问 `127.0.0.1`，需要批准该命令访问本机控制中心。

## Pi 配置

使用插件前请先配置 Pi。常见命令如下：

```bash
pi --version
pi
pi install npm:pi-subagents   # 可选
```

模型选择优先使用 skill 调用中显式指定的选项，其次使用 Pi 自己的默认配置。本仓库不保存模型提供商凭据，请按照 Pi 推荐的方式保存 API key。

## 运行数据

可以设置 `PI_CODEX_DATA_DIR` 覆盖运行数据目录，否则插件默认使用：

- Linux：`$XDG_STATE_HOME/pi-codex-plugin`；未设置时为 `~/.local/state/pi-codex-plugin`
- macOS：`~/Library/Application Support/pi-codex-plugin`
- Windows：`%LOCALAPPDATA%\pi-codex-plugin`

在平台支持时，状态目录会使用仅当前用户可访问的权限；每个工作区的数据存放在该根目录之下。

## 开发与测试

```bash
npm run check-version
npm test
```

主要目录：

- `.agents/plugins/marketplace.json`：Codex marketplace 配置
- `plugins/pi-codex/.codex-plugin/plugin.json`：Codex 插件 manifest
- `plugins/pi-codex/skills/`：公开 skills
- `plugins/pi-codex/scripts/`：Node.js runtime 和 RPC 控制中心
- `plugins/pi-codex/prompts/`：运行时提示词模板
- `tests/`：自动化测试

本地开发中修改插件后，需要刷新 Codex cachebuster 版本，并重新安装或更新 marketplace 插件，然后在新对话中测试。

## 安全说明

- Pi 会按照委派任务所需的权限运行；只有确实需要修改文件时才使用 write 模式。
- RPC 控制中心默认只监听本机回环地址，除非显式允许远程访问。
- 控制中心认证 URL 含有秘密 token，请勿分享。
- 提交或推送前请检查 Pi 生成的修改。
- 本仓库不会保存模型提供商的 API key。

## 许可证与来源

本项目使用 [Apache License 2.0](LICENSE)。上游来源链见 [NOTICE](NOTICE)。项目由 [LightningLeader](https://github.com/LightningLeader) 维护。
