import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { buildPiRpcSpawnConfig, PiRpcClient } from "../plugins/pi-codex/scripts/lib/pi-rpc.mjs";

const FIXTURE = fileURLToPath(new URL("fixtures/fake-pi-rpc.mjs", import.meta.url));

describe("Pi RPC spawn configuration", () => {
  it("lets cmd resolve either pi.cmd or pi.exe without passing an args array to the shell", () => {
    assert.deepEqual(buildPiRpcSpawnConfig("win32"), {
      command: "pi --mode rpc",
      args: [],
      detached: false,
      shell: true,
      windowsHide: true
    });
  });

  it("keeps direct execution on POSIX", () => {
    assert.deepEqual(buildPiRpcSpawnConfig("linux"), {
      command: "pi",
      args: ["--mode", "rpc"],
      detached: false,
      shell: false,
      windowsHide: true
    });
  });

  it("allows an explicit Pi command override", () => {
    assert.equal(
      buildPiRpcSpawnConfig("win32", "C:\\Program Files\\Pi\\pi.cmd").command,
      '"C:\\Program Files\\Pi\\pi.cmd" --mode rpc'
    );
  });

  it("keeps safe model identifiers in the single Windows command string", () => {
    assert.equal(
      buildPiRpcSpawnConfig("win32", null, ["--mode", "rpc", "--model", "openai/gpt-5.2"]).command,
      "pi --mode rpc --model openai/gpt-5.2"
    );
  });

  it("rejects Windows shell metacharacters instead of concatenating them", () => {
    assert.throws(
      () => buildPiRpcSpawnConfig("win32", null, ["--mode", "rpc", "--model", "safe&calc"]),
      /unsafe for the Windows command shell/
    );
  });

  it("starts and closes an npm pi.cmd shim on Windows", { skip: process.platform !== "win32" }, async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pi-rpc-windows-"));
    const shim = path.join(directory, "pi.cmd");
    fs.writeFileSync(shim, '@echo off\r\n"%PI_TEST_NODE%" "%PI_TEST_FIXTURE%" %*\r\n', "utf8");
    const client = new PiRpcClient(directory, {
      env: {
        ...process.env,
        PATH: `${directory};${process.env.PATH ?? ""}`,
        PI_TEST_NODE: process.execPath,
        PI_TEST_FIXTURE: FIXTURE
      }
    });

    try {
      await client.start();
      const state = await client.getState();
      assert.equal(state.sessionId, "windows-test-session");
    } finally {
      await client.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
