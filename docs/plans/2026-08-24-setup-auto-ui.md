# Setup Auto-Starts Control Center Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `pi-companion setup` start or reuse the Pi Control Center by default, with `--no-ui` as an explicit opt-out.

**Architecture:** Extract the existing background Control Center discovery/startup path into a reusable helper that returns a descriptor without writing CLI output. Both `ui` and `setup` call that helper so descriptor registration, authentication, process spawning, and startup waiting remain identical. The setup report includes the Control Center result and renders its authenticated URL after the readiness checks.

**Tech Stack:** Node.js ESM, `node:test`, existing Pi companion CLI and Control Center modules.

---

### Task 1: Specify setup CLI behavior

**Files:**
- Create: `tests/setup-cli.test.mjs`

**Step 1: Write the failing default-start test**

Create a temporary workspace and isolated `PI_CODEX_DATA_DIR`, invoke `setup --cwd <workspace> --json`, and assert that the JSON contains a running Control Center descriptor with a loopback URL. Always stop the server in `finally`.

**Step 2: Write the failing opt-out test**

Invoke `setup --cwd <workspace> --no-ui --json`, assert that the setup report marks automatic UI startup disabled, then run `ui --status` and assert it reports stopped.

**Step 3: Run the tests to verify failure**

Run: `node --test tests/setup-cli.test.mjs`

Expected: FAIL because setup does not accept or report the automatic UI behavior.

### Task 2: Reuse Control Center startup from setup

**Files:**
- Modify: `plugins/pi-codex/scripts/pi-companion.mjs`
- Test: `tests/setup-cli.test.mjs`

**Step 1: Extract discovery and background startup**

Move the descriptor lookup and detached startup portion of `handleControlUi` into helpers that return the running descriptor. Keep foreground, status, and stop behavior in the UI handler.

**Step 2: Add setup option parsing**

Add conventional `--no-<flag>` support to the boolean argument parser, then add `ui` to setup boolean options so `--no-ui` maps to `options.ui === false`. Treat every other value, including omission, as enabled.

**Step 3: Start or reuse UI after checks**

After `buildSetupReport`, call the shared background helper for the resolved workspace when UI is enabled. Add a `controlCenter` object to JSON output and append the standard authenticated Control Center block to text output. When disabled, report `{ enabled: false, status: "disabled" }` without spawning.

**Step 4: Run targeted tests**

Run: `node --test tests/setup-cli.test.mjs tests/ui-cli.test.mjs`

Expected: PASS, including the pre-existing UI lifecycle test.

### Task 3: Document the public behavior

**Files:**
- Modify: `plugins/pi-codex/skills/setup/SKILL.md`
- Modify: `plugins/pi-codex/scripts/pi-companion.mjs`
- Test: `tests/codex-plugin-layout.test.mjs`

**Step 1: Update CLI help**

Document `setup [--no-ui] [--json]` in companion usage.

**Step 2: Update setup skill**

State that setup starts or reuses the Control Center by default, forwards `--no-ui`, returns the authenticated URL, and does not open a browser.

**Step 3: Validate public skill layout**

Run: `node --test tests/codex-plugin-layout.test.mjs`

Expected: PASS.

### Task 4: Verify the repository

**Files:**
- Verify only

**Step 1: Check version consistency**

Run: `npm run check-version`

Expected: PASS.

**Step 2: Run the complete test suite**

Run: `npm test`

Expected: PASS.

**Step 3: Review the diff**

Run: `git -c safe.directory=D:/workspace/pi-codex-plugin diff --check` and inspect the scoped diff.

Expected: no whitespace errors and no unrelated modifications.
