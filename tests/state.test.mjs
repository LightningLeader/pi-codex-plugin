import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  defaultState,
  nowIso,
  generateJobId,
  resolvePluginDataDir,
} from "../plugins/pi-codex/scripts/lib/state.mjs";

// ---------------------------------------------------------------------------
// defaultState — pure function
// ---------------------------------------------------------------------------
describe("defaultState", () => {
  it("returns an object with version and jobs", () => {
    const state = defaultState();
    assert.equal(typeof state, "object");
    assert.equal(state.version, 2);
    assert.deepEqual(Object.keys(state).sort(), ["jobs", "version"]);
    assert.deepEqual(state.jobs, []);
  });

  it("returns a fresh copy each call (not shared reference)", () => {
    const a = defaultState();
    const b = defaultState();
    assert.notStrictEqual(a.jobs, b.jobs);
  });
});

describe("resolvePluginDataDir", () => {
  it("prefers PI_CODEX_DATA_DIR", () => {
    assert.equal(
      resolvePluginDataDir({ env: { PI_CODEX_DATA_DIR: "./custom-state" }, cwd: "/repo" }),
      path.resolve("/repo/custom-state")
    );
  });

  it("uses XDG_STATE_HOME on Linux", () => {
    assert.equal(
      resolvePluginDataDir({ platform: "linux", env: { XDG_STATE_HOME: "/state" }, homeDir: "/home/user" }),
      "/state/pi-codex-plugin"
    );
  });

  it("uses the Linux home fallback", () => {
    assert.equal(
      resolvePluginDataDir({ platform: "linux", env: {}, homeDir: "/home/user" }),
      "/home/user/.local/state/pi-codex-plugin"
    );
  });

  it("uses Application Support on macOS", () => {
    assert.equal(
      resolvePluginDataDir({ platform: "darwin", env: {}, homeDir: "/Users/user" }),
      "/Users/user/Library/Application Support/pi-codex-plugin"
    );
  });

  it("uses LOCALAPPDATA on Windows", () => {
    assert.equal(
      resolvePluginDataDir({ platform: "win32", env: { LOCALAPPDATA: "C:\\Users\\user\\AppData\\Local" }, homeDir: "C:\\Users\\user" }),
      path.win32.join("C:\\Users\\user\\AppData\\Local", "pi-codex-plugin")
    );
  });
});

// ---------------------------------------------------------------------------
// nowIso — pure logic (uses Date but no I/O)
// ---------------------------------------------------------------------------
describe("nowIso", () => {
  it("returns a string in ISO 8601 format", () => {
    const result = nowIso();
    assert.equal(typeof result, "string");
    // ISO 8601 format: YYYY-MM-DDTHH:mm:ss.sssZ
    assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("returns a valid Date string", () => {
    const result = nowIso();
    const parsed = new Date(result);
    assert.equal(parsed.toISOString(), result);
  });
});

// ---------------------------------------------------------------------------
// generateJobId — pure logic
// ---------------------------------------------------------------------------
describe("generateJobId", () => {
  it("returns a string with the default prefix", () => {
    const id = generateJobId();
    assert.ok(id.startsWith("job-"));
    assert.equal(typeof id, "string");
    assert.ok(id.length > "job-".length);
  });

  it("uses the provided prefix", () => {
    const id = generateJobId("task");
    assert.ok(id.startsWith("task-"));
  });

  it("contains two hyphens separating prefix, timestamp, and random", () => {
    const id = generateJobId();
    const parts = id.split("-");
    assert.equal(parts.length, 3);
    assert.equal(parts[0], "job");
  });

  it("generates unique IDs across calls", () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateJobId());
    }
    assert.equal(ids.size, 100);
  });
});

// ---------------------------------------------------------------------------
// Path-building functions — skipped because they need mock.module() to
// intercept the resolveWorkspaceRoot import, and that API is unavailable
// in this Node.js version.
// ---------------------------------------------------------------------------
describe.skip("resolveStateDir / resolveStateFile / resolveJobsDir", () => {
  it("would test path construction with mocked workspace root", () => {});
});
