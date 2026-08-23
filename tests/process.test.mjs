import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  binaryAvailable,
  formatCommandFailure,
  terminateProcessTree,
} from "../plugins/pi-codex/scripts/lib/process.mjs";

// ---------------------------------------------------------------------------
// formatCommandFailure — pure function, no mocking needed
// ---------------------------------------------------------------------------
describe("formatCommandFailure", () => {
  it("includes command name", () => {
    const result = formatCommandFailure({
      command: "git",
      args: [],
      signal: null,
      status: 0,
      stderr: "",
      stdout: "",
    });
    assert.ok(result.startsWith("git"));
  });

  it("joins args with command", () => {
    const result = formatCommandFailure({
      command: "git",
      args: ["status", "--short"],
      signal: null,
      status: 0,
      stderr: "",
      stdout: "",
    });
    assert.ok(result.startsWith("git status --short"));
  });

  it("reports signal when present instead of exit code", () => {
    const result = formatCommandFailure({
      command: "foo",
      args: [],
      signal: "SIGTERM",
      status: 1,
      stderr: "",
      stdout: "",
    });
    assert.match(result, /signal=SIGTERM/);
    assert.doesNotMatch(result, /exit=/);
  });

  it("reports exit code when signal is null", () => {
    const result = formatCommandFailure({
      command: "foo",
      args: [],
      signal: null,
      status: 42,
      stderr: "",
      stdout: "",
    });
    assert.match(result, /exit=42/);
  });

  it("includes stderr when present", () => {
    const result = formatCommandFailure({
      command: "cmd",
      args: [],
      signal: null,
      status: 1,
      stderr: "Error: something broke\n",
      stdout: "",
    });
    assert.match(result, /something broke/);
  });

  it("falls back to stdout when stderr is empty", () => {
    const result = formatCommandFailure({
      command: "cmd",
      args: [],
      signal: null,
      status: 1,
      stderr: "",
      stdout: "usage info\n",
    });
    assert.match(result, /usage info/);
  });

  it("prefers stderr over stdout when both are non-empty", () => {
    const result = formatCommandFailure({
      command: "cmd",
      args: [],
      signal: null,
      status: 1,
      stderr: "error output",
      stdout: "standard output",
    });
    assert.match(result, /error output/);
    assert.doesNotMatch(result, /standard output/);
  });

  it("handles null stderr and null stdout", () => {
    const result = formatCommandFailure({
      command: "cmd",
      args: [],
      signal: null,
      status: 1,
      stderr: null,
      stdout: null,
    });
    assert.equal(result, "cmd: exit=1");
  });

  it("handles empty args array", () => {
    const result = formatCommandFailure({
      command: "git",
      args: [],
      signal: null,
      status: 128,
      stderr: "fatal: not a git repository",
      stdout: "",
    });
    assert.equal(result, "git: exit=128: fatal: not a git repository");
  });

  it("trims whitespace from error output", () => {
    const result = formatCommandFailure({
      command: "cmd",
      args: [],
      signal: null,
      status: 1,
      stderr: "  \nerror text\n  ",
      stdout: "",
    });
    assert.equal(result, "cmd: exit=1: error text");
  });

  it("formats a zero-exit result (unusual but valid)", () => {
    const result = formatCommandFailure({
      command: "true",
      args: [],
      signal: null,
      status: 0,
      stderr: "",
      stdout: "",
    });
    assert.equal(result, "true: exit=0");
  });
});

