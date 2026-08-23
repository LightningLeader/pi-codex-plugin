# Changelog

## Unreleased

- Rebrand the project as `pi-codex-plugin`, publish it under LightningLeader,
  and rename the native Codex plugin ID from `pi` to `pi-codex`.
- Remove the non-Codex host manifests, hooks, slash commands, forwarding agent,
  and legacy prompt compatibility layer. The maintained product is now Codex-only.
- Move runtime state to a private, platform-standard `pi-codex-plugin` data
  directory with `PI_CODEX_DATA_DIR` as an explicit override.
- Update documentation and runtime guidance to use `$pi-codex:<skill>` names.
- Remove the `review` and `adversarial-review` skills together with their CLI
  commands, prompts, structured-output schema, incremental cache, panel, and
  sharding implementation.
- Rename the `rescue` and `parallel-rescue` skills to the shorter `task` and
  `parallel-task` names, and align task labels and documentation.

## 0.8.0

- Package the repository as a native Codex plugin with
  `plugins/pi-codex/.codex-plugin/plugin.json` and namespaced skills for review, delegation,
  live continuation, job control, setup, and the RPC dashboard. Retain legacy
  `codex-prompts/` only for older clients.
- Add Pi Control Center, a local-only web dashboard backed by a persistent RPC
  process manager. It streams assistant text/thinking deltas, tool calls and
  incremental tool output; supports prompts, steering, follow-ups, aborts, and
  extension UI responses; routes new background task jobs through the daemon;
  and lists pre-existing legacy plugin jobs with their logs.
- Add `pi-companion.mjs ui` and `/pi:ui` / Codex `pi-ui` wrappers with
  `--background`, `--status`, and `--stop`. Access is protected by a random
  local token and remote binding requires explicit opt-in.
- Extend `PiRpcClient` with conversation control and history helpers, and add
  control-server integration coverage.
- Create missing session working directories on demand; make session startup
  return immediately; add session/job deletion; reduce stream-driven sidebar
  refreshes; and render each thinking block as its own collapsible card.
- Keep conversations inside a dedicated scrolling viewport, color-code RPC
  event categories, localize session states, and offer full-collapse or
  latest-three-line previews for thinking and tool cards.
- Split session history and message composition into framed chat panels; stop
  auto-follow as soon as the user scrolls upward; add an explicit jump-to-latest
  control; and hide low-level turn boundaries and `agent_settled` events.
- Fix collapsed three-line previews by keeping them outside native `details`
  content; preserve rendered session DOM and card state while switching; keep
  prompt/agent/tool history labels consistent with live events; and rebuild
  settled sessions from full RPC history before attaching at an exact sequence.
- Surface streaming `toolcall_*` argument generation before tool execution,
  including write/edit progress without rendering entire file payloads; return
  switched sessions to their latest output; add global expand/collapse control;
  and safely render common Markdown, including GFM tables, in completed
  assistant messages.
- Show the Control Center PID and each managed Pi RPC process PID, live/exited
  state, exit code, or terminating signal in the dashboard session metadata.
- Refine the dashboard visual hierarchy with improved Chinese font fallbacks,
  higher-contrast message colors, clearer status indicators, richer active
  session states, and more polished panels, controls, and scrollbars.
- Increase secondary text contrast across session metadata, timestamps,
  placeholders, empty states, and collapsed previews for easier reading.
- Raise the overall text contrast another step and version the stylesheet URL
  so browser or proxy caches cannot hide visual updates.
- Prevent long event labels such as `compaction_start` from overlapping event
  payloads by widening the label column and allowing safe label wrapping.
- Label Pi's `compacting` phase as “压缩中” instead of the less precise
  “整理中”.
- Replace the legacy plugin-task log-only view with a rich, read-only Pi
  session mirror that renders prompts, thinking, assistant Markdown, tool
  calls/results, and compaction summaries using the control-session UI; keep
  the worker log available in a collapsible diagnostics panel.
- Register the newest live dashboard as a user-local global control center.
  Codex-launched `task` commands now try their workspace dashboard and then the
  global dashboard using an authenticated health check, regardless of PID
  namespace; both foreground and background tasks retain their original cwd
  while appearing as fully interactive control sessions. Foreground callers
  still wait for and receive the final task output.
