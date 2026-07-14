import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeShardReviews, splitFilesIntoShards } from "../plugins/pi/scripts/lib/shard.mjs";

function finding(overrides = {}) {
  return {
    severity: "medium",
    title: "Unchecked null dereference",
    body: "The value may be null.",
    file: "src/app.mjs",
    line_start: 10,
    line_end: 14,
    recommendation: "Add a guard.",
    ...overrides
  };
}

function review(findings, overrides = {}) {
  return {
    verdict: "needs-attention",
    summary: "Found issues.",
    findings,
    next_steps: [],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// splitFilesIntoShards
// ---------------------------------------------------------------------------
describe("splitFilesIntoShards", () => {
  it("round-robins files across shards", () => {
    const shards = splitFilesIntoShards(["a.js", "b.js", "c.js", "d.js", "e.js"], 2);
    assert.deepEqual(shards, [
      ["a.js", "c.js", "e.js"],
      ["b.js", "d.js"]
    ]);
  });

  it("produces files.length shards when there are fewer files than shards", () => {
    const shards = splitFilesIntoShards(["a.js", "b.js"], 5);
    assert.deepEqual(shards, [["a.js"], ["b.js"]]);
  });

  it("produces a single shard for a single file, regardless of n", () => {
    const shards = splitFilesIntoShards(["a.js"], 3);
    assert.deepEqual(shards, [["a.js"]]);
  });

  it("returns no shards for an empty file list", () => {
    assert.deepEqual(splitFilesIntoShards([], 3), []);
  });

  it("never creates an empty shard", () => {
    const shards = splitFilesIntoShards(["a.js", "b.js", "c.js"], 4);
    for (const shard of shards) {
      assert.ok(shard.length > 0);
    }
  });
});

// ---------------------------------------------------------------------------
// mergeShardReviews
// ---------------------------------------------------------------------------
describe("mergeShardReviews", () => {
  it("concatenates findings from every shard", () => {
    const merged = mergeShardReviews([
      review([finding({ file: "a.mjs" })]),
      review([finding({ file: "b.mjs" })])
    ]);
    assert.equal(merged.findings.length, 2);
  });

  it("sorts findings by severity", () => {
    const merged = mergeShardReviews([
      review([finding({ severity: "low", title: "Low issue" })]),
      review([finding({ severity: "critical", title: "Critical issue" })])
    ]);
    assert.deepEqual(
      merged.findings.map((f) => f.title),
      ["Critical issue", "Low issue"]
    );
  });

  it("skips a failed/null shard but counts it", () => {
    const merged = mergeShardReviews([review([finding()]), null]);
    assert.equal(merged.findings.length, 1);
    assert.equal(merged.shardCount, 2);
    assert.equal(merged.failedCount, 1);
  });

  it("handles an empty input list", () => {
    const merged = mergeShardReviews([]);
    assert.equal(merged.verdict, "approve");
    assert.deepEqual(merged.findings, []);
    assert.equal(merged.shardCount, 0);
    assert.equal(merged.failedCount, 0);
  });

  it("verdict is needs-attention when any shard says so", () => {
    const merged = mergeShardReviews([review([], { verdict: "approve" }), review([finding()])]);
    assert.equal(merged.verdict, "needs-attention");
  });

  it("combines summaries and dedupes next steps case-insensitively", () => {
    const merged = mergeShardReviews([
      review([], { summary: "Shard 1 ok.", next_steps: ["Fix the guard"] }),
      review([], { summary: "Shard 2 ok.", next_steps: ["fix the guard", "Add tests"] })
    ]);
    assert.equal(merged.summary, "Shard 1 ok. Shard 2 ok.");
    assert.deepEqual(merged.next_steps, ["Fix the guard", "Add tests"]);
  });
});
