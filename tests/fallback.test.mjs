import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildModelChain,
  describeFallback,
  modelLabel,
  runWithModelFallback
} from "../plugins/pi/scripts/lib/fallback.mjs";

// ---------------------------------------------------------------------------
// buildModelChain
// ---------------------------------------------------------------------------
describe("buildModelChain", () => {
  it("returns [null] with no primary and no fallbacks", () => {
    assert.deepEqual(buildModelChain(null), [null]);
  });

  it("keeps the primary model first", () => {
    assert.deepEqual(buildModelChain("a", ["b", "c"]), ["a", "b", "c"]);
  });

  it("uses null head when no primary is pinned", () => {
    assert.deepEqual(buildModelChain(null, ["b"]), [null, "b"]);
  });

  it("drops fallbacks equal to the primary", () => {
    assert.deepEqual(buildModelChain("a", ["a", "b"]), ["a", "b"]);
  });

  it("dedupes fallbacks", () => {
    assert.deepEqual(buildModelChain("a", ["b", "b", "c"]), ["a", "b", "c"]);
  });
});

// ---------------------------------------------------------------------------
// runWithModelFallback
// ---------------------------------------------------------------------------
describe("runWithModelFallback", () => {
  it("returns the first success without trying later models", async () => {
    const tried = [];
    const { result, attempts } = await runWithModelFallback([null, "b"], async (model) => {
      tried.push(model);
      return { status: 0 };
    });
    assert.deepEqual(tried, [null]);
    assert.equal(result.status, 0);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0].model, "pi default model");
    assert.equal(attempts[0].error, null);
  });

  it("falls back to the next model after a failed result", async () => {
    const tried = [];
    const { result, attempts } = await runWithModelFallback(["a", "b"], async (model) => {
      tried.push(model);
      return model === "a" ? { status: 1, error: { message: "provider down" } } : { status: 0 };
    });
    assert.deepEqual(tried, ["a", "b"]);
    assert.equal(result.status, 0);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].error, "provider down");
    assert.equal(attempts[1].status, 0);
  });

  it("returns the last failed result when the whole chain fails", async () => {
    const { result, attempts } = await runWithModelFallback(["a", "b"], async (model) => ({
      status: 1,
      error: { message: `${model} broken` }
    }));
    assert.equal(result.status, 1);
    assert.equal(result.error.message, "b broken");
    assert.equal(attempts.length, 2);
  });

  it("converts a mid-chain throw into a failed attempt and continues", async () => {
    const { result, attempts } = await runWithModelFallback(["a", "b"], async (model) => {
      if (model === "a") {
        throw new Error("spawn failed");
      }
      return { status: 0 };
    });
    assert.equal(result.status, 0);
    assert.equal(attempts[0].error, "spawn failed");
  });

  it("rethrows when the last chain entry throws", async () => {
    await assert.rejects(
      runWithModelFallback(["a"], async () => {
        throw new Error("spawn failed");
      }),
      /spawn failed/
    );
  });

  it("reports each failover through onProgress", async () => {
    const messages = [];
    await runWithModelFallback(
      ["a", "b"],
      async (model) => (model === "a" ? { status: 1, error: { message: "boom" } } : { status: 0 }),
      (event) => messages.push(event.message)
    );
    assert.equal(messages.length, 1);
    assert.match(messages[0], /Model a failed \(boom\); falling back to b\./);
  });

  it("does not report failover after the final failure", async () => {
    const messages = [];
    await runWithModelFallback(
      ["a"],
      async () => ({ status: 1, error: { message: "boom" } }),
      (event) => messages.push(event.message)
    );
    assert.equal(messages.length, 0);
  });
});

// ---------------------------------------------------------------------------
// describeFallback / modelLabel
// ---------------------------------------------------------------------------
describe("describeFallback", () => {
  it("returns null for a single attempt", () => {
    assert.equal(describeFallback([{ model: "a", status: 0, error: null }]), null);
    assert.equal(describeFallback([]), null);
    assert.equal(describeFallback(null), null);
  });

  it("describes a successful failover", () => {
    const note = describeFallback([
      { model: "a", status: 1, error: "boom" },
      { model: "b", status: 0, error: null }
    ]);
    assert.equal(note, "Model fallback: a failed (boom) -> succeeded with b.");
  });

  it("describes a fully failed chain", () => {
    const note = describeFallback([
      { model: "a", status: 1, error: "boom" },
      { model: "b", status: 1, error: "bang" }
    ]);
    assert.equal(note, "Model fallback: a failed (boom) -> b also failed (bang).");
  });
});

describe("modelLabel", () => {
  it("labels the null model as the pi default", () => {
    assert.equal(modelLabel(null), "pi default model");
    assert.equal(modelLabel("a"), "a");
  });
});
