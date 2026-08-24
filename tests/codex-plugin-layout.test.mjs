import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_ROOT = path.join(REPO_ROOT, "plugins", "pi-codex");
const MANIFEST_PATH = path.join(PLUGIN_ROOT, ".codex-plugin", "plugin.json");
const MARKETPLACE_PATH = path.join(REPO_ROOT, ".agents", "plugins", "marketplace.json");
const PUBLIC_SKILLS = [
  "cancel",
  "continue",
  "parallel-task",
  "result",
  "setup",
  "status",
  "task",
  "ui",
  "watch"
];

describe("Codex plugin skill layout", () => {
  it("keeps the manifest and marketplace entry aligned", () => {
    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
    const marketplace = JSON.parse(fs.readFileSync(MARKETPLACE_PATH, "utf8"));
    const entry = marketplace.plugins.find((plugin) => plugin.name === manifest.name);

    assert.equal(manifest.name, "pi-codex");
    assert.ok(entry, "marketplace should contain the pi-codex plugin");
    assert.equal(entry.source.source, "local");
    assert.equal(entry.source.path, "./plugins/pi-codex");
  });

  it("does not ship removed host compatibility surfaces", () => {
    const forbiddenPaths = [
      ".claude-plugin",
      "codex-prompts",
      "plugins/pi-codex/.claude-plugin",
      "plugins/pi-codex/agents",
      "plugins/pi-codex/commands",
      "plugins/pi-codex/hooks",
      "plugins/pi-codex/skills/review",
      "plugins/pi-codex/skills/adversarial-review",
      "plugins/pi-codex/prompts/review.md",
      "plugins/pi-codex/prompts/adversarial-review.md",
      "plugins/pi-codex/schemas/review-output.schema.json",
      "plugins/pi-codex/scripts/lib/review-cache.mjs",
      "plugins/pi-codex/scripts/lib/panel.mjs",
      "plugins/pi-codex/scripts/lib/shard.mjs",
      "plugins/pi-codex/skills/rescue",
      "plugins/pi-codex/skills/parallel-rescue",
      "plugins/pi-codex/prompts/parallel-rescue.md"
    ];

    for (const relativePath of forbiddenPaths) {
      assert.equal(fs.existsSync(path.join(REPO_ROOT, relativePath)), false, `${relativePath} should not exist`);
    }
  });

  it("contains no legacy host environment or review-gate references", () => {
    const forbidden = /CLAUDE_PLUGIN_DATA|CLAUDE_ENV_FILE|CLAUDE_PROJECT_DIR|stopReviewGate|task-resume-candidate/;
    const roots = [
      path.join(REPO_ROOT, "scripts"),
      path.join(REPO_ROOT, "plugins", "pi-codex", "scripts"),
      path.join(REPO_ROOT, "plugins", "pi-codex", "skills")
    ];

    const visit = (target) => {
      for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
        const entryPath = path.join(target, entry.name);
        if (entry.isDirectory()) visit(entryPath);
        else assert.doesNotMatch(fs.readFileSync(entryPath, "utf8"), forbidden, entryPath);
      }
    };

    for (const root of roots) visit(root);
  });

  it("exposes task-level model selection and racing", () => {
    const required = [/--model/, /--race/, /renderRaceResult/, /raceModels/];
    const files = [
      path.join(REPO_ROOT, "plugins", "pi-codex", "scripts", "pi-companion.mjs"),
      path.join(REPO_ROOT, "plugins", "pi-codex", "skills", "task", "SKILL.md")
    ];

    for (const pattern of required) {
      assert.ok(files.some((file) => pattern.test(fs.readFileSync(file, "utf8"))), `${pattern} should be exposed`);
    }
    assert.equal(fs.existsSync(path.join(REPO_ROOT, "plugins", "pi-codex", "scripts", "lib", "race.mjs")), true);
  });

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
