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

describe("Pi Control Center CLI", { concurrency: false }, () => {
  it("starts in the background by default and can be stopped", { timeout: 20000 }, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-ui-cli-test-"));
    const workspace = path.join(root, "workspace");
    const dataDir = path.join(root, "plugin-data");
    fs.mkdirSync(workspace, { recursive: true });
    const env = { ...process.env, PI_CODEX_DATA_DIR: dataDir };

    try {
      const started = await execFileAsync(
        process.execPath,
        [COMPANION, "ui", "--cwd", workspace, "--port", "0"],
        { cwd: workspace, env, timeout: 10000 }
      );
      assert.match(started.stdout, /Status: running/);
      assert.match(started.stdout, /Open: http:\/\/127\.0\.0\.1:\d+\/\?token=/);

      const status = await execFileAsync(
        process.execPath,
        [COMPANION, "ui", "--cwd", workspace, "--status"],
        { cwd: workspace, env, timeout: 10000 }
      );
      assert.match(status.stdout, /Status: running/);
    } finally {
      await execFileAsync(
        process.execPath,
        [COMPANION, "ui", "--cwd", workspace, "--stop"],
        { cwd: workspace, env, timeout: 10000 }
      ).catch(() => {});
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  it("rejects conflicting foreground and background flags", async () => {
    await assert.rejects(
      execFileAsync(process.execPath, [COMPANION, "ui", "--background", "--foreground"]),
      (error) => /cannot be used together/.test(error.stderr)
    );
  });
});
