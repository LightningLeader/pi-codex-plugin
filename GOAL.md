# Goal Handoff: pi-plugin-cc

**This file is the entry point for a fresh Claude Code session working in this directory.** Read it top to bottom before doing anything else.

The user's CLAUDE.md still applies: write minimum code, English-only comments, never put Claude attribution in commits or PRs.

---

## 1. The Goal

Build **`pi-plugin-cc`** — a Claude Code plugin that is a **complete 1:1 fork** of [`codex-plugin-cc`](https://github.com/openai/codex-plugin-cc), but routes every command through the **pi coding agent** instead of Codex.

- Reference (source plugin, fully read-accessible on local disk):
  `/Users/niehu/github/codex-plugin-cc`
- Target binary the new plugin must drive:
  `pi` (from npm `@earendil-works/pi-coding-agent`, repo https://github.com/earendil-works/pi/tree/main/packages/coding-agent)

Final user-visible result: the user runs `/pi:review`, `/pi:rescue`, `/pi:status`, `/pi:result`, `/pi:cancel`, `/pi:adversarial-review`, `/pi:setup` and gets the same UX as the original codex plugin, only powered by pi (and therefore by whatever model pi is configured for — DeepSeek by default for this user).

---

## 2. Decisions Already Locked In (do NOT re-ask)

| Question | User's choice |
|---|---|
| Workspace | `/Users/niehu/myagents/myskills/pi-plugin-cc` (this directory) |
| Scope | Full fork — clone every command and feature, no degradations |
| Background tasks (`/pi:status` / `/pi:result` / `/pi:cancel`) | Must work the same way as codex (process pool + state files) |
| Plugin namespace | `pi` (so commands are `/pi:<name>`) |
| Default backend model | DeepSeek (configured via pi's `~/.pi/agent/models.json`) |
| Keeping "codex" in names | No. Strip every reference. Don't keep codex as a fallback. |

The user converses in Chinese. Code comments stay English-only per their CLAUDE.md.

---

## 3. What Each Side Is

### codex-plugin-cc (source)
Wraps the Codex CLI's **app-server** (a JSON-RPC subprocess started via `codex app-server`). The plugin has:
- 6 slash commands + 1 setup command
- 1 sub-agent (`codex-rescue`, a thin Bash forwarder)
- ~1600 lines of Node ESM scripts:
  - `scripts/codex-companion.mjs` — 1027 lines, the orchestrator (task launch, status, result, cancel, resume, prompt building)
  - `scripts/app-server-broker.mjs` — 252 lines, manages the app-server child process
  - `scripts/session-lifecycle-hook.mjs` — 131 lines
  - `scripts/stop-review-gate-hook.mjs` — 184 lines (optional review gate)
- Generated TypeScript types under `plugins/codex/.generated/app-server-types/` (produced by `codex app-server generate-ts`)
- Skills under `plugins/codex/skills/` (prompting guides for GPT-5.4)

### pi (target)
- Install: `npm install -g --ignore-scripts @earendil-works/pi-coding-agent`
- Binary: `pi`
- Four modes:
  - interactive (TUI) — ignore
  - `pi --mode print "..."` — one-shot, plain text out
  - `pi --mode json "..."` — one-shot, JSON out
  - `pi --mode rpc` — **JSONL over stdin/stdout, this is the codex `app-server` analogue**
- Supports DeepSeek + many providers; users add custom providers via `~/.pi/agent/models.json` (OpenAI / Anthropic / Google compatible APIs).
- Pi ships **without** sub-agents and plan mode by design — that's fine, this plugin only needs the RPC channel.

---

## 4. First Three Things to Do (in this order)

1. **Read the pi RPC protocol spec.** The codex companion is built around codex's app-server JSON-RPC schema; you need pi's equivalent before writing any code. Sources to check:
   - `gh api repos/earendil-works/pi/contents/packages/coding-agent/docs` to list docs
   - Look for files with names like `rpc.md`, `protocol.md`, `sdk.md` in `packages/coding-agent/docs/`
   - Fallback: read pi's README at `https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/README.md` (note: cloudflare-fronted, may need WebFetch fallback)
   - Last resort: clone the pi repo locally and grep `src/` for `--mode rpc` handler

2. **Read the codex plugin top to bottom.** In particular:
   - `/Users/niehu/github/codex-plugin-cc/plugins/codex/scripts/codex-companion.mjs` (the long pole)
   - `/Users/niehu/github/codex-plugin-cc/plugins/codex/scripts/app-server-broker.mjs`
   - all of `/Users/niehu/github/codex-plugin-cc/plugins/codex/commands/*.md`
   - the `.claude-plugin/plugin.json` manifest

3. **Write a protocol-mapping doc** (`PROTOCOL_MAP.md`) before writing code. List every codex RPC method/event used by `codex-companion.mjs` and map it to the equivalent pi RPC method/event (or "synthesized client-side" if pi doesn't have a direct equivalent). This is the single biggest risk and should be reviewed by the user before you start coding.

Only after step 3 do you start porting code.

---

## 5. File-by-File Port Plan

Layout target (mirror the source where possible):

```
pi-plugin-cc/
├── .claude-plugin/marketplace.json        (rename "codex" → "pi" everywhere)
├── package.json                            (rename, drop codex prebuild step)
├── plugins/pi/
│   ├── .claude-plugin/plugin.json
│   ├── agents/pi-rescue.md                 (port codex-rescue.md, swap forwarder target)
│   ├── commands/
│   │   ├── review.md
│   │   ├── adversarial-review.md
│   │   ├── rescue.md
│   │   ├── status.md
│   │   ├── result.md
│   │   ├── cancel.md
│   │   └── setup.md
│   ├── hooks/
│   │   ├── session-lifecycle-hook.mjs      (port)
│   │   └── stop-review-gate-hook.mjs       (port)
│   ├── prompts/                            (review + adversarial-review system prompts — RETUNE for non-reasoning models)
│   ├── schemas/                            (any json schemas the commands rely on)
│   ├── scripts/
│   │   ├── pi-companion.mjs                (port of codex-companion.mjs — the long pole)
│   │   ├── pi-rpc-broker.mjs               (replaces app-server-broker.mjs)
│   │   └── lib/                            (shared helpers)
│   └── skills/
│       ├── pi-cli-runtime.md               (port of codex-cli-runtime, rewrite for pi)
│       └── pi-prompting.md                 (port of gpt-5-4-prompting, retune for DeepSeek)
├── scripts/bump-version.mjs                (port, change package name)
├── tests/
└── README.md                               (rewrite — point at pi, mention DeepSeek setup)
```

Renames to apply mechanically across every file:
- `codex` → `pi` (identifier / namespace)
- `Codex` → `Pi` (prose)
- `@openai/codex-plugin-cc` → `@earendil-works/pi-plugin-cc` (or whatever name the user wants — ask once)
- `codex app-server` → `pi --mode rpc`
- `codex resume <session-id>` → pi's resume equivalent (TBD from RPC docs)
- `gpt-5-4-prompting` skill → `pi-prompting` (and rewrite content)

---

## 6. Known Translation Challenges

1. **Protocol schemas differ.** Codex's JSON-RPC has typed methods (`newConversation`, `sendUserTurn`, `interrupt`, etc.) with generated TS types. Pi's RPC is JSONL — likely a different vocabulary. Expect to write a thin adapter layer; do NOT try to preserve the codex method names inside pi-companion.

2. **No reasoning effort knob on most pi providers.** Codex has `model_reasoning_effort = "high"`. DeepSeek's reasoner model has its own modes; other providers have none. The `--effort` flag should still parse but degrade gracefully (warn + drop) when the configured pi model doesn't support it.

3. **Review prompts are tuned for GPT-5.** The current `review.md` / `adversarial-review.md` prompts rely on strong instruction following + long-context reasoning. On DeepSeek-Chat they will probably under-perform. Plan to rewrite these prompts (more explicit checklists, fewer "challenge the design" abstractions). The `gpt-5-4-prompting` skill should be replaced wholesale.

4. **Session resume.** Codex tracks session IDs and supports `codex resume <id>`. Pi may or may not have an equivalent — confirm from the RPC docs. If pi doesn't, `--resume-last` becomes a client-side concept (store the last session JSONL transcript and re-feed it on next launch).

5. **`pi --mode rpc` lifecycle.** Codex's app-server is long-lived and multiplexes conversations. If pi's RPC mode is per-process per-task, the broker becomes a process pool instead of a multiplexer. Affects `/pi:status` and `/pi:cancel` design.

6. **The review gate hook (`stop-review-gate-hook.mjs`)** invokes a targeted codex review on Claude's response. Port carefully — same risk profile applies (long Claude/pi loops can burn API quota). Keep it opt-in via `/pi:setup --enable-review-gate`.

---

## 7. Conventions to Follow

From the user's global CLAUDE.md:
- **Comments: English only.** Even though the user chats in Chinese and DeepSeek is Chinese-fluent, every comment, docstring, and inline note in source files must be English. Edit any non-English comment you encounter when you touch the line.
- **Minimum code.** No speculative abstractions, no helper functions the spec doesn't need, no `try/except` for impossible cases, no "future-proofing".
- **Commit attribution.** Never add `Co-Authored-By: Claude`, `Generated with Claude Code`, claude.ai URLs, or any AI-tooling footer to commits, PRs, or version-control artifacts. The user is the sole author.
- **No R files here**, so the `<-` vs `=` rule doesn't apply.

---

## 8. Open Questions to Settle With the User Before Coding

Ask these **once**, in a single `AskUserQuestion` call, only after step 4.1 (reading pi's RPC docs):

1. Final npm package name (`@earendil-works/pi-plugin-cc`? `@niehu/pi-plugin-cc`? something else?). Affects manifest only.
2. Default pi model (`deepseek-chat` for general use, `deepseek-reasoner` for review? or always reasoner?).
3. Whether to ship a sample `~/.pi/agent/models.json` in the README or just point at pi's own docs.
4. License — copy Apache-2.0 from source, or change?

Everything else in section 2 is already decided.

---

## 9. Useful Commands

```bash
# Source of truth — codex plugin, read-only reference
ls /Users/niehu/github/codex-plugin-cc/plugins/codex

# Verify pi is installed
which pi && pi --version

# Try pi's RPC mode in a terminal (for protocol discovery)
echo '{"method":"hello"}' | pi --mode rpc

# Run codex-companion.mjs once to see its arg surface
node /Users/niehu/github/codex-plugin-cc/plugins/codex/scripts/codex-companion.mjs --help 2>&1 | head -50
```

---

## 10. Definition of Done

- `/pi:setup` reports green when `pi` is installed and a model is configured.
- `/pi:rescue <task>` runs the task on pi, foreground and background.
- `/pi:review` and `/pi:review --base main` produce a review using pi's configured model.
- `/pi:adversarial-review` works similarly with the steerable prompt.
- `/pi:status` / `/pi:result` / `/pi:cancel` manage background pi tasks the same way codex's do.
- The plugin loads cleanly via `/plugin install pi@<wherever-the-user-publishes-it>` and survives `/reload-plugins`.
- No string `codex` remains in the published plugin (grep clean).
- README documents DeepSeek setup end-to-end.

When all of the above pass, the goal is done.
