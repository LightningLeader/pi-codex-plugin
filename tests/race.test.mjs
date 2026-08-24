import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { buildRacerLabels, buildRaceWorktreePath, sanitizeModelForPath } from "../plugins/pi-codex/scripts/lib/race.mjs";
import { addRaceWorktree, captureWorktreePatch, removeRaceWorktree } from "../plugins/pi-codex/scripts/lib/git.mjs";

describe("sanitizeModelForPath", () => {
  it("keeps safe characters", () => {
    assert.equal(sanitizeModelForPath("deepseek-v4-flash"), "deepseek-v4-flash");
    assert.equal(sanitizeModelForPath("MiniMax-M3"), "MiniMax-M3");
    assert.equal(sanitizeModelForPath("gpt-4.1_mini"), "gpt-4.1_mini");
  });

  it("replaces unsafe characters and trims replacement hyphens", () => {
    assert.equal(sanitizeModelForPath("openai/gpt-5"), "openai-gpt-5");
    assert.equal(sanitizeModelForPath("a:b c"), "a-b-c");
    assert.equal(sanitizeModelForPath("/weird/"), "weird");
  });

  it("falls back for empty or fully unsafe input", () => {
    assert.equal(sanitizeModelForPath(""), "model");
    assert.equal(sanitizeModelForPath("///"), "model");
    assert.equal(sanitizeModelForPath(null), "model");
  });

  it("avoids traversal segments and Windows reserved device names", () => {
    assert.equal(sanitizeModelForPath("."), "model");
    assert.equal(sanitizeModelForPath(".."), "model");
    assert.equal(sanitizeModelForPath("CON"), "CON-model");
    assert.equal(sanitizeModelForPath("nul.txt"), "nul.txt-model");
    assert.equal(sanitizeModelForPath("model."), "model");
  });

  it("bounds long slugs and keeps their hash distinct", () => {
    const first = sanitizeModelForPath(`provider/${"x".repeat(300)}`);
    const second = sanitizeModelForPath(`provider/${"x".repeat(299)}y`);
    assert.equal(first.length <= 64, true);
    assert.equal(second.length <= 64, true);
    assert.notEqual(first, second);
  });
});

describe("buildRacerLabels", () => {
  it("labels models and uniquifies colliding slugs", () => {
    assert.deepEqual(buildRacerLabels(["x/y", "x-y", "x:y"]), [
      { model: "x/y", slug: "x-y" },
      { model: "x-y", slug: "x-y-2" },
      { model: "x:y", slug: "x-y-3" }
    ]);
  });

  it("handles an empty list", () => {
    assert.deepEqual(buildRacerLabels([]), []);
  });

  it("keeps collision suffixes within the Windows-safe length bound", () => {
    const long = "x".repeat(100);
    const labels = buildRacerLabels([long, `${long}/`, `${long}:`]);
    assert.equal(new Set(labels.map(({ slug }) => slug)).size, 3);
    assert.equal(labels.every(({ slug }) => slug.length <= 64), true);
  });
});

describe("buildRaceWorktreePath", () => {
  it("nests the model slug under a job-scoped race directory", () => {
    assert.equal(
      buildRaceWorktreePath(os.tmpdir(), "task-123", "deepseek"),
      path.join(os.tmpdir(), "pi-race-task-123", "deepseek")
    );
  });
});

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

  it("captures changes in an isolated detached worktree and removes it", () => {
    addRaceWorktree(repoDir, worktreeDir);
    fs.writeFileSync(path.join(worktreeDir, "existing.txt"), "changed\n");
    fs.writeFileSync(path.join(worktreeDir, "created.txt"), "new file\n");

    const { patch, stat, isEmpty } = captureWorktreePatch(worktreeDir);
    assert.equal(isEmpty, false);
    assert.match(patch, /existing\.txt/);
    assert.match(patch, /created\.txt/);
    assert.match(patch, /\+changed/);
    assert.match(stat, /2 files changed/);
    assert.equal(fs.readFileSync(path.join(repoDir, "existing.txt"), "utf8"), "original\n");
    assert.equal(git(repoDir, "status", "--porcelain").trim(), "");

    removeRaceWorktree(repoDir, worktreeDir);
    assert.equal(fs.existsSync(worktreeDir), false);
    assert.equal(git(repoDir, "worktree", "list").trim().split("\n").length, 1);
  });

  it("reports an empty patch when the racer changed nothing", () => {
    const cleanWorktree = path.join(path.dirname(worktreeDir), "clean-racer");
    addRaceWorktree(repoDir, cleanWorktree);
    assert.equal(captureWorktreePatch(cleanWorktree).isEmpty, true);
    removeRaceWorktree(repoDir, cleanWorktree);
  });
});
