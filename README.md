# Pi for Codex

**中文** | [English](README_EN.md)

[![许可证：Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![Codex 插件](https://img.shields.io/badge/Codex-plugin-111827)](https://github.com/LightningLeader/pi-codex-plugin)

`pi-codex-plugin` 是一个只面向 Codex 的插件。它让 Codex 可以把调查、实现和长时间运行的任务委派给 [Pi 编码 Agent](https://github.com/earendil-works/pi)，并负责追踪任务、保存结果、监控后台进度，以及通过本地 Web UI 操作仍然在线的 Pi RPC 会话。

## 它适合解决什么问题

- 把代码调查交给独立 Pi 上下文，避免挤占当前 Codex 对话
- 让 Pi 只读分析仓库，或者明确授权 Pi 修改文件并运行测试
- 把耗时任务放到后台，随后查询状态、等待完成、读取结果或取消
- 固定使用一个 Pi 模型，或让多个模型并发处理同一任务并比较结果
- 根据任务复杂度选择推理强度
- 将多个彼此独立的子任务并行分发给 `pi-subagents`
- 在浏览器中实时查看 thinking、回复、工具调用和终端输出
- 在原来的 Pi RPC 进程中继续对话，而不是只从磁盘历史创建新进程

## 运行要求

- Node.js 18.18 或更高版本
- 已安装 `pi` CLI，并至少配置一个可用的提供商
- 可选：安装 [`pi-subagents`](https://github.com/nicobailon/pi-subagents)，用于 `$pi-codex:parallel-task`

Pi 使用其自身配置的默认提供商。本插件不会把 Claude Code 当作宿主。

### Windows 用户注意

Pi 在 Windows 上需要可用的 Bash 环境，推荐安装 [Git for Windows](https://gitforwindows.org/) 提供的 Git Bash。Pi 通常会自动查找 Git Bash；如果未能正确识别，请在 `%USERPROFILE%\.pi\agent\settings.json` 中把 `shellPath` 设置为本机 `bash.exe` 的实际路径，例如：

```json
{
  "shellPath": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

安装位置可能因用户和安装方式而不同，不要直接假定示例路径一定存在。请先确认实际的 `bash.exe` 位置；完整说明参见 [Pi Windows Setup](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/windows.md)。这是 Pi 自身的 Windows 运行要求，不是本插件额外引入的依赖。

## 安装

```bash
git clone https://github.com/LightningLeader/pi-codex-plugin.git ~/pi-codex-plugin
codex plugin marketplace add ~/pi-codex-plugin
codex plugin add pi-codex@lightningleader
```

安装完成后，新建一个 Codex 对话，让插件 skills 被加载。

首次使用先检查环境：

```text
$pi-codex:setup
```

该命令会检查 Node.js、Pi CLI、提供商凭据、会话运行目录以及可选的 `pi-subagents`。

## 五分钟快速上手

### 1. 只读调查

不写 `--write` 时，Pi 只能使用读取、搜索和列目录工具：

```text
$pi-codex:task 调查登录接口偶发返回 500 的原因。只分析，不修改文件；给出证据、涉及文件和建议修复方案。
```

这是默认且更安全的模式，适合定位 bug、理解代码、评估方案和查找性能瓶颈。

### 2. 允许实现

底层运行时只有收到 `--write` 才允许修改文件；但通过 skill 使用时，不要求你亲自写参数。只要自然语言明确要求“实现、修复、修改、创建文件”，Codex 就会自动以可写模式调用 Pi：

```text
调用 $pi-codex:task 修复登录接口的空指针问题，补充回归测试并运行相关测试。不要改动无关文件。
```

前台任务会占用当前调用直到 Pi 完成，并直接返回结果。

### 3. 放到后台

```text
调用 $pi-codex:task 实现 CSV 导出功能，完成后运行测试。请放到后台执行。
```

启动成功后会立即返回类似 `task-...` 的 Job ID。保存这个 ID，然后使用：

```text
$pi-codex:status task-...
$pi-codex:result task-...
```

### 4. 自动监督后台任务

```text
调用 $pi-codex:task 实现分页接口并运行测试，后台运行，并开启子智能体监督。
```

Codex 会把“后台运行”和“开启子智能体监督”转换为对应执行选项：后台启动任务，再附加一个轻量 watcher。主对话可以继续做其他事情；watcher 只在任务结束时报告简短状态，不会自动读取大段结果。

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

推荐直接用自然语言告诉 Codex：调用哪个 skill、要完成什么、是否允许修改、是否后台运行、是否需要监督。你不必记住参数名称。

```text
调用 $pi-codex:task 调查支付回调偶发重复执行的原因，只分析，不要修改代码。

使用 $pi-codex:task 修复支付回调重复执行的问题，补充测试，后台运行，完成时让子智能体通知我。
```

Codex 会根据表达自动转换执行方式：

| 你可以这样说 | Codex 的执行行为 |
| --- | --- |
| “调查、分析、解释，不要改文件” | 只读前台任务 |
| “修复、实现、修改文件、补充测试” | 自动启用可写模式 |
| “放到后台、不要阻塞当前对话” | 后台启动并返回 Job ID |
| “开启子智能体监督、完成后通知我” | 后台运行并附加 watcher |
| “使用模型 X” | 使用 `--model` 固定该 Pi 模型 |
| “让模型 X、Y 同时完成并比较” | 使用 `--race` 并发运行同一任务 |
| “仔细分析、使用较高推理强度” | 使用较高 `effort` |
| “完整结果保存到某个文件” | 使用输出文件模式 |
| “继续刚才的在线 Pi 任务” | 优先使用 `$pi-codex:continue` |

任务说明最好写明目标、范围、约束、验收条件和验证方式。例如：

```text
调用 $pi-codex:task 完成下面的任务，使用较高推理强度，并在前台执行：
目标：修复用户重复提交订单的问题。
范围：只修改 src/order 和对应测试。
约束：不得改变公开 API；不要新增生产依赖。
验收：并发请求只创建一条订单记录。
验证：运行订单模块测试并报告结果。
```

也可以直接使用参数形式：

```text
$pi-codex:task [参数] <任务说明>
```

参数形式适合自动化、精确复现或你已经熟悉插件时使用；自然语言和参数可以混合。

### Task 参数与“超参数”

| 参数 | 默认值 | 作用与使用建议 |
| --- | --- | --- |
| `--write` | 关闭 | 授权 Pi 使用写入工具修改文件。不加时为只读工具集。只有实现任务才开启。 |
| `--background` | 关闭 | 后台启动并立即返回 Job ID。适合耗时任务。 |
| `--supervised` | 关闭 | Codex 编排参数：隐式启用后台任务并附加 watcher。它不是底层 Pi CLI 参数。 |
| `--poll-interval-ms <毫秒>` | `10000` | watcher 查询间隔，最小 `100`。通常保持默认，过小会增加本地轮询。与 `--supervised` 或 `$pi-codex:watch` 一起使用。 |
| `--model <模型>` / `-m <模型>` | Pi 默认模型 | 固定本次任务使用一个 Pi 模型。模型标识符必须与本机 Pi 配置一致。 |
| `--race <模型1,模型2,...>` | 关闭 | 让两个或更多 Pi 模型并发执行同一个任务，最后汇总各自结果。单个模型会退化为 `--model`。 |
| `--effort <等级>` | Pi 默认值 | 推理强度：`off`、`minimal`、`low`、`medium`、`high`、`xhigh`、`max`；`none` 是 `off` 的别名。不支持的等级会被 Pi 拒绝。 |
| `--out-file <路径>` | 关闭 | 前台任务把完整输出写入文件，只把摘要返回给 Codex，适合超长报告。后台任务应在完成后使用 `$pi-codex:result --out-file`。 |
| `--resume-last` / `--resume` | 关闭 | 从当前仓库最近一次可恢复的 Pi 磁盘会话继续，但会启动替代 RPC 进程。若必须复用原进程，应使用 `$pi-codex:continue`。 |
| `--fresh` | 默认行为 | 显式要求从新会话开始，主要用于防止误用恢复模式。不能与 `--resume-last` 同时使用。 |
| `--prompt-file <路径>` | 关闭 | 从 UTF-8 文件读取完整任务说明，适合较长的规格文档。 |
| `--cwd <目录>` / `-C <目录>` | 当前目录 | 指定任务工作目录；任务记录会归入解析后的工作区。 |
| `--json` | 关闭 | 输出机器可读 JSON，主要用于脚本和调试。一般对话无需使用。 |

### 参数组合限制

- `--fresh` 与 `--resume`/`--resume-last` 不能同时使用。
- `--model` 与 `--race` 不能同时使用；`--race` 不能与 `--resume`/`--resume-last` 同时使用，因为每个参赛模型都会启动新会话。
- 只读 race 中，各模型会并发检查当前工作树。可写 race 中，各模型从当前 `HEAD` 创建独立 Git worktree，因此看不到未提交改动；插件会为每个成功候选保存补丁，但不会自动选择或应用胜者。
- race 不进入 Control Center 的任务队列，但仍支持前台、后台和 supervised 后台运行。
- 同时最多附加两个以 `pi_watch_` 命名的 watcher；没有空闲代理槽位时，Pi 任务仍会继续运行，但不会被监督。
- `--out-file` 最适合前台任务。后台任务先保存 Job ID，完成后再用 `$pi-codex:result <job-id> --out-file <路径>`。

### effort 怎么选

- 不指定：使用 Pi 当前默认推理强度，适合大多数任务。
- `low`/`medium`：适合普通代码调查、小修复和格式化工作。
- `high`/`xhigh`/`max`：适合复杂调试、架构分析和跨模块修改，通常更慢且成本更高。
- `off`/`minimal`：适合机械性任务，但不建议用于复杂实现。

## 典型使用案例

下面的示例刻意采用日常表达。主控 Codex 会理解意图并选择所需参数，不要求逐字照抄。

### 推荐工作流：Codex 规划 → Pi 执行 → Codex 核查

这个流程适合跨文件开发、复杂缺陷修复和重构：先由 Codex 理清仓库现状并制定计划，再把确认后的计划交给 Pi 实施，最后由 Codex 独立验收结果。

#### 第一步：让 Codex 在 Plan mode 中制定计划

先切换到 Codex 的 Plan mode，然后描述目标、限制和验收要求。例如：

```text
请先分析当前仓库，为“给用户登录接口增加请求限流”制定一份可执行计划。
这一阶段不要修改文件。请说明需要改动的模块、实现步骤、测试方法、兼容性要求和主要风险；如果存在会影响方案的关键问题，先向我确认。
```

检查 Codex 给出的计划，根据需要补充或修改，直到计划可以直接执行。

#### 第二步：把最终计划交给 Pi 执行

计划确认后，可以直接对主控 Codex 说：

```text
调用 $pi-codex:task 执行刚才确认的最终计划。把完整计划原文一并发送给 Pi，允许修改文件并运行测试；任务在后台运行，开启子智能体监督。严格遵守计划中的改动范围和兼容性要求，完成后汇报修改文件、测试结果，以及任何偏离计划的地方。
```

这里应把完整计划写入 Pi 的任务说明，而不是只向 Pi 发送“执行刚才的计划”。Pi 任务拥有自己的上下文，明确附上计划可以避免遗漏范围、约束和验收标准。启动后，Codex 会返回 Job ID；监督子智能体会在后台跟踪任务，不影响你继续使用主对话。

如果需要手动查看进度或读取结果，可以说：

```text
调用 $pi-codex:status 查看 task-... 的进度。
调用 $pi-codex:result 读取 task-... 的最终结果。
```

#### 第三步：让 Codex 独立核查执行结果

Pi 完成后，不要只根据 Pi 的总结判断任务是否完成。让主控 Codex 直接检查工作区：

```text
Pi 已经完成 task-...。现在请由你核查执行结果，不要再把核查委派给 Pi。
请检查实际 git diff，逐项对照最终计划和验收标准，运行必要的测试，并检查是否存在遗漏、计划外改动、兼容性问题或回归风险。
先给出“通过”或“不通过”的结论，再列出证据；如果不通过，明确说明需要修正的内容，不要直接假定 Pi 的完成报告是正确的。
```

这样形成了清晰的职责分工：Codex 负责规划和最终验收，Pi 负责按计划实施，监督子智能体负责跟踪后台执行状态。

### 案例一：只读调查

```text
调用 $pi-codex:task 调查 tests/auth.test.ts 偶发失败的根因。只做分析，不要修改任何文件；结合调用链说明竞态条件发生在哪里，并给出最小修复建议。
```

Codex 会保留运行时的默认只读模式。

### 案例二：实现并验证一个修复

```text
请把这个实现任务交给 $pi-codex:task：修复上传大文件时的内存峰值问题，保持公开 API 不变，补充测试，运行相关测试并总结修改文件。
```

虽然没有写 `--write`，但“修复”和“补充测试”已经明确要求修改文件，Codex 会自动启用可写模式。

### 案例三：后台运行并开启子智能体监督

```text
调用 $pi-codex:task 把旧配置解析器迁移到新格式，保留向后兼容并运行完整测试。这个任务在后台运行，开启子智能体监督，完成后通知我。
```

Codex 会自动组合可写、后台和 supervised 模式，并立即返回 Pi Job ID 与 watcher 信息。

### 案例四：后台运行，但不需要监督

```text
使用 $pi-codex:task 在后台整理 API 文档中的失效链接，只修改文档，不要启动监督子智能体。把 Job ID 告诉我。
```

之后可以自然地要求 Codex 调用相应 skill：

```text
调用 $pi-codex:status 查看 task-... 的进度。
调用 $pi-codex:result 读取 task-... 的最终结果。
```

### 案例五：指定一个 Pi 模型

```text
调用 $pi-codex:task 使用 openai/gpt-5.2 模型只读分析缓存失效问题，列出证据和修复建议，不要修改文件。
```

Codex 会把明确指定的模型转换为 `--model`。模型名称只是示例，请使用 `$pi-codex:setup` 所列出的本机可用模型标识符。

### 案例六：让多个模型处理同一个任务并比较

```text
调用 $pi-codex:task，让 openai/gpt-5.2 和 google/gemini-3-pro 同时分析数据库迁移方案。只读运行，比较两者的风险判断与建议，不要修改文件。
```

这会使用 `--race` 并发运行同一份任务。若要求修改文件，每个模型会在隔离 worktree 中实现并产出独立补丁，由你或 Codex 核查后选择一个应用。

### 案例七：复杂任务使用更高推理强度

```text
调用 $pi-codex:task 深入分析订单状态机中的并发问题，使用较高推理强度。先只读调查，列出证据和候选方案，不要修改代码。
```

### 案例八：把长结果保存到文件

```text
调用 $pi-codex:task 全面分析认证模块的安全边界，只读，不修改文件。完整报告保存到 reports/security-analysis.md，当前对话只返回摘要。
```

### 案例九：给已有任务补挂监督

```text
调用 $pi-codex:watch 监督任务 task-...，每 15 秒检查一次。不要阻塞当前主对话，任务结束时告诉我结果是否可用。
```

### 案例十：继续原来的在线 Pi 进程

```text
调用 $pi-codex:continue 继续 task-... 对应的在线 Pi 会话，让它根据刚才的修改再运行一次边界测试，并解释失败原因。
```

`continue` 要求原 Control Session 和 RPC 进程仍在线且空闲；不满足时会明确失败，不会偷偷换成新进程。

### 案例十一：恢复最近的磁盘会话

```text
调用 $pi-codex:task 读取当前仓库最近一次可恢复的 Pi 任务历史，继续完善刚才的修复计划。这次只输出计划，不修改文件。
```

这种表达会使用 `resume-last`。它可以恢复 Pi 的持久化历史，但不保证复用原 RPC PID；严格复用原进程时应使用 `$pi-codex:continue`。

### 案例十二：并行处理多个独立任务

先安装可选依赖：

```bash
pi install npm:pi-subagents
```

然后明确说明任务彼此独立：

```text
调用 $pi-codex:parallel-task 并行完成下面三个彼此独立的任务：
1. 为用户模块补充单元测试；
2. 更新部署文档中的环境变量说明；
3. 调查订单模块是否存在未处理的 Promise rejection，第三项只读分析。
```

不要把存在先后依赖的步骤交给 `parallel-task`，例如“先改数据库结构，再基于新结构修改接口”。

### 案例十三：取消后台任务

```text
调用 $pi-codex:cancel 取消 task-...。如果已经完成，只报告当前状态，不要启动新任务。
```

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

- Control Center 运行时，`$pi-codex:task` 会优先通过它创建可交互会话。
- `--race` 会绕过 Control Center 队列，由插件运行时并发运行各模型；单模型 `--model` 任务仍可通过 Control Center。
- 前台任务仍会等待最终结果；后台任务仍会立即返回 Job ID。
- `$pi-codex:continue` 只复用 Control Center 中仍在线且空闲的原 RPC 进程。
- 如果希望后续能严格继续同一进程，最好先启动 UI，再发布任务。

### 页面区域

1. **顶部栏**：显示 Control Center 连接状态和 PID；“新建会话”用于直接创建 Pi RPC 会话。
2. **左侧会话列表**：按更新时间合并显示在线会话和只读任务记录，并显示状态、Job ID、监督状态等信息。
3. **会话标题区**：显示工作目录、实际模型、只读/可写模式、Job ID、RPC PID 和当前阶段。
4. **消息记录区**：实时呈现用户消息、thinking、Markdown 回复、工具参数、工具调用与增量输出。
5. **输入区**：向仍在线的 Pi 进程发送普通消息、Steer 或 Follow-up。

### 新建会话

点击“新建会话”，填写：

- **名称**：用于左侧列表显示，不影响任务行为。
- **工作目录**：Pi 操作的目录；目录不存在时会自动创建。
- **模型**：供 UI 手动会话选择，可选；留空时使用 Pi 默认配置。通过 `$pi-codex:task` 发布任务时也可以用自然语言指定模型或使用 `--model`。
- **Thinking level**：可选，留空使用 Pi 默认值。
- **初始任务**：创建会话后立即发送给 Pi 的第一条任务。
- **只读会话**：勾选后只启用 `read`、`grep`、`find`、`ls` 工具；不勾选则允许 Pi 使用其正常工具集。

注意两个入口的默认值不同：`$pi-codex:task` 底层默认只读，由 Codex 根据自然语言为实现任务自动加入写权限；UI 手动“新建会话”默认可写，只有勾选“只读会话”才会限制写入。

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
- **任务没有出现在 UI**：确认 UI 已启动、工作区匹配，并刷新左侧列表。

## Pi 配置

常用命令：

```bash
pi --version
pi
pi install npm:pi-subagents  # 可选
```

`$pi-codex:task` 在未指定模型时使用 Pi 自己的默认配置；`--model` 可固定一个模型，`--race` 可让多个已配置模型并发执行同一任务。还可通过 `PI_PLUGIN_FALLBACK_MODELS=model1,model2` 设置失败后的自动重试模型链。本仓库不保存提供商凭据，请使用 Pi 推荐的 `/login`、环境变量或 `~/.pi/agent/models.json` 配置方式。

## 运行数据

可以设置 `PI_CODEX_DATA_DIR` 覆盖运行数据目录，否则默认使用：

- Linux：`$XDG_STATE_HOME/pi-codex-plugin`；未设置时为 `~/.local/state/pi-codex-plugin`
- macOS：`~/Library/Application Support/pi-codex-plugin`
- Windows：`%LOCALAPPDATA%\pi-codex-plugin`

状态、Job 结果、watcher 记录、日志和 Control Center 描述文件会按工作区保存在该目录下。在平台支持时，目录权限会限制为仅当前用户可访问。

## 安全说明

- 只有确实需要修改文件时才使用 `--write`。
- Pi 完成修改后仍应检查 diff，再提交或推送。
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

本项目使用 [Apache License 2.0](LICENSE)。来源和必须保留的版权说明见 [NOTICE](NOTICE)。项目由 [LightningLeader](https://github.com/LightningLeader) 维护。本项目参考并基于 [agents365-ai/pi-plugin-cc](https://github.com/agents365-ai/pi-plugin-cc) 开发。
