import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveWorkspaceRoot } from "./workspace.mjs";

const STATE_VERSION = 2;
const PLUGIN_DATA_ENV = "PI_CODEX_DATA_DIR";
const PLUGIN_DATA_DIR_NAME = "pi-codex-plugin";
const STATE_FILE_NAME = "state.json";
const JOBS_DIR_NAME = "jobs";
const WATCHERS_DIR_NAME = "watchers";
const MAX_JOBS = 50;

export function nowIso() {
  return new Date().toISOString();
}

export function defaultState() {
  return {
    version: STATE_VERSION,
    jobs: []
  };
}

export function resolvePluginDataDir(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const homeDir = options.homeDir ?? os.homedir();
  const override = env[PLUGIN_DATA_ENV]?.trim();
  if (override) {
    return path.resolve(options.cwd ?? process.cwd(), override);
  }
  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA?.trim() || path.join(homeDir, "AppData", "Local");
    return path.join(localAppData, PLUGIN_DATA_DIR_NAME);
  }
  if (platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", PLUGIN_DATA_DIR_NAME);
  }
  const stateHome = env.XDG_STATE_HOME?.trim() || path.join(homeDir, ".local", "state");
  return path.join(stateHome, PLUGIN_DATA_DIR_NAME);
}

export function resolveStateDir(cwd, options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  let canonicalWorkspaceRoot = workspaceRoot;
  try {
    canonicalWorkspaceRoot = fs.realpathSync.native(workspaceRoot);
  } catch {
    canonicalWorkspaceRoot = workspaceRoot;
  }

  const slugSource = path.basename(workspaceRoot) || "workspace";
  const slug = slugSource.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
  const hash = createHash("sha256").update(canonicalWorkspaceRoot).digest("hex").slice(0, 16);
  const stateRoot = path.join(resolvePluginDataDir(options), "state");
  return path.join(stateRoot, `${slug}-${hash}`);
}

export function resolveStateFile(cwd) {
  return path.join(resolveStateDir(cwd), STATE_FILE_NAME);
}

export function resolveJobsDir(cwd) {
  return path.join(resolveStateDir(cwd), JOBS_DIR_NAME);
}

export function resolveWatchersDir(cwd) {
  return path.join(resolveStateDir(cwd), WATCHERS_DIR_NAME);
}

export function ensureStateDir(cwd) {
  fs.mkdirSync(resolveJobsDir(cwd), { recursive: true, mode: 0o700 });
}

function ensureWatchersDir(cwd) {
  fs.mkdirSync(resolveWatchersDir(cwd), { recursive: true, mode: 0o700 });
}

export function loadState(cwd) {
  const stateFile = resolveStateFile(cwd);
  if (!fs.existsSync(stateFile)) {
    return defaultState();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    return {
      version: STATE_VERSION,
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : []
    };
  } catch {
    return defaultState();
  }
}

function pruneJobs(jobs) {
  return [...jobs]
    .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")))
    .slice(0, MAX_JOBS);
}

function removeFileIfExists(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// previousJobs is the job list this write is based on (the same snapshot
// `state` was derived from). It must NOT be re-read from disk here: a
// concurrent writer (e.g. a background task-worker reporting progress) may
// have added a job to disk after our snapshot was taken, and diffing against
// that fresher read would wrongly treat the concurrent job as pruned and
// delete its job/log files.
export function saveState(cwd, state, previousJobs = state.jobs) {
  ensureStateDir(cwd);
  const nextJobs = pruneJobs(state.jobs ?? []);
  const nextState = {
    version: STATE_VERSION,
    jobs: nextJobs
  };

  const retainedIds = new Set(nextJobs.map((job) => job.id));
  for (const job of previousJobs) {
    if (retainedIds.has(job.id)) {
      continue;
    }
    removeJobFile(resolveJobFile(cwd, job.id));
    removeFileIfExists(job.logFile);
  }

  fs.writeFileSync(resolveStateFile(cwd), `${JSON.stringify(nextState, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return nextState;
}

export function updateState(cwd, mutate) {
  const state = loadState(cwd);
  const previousJobs = [...state.jobs];
  mutate(state);
  return saveState(cwd, state, previousJobs);
}

export function generateJobId(prefix = "job") {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function upsertJob(cwd, jobPatch) {
  return updateState(cwd, (state) => {
    const timestamp = nowIso();
    const existingIndex = state.jobs.findIndex((job) => job.id === jobPatch.id);
    if (existingIndex === -1) {
      state.jobs.unshift({
        createdAt: timestamp,
        updatedAt: timestamp,
        ...jobPatch
      });
      return;
    }
    state.jobs[existingIndex] = {
      ...state.jobs[existingIndex],
      ...jobPatch,
      updatedAt: timestamp
    };
  });
}

export function listJobs(cwd) {
  return loadState(cwd).jobs;
}

export function removeJob(cwd, jobId) {
  let removed = null;
  updateState(cwd, (state) => {
    removed = state.jobs.find((job) => job.id === jobId) ?? null;
    state.jobs = state.jobs.filter((job) => job.id !== jobId);
  });
  removeFileIfExists(resolveWatcherFile(cwd, jobId));
  return removed;
}

export function writeJobFile(cwd, jobId, payload) {
  ensureStateDir(cwd);
  const jobFile = resolveJobFile(cwd, jobId);
  fs.writeFileSync(jobFile, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  return jobFile;
}

export function readJobFile(jobFile) {
  return JSON.parse(fs.readFileSync(jobFile, "utf8"));
}

function removeJobFile(jobFile) {
  if (fs.existsSync(jobFile)) {
    fs.unlinkSync(jobFile);
  }
}

export function resolveJobLogFile(cwd, jobId) {
  ensureStateDir(cwd);
  return path.join(resolveJobsDir(cwd), `${jobId}.log`);
}

export function resolveJobFile(cwd, jobId) {
  ensureStateDir(cwd);
  return path.join(resolveJobsDir(cwd), `${jobId}.json`);
}

export function resolveWatcherFile(cwd, jobId) {
  ensureWatchersDir(cwd);
  return path.join(resolveWatchersDir(cwd), `${jobId}.json`);
}

export function writeWatcherFile(cwd, jobId, payload) {
  const watcherFile = resolveWatcherFile(cwd, jobId);
  const temporaryFile = `${watcherFile}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporaryFile, watcherFile);
  return watcherFile;
}

export function readWatcherFile(cwd, jobId) {
  const watcherFile = resolveWatcherFile(cwd, jobId);
  if (!fs.existsSync(watcherFile)) return null;
  try {
    return JSON.parse(fs.readFileSync(watcherFile, "utf8"));
  } catch {
    return null;
  }
}

export function listWatchers(cwd) {
  const watchersDir = resolveWatchersDir(cwd);
  if (!fs.existsSync(watchersDir)) return [];
  return fs.readdirSync(watchersDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(watchersDir, entry.name), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => String(right.updatedAt ?? "").localeCompare(String(left.updatedAt ?? "")));
}
