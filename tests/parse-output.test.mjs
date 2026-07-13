import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseStructuredOutput } from "../plugins/pi/scripts/lib/pi.mjs";

// ---------------------------------------------------------------------------
// parseStructuredOutput — pure function
// ---------------------------------------------------------------------------
describe("parseStructuredOutput", () => {
  it("parses valid JSON inside ```json … ``` fences", () => {
    const input = [
      "Here is the review:",
      "```json",
      '{"verdict": "pass", "findings": []}',
      "```",
      "End.",
    ].join("\n");
    const result = parseStructuredOutput(input);
    assert.equal(result.parseError, null);
    assert.deepEqual(result.parsed, { verdict: "pass", findings: [] });
    assert.equal(result.rawOutput, input);
  });

  it("parses valid JSON inside ``` … ``` fences (no language tag)", () => {
    const input = [
      "```",
      '{"status": "ok", "count": 3}',
      "```",
    ].join("\n");
    const result = parseStructuredOutput(input);
    assert.equal(result.parseError, null);
    assert.deepEqual(result.parsed, { status: "ok", count: 3 });
  });

  it("parses bare JSON without fences", () => {
    const input = '{"result": "success"}';
    const result = parseStructuredOutput(input);
    assert.equal(result.parseError, null);
    assert.deepEqual(result.parsed, { result: "success" });
  });

  it("parses JSON with leading text but no fences", () => {
    const input = 'Response: {"key": "value"}';
    const result = parseStructuredOutput(input);
    // Leading text that isn't a fence causes the whole input to be parsed as JSON,
    // which fails, so the result is parseError, not parsed.
    // Actually let me think about this...
    // trimmed = 'Response: {"key": "value"}'
    // fenced = null (no ```json or ```)
    // candidate = 'Response: {"key": "value"}'
    // JSON.parse(candidate) will fail because of 'Response: '
    // So parseError is set
    assert.equal(result.parsed, null);
    assert.notEqual(result.parseError, null);
  });

  it("parses first JSON block when multiple exist", () => {
    const input = [
      "```json",
      '{"first": true}',
      "```",
      "Some noise",
      "```json",
      '{"second": true}',
      "```",
    ].join("\n");
    const result = parseStructuredOutput(input);
    assert.equal(result.parseError, null);
    assert.deepEqual(result.parsed, { first: true });
  });

  it("returns null parsed and error for empty string", () => {
    const result = parseStructuredOutput("");
    assert.equal(result.parsed, null);
    assert.notEqual(result.parseError, null);
  });

  it("returns null parsed and error for whitespace-only string", () => {
    const result = parseStructuredOutput("   \n  ");
    assert.equal(result.parsed, null);
    assert.notEqual(result.parseError, null);
  });

  it("returns fallback for null/undefined input", () => {
    const result = parseStructuredOutput(null);
    assert.equal(result.parsed, null);
    assert.equal(
      result.parseError,
      "Pi did not return a final structured message."
    );
  });

  it("returns fallback for undefined input", () => {
    const result = parseStructuredOutput(undefined);
    assert.equal(result.parsed, null);
    assert.equal(
      result.parseError,
      "Pi did not return a final structured message."
    );
  });

  it("merges fallback properties into result for null input", () => {
    const result = parseStructuredOutput(null, {
      failureMessage: "Custom failure",
    });
    assert.equal(result.parseError, "Custom failure");
    assert.equal(result.failureMessage, "Custom failure");
  });

  it("merges fallback properties into result for successful parse", () => {
    const input = '{"a": 1}';
    const result = parseStructuredOutput(input, { extraProp: "yes" });
    assert.deepEqual(result.parsed, { a: 1 });
    assert.equal(result.extraProp, "yes");
  });

  it("returns parseError for malformed JSON", () => {
    const input = "{invalid}";
    const result = parseStructuredOutput(input);
    assert.equal(result.parsed, null);
    assert.notEqual(result.parseError, null);
    // JSON.parse SyntaxError messages vary by engine — we just check it is non-empty
    assert.ok(result.parseError.length > 0);
  });

  it("returns parseError for JSON with trailing text in fences", () => {
    const input = [
      "```json",
      '{"key": "value"}',
      "trailing noise",
      "```",
    ].join("\n");
    const result = parseStructuredOutput(input);
    // The regex matches content between ```json and the first ```,
    // so candidate = '{"key": "value"}\ntrailing noise'
    // JSON.parse will fail on 'trailing noise'
    assert.equal(result.parsed, null);
    assert.notEqual(result.parseError, null);
  });

  it("handles JSON with nested objects and arrays", () => {
    const input = JSON.stringify({
      verdict: "fail",
      summary: "Found issues",
      findings: [
        { severity: "high", title: "Bug", file: "a.js" },
      ],
      next_steps: ["Fix it"],
    });
    const result = parseStructuredOutput(input);
    assert.equal(result.parseError, null);
    assert.equal(result.parsed.verdict, "fail");
    assert.equal(result.parsed.findings.length, 1);
    assert.equal(result.parsed.next_steps.length, 1);
  });

  it("handles JSON inside fences with leading newline", () => {
    const input = "Some text\n\n```json\n{\"x\": 1}\n```\n\nMore text";
    const result = parseStructuredOutput(input);
    assert.equal(result.parseError, null);
    assert.deepEqual(result.parsed, { x: 1 });
  });

  it("preserves rawOutput in all result objects", () => {
    const input = '{"a": 1}';
    const result = parseStructuredOutput(input);
    assert.equal(result.rawOutput, input);

    const result2 = parseStructuredOutput(null);
    assert.equal(result2.rawOutput, "");

    const result3 = parseStructuredOutput("");
    assert.equal(result3.rawOutput, "");
  });
});
