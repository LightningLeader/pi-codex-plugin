# Pi for Codex 🥧

**中文** | [English](README_EN.md)

[![许可证：Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![Codex 插件](https://img.shields.io/badge/Codex-plugin-111827)](https://github.com/LightningLeader/pi-codex-plugin)

`pi-codex-plugin` 是一个只面向 Codex 的插件。它让 Codex 可以把调查、实现和长时间运行的任务委派给 [Pi 编码 Agent](https://github.com/earendil-works/pi)，并负责追踪任务、保存结果、监控后台进度，以及通过本地 Web UI 操作仍然在线的 Pi RPC 会话。

## 它适合解决什么问题

- 把代码调查交给独立 Pi 上下文，避免挤占当前 Codex 对话
- 让 Pi 只读分析仓库，或者明确授权 Pi 修改文件并运行测试
- 把耗时任务放到后台，随后查询状态、等待完成、读取结果或取消
- 指定模型和推理强度，或让多个模型并行处理同一个任务
- 将多个彼此独立的子任务并行分发给 `pi-subagents`
- 在浏览器中实时查看 thinking、回复、工具调用和终端输出
- 在原来的 Pi RPC 进程中继续对话，而不是只从磁盘历史创建新进程

## 运行要求

- Node.js 18.18 或更高版本
- 已安装 `pi` CLI，并至少配置一个可用的模型提供商
- 可选：安装 [`pi-subagents`](https://github.com/nicobailon/pi-subagents)，用于 `$pi-codex:parallel-task`

Pi 可以使用其支持的任意提供商或 OpenAI 兼容端点。本插件不会把 Claude Code 当作宿主；模型名称中出现 Claude 只代表 Pi 使用了 Anthropic 模型。

## 安装

```bash
git clone https://github.com/LightningLeader/pi-codex-plugin.git ~/pi-codex-plugin
codex plugin marketplace add ~/pi-codex-plugin
codex plugin add pi-codex@lightningleader
```

安装完成后，新建一个 Codex 对话，让插件 skills 被加载。当前仓库为私有仓库时，克隆需要使用有访问权限的 GitHub 账号或 SSH 密钥。

首次使用先检查环境：

```text
$pi-codex:setup
```

该命令会检查 Node.js、Pi CLI、提供商凭据、可用模型、模型回退配置、会话运行目录以及可选的 `pi-subagents`。

## 五分钟快速上手

### 1. 只读调查

不写 `--write` 时，Pi 只能使用读取、搜索和列目录工具：

```text
$pi-codex:task 调查登录接口偶发返回 500 的原因。只分析，不修改文件；给出证据、涉及文件和建议修复方案。
```

这是默认且更安全的模式，适合定位 bug、理解代码、评估方案和查找性能瓶颈。

### 2. 允许实现

只有明确加入 `--write`，Pi 才能修改当前工作区：

```text
$pi-codex:task --write 修复登录接口的空指针问题，补充回归测试并运行相关测试。不要改动无关文件。
```

前台任务会占用当前调用直到 Pi 完成，并直接返回结果。

### 3. 放到后台

```text
$pi-codex:task --write --background 实现 CSV 导出功能，完成后运行测试。
```

启动成功后会立即返回类似 `task-...` 的 Job ID。保存这个 ID，然后使用：

```text
$pi-codex:status task-...
$pi-codex:result task-...
```

### 4. 自动监督后台任务

```text
$pi-codex:task --write --supervised 实现分页接口并运行测试。
```

`--supervised` 会自动以后台模式启动任务，再附加一个轻量 Codex watcher。主对话可以继续做其他事情；watcher 只在任务结束时报告简短状态，不会自动读取大段结果。

### 5. 打开 Control Center

```text
$pi-codex:ui --background
```

复制命令返回的带 token URL，在本机浏览器打开。随后通过 `$pi-codex:task` 发出的普通任务会优先连接正在运行的 Control Center，因此可以在网页中实时查看和操作对应的 Pi 会话。

## Skills 一览

| Skill | 用途 |
| --- | --- |
| `$pi-codex:setup` | 检查 Pi、模型提供商和可选依赖 |
| `$pi-codex:task` | 发布一个调查或实现任务 |
| `$pi-codex:parallel-task` | 通过 `pi-subagents` 并行执行多个独立任务 |
| `$pi-codex:continue` | 在原来的在线 Pi RPC 进程中继续任务 |
| `$pi-codex:status` | 列出任务或查看指定任务状态 |
| `$pi-codex:watch` | 给已有后台任务附加轻量 watcher |
| `$pi-codex:result` | 读取已完成任务保存的结果 |
| `$pi-codex:cancel` | 取消正在运行的后台任务 |
| `$pi-codex:ui` | 启动、查看或停止本地 Control Center |

## 如何发布任务

基本格式：

```text
$pi-codex:task [参数] <任务说明>
```

任务说明最好同时写明目标、上下文、允许范围、验收条件和验证方式。例如：

```text
$pi-codex:task --write --effort high \
目标：修复用户重复提交订单的问题。 \
范围：只修改 src/order 和对应测试。 \
约束：不得改变公开 API；不要新增生产依赖。 \
验收：并发请求只创建一条订单记录。 \
验证：运行订单模块测试并报告结果。
```

这里的反斜杠只是为了展示结构；在 Codex 输入框里直接写成一条或多行消息即可。

### Task 参数与“超参数”

| 参数 | 默认值 | 作用与使用建议 |
| --- | --- | --- |
| `--write` | 关闭 | 授权 Pi 使用写入工具修改文件。不加时为只读工具集。只有实现任务才开启。 |
| `--background` | 关闭 | 后台启动并立即返回 Job ID。适合耗时任务。 |
| `--supervised` | 关闭 | Codex 编排参数：隐式启用后台任务并附加 watcher。它不是底层 Pi CLI 参数。 |
| `--poll-interval-ms <毫秒>` | `10000` | watcher 查询间隔，最小 `100`。通常保持默认，过小会增加本地轮询。与 `--supervised` 或 `$pi-codex:watch` 一起使用。 |
| `--model <模型>` / `-m <模型>` | Pi 默认模型 | 固定本次任务使用的模型，例如 `provider/model`。具体名称以 `$pi-codex:setup` 显示为准。 |
| `--effort <等级>` | Pi/模型默认值 | 推理强度：`off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`；`none` 是 `off` 的别名。模型不支持时 Pi 可能拒绝该等级。 |
| `--race <m1,m2,...>` | 关闭 | 让至少两个模型并行完成同一任务并比较结果。只有一个模型时等价于 `--model`。 |
| `--out-file <路径>` | 关闭 | 前台任务把完整输出写入文件，只把摘要返回给 Codex，适合超长报告。后台任务应在完成后使用 `$pi-codex:result --out-file`。 |
| `--resume-last` / `--resume` | 关闭 | 从当前仓库最近一次可恢复的 Pi 磁盘会话继续，但会启动替代 RPC 进程。若必须复用原进程，应使用 `$pi-codex:continue`。 |
| `--fresh` | 默认行为 | 显式要求从新会话开始，主要用于防止误用恢复模式。不能与 `--resume-last` 同时使用。 |
| `--prompt-file <路径>` | 关闭 | 从 UTF-8 文件读取完整任务说明，适合较长的规格文档。 |
| `--cwd <目录>` / `-C <目录>` | 当前目录 | 指定任务工作目录；任务记录会归入解析后的工作区。 |
| `--json` | 关闭 | 输出机器可读 JSON，主要用于脚本和调试。一般对话无需使用。 |

### 参数组合限制

- `--model` 与 `--race` 不能同时使用。
- `--race` 与 `--resume`/`--resume-last` 不能同时使用；每个 racer 都从新会话开始。
- `--fresh` 与 `--resume`/`--resume-last` 不能同时使用。
- 同时最多附加两个以 `pi_watch_` 命名的 watcher；没有空闲代理槽位时，Pi 任务仍会继续运行，但不会被监督。
- `--out-file` 最适合前台任务。后台任务先保存 Job ID，完成后再用 `$pi-codex:result <job-id> --out-file <路径>`。

### 模型与 effort 怎么选

- 不指定 `--model`：使用 Pi 当前默认模型，最适合日常使用。
- 指定 `--model`：用于复现实验、控制成本或使用某个模型的特长。
- `low`/`medium`：适合普通代码调查、小修复和格式化工作。
- `high`/`xhigh`/`max`：适合复杂调试、架构分析和跨模块修改，通常更慢且成本更高。
- `off`/`minimal`：适合机械性任务，但不建议用于复杂实现。

可配置自动模型回退：

```bash
export PI_PLUGIN_FALLBACK_MODELS="provider/model-b,provider/model-c"
```

普通任务的主模型失败后，插件会按顺序尝试这些模型。它与 `--race` 不同：回退是失败后串行重试，race 是多个模型同时执行并展示候选结果。

## 典型使用案例

### 案例一：只读定位测试失败

```text
$pi-codex:task --effort high 调查 tests/auth.test.ts 中偶发失败的根因。不要修改文件；结合调用链说明竞态条件发生在哪里，并给出最小修复建议。
```

### 案例二：实现并验证一个修复

```text
$pi-codex:task --write --effort high 修复上传大文件时的内存峰值问题。保持公开 API 不变，补充测试，运行相关测试并总结修改文件。
```

### 案例三：长任务后台执行

```text
$pi-codex:task --write --background 把旧配置解析器迁移到新格式，保留向后兼容，并运行完整测试。
```

随后：

```text
$pi-codex:status task-...
$pi-codex:status task-... --wait
$pi-codex:result task-... --out-file reports/migration-result.md
```

`status --wait` 默认最多等待 4 分钟、每 2 秒检查一次。底层还接受 `--timeout-ms` 和 `--poll-interval-ms`；如果只想让主对话立即恢复，优先使用 `$pi-codex:watch` 或 `--supervised`。

### 案例四：后台任务自动监督

```text
$pi-codex:task --write --supervised --poll-interval-ms 15000 实现缓存失效策略并运行测试。
```

这会立即返回 Pi Job ID 和 watcher 信息。任务结束后，再读取完整结果：

```text
$pi-codex:result task-...
```

也可以给已经启动的后台任务补挂 watcher：

```text
$pi-codex:watch task-... --poll-interval-ms 15000
```

### 案例五：比较多个模型的分析结果

```text
$pi-codex:task --race provider/model-a,provider/model-b --effort high 分析当前数据库事务设计，比较潜在的数据一致性问题。只读分析。
```

### 案例六：让多个模型分别尝试实现

```text
$pi-codex:task --write --race provider/model-a,provider/model-b 修复解析器性能问题并补充基准测试。
```

可写 race 有特殊安全行为：

1. 当前目录必须是 Git 仓库。
2. 每个模型在从 `HEAD` 创建的独立临时 worktree 中运行，不会直接修改当前工作树。
3. 当前未提交的改动不会被 racer 看到。
4. 每个成功候选会生成 patch；检查结果后，手动执行输出中的 `git apply <patch-file>` 应用获胜方案。

### 案例七：把超长结果写入文件

```text
$pi-codex:task --out-file reports/security-analysis.md 全面分析认证模块的安全边界，只读，不修改文件。
```

Codex 只接收简短摘要，完整内容保存在指定文件，能够减少当前对话的上下文占用。

### 案例八：继续上一次任务

如果只需要读取最近的 Pi 磁盘会话并继续：

```text
$pi-codex:task --resume-last 根据刚才的调查结论补充一个更具体的修复计划。
```

如果必须保留原来的内存上下文、扩展状态和同一个 RPC PID，请先启动 Control Center，并使用：

```text
$pi-codex:continue task-... 再检查一遍刚才的修改，并运行遗漏的边界测试。
```

不提供 Job ID 时，`continue` 会选择当前调用者、当前工作区中最新的空闲在线任务。目标会话正在运行、已经断开或原进程退出时，命令会明确失败，不会静默创建新进程。

### 案例九：并行处理独立任务

先安装可选依赖：

```bash
pi install npm:pi-subagents
```

然后明确列出可以彼此独立完成的任务：

```text
$pi-codex:parallel-task
1. 为用户模块补充单元测试。
2. 更新部署文档中的环境变量说明。
3. 检查订单模块是否存在未处理的 Promise rejection。
```

不要把存在先后依赖的步骤交给 `parallel-task`，例如“先改数据库结构，再基于新结构修改接口”。

## 后台任务的完整生命周期

### 查看任务

```text
$pi-codex:status
$pi-codex:status --all
$pi-codex:status task-...
$pi-codex:status task-... --wait
```

- 无 Job ID：显示当前工作区的活动任务和近期任务。
- `--all`：显示更多历史任务。
- 指定 Job ID：显示该任务的状态、阶段、PID、耗时和摘要。
- `--wait`：阻塞等待指定任务进入终态，必须同时提供 Job ID。

常见状态包括 `queued`、`running`、`completed`、`failed` 和 `cancelled`。

### 获取结果

```text
$pi-codex:result task-...
$pi-codex:result task-... --out-file reports/result.md
```

第二种写法适合大结果：完整内容写入文件，Codex 只接收路径和摘要。

### 取消任务

```text
$pi-codex:cancel task-...
```

`cancel` 面向已追踪、仍在运行的 Pi Job。它不同于 UI 中的“结束进程”：前者按 Job ID 取消任务，后者直接结束某个在线 Control Session 的 RPC 进程。

## Pi Control Center UI 使用手册

Control Center 是仅在本机运行的 Pi RPC Web UI。它既能显示插件任务，也可以直接创建和操作 Pi 会话。

### 启动、查询和停止

推荐后台启动：

```text
$pi-codex:ui --background
```

查询当前状态和认证 URL：

```text
$pi-codex:ui --status
```

停止整个 Control Center：

```text
$pi-codex:ui --stop
```

UI 参数：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `--background` | 关闭 | 后台启动服务器并立即返回 URL。推荐日常使用。 |
| `--status` | 关闭 | 查看现有 Control Center 的 PID、工作区和认证 URL。 |
| `--stop` | 关闭 | 停止 Control Center，以及由它维护的在线 Pi RPC 会话。 |
| `--cwd <目录>` | 当前工作区 | 指定 Control Center 所属工作区。 |
| `--host <地址>` | `127.0.0.1` | 监听地址。默认只允许本机访问。 |
| `--port <端口>` | `43120` | HTTP 端口；被占用时可改用其他端口。 |
| `--allow-remote` | 关闭 | 显式允许非回环地址。除非完全了解网络风险，否则不要使用。 |

启动结果类似：

```text
# Pi Control Center

Status: running (pid 12345)
Workspace: /path/to/project
Open: http://127.0.0.1:43120/?token=<secret>
```

第一次必须使用完整 URL 打开。服务会把 token 写入仅该站点使用的 HttpOnly Cookie。token 等同于控制权限，不要截图、粘贴到 issue、写入仓库或分享给其他人。

### UI 与 `$pi-codex:task` 的关系

- Control Center 运行时，普通单模型 `$pi-codex:task` 会优先通过它创建可交互会话。
- 前台任务仍会等待最终结果；后台任务仍会立即返回 Job ID。
- `--race` 任务使用独立 race 执行流程，不进入单一在线 Control Session。
- `$pi-codex:continue` 只复用 Control Center 中仍在线且空闲的原 RPC 进程。
- 如果希望后续能严格继续同一进程，最好先启动 UI，再发布任务。

### 页面区域

1. **顶部栏**：显示 Control Center 连接状态和 PID；“新建会话”用于直接创建 Pi RPC 会话。
2. **左侧会话列表**：按更新时间合并显示在线会话和只读任务记录，并显示状态、Job ID、监督状态等信息。
3. **会话标题区**：显示工作目录、模型、只读/可写模式、Job ID、RPC PID 和当前阶段。
4. **消息记录区**：实时呈现用户消息、thinking、Markdown 回复、工具参数、工具调用与增量输出。
5. **输入区**：向仍在线的 Pi 进程发送普通消息、Steer 或 Follow-up。

### 新建会话

点击“新建会话”，填写：

- **名称**：用于左侧列表显示，不影响模型行为。
- **工作目录**：Pi 操作的目录；目录不存在时会自动创建。
- **模型**：可选，格式取决于 Pi，例如 `provider/model`；留空使用 Pi 默认模型。
- **Thinking level**：可选，留空使用 Pi 默认值。
- **初始任务**：创建会话后立即发送给 Pi 的第一条任务。
- **只读会话**：勾选后只启用 `read`、`grep`、`find`、`ls` 工具；不勾选则允许 Pi 使用其正常工具集。

### 三种消息发送模式

| 模式 | 行为 | 适用场景 |
| --- | --- | --- |
| 普通消息 | 空闲时立即发送；Pi 正在运行时按 follow-up 行为排队 | 普通新任务或自然接续对话 |
| Steer | 等当前工具调用结束后改变正在执行任务的方向 | 发现 Pi 理解偏差，希望尽快纠正但不强制中断 |
| Follow-up | 等当前任务完整结束后，再执行这条消息 | 提前排队后续检查、测试或总结任务 |

输入完成后点击“发送”，或按 `Ctrl+Enter` / `Cmd+Enter`。

### 会话操作按钮的区别

| 操作 | 当前任务 | Pi RPC 进程 | 会话记录 | 能否继续对话 |
| --- | --- | --- | --- | --- |
| 中断 | 中止当前这一轮 | 保留 | 保留 | 可以 |
| 结束进程 | 取消当前任务 | 结束 | 保留 | 不可以 |
| 删除会话 | 停止当前任务 | 结束 | 从 Control Center 删除 | 不可以 |

“删除会话”不可恢复。若只是觉得 Pi 当前方向不对，优先使用 Steer；若要停止当前生成但稍后继续，使用“中断”。

### 阅读输出

- Thinking 和工具卡片可分别展开或折叠。
- “全部折叠”会统一收起 thinking/工具卡片，并在浏览器本地记住设置。
- 向上滚动后自动跟随会暂停；点击“回到最新”重新跟随实时输出。
- “重载历史”会重新获取 Pi 的完整消息历史，适合断线重连或显示异常时使用。
- Pi 扩展发起选择、输入、编辑或确认请求时，页面顶部会显示待处理 UI 请求，可直接允许、拒绝或提交回答。

### 在线会话与只读任务记录

- **在线会话**有消息输入框，并显示 RPC PID。只要进程状态正常，就能继续交互。
- **只读任务记录**用于展示已持久化但不再在线的任务结果，并提供“原始任务日志（诊断）”。它不能重新变成原 RPC 进程。
- “删除任务”会删除该任务记录；如果任务仍在运行，也会同时停止它。执行前会弹出确认。

### UI 常见问题

- **页面显示未认证**：重新运行 `$pi-codex:ui --status`，使用返回的完整带 token URL。
- **端口已被占用**：使用 `$pi-codex:ui --background --port 43121`。
- **`continue` 报 loopback/EPERM**：允许 Codex 命令访问本机 `127.0.0.1`；插件不会在失败时偷偷创建替代进程。
- **页面显示 RPC 已退出**：记录仍可查看，但无法继续对话；创建新会话或重新发布任务。
- **任务没有出现在 UI**：确认 UI 已启动、工作区匹配，并刷新左侧列表。race 任务不会作为单一在线会话出现。

## Pi 配置

常用命令：

```bash
pi --version
pi
pi install npm:pi-subagents  # 可选
```

模型选择顺序为：本次任务显式 `--model`、Pi 自己的默认配置。`PI_PLUGIN_FALLBACK_MODELS` 只在前一个模型运行失败后参与自动重试。本仓库不保存模型提供商凭据，请使用 Pi 推荐的 `/login`、环境变量或 `~/.pi/agent/models.json` 配置方式。

## 运行数据

可以设置 `PI_CODEX_DATA_DIR` 覆盖运行数据目录，否则默认使用：

- Linux：`$XDG_STATE_HOME/pi-codex-plugin`；未设置时为 `~/.local/state/pi-codex-plugin`
- macOS：`~/Library/Application Support/pi-codex-plugin`
- Windows：`%LOCALAPPDATA%\pi-codex-plugin`

状态、Job 结果、watcher 记录、日志和 Control Center 描述文件会按工作区保存在该目录下。在平台支持时，目录权限会限制为仅当前用户可访问。

## 安全说明

- 只有确实需要修改文件时才使用 `--write`。
- Pi 完成修改后仍应检查 diff，再提交或推送。
- 可写 race 从 Git `HEAD` 建立隔离 worktree，不包含未提交改动。
- Control Center 默认只监听回环地址；不要把带 token 的 URL 分享给他人。
- `--allow-remote` 没有自动提供 TLS 或公网安全防护，不建议暴露到互联网。
- 仓库和运行数据都不会主动保存模型提供商 API key。

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
- `plugins/pi-codex/control-ui/`：Control Center 前端
- `plugins/pi-codex/prompts/`：运行时提示词模板
- `tests/`：自动化测试

本地开发中修改插件后，需要刷新 Codex cachebuster、重新安装插件，并在新 Codex 对话中测试。

## 许可证与来源

本项目使用 [Apache License 2.0](LICENSE)。来源和必须保留的版权说明见 [NOTICE](NOTICE)。项目由 [LightningLeader](https://github.com/LightningLeader) 维护。
