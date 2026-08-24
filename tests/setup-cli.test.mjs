import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPANION = path.join(REPO_ROOT, "plugins", "pi-codex", "scripts", "pi-companion.mjs");

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-setup-cli-test-"));
  const workspace = path.join(root, "workspace");
  const dataDir = path.join(root, "plugin-data");
  fs.mkdirSync(workspace, { recursive: true });
  return {
    root,
    workspace,
    env: { ...process.env, PI_CODEX_DATA_DIR: dataDir }
  };
}

async function stopControlCenter(fixture) {
  await execFileAsync(
    process.execPath,
    [COMPANION, "ui", "--cwd", fixture.workspace, "--stop"],
    { cwd: fixture.workspace, env: fixture.env, timeout: 10000 }
  ).catch(() => {});
}

describe("Pi setup CLI", { concurrency: false }, () => {
  it("starts the Control Center by default", { timeout: 20000 }, async () => {
    const fixture = createFixture();
    try {
      const result = await execFileAsync(
        process.execPath,
        [COMPANION, "setup", "--cwd", fixture.workspace, "--json"],
        { cwd: fixture.workspace, env: fixture.env, timeout: 15000 }
      );
      const report = JSON.parse(result.stdout);
      assert.equal(report.controlCenter.enabled, true);
      assert.equal(report.controlCenter.status, "running");
      assert.equal(report.controlCenter.workspaceRoot, fixture.workspace);
      assert.match(report.controlCenter.url, /^http:\/\/127\.0\.0\.1:\d+\/\?token=/);

      const repeated = await execFileAsync(
        process.execPath,
        [COMPANION, "setup", "--cwd", fixture.workspace, "--json"],
        { cwd: fixture.workspace, env: fixture.env, timeout: 15000 }
      );
      assert.equal(JSON.parse(repeated.stdout).controlCenter.pid, report.controlCenter.pid);

      const status = await execFileAsync(
        process.execPath,
        [COMPANION, "ui", "--cwd", fixture.workspace, "--status"],
        { cwd: fixture.workspace, env: fixture.env, timeout: 10000 }
      );
      assert.match(status.stdout, /Status: running/);
    } finally {
      await stopControlCenter(fixture);
      fs.rmSync(fixture.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  it("does not start the Control Center with --no-ui", { timeout: 20000 }, async () => {
    const fixture = createFixture();
    try {
      const result = await execFileAsync(
        process.execPath,
        [COMPANION, "setup", "--cwd", fixture.workspace, "--no-ui", "--json"],
        { cwd: fixture.workspace, env: fixture.env, timeout: 15000 }
      );
      const report = JSON.parse(result.stdout);
      assert.deepEqual(report.controlCenter, { enabled: false, status: "disabled" });

      const status = await execFileAsync(
        process.execPath,
        [COMPANION, "ui", "--cwd", fixture.workspace, "--status"],
        { cwd: fixture.workspace, env: fixture.env, timeout: 10000 }
      );
      assert.match(status.stdout, /not running/);
    } finally {
      await stopControlCenter(fixture);
      fs.rmSync(fixture.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
});
