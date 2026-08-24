// Model racing: run the same task with several models in parallel and
// let the caller pick the winner. Write races isolate each racer in its own
// git worktree (created from HEAD) and capture the result as a patch.

import { createHash } from "node:crypto";
import path from "node:path";

const MAX_MODEL_SLUG_LENGTH = 64;
const WINDOWS_RESERVED_BASENAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function shortenSlug(slug) {
  if (slug.length <= MAX_MODEL_SLUG_LENGTH) {
    return slug;
  }
  const digest = createHash("sha256").update(slug).digest("hex").slice(0, 10);
  return `${slug.slice(0, MAX_MODEL_SLUG_LENGTH - digest.length - 1).replace(/[.-]+$/g, "")}-${digest}`;
}

function addSlugSuffix(base, suffix) {
  const prefix = base.slice(0, MAX_MODEL_SLUG_LENGTH - suffix.length).replace(/[.-]+$/g, "") || "model";
  return `${prefix}${suffix}`;
}

export function sanitizeModelForPath(model) {
  let sanitized = String(model ?? "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
  if (!sanitized) {
    sanitized = "model";
  }
  if (WINDOWS_RESERVED_BASENAME.test(sanitized)) {
    sanitized = `${sanitized}-model`;
  }
  return shortenSlug(sanitized);
}

export function buildRacerLabels(models) {
  const used = new Set();
  return models.map((model) => {
    const base = sanitizeModelForPath(model);
    let slug = base;
    let suffix = 1;
    while (used.has(slug)) {
      suffix += 1;
      slug = addSlugSuffix(base, `-${suffix}`);
    }
    used.add(slug);
    return { model, slug };
  });
}

export function buildRaceWorktreePath(baseDir, jobId, slug) {
  return path.join(baseDir, `pi-race-${jobId}`, slug);
}
