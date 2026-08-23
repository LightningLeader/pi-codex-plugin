import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPiRpcSpawnConfig } from "../plugins/pi-codex/scripts/lib/pi-rpc.mjs";

describe("Pi RPC spawn configuration", () => {
  it("uses the Windows command shim without detaching", () => {
    assert.deepEqual(buildPiRpcSpawnConfig("win32"), {
      command: "pi.cmd",
      detached: false,
      shell: true,
      windowsHide: true
    });
  });

  it("keeps direct execution on POSIX", () => {
    assert.deepEqual(buildPiRpcSpawnConfig("linux"), {
      command: "pi",
      detached: false,
      shell: false,
      windowsHide: true
    });
  });

  it("allows an explicit Pi command override", () => {
    assert.equal(buildPiRpcSpawnConfig("win32", "custom-pi").command, "custom-pi");
  });
});
