import { runCommand, runCommandChecked } from "./process.mjs";

function git(cwd, args, options = {}) {
  return runCommand("git", args, { cwd, ...options, shell: false });
}

function gitChecked(cwd, args, options = {}) {
  return runCommandChecked("git", args, { cwd, ...options, shell: false });
}

export function ensureGitRepository(cwd) {
  const result = git(cwd, ["rev-parse", "--show-toplevel"]);
  const errorCode = result.error && "code" in result.error ? result.error.code : null;
  if (errorCode === "ENOENT") {
    throw new Error("git is not installed. Install Git and retry.");
  }
  if (result.status !== 0) {
    throw new Error("This command must run inside a Git repository.");
  }
  return result.stdout.trim();
}

export function getWorkingTreeState(cwd) {
  const staged = gitChecked(cwd, ["diff", "--cached", "--name-only"]).stdout.trim().split("\n").filter(Boolean);
  const unstaged = gitChecked(cwd, ["diff", "--name-only"]).stdout.trim().split("\n").filter(Boolean);
  const untracked = gitChecked(cwd, ["ls-files", "--others", "--exclude-standard"]).stdout.trim().split("\n").filter(Boolean);

  return {
    staged,
    unstaged,
    untracked,
    isDirty: staged.length > 0 || unstaged.length > 0 || untracked.length > 0
  };
}

export function addRaceWorktree(repoRoot, worktreePath) {
  gitChecked(repoRoot, ["worktree", "add", "--detach", worktreePath, "HEAD"]);
}

export function removeRaceWorktree(repoRoot, worktreePath) {
  const result = git(repoRoot, ["worktree", "remove", "--force", worktreePath]);
  if (result.status !== 0) {
    git(repoRoot, ["worktree", "prune"]);
  }
}

const RACE_PATCH_MAX_BYTES = 32 * 1024 * 1024;

export function captureWorktreePatch(worktreePath) {
  gitChecked(worktreePath, ["add", "-A"]);
  const patch = gitChecked(worktreePath, ["diff", "--cached", "--binary"], {
    maxBuffer: RACE_PATCH_MAX_BYTES
  }).stdout;
  const stat = gitChecked(worktreePath, ["diff", "--cached", "--stat"], {
    maxBuffer: RACE_PATCH_MAX_BYTES
  }).stdout.trim();
  return { patch, stat, isEmpty: !patch.trim() };
}
