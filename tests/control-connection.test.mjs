import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { localControlAccessDenialCode } from "../plugins/pi-codex/scripts/lib/control-connection.mjs";

describe("Pi Control Center connection errors", () => {
  it("recognizes nested loopback permission denials", () => {
    const denied = new TypeError("fetch failed", {
      cause: Object.assign(new Error("connect EPERM 127.0.0.1"), { code: "EPERM" })
    });
    assert.equal(localControlAccessDenialCode(denied), "EPERM");
  });

  it("recognizes direct access denials", () => {
    assert.equal(
      localControlAccessDenialCode(Object.assign(new Error("access denied"), { code: "EACCES" })),
      "EACCES"
    );
  });

  it("does not misclassify an offline Control Center", () => {
    const refused = new TypeError("fetch failed", {
      cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" })
    });
    assert.equal(localControlAccessDenialCode(refused), null);
  });
});
