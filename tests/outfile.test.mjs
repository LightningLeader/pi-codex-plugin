import { test } from "node:test";
import assert from "node:assert/strict";

import { renderOutFileSummary } from "../plugins/pi-codex/scripts/lib/render.mjs";

test("out-file mode returns the task summary and output path", () => {
  const out = renderOutFileSummary(
    { summary: "Refactored the payments module.", payload: { rawOutput: "..." } },
    "/tmp/task.txt"
  );
  assert.match(out, /Refactored the payments module\./);
  assert.match(out, /Full output written to \/tmp\/task\.txt/);
});

test("out-file mode still reports the output path without a summary", () => {
  const out = renderOutFileSummary({}, "/tmp/task.txt");
  assert.equal(out, "\nFull output written to /tmp/task.txt\n");
});
