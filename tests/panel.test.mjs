import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findingsMatch, mergePanelReviews, parseModelList } from "../plugins/pi-codex/scripts/lib/panel.mjs";

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
// parseModelList
// ---------------------------------------------------------------------------
describe("parseModelList", () => {
  it("returns empty array for null/undefined/empty", () => {
    assert.deepEqual(parseModelList(null), []);
    assert.deepEqual(parseModelList(undefined), []);
    assert.deepEqual(parseModelList(""), []);
  });

  it("splits on commas", () => {
    assert.deepEqual(parseModelList("a,b,c"), ["a", "b", "c"]);
  });

  it("splits on commas with whitespace", () => {
    assert.deepEqual(parseModelList(" a , b ,c "), ["a", "b", "c"]);
  });

  it("splits on bare whitespace", () => {
    assert.deepEqual(parseModelList("a b"), ["a", "b"]);
  });

  it("dedupes while preserving order", () => {
    assert.deepEqual(parseModelList("a,b,a,c,b"), ["a", "b", "c"]);
  });

  it("drops empty segments", () => {
    assert.deepEqual(parseModelList(",a,,b,"), ["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// findingsMatch
// ---------------------------------------------------------------------------
describe("findingsMatch", () => {
  it("rejects different files", () => {
    assert.equal(findingsMatch(finding(), finding({ file: "src/other.mjs" })), false);
  });

  it("matches identical ranges in the same file", () => {
    assert.equal(findingsMatch(finding(), finding({ title: "Different title" })), true);
  });

  it("matches overlapping ranges", () => {
    assert.equal(findingsMatch(finding({ line_start: 10, line_end: 14 }), finding({ line_start: 13, line_end: 20 })), true);
  });

  it("matches near ranges within the slack window", () => {
    assert.equal(findingsMatch(finding({ line_start: 10, line_end: 12 }), finding({ line_start: 15, line_end: 16 })), true);
  });

  it("rejects distant ranges in the same file", () => {
    assert.equal(findingsMatch(finding({ line_start: 10, line_end: 12 }), finding({ line_start: 100, line_end: 105 })), false);
  });

  it("falls back to normalized title when line info is missing", () => {
    const a = finding({ line_start: null, line_end: null, title: "SQL Injection risk!" });
    const b = finding({ line_start: null, line_end: null, title: "sql injection risk" });
    assert.equal(findingsMatch(a, b), true);
  });

  it("rejects differing titles when line info is missing", () => {
    const a = finding({ line_start: null, line_end: null, title: "SQL injection" });
    const b = finding({ line_start: null, line_end: null, title: "Path traversal" });
    assert.equal(findingsMatch(a, b), false);
  });

  it("does not match empty titles without line info", () => {
    const a = finding({ line_start: null, line_end: null, title: "" });
    const b = finding({ line_start: null, line_end: null, title: "" });
    assert.equal(findingsMatch(a, b), false);
  });
});

// ---------------------------------------------------------------------------
// mergePanelReviews
// ---------------------------------------------------------------------------
describe("mergePanelReviews", () => {
  it("tags consensus findings with all reporting models", () => {
    const merged = mergePanelReviews([
      { model: "a", parsed: review([finding()]) },
      { model: "b", parsed: review([finding({ line_start: 11, line_end: 15 })]) }
    ]);
    assert.equal(merged.findings.length, 1);
    assert.deepEqual(merged.findings[0].foundBy, ["a", "b"]);
  });

  it("keeps distinct findings separate", () => {
    const merged = mergePanelReviews([
      { model: "a", parsed: review([finding()]) },
      { model: "b", parsed: review([finding({ file: "src/other.mjs" })]) }
    ]);
    assert.equal(merged.findings.length, 2);
  });

  it("escalates to the highest severity across models", () => {
    const merged = mergePanelReviews([
      { model: "a", parsed: review([finding({ severity: "low", title: "Minor issue" })]) },
      { model: "b", parsed: review([finding({ severity: "critical", title: "Severe issue" })]) }
    ]);
    assert.equal(merged.findings.length, 1);
    assert.equal(merged.findings[0].severity, "critical");
    assert.equal(merged.findings[0].title, "Severe issue");
    assert.deepEqual(merged.findings[0].alsoReportedAs, ["Minor issue"]);
  });

  it("records alternate titles without duplicates", () => {
    const merged = mergePanelReviews([
      { model: "a", parsed: review([finding({ title: "Null deref" })]) },
      { model: "b", parsed: review([finding({ title: "Possible null DEREF" })]) },
      { model: "c", parsed: review([finding({ title: "null deref" })]) }
    ]);
    assert.equal(merged.findings.length, 1);
    assert.deepEqual(merged.findings[0].alsoReportedAs, ["Possible null DEREF"]);
  });

  it("widens the merged line range to the union", () => {
    const merged = mergePanelReviews([
      { model: "a", parsed: review([finding({ line_start: 10, line_end: 12 })]) },
      { model: "b", parsed: review([finding({ line_start: 12, line_end: 20 })]) }
    ]);
    assert.equal(merged.findings[0].line_start, 10);
    assert.equal(merged.findings[0].line_end, 20);
  });

  it("sorts consensus findings before single-model ones, then by severity", () => {
    const merged = mergePanelReviews([
      {
        model: "a",
        parsed: review([
          finding({ file: "solo.mjs", severity: "critical", title: "Solo critical" }),
          finding({ severity: "low", title: "Shared low" })
        ])
      },
      { model: "b", parsed: review([finding({ severity: "low", title: "Shared low" })]) }
    ]);
    assert.equal(merged.findings[0].title, "Shared low");
    assert.equal(merged.findings[1].title, "Solo critical");
  });

  it("ignores failed runs (parsed = null)", () => {
    const merged = mergePanelReviews([
      { model: "a", parsed: review([finding()]) },
      { model: "b", parsed: null }
    ]);
    assert.equal(merged.modelCount, 1);
    assert.deepEqual(merged.findings[0].foundBy, ["a"]);
  });

  it("verdict is needs-attention when any model says so", () => {
    const merged = mergePanelReviews([
      { model: "a", parsed: review([], { verdict: "approve" }) },
      { model: "b", parsed: review([finding()]) }
    ]);
    assert.equal(merged.verdict, "needs-attention");
  });

  it("verdict is approve when all models approve", () => {
    const merged = mergePanelReviews([
      { model: "a", parsed: review([], { verdict: "approve" }) },
      { model: "b", parsed: review([], { verdict: "approve" }) }
    ]);
    assert.equal(merged.verdict, "approve");
  });

  it("dedupes next steps case-insensitively while keeping order", () => {
    const merged = mergePanelReviews([
      { model: "a", parsed: review([], { next_steps: ["Fix the guard", "Add tests"] }) },
      { model: "b", parsed: review([], { next_steps: ["fix the guard", "Run linter"] }) }
    ]);
    assert.deepEqual(merged.next_steps, ["Fix the guard", "Add tests", "Run linter"]);
  });

  it("handles an empty run list", () => {
    const merged = mergePanelReviews([]);
    assert.equal(merged.verdict, "approve");
    assert.deepEqual(merged.findings, []);
    assert.equal(merged.modelCount, 0);
  });
});
