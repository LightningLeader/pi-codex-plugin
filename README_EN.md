# Pi for Codex

[中文](README.md) | **English**

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![Codex Plugin](https://img.shields.io/badge/Codex-plugin-111827)](https://github.com/LightningLeader/pi-codex-plugin)

`pi-codex-plugin` is a Codex-only plugin. It lets Codex delegate investigations, implementations, and long-running tasks to the [Pi coding agent](https://github.com/earendil-works/pi), while tracking jobs, saving results, monitoring background progress, and operating live Pi RPC sessions through a local web UI.

## What It Is For

- Move code investigations into an independent Pi context instead of filling the current Codex conversation
- Let Pi analyze a repository in read-only mode, or explicitly authorize it to modify files and run tests
- Run long tasks in the background, then check status, wait for completion, retrieve results, or cancel them
- Pin one Pi model or race multiple models on the same task and compare their results
- Select a reasoning effort level appropriate for the task
- Distribute multiple independent subtasks in parallel through `pi-subagents`
- View thinking, responses, tool calls, and terminal output live in a browser
- Continue a conversation in the original Pi RPC process instead of creating a new process from disk history

## Requirements

- Node.js 18.18 or later
- A working `pi` CLI installation with at least one configured provider
- Optional: [`pi-subagents`](https://github.com/nicobailon/pi-subagents) for `$pi-codex:parallel-task`

Pi uses its own configured default provider. This plugin does not use Claude Code as its host.

### Windows Note

Pi requires a working Bash environment on Windows. Installing [Git for Windows](https://gitforwindows.org/) is recommended because it provides Git Bash. Pi normally discovers Git Bash automatically. If detection fails, set `shellPath` in `%USERPROFILE%\.pi\agent\settings.json` to the actual location of `bash.exe` on that machine, for example:

```json
{
  "shellPath": "C:\\Program Files\\Git\\bin\\bash.exe"
}
```

The installation location varies by user and installation method, so do not assume the example path always exists. Confirm the real `bash.exe` location first and see [Pi Windows Setup](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/windows.md) for complete instructions. This is a Windows runtime requirement of Pi itself, not an additional dependency introduced by this plugin.

## Installation

```bash
git clone https://github.com/LightningLeader/pi-codex-plugin.git ~/pi-codex-plugin
codex plugin marketplace add ~/pi-codex-plugin
codex plugin add pi-codex@lightningleader
```

After installation, start a new Codex conversation so the plugin skills are loaded.

Before first use, check the environment:

```text
$pi-codex:setup
```

This checks Node.js, the Pi CLI, provider credentials, the session runtime directory, and the optional `pi-subagents` dependency.

## Five-Minute Quick Start

### 1. Read-Only Investigation

Without `--write`, Pi can only use tools for reading, searching, and listing directories:

```text
$pi-codex:task Investigate why the login endpoint occasionally returns 500. Analyze only and do not modify files; provide evidence, affected files, and a recommended fix.
```

This is the default and safer mode. It is useful for locating bugs, understanding code, evaluating approaches, and finding performance bottlenecks.

### 2. Allow Implementation

The underlying runtime permits file changes only when it receives `--write`. When using the skill, however, you do not need to type the parameter yourself. If the natural-language request clearly asks to implement, fix, modify, or create files, Codex automatically invokes Pi in writable mode:

```text
Ask $pi-codex:task to fix the null-pointer bug in the login endpoint, add a regression test, and run the relevant tests. Do not change unrelated files.
```

A foreground task occupies the current invocation until Pi finishes and then returns the result directly.

### 3. Run in the Background

```text
Ask $pi-codex:task to implement CSV export and run the tests when finished. Run it in the background.
```

After startup, the command immediately returns a Job ID similar to `task-...`. Save this ID and then use:

```text
$pi-codex:status task-...
$pi-codex:result task-...
```

### 4. Automatically Supervise a Background Task

```text
Ask $pi-codex:task to implement the pagination endpoint and run tests. Run it in the background and enable subagent supervision.
```

Codex translates “run in the background” and “enable subagent supervision” into the corresponding execution options: it starts the task in the background and attaches a lightweight watcher. The main conversation can continue with other work. The watcher reports a short status only when the task ends and does not automatically load a large result.

### 5. Open the Control Center

```text
$pi-codex:ui --background
```

Copy the token-bearing URL returned by the command and open it in a local browser. Regular tasks launched later through `$pi-codex:task` will prefer the running Control Center, allowing you to view and operate their Pi sessions live in the web UI.

## Skills Overview

| Skill | Purpose |
| --- | --- |
| `$pi-codex:setup` | Check Pi, model providers, and optional dependencies |
| `$pi-codex:task` | Launch an investigation or implementation task |
| `$pi-codex:parallel-task` | Run multiple independent tasks in parallel through `pi-subagents` |
| `$pi-codex:continue` | Continue a task in its original live Pi RPC process |
| `$pi-codex:status` | List jobs or inspect a specific job |
| `$pi-codex:watch` | Attach a lightweight watcher to an existing background job |
| `$pi-codex:result` | Retrieve the stored result of a completed job |
| `$pi-codex:cancel` | Cancel a running background job |
| `$pi-codex:ui` | Start, inspect, or stop the local Control Center |

## How to Launch a Task

The recommended approach is to tell Codex in natural language which skill to call, what to accomplish, whether file changes are allowed, whether the task should run in the background, and whether it needs supervision. You do not need to memorize parameter names.

```text
Ask $pi-codex:task to investigate why payment callbacks occasionally run twice. Analyze only and do not modify code.

Use $pi-codex:task to fix duplicate payment callback execution, add tests, run in the background, and have a subagent notify me when it finishes.
```

Codex translates your wording into the appropriate execution behavior:

| You can say | Codex behavior |
| --- | --- |
| “Investigate, analyze, explain, and do not modify files” | Read-only foreground task |
| “Fix, implement, modify files, or add tests” | Automatically enable writable mode |
| “Run in the background and do not block this conversation” | Start in the background and return a Job ID |
| “Enable subagent supervision and notify me when finished” | Run in the background and attach a watcher |
| “Use model X” | Pin that Pi model with `--model` |
| “Have models X and Y do the same task and compare them” | Run the same task concurrently with `--race` |
| “Analyze carefully and use higher reasoning effort” | Use a higher `effort` level |
| “Save the complete result to a file” | Use output-file mode |
| “Continue the previous live Pi task” | Prefer `$pi-codex:continue` |

A good task description states the objective, scope, constraints, acceptance criteria, and verification method. For example:

```text
Ask $pi-codex:task to complete the task below with higher reasoning effort and run it in the foreground:
Objective: Fix duplicate order creation caused by repeated submissions.
Scope: Modify only src/order and its tests.
Constraints: Do not change the public API or add production dependencies.
Acceptance: Concurrent requests create only one order record.
Verification: Run the order-module tests and report the results.
```

You can also use the parameter form directly:

```text
$pi-codex:task [options] <task description>
```

The parameter form is useful for automation, exact reproduction, or experienced users. Natural language and parameters may be mixed.

### Task Options and “Hyperparameters”

| Option | Default | Purpose and guidance |
| --- | --- | --- |
| `--write` | Off | Authorize Pi to use write tools and modify files. Without it, the toolset is read-only. Enable it only for implementation tasks. |
| `--background` | Off | Start in the background and immediately return a Job ID. Useful for long tasks. |
| `--supervised` | Off | A Codex orchestration option that implicitly enables background mode and attaches a watcher. It is not an underlying Pi CLI option. |
| `--poll-interval-ms <milliseconds>` | `10000` | Watcher polling interval, minimum `100`. The default is normally appropriate; very small values increase local polling. Use with `--supervised` or `$pi-codex:watch`. |
| `--model <model>` / `-m <model>` | Pi default model | Pin one Pi model for this task. The identifier must match the local Pi configuration. |
| `--race <model1,model2,...>` | Off | Run the same task concurrently with two or more Pi models and aggregate their results. One entry degrades to `--model`. |
| `--effort <level>` | Pi default | Reasoning effort: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max`; `none` aliases `off`. Pi rejects unsupported levels. |
| `--out-file <path>` | Off | For a foreground task, write the full output to a file and return only a summary to Codex. For a background task, use `$pi-codex:result --out-file` after completion. |
| `--resume-last` / `--resume` | Off | Continue from the most recent resumable Pi disk session in the current repository, but start a replacement RPC process. Use `$pi-codex:continue` if the original process must be reused. |
| `--fresh` | Default behavior | Explicitly start a fresh session, mainly to prevent accidental resume behavior. Cannot be combined with `--resume-last`. |
| `--prompt-file <path>` | Off | Read the complete task description from a UTF-8 file. Useful for long specifications. |
| `--cwd <directory>` / `-C <directory>` | Current directory | Set the task working directory; task records are associated with the resolved workspace. |
| `--json` | Off | Return machine-readable JSON, mainly for scripts and debugging. Usually unnecessary in conversation. |

### Option Combination Constraints

- `--fresh` cannot be combined with `--resume`/`--resume-last`.
- `--model` and `--race` are mutually exclusive. `--race` cannot be combined with `--resume`/`--resume-last`, because each racer starts a fresh session.
- In a read-only race, all models inspect the current working tree concurrently. In a writable race, each model starts in an isolated Git worktree at the current `HEAD`, so uncommitted changes are invisible; the plugin saves a patch for each successful candidate but never selects or applies a winner automatically.
- A race bypasses the Control Center task queue, but foreground, background, and supervised-background execution remain available.
- At most two watchers named with the `pi_watch_` prefix can be attached at once. If no agent slot is available, the Pi task still runs but is not supervised.
- `--out-file` is best suited to foreground tasks. For a background task, save the Job ID first and then use `$pi-codex:result <job-id> --out-file <path>` after completion.

### Choosing an Effort Level

- Unspecified: use Pi's current default reasoning effort; suitable for most tasks.
- `low`/`medium`: suitable for routine code investigations, small fixes, and formatting work.
- `high`/`xhigh`/`max`: suitable for complex debugging, architecture analysis, and cross-module changes; generally slower and more expensive.
- `off`/`minimal`: suitable for mechanical tasks, but not recommended for complex implementation.

## Usage Examples

The following examples intentionally use everyday language. The controlling Codex understands the intent and selects the required options; you do not need to copy the wording exactly.

### Recommended Workflow: Codex Plans → Pi Executes → Codex Verifies

This workflow is useful for cross-file development, complex defect fixes, and refactoring. Codex first understands the repository and prepares a plan, Pi implements the approved plan, and Codex independently verifies the result.

#### Step 1: Have Codex Create a Plan in Plan Mode

Switch Codex to Plan mode, then describe the objective, constraints, and acceptance requirements. For example:

```text
First analyze the current repository and create an executable plan for adding request rate limiting to the user login endpoint.
Do not modify files during this phase. Describe the modules to change, implementation steps, test approach, compatibility requirements, and major risks. If a critical question would affect the approach, ask me before finalizing the plan.
```

Review the plan from Codex and refine it as needed until it is ready to execute.

#### Step 2: Send the Final Plan to Pi for Execution

After confirming the plan, tell the controlling Codex:

```text
Call $pi-codex:task to execute the final plan we just approved. Include the complete plan verbatim in the task sent to Pi, allow file changes and test execution, run it in the background, and enable subagent supervision. Follow the planned scope and compatibility requirements exactly. When finished, report changed files, test results, and any deviations from the plan.
```

Include the complete plan in Pi's task description instead of sending only “execute the previous plan.” A Pi task has its own context, so attaching the plan explicitly prevents it from missing scope, constraints, or acceptance criteria. Codex returns a Job ID after startup, while the supervising subagent tracks the task in the background without blocking the main conversation.

To inspect progress or retrieve the result manually, say:

```text
Call $pi-codex:status to check the progress of task-....
Call $pi-codex:result to retrieve the final result of task-....
```

#### Step 3: Have Codex Independently Verify the Result

After Pi finishes, do not judge completion solely from Pi's summary. Ask the controlling Codex to inspect the workspace directly:

```text
Pi has completed task-.... Now verify the implementation yourself; do not delegate this verification back to Pi.
Inspect the actual git diff, compare every item against the final plan and acceptance criteria, run the necessary tests, and check for omissions, unplanned changes, compatibility issues, or regression risks.
Start with a Pass or Fail conclusion and then provide evidence. If it fails, state exactly what must be corrected instead of assuming Pi's completion report is accurate.
```

This creates a clear division of responsibility: Codex owns planning and final verification, Pi implements the plan, and the supervising subagent tracks background execution.

### Example 1: Read-Only Investigation

```text
Ask $pi-codex:task to investigate the root cause of intermittent failures in tests/auth.test.ts. Analyze only and do not modify any files; trace the call path, explain where the race condition occurs, and recommend the smallest fix.
```

Codex keeps the runtime in its default read-only mode.

### Example 2: Implement and Verify a Fix

```text
Delegate this implementation to $pi-codex:task: fix the memory spike when uploading large files, keep the public API unchanged, add tests, run the relevant tests, and summarize the changed files.
```

Although the request does not spell out `--write`, “fix” and “add tests” clearly require file changes, so Codex automatically enables writable mode.

### Example 3: Run in the Background with Subagent Supervision

```text
Ask $pi-codex:task to migrate the legacy configuration parser to the new format, preserve backward compatibility, and run the full test suite. Run this task in the background, enable subagent supervision, and notify me when it finishes.
```

Codex automatically combines writable, background, and supervised modes, then immediately returns the Pi Job ID and watcher information.

### Example 4: Run in the Background Without Supervision

```text
Use $pi-codex:task to clean up broken links in the API documentation in the background. Modify documentation only, do not start a supervising subagent, and give me the Job ID.
```

You can later ask Codex to invoke the relevant skill naturally:

```text
Call $pi-codex:status to check the progress of task-....
Call $pi-codex:result to retrieve the final result of task-....
```

### Example 5: Pin One Pi Model

```text
Ask $pi-codex:task to use the openai/gpt-5.2 model to analyze the cache invalidation problem in read-only mode. List the evidence and recommended fixes without modifying files.
```

Codex translates the explicit model choice into `--model`. The model name is only an example; use an identifier listed as locally available by `$pi-codex:setup`.

### Example 6: Race Multiple Models on the Same Task

```text
Ask $pi-codex:task to have openai/gpt-5.2 and google/gemini-3-pro analyze the database migration approach at the same time. Run read-only, compare their risk assessments and recommendations, and do not modify files.
```

This uses `--race` to run the same task concurrently. If file changes are requested, every model implements in an isolated worktree and produces a separate patch for you or Codex to review before applying one.

### Example 7: Use Higher Reasoning Effort for a Complex Task

```text
Ask $pi-codex:task to deeply analyze concurrency problems in the order state machine using higher reasoning effort. Start with a read-only investigation, list the evidence and candidate approaches, and do not modify code.
```

### Example 8: Save a Long Result to a File

```text
Ask $pi-codex:task to comprehensively analyze the security boundaries of the authentication module in read-only mode without modifying files. Save the complete report to reports/security-analysis.md and return only a summary in this conversation.
```

### Example 9: Attach Supervision to an Existing Job

```text
Call $pi-codex:watch to supervise task-... and check every 15 seconds. Do not block the main conversation; tell me whether the result is available when the task ends.
```

### Example 10: Continue the Original Live Pi Process

```text
Call $pi-codex:continue to continue the live Pi session associated with task-.... Ask it to rerun the boundary tests after the recent changes and explain any failures.
```

`continue` requires the original Control Session and RPC process to still be online and idle. If not, it fails explicitly and does not silently start a replacement process.

### Example 11: Resume the Most Recent Disk Session

```text
Ask $pi-codex:task to load the most recent resumable Pi task history for the current repository and continue improving the previous fix plan. Produce a plan only and do not modify files.
```

This wording uses `resume-last`. It restores Pi's persistent history but does not guarantee reuse of the original RPC PID. Use `$pi-codex:continue` when strict process reuse is required.

### Example 12: Run Multiple Independent Tasks in Parallel

First install the optional dependency:

```bash
pi install npm:pi-subagents
```

Then state explicitly that the tasks are independent:

```text
Call $pi-codex:parallel-task to run these three independent tasks in parallel:
1. Add unit tests for the user module.
2. Update the environment-variable documentation for deployment.
3. Investigate whether the order module has unhandled Promise rejections; make the third task read-only.
```

Do not send sequentially dependent steps to `parallel-task`, such as “first change the database schema, then modify the API based on the new schema.”

### Example 13: Cancel a Background Job

```text
Call $pi-codex:cancel to cancel task-.... If it has already finished, report its current state and do not start another task.
```

## Complete Background Job Lifecycle

### Inspect a Job

```text
$pi-codex:status
$pi-codex:status --all
$pi-codex:status task-...
$pi-codex:status task-... --wait
```

- Without a Job ID: show active and recent jobs for the current workspace.
- `--all`: show more job history.
- With a Job ID: show the job's status, phase, PID, elapsed time, and summary.
- `--wait`: block until the specified job reaches a terminal state; a Job ID is required.

Common states include `queued`, `running`, `completed`, `failed`, and `cancelled`.

### Retrieve a Result

```text
$pi-codex:result task-...
$pi-codex:result task-... --out-file reports/result.md
```

The second form is useful for large results: the full content is written to the file, while Codex receives only the path and a summary.

### Cancel a Job

```text
$pi-codex:cancel task-...
```

`cancel` targets a tracked Pi job that is still running. It differs from “Terminate Process” in the UI: the former cancels a job by Job ID, while the latter directly terminates the RPC process of a live Control Session.

## Pi Control Center UI Guide

The Control Center is a local-only Pi RPC web UI. It displays plugin jobs and can also create and operate Pi sessions directly.

### Start, Inspect, and Stop

Recommended background startup:

```text
$pi-codex:ui --background
```

Inspect the current status and authenticated URL:

```text
$pi-codex:ui --status
```

Stop the entire Control Center:

```text
$pi-codex:ui --stop
```

UI options:

| Option | Default | Description |
| --- | --- | --- |
| `--background` | Off | Start the server in the background and immediately return its URL. Recommended for everyday use. |
| `--status` | Off | Show the PID, workspace, and authenticated URL of the existing Control Center. |
| `--stop` | Off | Stop the Control Center and the live Pi RPC sessions it maintains. |
| `--cwd <directory>` | Current workspace | Select the workspace owned by this Control Center. |
| `--host <address>` | `127.0.0.1` | Listening address. By default, access is limited to the local machine. |
| `--port <port>` | `43120` | HTTP port; select another port if it is occupied. |
| `--allow-remote` | Off | Explicitly allow a non-loopback address. Do not use unless you fully understand the network risks. |

Startup output resembles:

```text
# Pi Control Center

Status: running (pid 12345)
Workspace: /path/to/project
Open: http://127.0.0.1:43120/?token=<secret>
```

The first visit must use the complete URL. The server stores the token in an HttpOnly cookie scoped to that site. The token grants control access, so do not include it in screenshots, paste it into issues, commit it to a repository, or share it with others.

### Relationship Between the UI and `$pi-codex:task`

- While the Control Center is running, `$pi-codex:task` prefers to create interactive sessions through it.
- `--race` bypasses the Control Center queue and runs its models concurrently in the plugin runtime. A single-model `--model` task can still use the Control Center.
- Foreground tasks still wait for the final result; background tasks still return a Job ID immediately.
- `$pi-codex:continue` reuses only an original RPC process that is still live and idle in the Control Center.
- If you want to continue later in the exact same process, start the UI before launching the task.

### Page Areas

1. **Top bar**: Shows the Control Center connection state and PID. “New Session” creates a Pi RPC session directly.
2. **Left session list**: Combines live sessions and read-only job records by update time, showing status, Job ID, supervision state, and related information.
3. **Session header**: Shows the working directory, actual model, read-only/writable mode, Job ID, RPC PID, and current phase.
4. **Message history**: Displays user messages, thinking, Markdown responses, tool arguments, tool calls, and incremental output in real time.
5. **Input area**: Sends a normal message, Steer, or Follow-up to a Pi process that is still live.

### Create a Session

Click “New Session” and fill in:

- **Name**: Used in the left-side list; does not affect task behavior.
- **Working directory**: The directory Pi operates on; it is created automatically if it does not exist.
- **Model**: Optional for manually created UI sessions; leave blank to use Pi's default configuration. A task launched through `$pi-codex:task` can also select a model in natural language or with `--model`.
- **Thinking level**: Optional; leave blank to use Pi's default.
- **Initial task**: The first task sent to Pi immediately after creating the session.
- **Read-only session**: When selected, enables only the `read`, `grep`, `find`, and `ls` tools. When clear, Pi can use its normal toolset.

The defaults differ between the two entry points: the `$pi-codex:task` runtime is read-only by default, and Codex automatically adds write permission for implementation requests expressed in natural language. A manually created UI session is writable by default and becomes read-only only when “Read-only session” is selected.

### Three Message Delivery Modes

| Mode | Behavior | Use case |
| --- | --- | --- |
| Normal message | Sent immediately while idle; queued with follow-up behavior while Pi is running | A normal new task or natural continuation of the conversation |
| Steer | Changes the direction of the running task after the current tool call finishes | Correct Pi quickly after noticing a misunderstanding, without forcibly interrupting it |
| Follow-up | Waits until the current task fully finishes, then executes this message | Queue a later inspection, test, or summary task in advance |

After entering a message, click “Send” or press `Ctrl+Enter` / `Cmd+Enter`.

### Differences Between Session Actions

| Action | Current task | Pi RPC process | Session record | Can continue chatting? |
| --- | --- | --- | --- | --- |
| Interrupt | Stop the current turn | Keep | Keep | Yes |
| Terminate Process | Cancel the current task | Terminate | Keep | No |
| Delete Session | Stop the current task | Terminate | Remove from the Control Center | No |

“Delete Session” cannot be undone. If Pi is merely going in the wrong direction, prefer Steer. To stop the current generation but continue later, use Interrupt.

### Read the Output

- Thinking and tool cards can be expanded or collapsed separately.
- “Collapse All” closes all thinking/tool cards and remembers the setting locally in the browser.
- Auto-follow pauses after you scroll upward; click “Jump to Latest” to resume following live output.
- “Reload History” retrieves Pi's complete message history again and is useful after reconnecting or when the display looks incomplete.
- When a Pi extension requests a choice, input, edit, or confirmation, a pending UI request appears at the top of the page and can be allowed, denied, or answered directly.

### Live Sessions and Read-Only Job Records

- A **live session** has a message input and displays an RPC PID. You can keep interacting while its process remains healthy.
- A **read-only job record** displays a persisted task whose process is no longer live and provides “Raw Job Log (Diagnostics).” It cannot be converted back into the original RPC process.
- “Delete Job” removes the job record and also stops the job if it is still running. A confirmation prompt appears first.

### Common UI Problems

- **Page says unauthenticated**: Run `$pi-codex:ui --status` again and use the complete token-bearing URL it returns.
- **Port is occupied**: Use `$pi-codex:ui --background --port 43121`.
- **`continue` reports loopback/EPERM**: Allow Codex commands to access local `127.0.0.1`; the plugin does not silently create a replacement process after failure.
- **Page says RPC exited**: The record remains available, but the conversation cannot continue. Create a new session or launch the task again.
- **Task does not appear in the UI**: Confirm that the UI is running, its workspace matches, and refresh the left-side list.

## Pi Configuration

Common commands:

```bash
pi --version
pi
pi install npm:pi-subagents  # optional
```

Without an explicit model, `$pi-codex:task` uses Pi's own default configuration. Use `--model` to pin one model or `--race` to run the same task concurrently with multiple configured models. You may also set `PI_PLUGIN_FALLBACK_MODELS=model1,model2` as the automatic retry chain after a failure. This repository does not store provider credentials; configure them with Pi's recommended `/login`, environment-variable, or `~/.pi/agent/models.json` mechanism.

## Runtime Data

Set `PI_CODEX_DATA_DIR` to override the runtime data directory. Otherwise the default is:

- Linux: `$XDG_STATE_HOME/pi-codex-plugin`, or `~/.local/state/pi-codex-plugin` when it is unset
- macOS: `~/Library/Application Support/pi-codex-plugin`
- Windows: `%LOCALAPPDATA%\pi-codex-plugin`

Status, Job results, watcher records, logs, and Control Center descriptor files are stored below this directory by workspace. Where supported by the platform, directory permissions restrict access to the current user.

## Security

- Use `--write` only when file changes are genuinely required.
- After Pi makes changes, inspect the diff before committing or pushing.
- The Control Center listens on a loopback address by default; do not share a token-bearing URL.
- `--allow-remote` does not automatically provide TLS or public-network protection and should not be exposed to the internet.
- Neither the repository nor runtime data intentionally stores model-provider API keys.

## Development and Testing

```bash
npm run check-version
npm test
```

Main directories:

- `.agents/plugins/marketplace.json`: Codex marketplace configuration
- `plugins/pi-codex/.codex-plugin/plugin.json`: Codex plugin manifest
- `plugins/pi-codex/skills/`: public skills
- `plugins/pi-codex/scripts/`: Node.js runtime and RPC Control Center
- `plugins/pi-codex/control-ui/`: Control Center frontend
- `plugins/pi-codex/prompts/`: runtime prompt templates
- `tests/`: automated tests

After changing the plugin during local development, refresh the Codex cachebuster, reinstall the plugin, and test it in a new Codex conversation.

## License and Attribution

This project is licensed under the [Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for source information and required attribution notices. The project is maintained by [LightningLeader](https://github.com/LightningLeader). This project was developed with reference to and based on [agents365-ai/pi-plugin-cc](https://github.com/agents365-ai/pi-plugin-cc).
