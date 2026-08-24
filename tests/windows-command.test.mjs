import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSafeWindowsShellCommand } from "../plugins/pi-codex/scripts/lib/windows-command.mjs";

describe("buildSafeWindowsShellCommand", () => {
  it("quotes spaces in command and argument paths", () => {
    assert.equal(
      buildSafeWindowsShellCommand("C:\\Program Files\\Pi\\pi.cmd", ["--session", "session 1"]),
      '"C:\\Program Files\\Pi\\pi.cmd" --session "session 1"'
    );
  });

  it("preserves ordinary Pi CLI punctuation", () => {
    assert.equal(
      buildSafeWindowsShellCommand("pi", ["--tools", "read,grep,find,ls", "--model", "provider/model:v2"]),
      "pi --tools read,grep,find,ls --model provider/model:v2"
    );
  });

  for (const unsafe of ["x&whoami", "x|more", "%PATH%", "x^y", "x!y", "x\ny", 'x"y']) {
    it(`rejects unsafe token ${JSON.stringify(unsafe)}`, () => {
      assert.throws(() => buildSafeWindowsShellCommand("pi", [unsafe]), /unsafe/);
    });
  }
});