// ---------------------------------------------------------------------------
// binaryAvailable — dependency injection via runCommandImpl
// ---------------------------------------------------------------------------
describe("binaryAvailable", () => {
  it("returns not-found on ENOENT error", () => {
    const runCommandImpl = () => ({
      error: Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }),
      status: null,
      signal: null,
      stdout: "",
      stderr: "",
    });
    const result = binaryAvailable("nonexistent", ["--version"], {
      runCommandImpl,
    });
    assert.equal(result.available, false);
    assert.equal(result.detail, "not found");
  });

  it("returns error detail for non-ENOENT errors", () => {
    const runCommandImpl = () => ({
      error: new Error("permission denied"),
      status: null,
      signal: null,
      stdout: "",
      stderr: "",
    });
    const result = binaryAvailable("somebinary", ["--version"], {
      runCommandImpl,
    });
    assert.equal(result.available, false);
    assert.equal(result.detail, "permission denied");
  });

  it("returns stderr detail on non-zero exit", () => {
    const runCommandImpl = () => ({
      error: null,
      status: 1,
      signal: null,
      stdout: "",
      stderr: "command not found\n",
    });
    const result = binaryAvailable("somebinary", ["--version"], {
      runCommandImpl,
    });
    assert.equal(result.available, false);
    assert.equal(result.detail, "command not found");
  });

  it("falls back to stdout detail when stderr is empty on non-zero exit", () => {
    const runCommandImpl = () => ({
      error: null,
      status: 1,
      signal: null,
      stdout: "something\n",
      stderr: "",
    });
    const result = binaryAvailable("somebinary", ["--version"], {
      runCommandImpl,
    });
    assert.equal(result.available, false);
    assert.equal(result.detail, "something");
  });

  it("falls back to exit code string when both stderr and stdout are empty on non-zero", () => {
    const runCommandImpl = () => ({
      error: null,
      status: 42,
      signal: null,
      stdout: "",
      stderr: "",
    });
    const result = binaryAvailable("somebinary", ["--version"], {
      runCommandImpl,
    });
    assert.equal(result.available, false);
    assert.equal(result.detail, "exit 42");
  });

  it("returns stdout on success", () => {
    const runCommandImpl = () => ({
      error: null,
      status: 0,
      signal: null,
      stdout: "1.2.3\n",
      stderr: "",
    });
    const result = binaryAvailable("git", ["--version"], { runCommandImpl });
    assert.equal(result.available, true);
    assert.equal(result.detail, "1.2.3");
  });

  it("falls back to stderr for detail on success when stdout is empty", () => {
    const runCommandImpl = () => ({
      error: null,
      status: 0,
      signal: null,
      stdout: "",
      stderr: "version info\n",
    });
    const result = binaryAvailable("git", ["--version"], { runCommandImpl });
    assert.equal(result.available, true);
    assert.equal(result.detail, "version info");
  });

  it('returns "ok" when both stdout and stderr are empty on success', () => {
    const runCommandImpl = () => ({
      error: null,
      status: 0,
      signal: null,
      stdout: "",
      stderr: "",
    });
    const result = binaryAvailable("git", ["--version"], { runCommandImpl });
    assert.equal(result.available, true);
    assert.equal(result.detail, "ok");
  });
});

