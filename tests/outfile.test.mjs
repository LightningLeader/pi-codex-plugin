import { test } from "node:test";
import assert from "node:assert/strict";

import { renderOutFileSummary } from "../plugins/pi-codex/scripts/lib/render.mjs";

function reviewExecution(findings) {
  return {
    summary: "should not be used when findings exist",
    payload: {
      result: {
        verdict: "needs-attention",
        findings,
        next_steps: []
      }
    }
  };
}

test("review summary shows verdict, severity counts, and one line per finding", () => {
  const out = renderOutFileSummary(
    reviewExecution([
      { severity: "high", title: "SQL injection", file: "db.js", line_start: 12 },
      { severity: "low", title: "Unused import", file: "app.js" },
      { severity: "high", title: "Missing await", file: "db.js", line_start: 40 }
    ]),
    "/tmp/review.txt"
  );
  assert.match(out, /Verdict: needs-attention/);
  assert.match(out, /3 findings: 2 high, 1 low/);
  assert.match(out, /- \[high\] SQL injection \(db\.js:12\)/);
  assert.match(out, /- \[low\] Unused import \(app\.js\)/);
  assert.match(out, /Full output written to \/tmp\/review\.txt/);
});

test("findings are ordered by severity (critical first)", () => {
  const out = renderOutFileSummary(
    reviewExecution([
      { severity: "low", title: "Low one", file: "a.js" },
      { severity: "critical", title: "Critical one", file: "b.js" }
    ]),
    "/tmp/r.txt"
  );
  assert.ok(out.indexOf("Critical one") < out.indexOf("Low one"));
  assert.match(out, /2 findings: 1 critical, 1 low/);
});

test("no findings reports 'No material findings.'", () => {
  const out = renderOutFileSummary(reviewExecution([]), "/tmp/r.txt");
  assert.match(out, /Verdict: needs-attention/);
  assert.match(out, /No material findings\./);
  assert.match(out, /Full output written to \/tmp\/r\.txt/);
});

test("free-form run (no structured findings) falls back to the one-line summary", () => {
  const out = renderOutFileSummary(
    { summary: "Refactored the payments module.", payload: { rawOutput: "..." } },
    "/tmp/task.txt"
  );
  assert.match(out, /Refactored the payments module\./);
  assert.match(out, /Full output written to \/tmp\/task\.txt/);
  assert.doesNotMatch(out, /Verdict:/);
});
