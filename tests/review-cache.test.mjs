import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { readReviewCache, writeReviewCache, reviewCacheFile } from "../plugins/pi-codex/scripts/lib/review-cache.mjs";
import { getHeadSha, isAncestor } from "../plugins/pi-codex/scripts/lib/git.mjs";

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ---------------------------------------------------------------------------
// readReviewCache / writeReviewCache — pure file I/O, no git needed
// ---------------------------------------------------------------------------
describe("review cache read/write", () => {
  let workspaceRoot;

  before(() => {
    workspaceRoot = tempDir("pi-review-cache-");
  });

  after(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("round-trips a sha for a branch", () => {
    writeReviewCache(workspaceRoot, "main", "abc123");
    assert.equal(readReviewCache(workspaceRoot, "main"), "abc123");
  });

  it("preserves other branches' entries", () => {
    writeReviewCache(workspaceRoot, "feature-a", "sha-a");
    writeReviewCache(workspaceRoot, "feature-b", "sha-b");
    assert.equal(readReviewCache(workspaceRoot, "feature-a"), "sha-a");
    assert.equal(readReviewCache(workspaceRoot, "feature-b"), "sha-b");
  });

  it("returns null for a missing file", () => {
    const emptyWorkspace = tempDir("pi-review-cache-empty-");
    assert.equal(readReviewCache(emptyWorkspace, "main"), null);
    fs.rmSync(emptyWorkspace, { recursive: true, force: true });
  });

  it("returns null for a missing branch key", () => {
    assert.equal(readReviewCache(workspaceRoot, "nonexistent-branch"), null);
  });

  it("returns null for corrupt JSON", () => {
    const corruptWorkspace = tempDir("pi-review-cache-corrupt-");
    const file = reviewCacheFile(corruptWorkspace);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ not valid json", "utf8");
    assert.equal(readReviewCache(corruptWorkspace, "main"), null);
    fs.rmSync(corruptWorkspace, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// getHeadSha / isAncestor — integration against real temp git repos
// ---------------------------------------------------------------------------
describe("git review-cache helpers", () => {
  let repoDir;
  let firstSha;
  let otherRepoDir;
  let unrelatedSha;

  function git(cwd, ...args) {
    return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  }

  before(() => {
    repoDir = tempDir("pi-review-cache-repo-");
    git(repoDir, "init", "-q");
    git(repoDir, "config", "user.email", "test@example.com");
    git(repoDir, "config", "user.name", "Test");
    fs.writeFileSync(path.join(repoDir, "a.txt"), "one\n");
    git(repoDir, "add", "-A");
    git(repoDir, "commit", "-q", "-m", "first");
    firstSha = git(repoDir, "rev-parse", "HEAD");
    fs.writeFileSync(path.join(repoDir, "a.txt"), "two\n");
    git(repoDir, "add", "-A");
    git(repoDir, "commit", "-q", "-m", "second");

    otherRepoDir = tempDir("pi-review-cache-other-repo-");
    git(otherRepoDir, "init", "-q");
    git(otherRepoDir, "config", "user.email", "test@example.com");
    git(otherRepoDir, "config", "user.name", "Test");
    fs.writeFileSync(path.join(otherRepoDir, "b.txt"), "unrelated\n");
    git(otherRepoDir, "add", "-A");
    git(otherRepoDir, "commit", "-q", "-m", "unrelated");
    unrelatedSha = git(otherRepoDir, "rev-parse", "HEAD");
  });

  after(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(otherRepoDir, { recursive: true, force: true });
  });

  it("getHeadSha returns the HEAD sha", () => {
    assert.equal(getHeadSha(repoDir), git(repoDir, "rev-parse", "HEAD"));
  });

  it("isAncestor is true for an earlier commit vs HEAD", () => {
    assert.equal(isAncestor(repoDir, firstSha), true);
  });

  it("isAncestor is false for an unrelated sha", () => {
    assert.equal(isAncestor(repoDir, unrelatedSha), false);
  });
});
