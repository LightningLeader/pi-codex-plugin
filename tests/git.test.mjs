import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  listUniqueFiles,
  normalizeMaxInlineFiles,
  normalizeMaxInlineDiffBytes,
  formatUntrackedFile,
} from "../plugins/pi-codex/scripts/lib/git.mjs";

// ---------------------------------------------------------------------------
// listUniqueFiles — pure function
// ---------------------------------------------------------------------------
describe("listUniqueFiles", () => {
  it("deduplicates files across groups", () => {
    const result = listUniqueFiles(["a.js", "b.js"], ["b.js", "c.js"]);
    assert.deepEqual(result, ["a.js", "b.js", "c.js"]);
  });

  it("returns sorted results", () => {
    const result = listUniqueFiles(["z.js", "a.js", "m.js"]);
    assert.deepEqual(result, ["a.js", "m.js", "z.js"]);
  });

  it("handles empty groups", () => {
    const result = listUniqueFiles([], ["a.js"], []);
    assert.deepEqual(result, ["a.js"]);
  });

  it("handles all empty groups", () => {
    const result = listUniqueFiles([], [], []);
    assert.deepEqual(result, []);
  });

  it("filters out null and undefined values", () => {
    const result = listUniqueFiles(["a.js", null, "b.js", undefined]);
    assert.deepEqual(result, ["a.js", "b.js"]);
  });

  it("filters out empty strings", () => {
    const result = listUniqueFiles(["a.js", "", "b.js"]);
    assert.deepEqual(result, ["a.js", "b.js"]);
  });

  it("handles single group", () => {
    const result = listUniqueFiles(["x.js", "y.js"]);
    assert.deepEqual(result, ["x.js", "y.js"]);
  });

  it("handles no arguments", () => {
    const result = listUniqueFiles();
    assert.deepEqual(result, []);
  });

  it("deduplicates identical single file across multiple groups", () => {
    const result = listUniqueFiles(["a.js"], ["a.js"], ["a.js"]);
    assert.deepEqual(result, ["a.js"]);
  });
});

// ---------------------------------------------------------------------------
// normalizeMaxInlineFiles — pure function
// ---------------------------------------------------------------------------
describe("normalizeMaxInlineFiles", () => {
  it("returns the floor of a valid positive float", () => {
    assert.equal(normalizeMaxInlineFiles(5.7), 5);
  });

  it("returns the value for a valid integer", () => {
    assert.equal(normalizeMaxInlineFiles(10), 10);
  });

  it("returns 0 for zero (valid finite number not < 0)", () => {
    assert.equal(normalizeMaxInlineFiles(0), 0);
  });

  it("returns default for negative number", () => {
    assert.equal(normalizeMaxInlineFiles(-5), 2);
  });

  it("returns default for NaN", () => {
    assert.equal(normalizeMaxInlineFiles(NaN), 2);
  });

  it("returns default for Infinity", () => {
    assert.equal(normalizeMaxInlineFiles(Infinity), 2);
  });

  it("returns default for -Infinity", () => {
    assert.equal(normalizeMaxInlineFiles(-Infinity), 2);
  });

  it("parses string numbers", () => {
    assert.equal(normalizeMaxInlineFiles("3"), 3);
  });

  it("returns default for non-numeric string", () => {
    assert.equal(normalizeMaxInlineFiles("abc"), 2);
  });

  it("returns 0 for null (Number(null) === 0, finite, not < 0)", () => {
    assert.equal(normalizeMaxInlineFiles(null), 0);
  });

  it("returns default for undefined", () => {
    assert.equal(normalizeMaxInlineFiles(undefined), 2);
  });
});

