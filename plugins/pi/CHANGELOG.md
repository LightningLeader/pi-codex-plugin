# Changelog

## Unreleased

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