// ---------------------------------------------------------------------------
// terminateProcessTree — uses dependency injection via options
// ---------------------------------------------------------------------------
describe("terminateProcessTree", () => {
  describe("input validation", () => {
    it("returns not-attempted for NaN pid", () => {
      const result = terminateProcessTree(NaN);
      assert.deepEqual(result, {
        attempted: false,
        delivered: false,
        method: null,
      });
    });

    it("returns not-attempted for Infinity pid", () => {
      const result = terminateProcessTree(Infinity);
      assert.deepEqual(result, {
        attempted: false,
        delivered: false,
        method: null,
      });
    });

    it("returns not-attempted for -Infinity pid", () => {
      const result = terminateProcessTree(-Infinity);
      assert.deepEqual(result, {
        attempted: false,
        delivered: false,
        method: null,
      });
    });

    it("returns not-attempted for null pid", () => {
      const result = terminateProcessTree(null);
      assert.deepEqual(result, {
        attempted: false,
        delivered: false,
        method: null,
      });
    });

    it("returns not-attempted for undefined pid", () => {
      const result = terminateProcessTree(undefined);
      assert.deepEqual(result, {
        attempted: false,
        delivered: false,
        method: null,
      });
    });

    it("returns not-attempted for string pid", () => {
      const result = terminateProcessTree("abc");
      assert.deepEqual(result, {
        attempted: false,
        delivered: false,
        method: null,
      });
    });
  });

  describe("win32 platform", () => {
    const WIN_OPTS = { platform: "win32", escalateAfterMs: 0 };

    it("returns delivered when taskkill succeeds", () => {
      const runCommandImpl = (_cmd, _args) => ({
        error: null,
        status: 0,
        stdout: "",
        stderr: "",
      });
      const result = terminateProcessTree(1234, {
        ...WIN_OPTS,
        runCommandImpl,
        killImpl: () => {},
      });
      assert.equal(result.attempted, true);
      assert.equal(result.delivered, true);
      assert.equal(result.method, "taskkill");
    });

    it("returns delivered:false when taskkill reports missing process", () => {
      const runCommandImpl = () => ({
        error: null,
        status: 1,
        stdout: "",
        stderr: "not found",
      });
      const result = terminateProcessTree(1234, {
        ...WIN_OPTS,
        runCommandImpl,
        killImpl: () => {},
      });
      assert.equal(result.attempted, true);
      assert.equal(result.delivered, false);
      assert.equal(result.method, "taskkill");
    });

    it("recognizes localized taskkill output for a missing process", () => {
      const runCommandImpl = () => ({
        error: null,
        status: 128,
        stdout: "错误: 找不到进程 1234。",
        stderr: "",
      });
      const result = terminateProcessTree(1234, {
        ...WIN_OPTS,
        runCommandImpl,
        killImpl: () => {},
      });
      assert.equal(result.attempted, true);
      assert.equal(result.delivered, false);
      assert.equal(result.method, "taskkill");
    });

    it("falls back to process.kill when taskkill is unavailable (ENOENT)", () => {
      const runCommandImpl = () => ({
        error: Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
        status: null,
        stdout: "",
        stderr: "",
      });
      let killedPid = null;
      const killImpl = (pid) => {
        killedPid = pid;
      };
      const result = terminateProcessTree(1234, {
        ...WIN_OPTS,
        runCommandImpl,
        killImpl,
      });
      assert.equal(killedPid, 1234);
      assert.equal(result.method, "kill");
      assert.equal(result.delivered, true);
    });

    it("returns delivered:false on ESRCH during fallback kill", () => {
      const runCommandImpl = () => ({
        error: Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
        status: null,
        stdout: "",
        stderr: "",
      });
      const killImpl = () => {
        const err = new Error("ESRCH");
        err.code = "ESRCH";
        throw err;
      };
      const result = terminateProcessTree(1234, {
        ...WIN_OPTS,
        runCommandImpl,
        killImpl,
      });
      assert.equal(result.delivered, false);
      assert.equal(result.method, "kill");
    });

    it("throws non-ESRCH error from fallback kill", () => {
      const runCommandImpl = () => ({
        error: Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
        status: null,
        stdout: "",
        stderr: "",
      });
      const killImpl = () => {
        throw new Error("EPERM: operation not permitted");
      };
      assert.throws(() => {
        terminateProcessTree(1234, { ...WIN_OPTS, runCommandImpl, killImpl });
      }, /EPERM/);
    });

    it("throws on unexpected taskkill error", () => {
      const runCommandImpl = () => ({
        error: new Error("unexpected error"),
        status: null,
        stdout: "",
        stderr: "",
      });
      assert.throws(() => {
        terminateProcessTree(1234, {
          ...WIN_OPTS,
          runCommandImpl,
          killImpl: () => {},
        });
      }, /unexpected error/);
    });

    it("throws formatCommandFailure when taskkill returns non-zero with non-missing output", () => {
      // Include command/args so formatCommandFailure can build the error message
      const runCommandImpl = (_cmd, _args) => ({
        command: "taskkill",
        args: ["/PID", "1234", "/T", "/F"],
        error: null,
        status: 2,
        stdout: "",
        stderr: "access denied",
      });
      assert.throws(() => {
        terminateProcessTree(1234, {
          ...WIN_OPTS,
          runCommandImpl,
          killImpl: () => {},
        });
      }, /access denied/);
    });
  });

  describe("unix platform", () => {
    const UNIX_OPTS = { platform: "darwin", escalateAfterMs: 0 };

    it("kills process group with SIGTERM on success", () => {
      let killedPid = null;
      let killedSignal = null;
      const killImpl = (pid, signal) => {
        killedPid = pid;
        killedSignal = signal;
      };
      const result = terminateProcessTree(1234, { ...UNIX_OPTS, killImpl });
      assert.equal(killedPid, -1234);
      assert.equal(killedSignal, "SIGTERM");
      assert.equal(result.delivered, true);
      assert.equal(result.method, "process-group");
    });

    it("returns delivered:false when process-group ESRCH (no fallback)", () => {
      // When kill(-pid) throws ESRCH, the function short-circuits — it does
      // NOT fall back to kill(pid). ESRCH means the negation itself is invalid.
      let callCount = 0;
      const killImpl = (_pid, _signal) => {
        callCount++;
        const err = new Error("ESRCH");
        err.code = "ESRCH";
        throw err;
      };
      const result = terminateProcessTree(1234, { ...UNIX_OPTS, killImpl });
      assert.equal(callCount, 1);
      assert.equal(result.delivered, false);
      assert.equal(result.method, "process-group");
    });

    it("falls back to process kill when process-group gets non-ESRCH error", () => {
      let callLog = [];
      const killImpl = (pid, signal) => {
        callLog.push({ pid, signal });
        if (pid < 0) {
          // Non-ESRCH → triggers the fallback to kill(pid)
          const err = new Error("EPERM");
          err.code = "EPERM";
          throw err;
        }
        // Fallback to kill(pid, ...) succeeds
      };
      const result = terminateProcessTree(1234, { ...UNIX_OPTS, killImpl });
      assert.equal(callLog.length, 2);
      assert.equal(callLog[0].pid, -1234);
      assert.equal(callLog[1].pid, 1234);
      assert.equal(result.delivered, true);
      assert.equal(result.method, "process");
    });

    it("returns delivered:false when process fallback also gets ESRCH", () => {
      const killImpl = (pid, _signal) => {
        if (pid < 0) {
          const err = new Error("EPERM");
          err.code = "EPERM";
          throw err;
        }
        // Fallback: pid > 0 gets ESRCH
        const err = new Error("ESRCH");
        err.code = "ESRCH";
        throw err;
      };
      const result = terminateProcessTree(1234, { ...UNIX_OPTS, killImpl });
      assert.equal(result.delivered, false);
      assert.equal(result.method, "process");
    });

    it("throws non-ESRCH error from process-group kill", () => {
      // Both process-group AND process fallback throw non-ESRCH
      const killImpl = (_pid, _signal) => {
        throw Object.assign(new Error("EPERM: operation not permitted"), {
          code: "EPERM",
        });
      };
      assert.throws(() => {
        terminateProcessTree(1234, { ...UNIX_OPTS, killImpl });
      }, /EPERM/);
    });

    it("throws non-ESRCH error from process fallback", () => {
      const killImpl = (pid, _signal) => {
        if (pid < 0) {
          // non-ESRCH from process-group → triggers fallback
          throw Object.assign(new Error("EPERM: operation not permitted"), {
            code: "EPERM",
          });
        }
        // Fallback throws a different non-ESRCH
        throw Object.assign(new Error("EACCES: permission denied"), {
          code: "EACCES",
        });
      };
      assert.throws(() => {
        terminateProcessTree(1234, { ...UNIX_OPTS, killImpl });
      }, /EACCES/);
    });
  });
});