- Clamp long session titles without shrinking status chips or action buttons,
  and expose the full title as a hover tooltip.
- Prevent duplicate live prompts, thinking blocks, and tool events after an
  SSE reconnect by honoring `Last-Event-ID` on the server, deduplicating event
  sequences in the browser, and ignoring buffered events from stale streams.
- Merge control sessions and legacy task records into one chronological
  navigation list. Managed task jobs are represented by their interactive
  session only, while direct-task history remains available as a read-only
  session record without a duplicate entry.
- Give idle sessions a cyan status chip while keeping completed records blue,
  so waiting RPC sessions are visually distinct from finished history.
- Use orange for active running/responding/tool phases, preserving cyan for
  idle sessions and blue for completed records as three distinct state hues.
- Replace the global collapse dropdown with a single “全部折叠” checkbox:
  checking it closes every card and unchecking it expands every card.
- Remove per-session terminate buttons from the navigation sidebar. Add hover
  explanations to the header actions for aborting the current turn, ending
  the RPC process while retaining history, and deleting the whole session.
- Add strict live continuation through `/pi:continue`, Codex `/pi-continue`,
  and the `continue` CLI subcommand. Each continuation becomes a new tracked
  job in the original Control Session while reusing its exact Pi RPC process;
  unavailable or busy sessions fail without spawning a replacement process.
- Add Codex supervised-background delegation through `$pi:rescue --supervised`
  and `$pi:watch`. A lightweight Codex subagent waits on the new deterministic
  `watch` CLI command while the main conversation remains free. Watcher state is
  stored independently from job state and surfaced in Pi Control Center.
- Make supervised watcher polling configurable with `--poll-interval-ms` on
  both `$pi:watch` and `$pi:rescue --supervised`, and change the default
  interval from two seconds to ten seconds.

## 0.7.2

