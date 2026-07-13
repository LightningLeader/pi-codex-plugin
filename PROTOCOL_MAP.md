# PROTOCOL_MAP — codex-plugin-cc → pi-plugin-cc

This is the design-before-code reference. It enumerates every codex JSON-RPC
method / event / state file / env var used by `codex-companion.mjs` and maps
each to its pi equivalent — or marks it "synthesized client-side" when pi has
no direct analogue.

**Read this end-to-end before touching any port code.** If anything looks wrong,
fix it here first; the implementation will follow.

---

## TL;DR — Architectural Deltas

| Concern | Codex | Pi | Implication |
|---|---|---|---|
| **Process model** | One long-lived `codex app-server` multiplexes N threads | One `pi --mode rpc` ≙ one conversation | Drop the broker. Spawn one pi RPC subprocess per task. |
| **Wire framing** | JSONL over stdin/stdout (or unix socket via broker) | JSONL over stdin/stdout (LF only — no `U+2028`) | Use a hand-written line splitter (not `readline`). |
| **Conversation lifecycle** | `thread/start` → `turn/start` → ... → `turn/completed` | RPC: command `prompt` ⇒ `agent_start` / `turn_*` / `message_*` / `tool_execution_*` events ⇒ `agent_end` | Different vocabulary, same shape. |
| **Review verb** | Native `review/start` with `target = uncommittedChanges \| baseBranch` | None | Build the review prompt client-side and send it as a normal `prompt`. Same for adversarial. |
| **Sandbox** | `sandbox: "read-only" \| "workspace-write"` per turn | None — instead allowlist via `--tools read,grep,find,ls` | Translate at spawn time, not per-turn. |
| **Approval policy** | `approvalPolicy: "never"` (we always use never) | No equivalent (extensions can gate via UI, built-ins don't) | Drop entirely. |
| **Reasoning effort** | `effort: none\|minimal\|low\|medium\|high\|xhigh` on `turn/start` | `set_thinking_level` with `off\|minimal\|low\|medium\|high\|xhigh` | Send `set_thinking_level` after spawn, before `prompt`. `none` → `off`. |
| **Resume** | `thread/resume` (RPC) | `pi --mode rpc --session <UUID-or-path>` (spawn arg) | Resume happens at spawn, not via RPC. |
| **Cancel running turn** | `turn/interrupt` (RPC) | `abort` (RPC) | Direct rename. |
| **Session ID** | Returned in `thread/started` notif | Returned in `get_state` response (`sessionId`, `sessionFile`) | Issue a `get_state` once after spawn to capture it. |

Net result: the port is **shorter** than the source. We delete ~500 lines of
broker + broker-lifecycle + broker-endpoint and replace `lib/app-server.mjs`
with a slimmer `lib/pi-rpc.mjs` that just spawns `pi --mode rpc` per task.

---

## 1. RPC Verb Map

| Codex method | Pi command | Notes |
|---|---|---|
| `initialize` (request) + `initialized` (notif) | (implicit on `pi --mode rpc` startup) | Pi has no handshake. First stdin line can be a real command. |
| `thread/start` (with `cwd`, `model`, `sandbox`, `ephemeral`, `serviceName`) | `spawn("pi", ["--mode","rpc",...])` with appropriate flags | See [§2 spawn flag map](#2-spawn-flag-map). One pi process = one thread. |
| `thread/resume` (with `threadId`) | `spawn("pi", ["--mode","rpc","--session", id_or_path, ...])` | Resume is a spawn arg, not a runtime call. |
| `thread/name/set` (with `name`) | `{"type":"set_session_name","name":"..."}` | Direct equivalent. |
| `turn/start` (with `threadId`, `input`, `model`, `effort`, `outputSchema`) | `{"type":"prompt","message":"..."}` (preceded by `set_thinking_level` if effort changed) | Pi has no per-turn `model` override (only `set_model` global) and no `outputSchema`. See [§4 output schema](#4-output-schema). |
| `turn/interrupt` (with `threadId`, `turnId`) | `{"type":"abort"}` | Direct equivalent. Pi has no per-turn ID — there's only one in-flight turn per process. |
| `review/start` (with `threadId`, `delivery`, `target`) | **Synthesized client-side** — build prompt from template, send as `prompt`. | See [§3 review synthesis](#3-review-synthesis). |
| (none) | `{"type":"get_state"}` | New: used to retrieve `sessionId`, `sessionFile`, `isStreaming`. |
| (none) | `{"type":"get_last_assistant_text"}` | New: used to retrieve final agent message reliably (we also see it via `agent_end` events). |

### Codex notifications → Pi events

| Codex notif | Pi event | Notes |
|---|---|---|
| `thread/started` | (not emitted) | Capture sessionId via `get_state` instead. |
| `thread/name/updated` | (not emitted) | We know our own renames. |
| `turn/started` | `turn_start` | |
| `turn/completed` | `turn_end` + `agent_end` | Pi splits per-message and per-run. Use `agent_end` as the "task done" signal. |
| `item/started` (kind=`file_change`) | `tool_execution_start` (toolName=`edit`/`write`) | |
| `item/started` (kind=`command`) | `tool_execution_start` (toolName=`bash`) | |
| `item/started` (kind=`agent_message`) | `message_start` (assistant role) | |
| `item/started` (kind=`reasoning`) | `message_update` with `assistantMessageEvent.type=thinking_*` | |
| `item/started` (kind=`tool_call`) | `tool_execution_start` (other tool names) | |
| `item/started` (kind=`review`) | n/a | Review is synthesized client-side. We just observe the assistant message. |
| `item/completed` | `tool_execution_end` / `message_end` | |
| `error` | `auto_retry_*` events, or RPC error response | Pi distinguishes transient (auto_retry) from fatal. |

### Streaming text deltas

Codex opts out of `item/agentMessage/delta` and `item/reasoning/*Delta` in
`capabilities.optOutNotificationMethods` (line 36 of `lib/app-server.mjs`) — it
doesn't display streaming text in the companion.

We do the same: ignore `message_update` deltas in the pi RPC client, only act
on `message_end` / `tool_execution_end` / `agent_end`. Saves log noise and
keeps log files small.

---

## 2. Spawn Flag Map

Always: `pi --mode rpc`. Do **not** add `--no-skills`, `--no-extensions`, or
`--no-prompt-templates` by default — the user's installed pi extensions (e.g.
[`pi-subagents`](https://github.com/nicobailon/pi-subagents), which lets pi
delegate to its own internal subagents via a tool call) should be honored.
The plugin's job is to drive pi; it is not in charge of pi's runtime config.

The one exception is `/pi:review` and the stop-gate review — there we still
pass `--no-extensions --no-prompt-templates` so the review prompt environment
is deterministic across users. Skills stay enabled there too unless they
cause flake.

| Codex thread option | Pi spawn flag | Notes |
|---|---|---|
| `cwd` | `cwd` of `spawn()` | Same. |
| `model: "gpt-5.4-mini"` etc. | `--model <pi-model-id>` | Or `--provider deepseek --model deepseek-chat`. Default lives in plugin config (see [§8 model resolution](#8-model-resolution)). |
| `sandbox: "read-only"` | `--tools read,grep,find,ls` | Drop write tools. |
| `sandbox: "workspace-write"` | (default — all built-in tools) | |
| `approvalPolicy: "never"` | (no flag) | Pi has no approval gate for built-in tools. |
| `ephemeral: true` | `--no-session` | Codex `ephemeral=true` ⇒ no session persistence. |
| `ephemeral: false` + `threadName` | (default session save) + post-spawn `set_session_name` | |
| `serviceName: "claude_code_codex_plugin"` | (none — pi has no telemetry serviceName concept) | Drop. |
| `resumeThreadId` | `--session <uuid-or-path>` | Pi accepts both partial UUID and absolute path. |
| `effort: "high"` | post-spawn `{"type":"set_thinking_level","level":"high"}` | `none` → `off`; all other levels are 1:1. |

### Per-turn options that move to spawn time

- `model` and `effort` were per-`turn/start` in codex but are session-global in
  pi. We set them once at spawn (or right after) and never mid-conversation.
  For background tasks that resume + change model, we send `set_model` /
  `set_thinking_level` after `pi --session …` spawns.

---

## 3. Review Synthesis

Codex's `review/start` is gone. The plugin must build the review prompt
client-side and send it as a normal `prompt`.

### `/pi:review` (replaces codex's "native reviewer")

Codex relied on the codex CLI's *built-in* reviewer. Pi has no such thing.
We **ship our own review prompt** under `plugins/pi/prompts/review.md`. Use
existing `git diff` / file content gathering (already in `lib/git.mjs`) to
fill the `{{REVIEW_INPUT}}` slot, and send the rendered prompt to pi.

The prompt is tuned for **non-reasoning models** (DeepSeek-Chat default):
explicit checklist, concrete examples, no abstract "challenge the design"
framing. The challenge-oriented variant lives in `adversarial-review.md`.

### `/pi:adversarial-review`

Already client-rendered in codex via `plugins/codex/prompts/adversarial-review.md`.
We port it as-is, retuning the language for non-reasoning models.

### Target resolution

Codex maps:

```js
target: { type: "uncommittedChanges" }            // working tree
target: { type: "baseBranch", branch: "main" }    // branch diff
```

Pi version: same git-side resolution (`lib/git.mjs` unchanged), but the diff
is rendered into a `{{REVIEW_INPUT}}` slot in the prompt. The pi side never
sees the structured `target` object; it just sees diff text.

### Output schema → structured output

Codex passes `outputSchema` to `turn/start`. Pi has no equivalent. We instead
include the JSON schema *in the prompt* and ask pi to emit a fenced ```json
block, then parse it client-side. Existing `schemas/review-output.schema.json`
is repurposed: included verbatim inside the prompt.

---

## 4. Output Schema

Codex's `outputSchema` parameter on `turn/start` causes the model to be
*constrained* to that schema (provider-side JSON-mode). Pi exposes no such
knob.

**Strategy**: inline the schema into the prompt template and parse the model's
output:

```
You MUST respond with a single JSON object matching this schema:
<schema>...</schema>
Wrap it in a ```json fenced code block. Do not include any other text.
```

Then in the client, run a fenced-code extractor → `JSON.parse`. Reject and
report if the response doesn't match. Tradeoff: less reliable than codex's
provider-enforced JSON mode, but acceptable for review summaries (we can
fall back to free-text rendering on parse failure).

For `/pi:rescue` we don't need structured output — the model just talks.

---

## 5. State Files & Persistence

**Unchanged structurally** — same on-disk layout, renamed paths.

| Codex path | Pi path |
|---|---|
| `$CLAUDE_PLUGIN_DATA/state/<slug>-<hash>/state.json` | (same) |
| `$CLAUDE_PLUGIN_DATA/state/<slug>-<hash>/jobs/<id>.json` | (same) |
| `$CLAUDE_PLUGIN_DATA/state/<slug>-<hash>/jobs/<id>.log` | (same) |
| `$CLAUDE_PLUGIN_DATA/state/<slug>-<hash>/broker.json` | **DELETED** (no broker) |
| Fallback `$TMPDIR/codex-companion/...` | `$TMPDIR/pi-companion/...` |

`state.json` schema: identical, including `config.stopReviewGate`.

`jobs/<id>.json` schema: identical, except:
- `threadId` → `piSessionId` (pi session UUID). The existing `sessionId`
  field retains its codex meaning (the Claude Code session id from
  `PI_COMPANION_SESSION_ID`, used to scope job listings). The pi session
  identifier uses the distinct field name `piSessionId` to avoid collision.
- additional `piSessionFile` (absolute path to the pi session JSONL — needed
  for resume across host machines / TMPDIR rotation)
- delete `turnId` (pi has no per-turn id; cancellation uses the process PID)

---

## 6. Environment Variables

| Codex env var | Pi env var | Purpose |
|---|---|---|
| `CODEX_COMPANION_SESSION_ID` | `PI_COMPANION_SESSION_ID` | Tracks the *Claude Code* session id, propagated by SessionStart hook. Used to scope job listings to "this Claude session". |
| `CODEX_COMPANION_APP_SERVER_ENDPOINT` | (deleted — no broker) | |
| `CODEX_COMPANION_APP_SERVER_PID_FILE` | (deleted — no broker) | |
| `CODEX_COMPANION_APP_SERVER_LOG_FILE` | (deleted — no broker) | |
| `CLAUDE_PLUGIN_DATA` | (unchanged — Claude Code's env) | |
| `CLAUDE_PLUGIN_ROOT` | (unchanged — Claude Code's env) | |
| `CLAUDE_ENV_FILE` | (unchanged — used by SessionStart hook to export env into the Claude shell) | |
| (pi-specific, not consumed by plugin but inherited) | `PI_CODING_AGENT_DIR`, `PI_OFFLINE`, `PI_SKIP_VERSION_CHECK` | Pass through user's env unchanged. |

---

## 7. Process Model & Background Tasks

### Foreground task

```
node pi-companion.mjs <cmd> ...
  └─ spawn("pi", ["--mode","rpc", ...])
       └─ stream events → log file + progress callback
       └─ on agent_end, capture final assistant text → return
```

No socket layer. Direct stdin/stdout.

### Background task

```
parent: node pi-companion.mjs task --background ... <prompt>
  └─ write jobs/<id>.json with status="queued"
  └─ spawn detached: node pi-companion.mjs task-worker --cwd ... --job-id <id>
       (stdio="ignore", detached=true, unref())

worker (in detached child):
  └─ load jobs/<id>.json
  └─ spawn("pi", ["--mode","rpc", ...])
  └─ stream events → log file
  └─ on agent_end / process exit: update jobs/<id>.json (status, result)
```

Cancellation:
- Read `jobs/<id>.json` to get the worker PID.
- `process.kill(workerPid, "SIGTERM")` — SIGTERM propagates to the pi child.
- Worker's exit-handler updates the job state to `cancelled`.

This matches codex's process pool semantics (one detached node worker per
background task), minus the per-task broker connection. The Claude session
can have many concurrent pi tasks running, each its own process tree.

---

## 8. Model Resolution

Codex's "default model" is whatever's set in `~/.codex/config.toml`. Pi reads
`~/.pi/agent/models.json` and supports CLI overrides via `--provider/--model`.

Plugin defaults (locked-in via GOAL.md §2):
- General task (`/pi:rescue`): user's pi default (no explicit `--model`).
- Review (`/pi:review`, `/pi:adversarial-review`): TBD — proposed
  `deepseek-reasoner` for review since it's where reasoning helps most.
  **Open question #2** asks the user to confirm.

CLI flag pass-through:
- `--model <id>` on a slash command ⇒ added to pi spawn args.
- `--effort <level>` ⇒ post-spawn `set_thinking_level`. If the configured
  model doesn't support thinking, pi's `set_thinking_level` returns success
  with no observable effect (verified in rpc.md — the cycle command returns
  `null` data if the model has no thinking). We log a one-line note when
  effort is requested but model is non-reasoning.
- `--model spark` alias: codex used this for `gpt-5.3-codex-spark`. In pi
  there's no equivalent; we **drop the alias** and let the user pass full
  model IDs.

---

## 9. Hook Map

### SessionStart / SessionEnd

`session-lifecycle-hook.mjs` shrinks substantially:

- **SessionStart**: still exports `PI_COMPANION_SESSION_ID=<claude-session-id>`
  to `$CLAUDE_ENV_FILE`. No broker bring-up.
- **SessionEnd**: still terminates orphaned worker PIDs (those tagged with the
  ending Claude session id). No broker tear-down.

### Stop (review gate)

`stop-review-gate-hook.mjs` is structurally unchanged: when enabled, it spawns
`pi-companion task --json` with the stop-gate prompt, parses the first line
for `ALLOW: <reason>` or `BLOCK: <reason>`, and emits the JSON decision to
stdout. Only the prompt template needs retuning for non-reasoning models.

---

## 10. Skills & Prompts

| Codex | Pi | Action |
|---|---|---|
| `skills/codex-cli-runtime/SKILL.md` | `skills/pi-cli-runtime/SKILL.md` | Port; swap names, `task` invocation unchanged. |
| `skills/codex-result-handling/SKILL.md` | `skills/pi-result-handling/SKILL.md` | Port; swap `/codex:` → `/pi:`. |
| `skills/gpt-5-4-prompting/SKILL.md` | `skills/pi-prompting/SKILL.md` | **Rewrite.** GPT-5.4's prompting recipe (`<task>`, `<structured_output_contract>`, etc.) doesn't fit DeepSeek-Chat as well — favor explicit numbered checklists, short examples, low-abstraction language. Drop the `<verification_loop>` block (DeepSeek doesn't reliably follow it). Keep `<task>` and a simplified output contract. |
| `prompts/adversarial-review.md` | `prompts/adversarial-review.md` | Port + retune (less reasoning-dependent). |
| `prompts/stop-review-gate.md` | `prompts/stop-review-gate.md` | Port + retune. |
| (new) | `prompts/review.md` | **New** — replaces codex's built-in reviewer. |

---

## 11. Files to Port and Their Diff-from-Source

| Source | Target | Changes |
|---|---|---|
| `.claude-plugin/marketplace.json` | (same path) | Rename plugin `codex` → `pi`; new author/license info from open questions. |
| `package.json` | (same path) | Rename; drop `prebuild` (no `codex app-server generate-ts`); drop `tsconfig.app-server.json`; drop `@types/node` / `typescript` devDeps unless we keep TS types. |
| `plugins/codex/.claude-plugin/plugin.json` | `plugins/pi/.claude-plugin/plugin.json` | Rename. |
| `plugins/codex/commands/*.md` | `plugins/pi/commands/*.md` | Path/flag rename. No logic change. |
| `plugins/codex/hooks/hooks.json` | `plugins/pi/hooks/hooks.json` | Script path rename. |
| `plugins/codex/agents/codex-rescue.md` | `plugins/pi/agents/pi-rescue.md` | Rename + skill references. |
| `plugins/codex/scripts/codex-companion.mjs` | `plugins/pi/scripts/pi-companion.mjs` | Rename + drop broker lookup. Subcommand surface unchanged. |
| `plugins/codex/scripts/app-server-broker.mjs` | **DELETED** | Pi has no broker. |
| `plugins/codex/scripts/session-lifecycle-hook.mjs` | `plugins/pi/scripts/session-lifecycle-hook.mjs` | Rename; drop broker-shutdown step. |
| `plugins/codex/scripts/stop-review-gate-hook.mjs` | `plugins/pi/scripts/stop-review-gate-hook.mjs` | Rename + prompt path swap. |
| `plugins/codex/scripts/lib/app-server.mjs` (350 lines) | `plugins/pi/scripts/lib/pi-rpc.mjs` (~150 lines) | Slim rewrite: just spawned-client, no broker variant, no LSP-style framing logic. |
| `plugins/codex/scripts/lib/broker-endpoint.mjs` | **DELETED** | |
| `plugins/codex/scripts/lib/broker-lifecycle.mjs` | **DELETED** | |
| `plugins/codex/scripts/lib/codex.mjs` (1088 lines) | `plugins/pi/scripts/lib/pi.mjs` | Rewrite around new RPC verbs. Keep public surface (`runAppServerTurn`, `runAppServerReview`, `getCodexAvailability` → `getPiAvailability`, etc.) so `pi-companion.mjs` only needs identifier renames. |
| `plugins/codex/scripts/lib/args.mjs` | `plugins/pi/scripts/lib/args.mjs` | No change. |
| `plugins/codex/scripts/lib/fs.mjs` | `plugins/pi/scripts/lib/fs.mjs` | No change. |
| `plugins/codex/scripts/lib/git.mjs` | `plugins/pi/scripts/lib/git.mjs` | No change. |
| `plugins/codex/scripts/lib/job-control.mjs` | `plugins/pi/scripts/lib/job-control.mjs` | Rename only. |
| `plugins/codex/scripts/lib/process.mjs` | `plugins/pi/scripts/lib/process.mjs` | Check `pi` binary instead of `codex`. |
| `plugins/codex/scripts/lib/prompts.mjs` | `plugins/pi/scripts/lib/prompts.mjs` | No change. |
| `plugins/codex/scripts/lib/render.mjs` | `plugins/pi/scripts/lib/render.mjs` | String renames (Codex → PI). |
| `plugins/codex/scripts/lib/state.mjs` | `plugins/pi/scripts/lib/state.mjs` | Drop broker fields. |
| `plugins/codex/scripts/lib/tracked-jobs.mjs` | `plugins/pi/scripts/lib/tracked-jobs.mjs` | Field renames (`threadId` → `sessionId` + `sessionFile`). |
| `plugins/codex/scripts/lib/workspace.mjs` | `plugins/pi/scripts/lib/workspace.mjs` | No change. |
| `plugins/codex/.generated/app-server-types/` | **DELETED** | Pi has its own types in `@earendil-works/pi-coding-agent`. We don't need a generated build artifact; the wire format is documented and we hand-write JSDoc types. |
| `tsconfig.app-server.json` | **DELETED** | |
| `plugins/codex/schemas/review-output.schema.json` | `plugins/pi/schemas/review-output.schema.json` | No structural change; embedded into prompt instead of passed to RPC. |
| `plugins/codex/skills/*/SKILL.md` | `plugins/pi/skills/*/SKILL.md` | See §10. |
| `plugins/codex/prompts/*.md` | `plugins/pi/prompts/*.md` | See §10. |
| `scripts/bump-version.mjs` | (same path) | Update package name string. |
| `README.md` | (same path) | Rewrite — pi/DeepSeek setup, drop "ChatGPT subscription" line. |

Total: ~5100 lines source → ~4400 lines target (drop ~700 in broker + types).

---

## 12. Risks & Open Items

1. **DeepSeek-Chat may underperform the review prompts.** The prompts are
   currently tuned for GPT-5.4 reasoning. Plan to dogfood once on a real
   review, then revise. Hold review-quality concerns until after first run.

2. **No `outputSchema` ⇒ less reliable JSON output.** Adversarial review
   returns structured JSON. If parse-failure rate is non-trivial after
   tuning, fall back to free-text rendering with a soft-warning footer.

3. **Pi RPC stability.** Pi is younger than codex; the RPC interface may
   change between minor versions. Pin a minimum pi version in `/pi:setup`
   (probably `>= 0.75.0`) and surface a clear error if the installed pi
   doesn't match.

4. **`pi-rpc-broker.mjs`** — listed in GOAL.md §5 file layout, but per this
   doc we're dropping the broker concept entirely. Naming-wise, the file
   that does exist is `pi-rpc.mjs` (the client) and there is no separate
   broker module. Mention this delta to the user when reviewing the map.

5. **Effort flag on non-reasoning models.** When user passes `--effort high`
   but their pi model has no thinking support, we send `set_thinking_level`
   anyway and ignore the response. Document this as "pi silently absorbs the
   request" in the README.

6. **GOAL.md §3 claim "Pi ships without sub-agents by design" is stale.**
   Pi itself has no built-in subagents, but the community package
   [`pi-subagents`](https://github.com/nicobailon/pi-subagents) (1.5k stars,
   installed via `pi install npm:pi-subagents`) adds a `subagent` tool plus
   `/run`, `/chain`, `/parallel`, `/run-chain` slash commands. It works
   *inside* a pi run — pi decides whether to delegate. It does **not** expose
   an external API the plugin could call, so the port architecture
   (Claude Code subagent `pi-rescue` ⇒ `pi-companion task` ⇒ `pi --mode rpc`)
   is unchanged. The only change driven by pi-subagents is the spawn-flag
   note in §2 above — we don't strip extensions by default, so pi-subagents
   can do its thing inside a rescue run if the user has it installed.

---

## 13. Verification Plan

Before merging the port:

- `node pi-companion.mjs setup --json` returns `available: true` and lists the
  configured pi model.
- `node pi-companion.mjs task "hello, who are you" --write` returns a coherent
  response in < 30s.
- `/pi:review` against a dirty working tree finishes and emits at least one
  finding or an explicit "no issues" verdict.
- `/pi:rescue ... --background` returns a job ID; `/pi:status <id>` shows it;
  `/pi:result <id>` returns the output after completion.
- `/pi:cancel <id>` terminates a running task within 5s.
- `grep -ri 'codex' plugins/pi/` returns zero hits.

---

**End of PROTOCOL_MAP.** Review and flag anything that should change before
the port begins.
