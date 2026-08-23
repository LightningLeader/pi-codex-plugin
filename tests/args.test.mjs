import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, splitRawArgumentString } from "../plugins/pi-codex/scripts/lib/args.mjs";

// ---------------------------------------------------------------------------
// parseArgs — pure function
// ---------------------------------------------------------------------------
describe("parseArgs", () => {
  describe("boolean flags", () => {
    it("parses a boolean flag as true", () => {
      const { options, positionals } = parseArgs(["--verbose"], {
        booleanOptions: ["verbose"],
      });
      assert.equal(options.verbose, true);
      assert.deepEqual(positionals, []);
    });

    it("parses --no-flag equivalent as false", () => {
      const { options, positionals: _positionals } = parseArgs(["--verbose=false"], {
        booleanOptions: ["verbose"],
      });
      assert.equal(options.verbose, false);
    });

    it("parses short boolean flag", () => {
      const { options, positionals: _positionals } = parseArgs(["-v"], {
        booleanOptions: ["v"],
      });
      assert.equal(options.v, true);
    });
  });

  describe("value options", () => {
    it("parses --key=value syntax", () => {
      const { options, positionals } = parseArgs(["--base=main"], {
        valueOptions: ["base"],
      });
      assert.equal(options.base, "main");
      assert.deepEqual(positionals, []);
    });

    it("parses --key value syntax (space-separated)", () => {
      const { options, positionals } = parseArgs(["--base", "develop"], {
        valueOptions: ["base"],
      });
      assert.equal(options.base, "develop");
      assert.deepEqual(positionals, []);
    });

    it("throws when value option is missing its value (--key at end)", () => {
      assert.throws(() => {
        parseArgs(["--base"], { valueOptions: ["base"] });
      }, /Missing value for --base/);
    });

    it("throws when short value option is missing its value", () => {
      assert.throws(() => {
        parseArgs(["-b"], { valueOptions: ["b"] });
      }, /Missing value for -b/);
    });

    it("parses short value option with next arg as value", () => {
      const { options } = parseArgs(["-b", "main"], { valueOptions: ["b"] });
      assert.equal(options.b, "main");
    });

    it("does not consume next arg with = syntax", () => {
      const { options, positionals } = parseArgs(
        ["--base=main", "extra"],
        { valueOptions: ["base"] }
      );
      assert.equal(options.base, "main");
      assert.deepEqual(positionals, ["extra"]);
    });
  });

  describe("alias map", () => {
    it("resolves --long flag via aliasMap", () => {
      const { options } = parseArgs(["--verbose"], {
        booleanOptions: ["v"],
        aliasMap: { verbose: "v" },
      });
      assert.equal(options.v, true);
    });

    it("resolves -v short flag via aliasMap", () => {
      const { options } = parseArgs(["-v"], {
        booleanOptions: ["verbose"],
        aliasMap: { v: "verbose" },
      });
      assert.equal(options.verbose, true);
    });

    it("preserves original key when not in aliasMap", () => {
      const { options } = parseArgs(["--foo"], {
        booleanOptions: ["foo"],
        aliasMap: {},
      });
      assert.equal(options.foo, true);
    });
  });

  describe("positional arguments", () => {
    it("collects positional args", () => {
      const { options, positionals } = parseArgs(
        ["file1.js", "file2.js"],
        {}
      );
      assert.deepEqual(positionals, ["file1.js", "file2.js"]);
      assert.deepEqual(options, {});
    });

    it("interleaves flags and positionals", () => {
      const { options, positionals } = parseArgs(
        ["--verbose", "file.js", "--output=out.txt"],
        { booleanOptions: ["verbose"], valueOptions: ["output"] }
      );
      assert.equal(options.verbose, true);
      assert.equal(options.output, "out.txt");
      assert.deepEqual(positionals, ["file.js"]);
    });

    it("treats bare '-' as a positional", () => {
      const { positionals } = parseArgs(["-"], {});
      assert.deepEqual(positionals, ["-"]);
    });

    it("treats unknown --flags as positionals", () => {
      const { options, positionals } = parseArgs(["--unknown-flag"], {
        booleanOptions: ["known"],
      });
      assert.deepEqual(options, {});
      assert.deepEqual(positionals, ["--unknown-flag"]);
    });

    it("treats unknown -flags as positionals", () => {
      const { positionals } = parseArgs(["-x"], {
        booleanOptions: ["v"],
      });
      assert.deepEqual(positionals, ["-x"]);
    });
  });

  describe("passthrough (--)", () => {
    it("passes everything after -- as positional", () => {
      const { options, positionals } = parseArgs(
        ["--verbose", "--", "--flag", "value"],
        { booleanOptions: ["verbose"], valueOptions: ["output"] }
      );
      assert.equal(options.verbose, true);
      assert.deepEqual(positionals, ["--flag", "value"]);
    });

    it("handles -- with no following args", () => {
      const { positionals } = parseArgs(["--"], {});
      assert.deepEqual(positionals, []);
    });
  });

  describe("edge cases", () => {
    it("handles empty argv", () => {
      const { options, positionals } = parseArgs([], {});
      assert.deepEqual(options, {});
      assert.deepEqual(positionals, []);
    });

    it("handles duplicate boolean flags (last wins)", () => {
      const { options } = parseArgs(["--verbose", "--verbose"], {
        booleanOptions: ["verbose"],
      });
      assert.equal(options.verbose, true); // overwritten with same value
    });

    it("handles duplicate value flags (last wins)", () => {
      const { options } = parseArgs(["--base=main", "--base=dev"], {
        valueOptions: ["base"],
      });
      assert.equal(options.base, "dev");
    });

    it("handles empty config", () => {
      const { options, positionals } = parseArgs(["arg"]);
      assert.deepEqual(options, {});
      assert.deepEqual(positionals, ["arg"]);
    });
  });
});

// ---------------------------------------------------------------------------
// splitRawArgumentString — pure function
// ---------------------------------------------------------------------------
describe("splitRawArgumentString", () => {
  it("splits on whitespace", () => {
    assert.deepEqual(splitRawArgumentString("a b c"), ["a", "b", "c"]);
  });

  it("handles multiple spaces", () => {
    assert.deepEqual(splitRawArgumentString("a   b"), ["a", "b"]);
  });

  it("preserves quoted strings as single tokens", () => {
    assert.deepEqual(splitRawArgumentString('a "b c" d'), ["a", "b c", "d"]);
  });

  it("preserves single-quoted strings as single tokens", () => {
    assert.deepEqual(splitRawArgumentString("a 'b c' d"), ["a", "b c", "d"]);
  });

  it("handles escaped characters", () => {
    assert.deepEqual(splitRawArgumentString("a\\ b c"), ["a b", "c"]);
  });

  it("handles trailing backslash", () => {
    assert.deepEqual(splitRawArgumentString("a\\"), ["a\\"]);
  });

  it("returns empty array for empty string", () => {
    assert.deepEqual(splitRawArgumentString(""), []);
  });

  it("returns empty array for whitespace-only string", () => {
    assert.deepEqual(splitRawArgumentString("   "), []);
  });

  it("handles mixed quotes and escapes", () => {
    assert.deepEqual(
      splitRawArgumentString('--base="main branch" "hello world"'),
      ["--base=main branch", "hello world"]
    );
  });

  it("handles nested quotes", () => {
    // Outer single quotes preserve inner double quotes as literal
    assert.deepEqual(splitRawArgumentString("'--flag=\"val\"'"), [
      '--flag="val"',
    ]);
  });
});