// ---------------------------------------------------------------------------
// normalizeMaxInlineDiffBytes — pure function
// ---------------------------------------------------------------------------
describe("normalizeMaxInlineDiffBytes", () => {
  it("returns the floor of a valid positive float", () => {
    assert.equal(normalizeMaxInlineDiffBytes(10000.7), 10000);
  });

  it("returns the value for a valid integer", () => {
    assert.equal(normalizeMaxInlineDiffBytes(256 * 1024), 256 * 1024);
  });

  it("returns 0 for zero (valid finite number not < 0)", () => {
    assert.equal(normalizeMaxInlineDiffBytes(0), 0);
  });

  it("returns default for negative number", () => {
    assert.equal(normalizeMaxInlineDiffBytes(-1), 256 * 1024);
  });

  it("returns default for NaN", () => {
    assert.equal(normalizeMaxInlineDiffBytes(NaN), 256 * 1024);
  });

  it("returns default for Infinity", () => {
    assert.equal(normalizeMaxInlineDiffBytes(Infinity), 256 * 1024);
  });

  it("returns default for -Infinity", () => {
    assert.equal(normalizeMaxInlineDiffBytes(-Infinity), 256 * 1024);
  });

  it("parses string numbers", () => {
    assert.equal(normalizeMaxInlineDiffBytes("512000"), 512000);
  });

  it("returns default for non-numeric string", () => {
    assert.equal(normalizeMaxInlineDiffBytes("abc"), 256 * 1024);
  });

  it("returns 0 for null (Number(null) === 0, finite, not < 0)", () => {
    assert.equal(normalizeMaxInlineDiffBytes(null), 0);
  });

  it("returns default for undefined", () => {
    assert.equal(normalizeMaxInlineDiffBytes(undefined), 256 * 1024);
  });
});

// ---------------------------------------------------------------------------
// formatUntrackedFile — requires fs mocking
// ---------------------------------------------------------------------------
describe("formatUntrackedFile", () => {
  const CWD = "/test/repo";

  beforeEach(() => {
    // Default mocks: a small readable text file
    const fileStat = {
      isDirectory: () => false,
      isSymbolicLink: () => false,
      size: 100,
    };
    mock.method(fs, "lstatSync", () => fileStat);
    mock.method(fs, "readFileSync", () => Buffer.from("file content"));
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it("formats a normal text file", () => {
    const result = formatUntrackedFile(CWD, "src/main.js");
    assert.match(result, /### src\/main\.js/);
    assert.match(result, /```/);
    assert.match(result, /file content/);
  });

  it("skips symlinks without following them", () => {
    mock.restoreAll();
    mock.method(fs, "lstatSync", () => ({
      isDirectory: () => false,
      isSymbolicLink: () => true,
      size: 10,
    }));
    const readFileSync = mock.method(fs, "readFileSync", () => Buffer.from("secret"));
    const result = formatUntrackedFile(CWD, "leak-link");
    assert.match(result, /### leak-link/);
    assert.match(result, /skipped: symlink/);
    assert.equal(readFileSync.mock.callCount(), 0);
  });

  it("skips directories", () => {
    mock.restoreAll();
    mock.method(fs, "lstatSync", () => ({
      isDirectory: () => true,
      isSymbolicLink: () => false,
      size: 0,
    }));
    const result = formatUntrackedFile(CWD, "dist");
    assert.match(result, /### dist/);
    assert.match(result, /skipped: directory/);
  });

  it("skips files exceeding size limit", () => {
    mock.restoreAll();
    mock.method(fs, "lstatSync", () => ({
      isDirectory: () => false,
      isSymbolicLink: () => false,
      size: 25 * 1024, // exceeds 24KB limit
    }));
    const result = formatUntrackedFile(CWD, "large.bin");
    assert.match(result, /### large\.bin/);
    assert.match(result, /exceeds/);
    assert.match(result, /byte limit/);
  });

  it("skips broken symlinks or unreadable files on stat", () => {
    mock.restoreAll();
    mock.method(fs, "lstatSync", () => {
      throw new Error("ENOENT");
    });
    const result = formatUntrackedFile(CWD, "broken-link");
    assert.match(result, /### broken-link/);
    assert.match(result, /skipped: broken symlink/);
  });

  it("skips broken symlinks or unreadable files on read", () => {
    mock.restoreAll();
    mock.method(fs, "lstatSync", () => ({
      isDirectory: () => false,
      isSymbolicLink: () => false,
      size: 10,
    }));
    mock.method(fs, "readFileSync", () => {
      throw new Error("EACCES");
    });
    const result = formatUntrackedFile(CWD, "restricted");
    assert.match(result, /### restricted/);
    assert.match(result, /skipped: broken symlink/);
  });
});