- Fix install failure on Claude Code >= 2.1 (PR #26, thanks @Heelc). The
  plugin-manifest schema requires `commands` and `hooks` component paths to
  start with `./`; the bare paths were rejected with
  `hooks: Invalid input, commands: Invalid input`, so the plugin could not be
  installed at all. Every path in `plugins/pi-codex/.claude-plugin/plugin.json` is
  now `./`-prefixed. Files and directory layout are unchanged.

## 0.7.1

- Pi 0.80.x compatibility:
  - `--effort max` is now accepted and forwarded via `set_thinking_level`
    (new top thinking level introduced in Pi 0.80.6; exposed by models such
    as GPT-5.6 and adaptive Claude).
  - `/pi:setup` readiness now recognizes credentials stored by pi `/login`
    in `~/.pi/agent/auth.json` (API keys and OAuth tokens). Previously a
    user authenticated only via `/login` was reported as "no provider
    configured" even though pi worked; the check looked at env vars and
    `models.json` alone. New `authProviderCount` field in the setup JSON.
- README value tier: suggest `kimi-k3` (Kimi K3 support landed in Pi 0.80.9).
- Includes the previously unreleased fixes from PR #24: untracked-symlink
  content leak in review prompts, race-worktree slug collision, and a
  job-state save race (`lib/git.mjs`, `lib/race.mjs`, `lib/state.mjs`).

## 0.7.0

- Incremental review: `/pi:review --incremental` (and `/pi:adversarial-review`)
  reviews only the commits since the last review on the current branch,
  instead of the full branch diff. A per-(workspace, branch) cache tracks the
  last-reviewed commit sha; after any successful review, HEAD is recorded as
  the new marker. Falls back to a full review when there is no valid cache
  (first run, or the cached commit is no longer an ancestor of HEAD after a
  rebase/history rewrite). Not combinable with `--base`; composes with
  `--models`/`--shards`. Only committed changes are covered — uncommitted
  working-tree changes are not part of the incremental diff. New
  `lib/review-cache.mjs` + `getHeadSha`/`isAncestor` in `lib/git.mjs`;
  8 new tests (205 total).

## 0.6.0

- `--out-file <path>` on `/pi:review`, `/pi:adversarial-review`, `/pi:rescue`,
  and `/pi:result` writes Pi's full output to a file and returns only a short
  summary (verdict, finding counts, one line per finding for reviews; a one-line
  summary for free-form task/rescue results). This keeps a large review or task
  result out of the calling agent's context to save tokens — relay the summary,
  open the file for detail. New `renderOutFileSummary`; 4 new tests (197 total).

## 0.5.0

- Sharded parallel review: `/pi:review --shards <N>` (and
  `/pi:adversarial-review`) splits the changed files across N review jobs
  that run in parallel — each job's diff is scoped to only its own files —
  then merges the findings (sorted by severity) into one review result.
  Activates only when `--shards` is 2 or more and more than one file
  changed; otherwise falls back to the normal single review. Not combinable
  with `--models`. New `lib/shard.mjs`; 11 new tests (193 total).

## 0.4.0

- Model racing: `/pi:rescue --race m1,m2,...` runs the same task with every
  listed model in parallel and presents each racer's result so a winner can
  be picked. Write races isolate each racer in its own git worktree created
  from HEAD (racers can never touch the user's tree or each other) and
  capture each racer's result as a patch — apply the winner with
  `git apply <patch>`. Read-only races present the answers side by side.
  Works foreground and `--background`; not combinable with `--model` or
  `--resume`. New `lib/race.mjs` + worktree helpers in `lib/git.mjs`;
  10 new tests (182 total) including a real-worktree integration test.

## 0.3.0

- Multi-model review panel: `/pi:review --models m1,m2,...` (and
  `/pi:adversarial-review`) reviews the same diff with several models in
  parallel and merges the findings — consensus findings (reported by 2+
  models) rank first with `found by:` tags; duplicates are matched per file
  with line-range slack, severity escalates to the highest reported, and
  alternate titles are preserved. A failed member (provider error, invalid
  JSON) is reported inline without sinking the panel.
- Automatic model fallback: set `PI_PLUGIN_FALLBACK_MODELS=a,b` and any
  failed review/task run is retried with the next model in the chain. The
  output ends with a `Model fallback:` note and the JSON payload carries
  `modelAttempts`. `/pi:setup` reports the configured chain.
- New lib modules `panel.mjs` and `fallback.mjs`; 41 new tests (172 total).

## 0.2.0

- pi-subagents integration: `/pi:setup` detects installation (npm + legacy paths)
  and lists agent profiles; rescue prompts gain subagent awareness; new
  `/pi:parallel-rescue` command for multi-task parallel fan-out via
  `subagent({ tasks: [...] })` (runs `task --write` so the subagent tool stays
  available).
- Test suite: 131 tests across process, git, state, JSON parsing, and args
  modules (`node --test`).
- Shell expansion safety fix (ported from upstream codex-plugin-cc):
  `shell: false` on git invocations.
- Fixed process-group kill that could take down the parent process
  (`detached: true` on pi spawn); fixed `auto_retry_end` failure deadlock;
  removed always-null `turnId`.
- `/pi:setup` shows pi version (min 0.75.0 check) and available models.
- Windows-safe `shellEscape`; renamed rescue agent to `pi-companion-forwarder`
  to prevent slash-command re-entry.
- Removed unimplemented `--background` flag from review commands; registered
  hooks/commands in plugin.json.
- Replace ASCII workflow diagram with drawio PNG; rephrase "1:1 fork" to
  "Adapted from".

## 0.1.2

- Model-agnostic: removed hard-coded `deepseek-v4-flash` / `deepseek-v4-pro` defaults
  that caused spawn failures for non-DeepSeek users.
- New env-var overrides: `PI_PLUGIN_REVIEW_MODEL` and
  `PI_PLUGIN_ADVERSARIAL_REVIEW_MODEL`. With nothing set, the plugin defers
  model selection entirely to pi.
- README rewritten as model-agnostic with a per-provider suggested-model table.

## 0.1.1

- Fixed 14 findings from a dual pi+DeepSeek self-review (3 critical, 2 high,
  6 medium, 3 low). Highlights: close()/agent_end deadlock fixes, SIGKILL
  escalation, stop-review-gate no longer silently bypasses when pi is
  unavailable, bounded stderr buffer, StringDecoder flush on close.

## 0.1.0

- Initial release of the Pi plugin for Claude Code, forked from `codex-plugin-cc`.
