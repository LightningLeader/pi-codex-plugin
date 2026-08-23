import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getPiModelsStatus } from "../plugins/pi-codex/scripts/lib/pi.mjs";

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
