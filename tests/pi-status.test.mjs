import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getPiModelsStatus, getWindowsBashStatus } from "../plugins/pi-codex/scripts/lib/pi.mjs";

function withTempPiDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-status-"));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// getPiModelsStatus — auth.json credentials (pi /login) count as configured
// ---------------------------------------------------------------------------
describe("getPiModelsStatus", () => {
  it("treats auth.json credentials as a configured provider source", () => {
    withTempPiDir((dir) => {
      fs.writeFileSync(
        path.join(dir, "auth.json"),
        JSON.stringify({ deepseek: { type: "api_key", key: "sk-test" } })
      );
      const status = getPiModelsStatus({ PI_CODING_AGENT_DIR: dir });
      assert.equal(status.available, true);
      assert.equal(status.authProviderCount, 1);
      assert.match(status.detail, /auth\.json/);
    });
  });

  it("reports unavailable when env, models.json, and auth.json are all absent", () => {
    withTempPiDir((dir) => {
      const status = getPiModelsStatus({ PI_CODING_AGENT_DIR: dir });
      assert.equal(status.available, false);
      assert.equal(status.authProviderCount, 0);
    });
  });

  it("ignores an unparseable auth.json", () => {
    withTempPiDir((dir) => {
      fs.writeFileSync(path.join(dir, "auth.json"), "not json");
      const status = getPiModelsStatus({ PI_CODING_AGENT_DIR: dir });
      assert.equal(status.available, false);
      assert.equal(status.authProviderCount, 0);
    });
  });
});

describe("getWindowsBashStatus", () => {
  const baseOptions = {
    platform: "win32",
    homeDir: "C:\\Users\\Test",
    env: {
      ProgramFiles: "C:\\Program Files",
      "ProgramFiles(x86)": "C:\\Program Files (x86)"
    },
    readFileImpl: () => { throw Object.assign(new Error("missing"), { code: "ENOENT" }); }
  };

  it("uses a valid shellPath before automatic discovery", () => {
    const status = getWindowsBashStatus({
      ...baseOptions,
      readFileImpl: () => JSON.stringify({ shellPath: "D:\\Tools\\Git\\bin\\bash.exe" }),
      existsImpl: (candidate) => candidate === "D:\\Tools\\Git\\bin\\bash.exe",
      runCommandImpl: () => { throw new Error("where.exe should not run"); }
    });
    assert.equal(status.available, true);
    assert.equal(status.source, "settings");
  });

  it("finds Git Bash in Program Files", () => {
    const status = getWindowsBashStatus({
      ...baseOptions,
      existsImpl: (candidate) => candidate === "C:\\Program Files\\Git\\bin\\bash.exe",
      runCommandImpl: () => { throw new Error("where.exe should not run"); }
    });
    assert.equal(status.available, true);
    assert.equal(status.source, "git-bash");
  });

  it("finds bash.exe on PATH and ignores the legacy WSL alias", () => {
    const gitBash = "D:\\PortableGit\\bin\\bash.exe";
    const status = getWindowsBashStatus({
      ...baseOptions,
      existsImpl: (candidate) => candidate === gitBash,
      runCommandImpl: () => ({
        error: null,
        status: 0,
        stdout: `C:\\Windows\\System32\\bash.exe\r\n${gitBash}\r\n`,
        stderr: ""
      })
    });
    assert.equal(status.available, true);
    assert.equal(status.source, "path");
    assert.equal(status.path, gitBash);
  });

  it("reports an invalid configured shellPath without silently falling back", () => {
    const status = getWindowsBashStatus({
      ...baseOptions,
      readFileImpl: () => JSON.stringify({ shellPath: "D:\\Missing\\bash.exe" }),
      existsImpl: () => false,
      runCommandImpl: () => { throw new Error("where.exe should not run"); }
    });
    assert.equal(status.available, false);
    assert.match(status.detail, /configured shellPath not found/);
  });

  it("is not applicable outside Windows", () => {
    assert.equal(getWindowsBashStatus({ platform: "linux" }), null);
  });
});
