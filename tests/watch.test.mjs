import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  listWatchers,
  readWatcherFile,
  upsertJob,
  writeJobFile
} from "../plugins/pi-codex/scripts/lib/state.mjs";
import {
  DEFAULT_WATCH_POLL_INTERVAL_MS,
  watchJob
} from "../plugins/pi-codex/scripts/lib/job-watcher.mjs";

function withFixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-watch-test-"));
  const workspace = path.join(root, "workspace");
  const pluginData = path.join(root, "plugin-data");
  fs.mkdirSync(workspace, { recursive: true });
  const previous = process.env.PI_CODEX_DATA_DIR;
  process.env.PI_CODEX_DATA_DIR = pluginData;
  return Promise.resolve()
    .then(() => run({ root, workspace, pluginData }))
    .finally(() => {
      if (previous === undefined) delete process.env.PI_CODEX_DATA_DIR;
      else process.env.PI_CODEX_DATA_DIR = previous;
      fs.rmSync(root, { recursive: true, force: true });
    });
}

function seedJob(workspace, id, status) {
  const timestamp = new Date().toISOString();
  const job = {
    id,
    kind: "task",
    jobClass: "task",
    title: "Pi Task",
    summary: `fixture ${status}`,
    workspaceRoot: workspace,
    status,
    phase: status === "completed" ? "done" : status,
    createdAt: timestamp,
    startedAt: timestamp,
    ...(status === "running" ? {} : { completedAt: timestamp })
  };
  writeJobFile(workspace, id, { ...job, result: { lastAssistantText: "done" } });
  upsertJob(workspace, job);
}

describe("Pi job watcher", { concurrency: false }, () => {
  it("checks every ten seconds by default", () => {
    assert.equal(DEFAULT_WATCH_POLL_INTERVAL_MS, 10000);
  });

  for (const status of ["completed", "failed", "cancelled"]) {
    it(`records an already-${status} job as finished`, () => withFixture(async ({ workspace, pluginData }) => {
      const id = `task-${status}`;
      seedJob(workspace, id, status);

      const payload = await watchJob(workspace, id);

      assert.equal(payload.jobId, id);
      assert.equal(payload.watcherStatus, "finished");
      assert.equal(payload.jobStatus, status);
      assert.equal(payload.resultAvailable, true);
      assert.equal(readWatcherFile(workspace, id).watcherPid, null);
      assert.deepEqual(listWatchers(workspace).map((watcher) => watcher.jobId), [id]);
    }));
  }

  it("keeps a durable watching record when the wait times out", () => withFixture(async ({ workspace }) => {
    const id = "task-running";
    seedJob(workspace, id, "running");

    const payload = await watchJob(workspace, id, { timeoutMs: 120, pollIntervalMs: 100 });

    assert.equal(payload.watcherStatus, "watching");
    assert.equal(payload.jobStatus, "running");
    assert.equal(payload.waitTimedOut, true);
    assert.equal(readWatcherFile(workspace, id).watcherStatus, "watching");
  }));

  it("requires an explicit job id", () => withFixture(async ({ workspace }) => {
    await assert.rejects(watchJob(workspace, ""), /`watch` requires a job id/);
  }));
});
