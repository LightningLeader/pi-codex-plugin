import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ROOT = path.join(REPO_ROOT, "plugins", "pi");
const PUBLIC_SKILLS = [
  "adversarial-review",
  "cancel",
  "continue",
  "parallel-rescue",
  "rescue",
  "result",
  "review",
  "setup",
  "status",
  "ui",
  "watch"
];

describe("Codex plugin skill layout", () => {
  for (const skillName of PUBLIC_SKILLS) {
    it(`${skillName} references files that exist inside the installed plugin root`, () => {
      const skillFile = path.join(PLUGIN_ROOT, "skills", skillName, "SKILL.md");
      const contents = fs.readFileSync(skillFile, "utf8");
      const references = [...contents.matchAll(/<plugin-root>\/([A-Za-z0-9_./-]+\.(?:md|mjs))/g)]
        .map((match) => match[1]);

      assert.ok(references.length > 0, `${skillName} should reference a bundled entrypoint`);
      for (const relativePath of references) {
        assert.equal(
          fs.existsSync(path.join(PLUGIN_ROOT, relativePath)),
          true,
          `${skillName} references missing plugin file: ${relativePath}`
        );
      }
    });
  }
});
