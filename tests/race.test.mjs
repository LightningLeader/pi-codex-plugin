import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { buildRacerLabels, buildRaceWorktreePath, sanitizeModelForPath } from "../plugins/pi/scripts/lib/race.mjs";
import { addRaceWorktree, captureWorktreePatch, removeRaceWorktree } from "../plugins/pi/scripts/lib/git.mjs";

// ---------------------------------------------------------------------------
// sanitizeModelForPath
// ---------------------------------------------------------------------------
describe("sanitizeModelForPath", () => {
  it("keeps safe characters", () => {
    assert.equal(sanitizeModelForPath("deepseek-v4-flash"), "deepseek-v4-flash");
    assert.equal(sanitizeModelForPath("MiniMax-M3"), "MiniMax-M3");
    assert.equal(sanitizeModelForPath("gpt-4.1_mini"), "gpt-4.1_mini");
  });

  it("replaces slashes and other unsafe characters", () => {
    assert.equal(sanitizeModelForPath("openai/gpt-5"), "openai-gpt-5");
    assert.equal(sanitizeModelForPath("a:b c"), "a-b-c");
  });

  it("trims leading/trailing replacement hyphens", () => {
    assert.equal(sanitizeModelForPath("/weird/"), "weird");
  });

  it("falls back for empty or fully-unsafe input", () => {
    assert.equal(sanitizeModelForPath(""), "model");
    assert.equal(sanitizeModelForPath("///"), "model");
    assert.equal(sanitizeModelForPath(null), "model");
  });
});

// ---------------------------------------------------------------------------
// buildRacerLabels
// ---------------------------------------------------------------------------
describe("buildRacerLabels", () => {
  it("labels each model with its sanitized slug", () => {
    assert.deepEqual(buildRacerLabels(["a", "b/c"]), [
      { model: "a", slug: "a" },
      { model: "b/c", slug: "b-c" }
    ]);
  });

  it("uniquifies colliding slugs with an index suffix", () => {
    assert.deepEqual(buildRacerLabels(["x/y", "x-y", "x:y"]), [
      { model: "x/y", slug: "x-y" },
      { model: "x-y", slug: "x-y-2" },
      { model: "x:y", slug: "x-y-3" }
    ]);
  });

  it("handles an empty list", () => {
    assert.deepEqual(buildRacerLabels([]), []);
  });
});

// ---------------------------------------------------------------------------
// buildRaceWorktreePath
// ---------------------------------------------------------------------------
describe("buildRaceWorktreePath", () => {
  it("nests slug under a job-scoped race dir", () => {
    assert.equal(
      buildRaceWorktreePath("/tmp", "task-123", "deepseek"),
      path.join("/tmp", "pi-race-task-123", "deepseek")
    );
  });
});

// ---------------------------------------------------------------------------
// Race worktree lifecycle — integration against a real temp git repo
// ---------------------------------------------------------------------------
describe("race worktree lifecycle", () => {
  let repoDir;
  let worktreeDir;

  function git(cwd, ...args) {
    return execFileSync("git", args, { cwd, encoding: "utf8" });
  }

  before(() => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-race-repo-"));
    worktreeDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pi-race-wt-")), "racer");
    git(repoDir, "init", "-q");
    git(repoDir, "config", "user.email", "test@example.com");
    git(repoDir, "config", "user.name", "Test");
    fs.writeFileSync(path.join(repoDir, "existing.txt"), "original\n");
    git(repoDir, "add", "-A");
    git(repoDir, "commit", "-q", "-m", "init");
  });

  after(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(path.dirname(worktreeDir), { recursive: true, force: true });
  });

  it("adds a detached worktree, captures modified + untracked files as a patch, and removes it", () => {
    addRaceWorktree(repoDir, worktreeDir);
    assert.ok(fs.existsSync(path.join(worktreeDir, "existing.txt")));

    fs.writeFileSync(path.join(worktreeDir, "existing.txt"), "changed\n");
    fs.writeFileSync(path.join(worktreeDir, "created.txt"), "new file\n");

    const { patch, stat, isEmpty } = captureWorktreePatch(worktreeDir);
    assert.equal(isEmpty, false);
    assert.match(patch, /existing\.txt/);
    assert.match(patch, /created\.txt/);
    assert.match(patch, /\+changed/);
    assert.match(stat, /2 files changed/);

    // The user's repo is untouched by the racer.
    assert.equal(fs.readFileSync(path.join(repoDir, "existing.txt"), "utf8"), "original\n");
    assert.equal(git(repoDir, "status", "--porcelain").trim(), "");

    removeRaceWorktree(repoDir, worktreeDir);
    assert.equal(fs.existsSync(worktreeDir), false);
    assert.equal(git(repoDir, "worktree", "list").trim().split("\n").length, 1);
  });

  it("reports an empty patch when the racer changed nothing", () => {
    const cleanWorktree = path.join(path.dirname(worktreeDir), "clean-racer");
    addRaceWorktree(repoDir, cleanWorktree);
    const { isEmpty } = captureWorktreePatch(cleanWorktree);
    assert.equal(isEmpty, true);
    removeRaceWorktree(repoDir, cleanWorktree);
  });
});
