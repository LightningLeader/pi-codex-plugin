import { buildSingleJobSnapshot, readStoredJob } from "./job-control.mjs";
import { nowIso, readWatcherFile, writeWatcherFile } from "./state.mjs";

export const DEFAULT_WATCH_TIMEOUT_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_WATCH_POLL_INTERVAL_MS = 10000;

function active(status) {
  return status === "queued" || status === "running";
}

function recordFor(workspaceRoot, snapshot, previous, options = {}) {
  const timestamp = nowIso();
  const isActive = active(snapshot.job.status);
  return {
    version: 1,
    jobId: snapshot.job.id,
    workspaceRoot,
    watcherStatus: isActive ? "watching" : "finished",
    jobStatus: snapshot.job.status,
    summary: snapshot.job.summary ?? snapshot.job.title ?? null,
    resultAvailable: !isActive && Boolean(readStoredJob(workspaceRoot, snapshot.job.id)),
    startedAt: previous?.startedAt ?? timestamp,
    updatedAt: timestamp,
    completedAt: isActive ? null : timestamp,
    waitTimedOut: Boolean(options.waitTimedOut),
    watcherPid: isActive ? process.pid : null
  };
}

export async function watchJob(cwd, reference, options = {}) {
  if (!reference) throw new Error("`watch` requires a job id.");
  let snapshot = buildSingleJobSnapshot(cwd, reference);
  const workspaceRoot = snapshot.workspaceRoot;
  const previous = readWatcherFile(workspaceRoot, snapshot.job.id);
  let watcher = recordFor(workspaceRoot, snapshot, previous);
  writeWatcherFile(workspaceRoot, snapshot.job.id, watcher);

  const timeoutMs = Math.max(0, Number(options.timeoutMs) || DEFAULT_WATCH_TIMEOUT_MS);
  const pollIntervalMs = Math.max(100, Number(options.pollIntervalMs) || DEFAULT_WATCH_POLL_INTERVAL_MS);
  const deadline = Date.now() + timeoutMs;
  while (active(snapshot.job.status) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollIntervalMs, deadline - Date.now())));
    snapshot = buildSingleJobSnapshot(workspaceRoot, snapshot.job.id);
  }

  watcher = recordFor(workspaceRoot, snapshot, previous, { waitTimedOut: active(snapshot.job.status) });
  writeWatcherFile(workspaceRoot, snapshot.job.id, watcher);
  return watcher;
}
