// Model racing: run the same rescue task with several models in parallel and
// let the caller pick the winner. Write races isolate each racer in its own
// git worktree (created from HEAD) and capture the result as a patch.

import path from "node:path";

export function sanitizeModelForPath(model) {
  const sanitized = String(model ?? "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return sanitized || "model";
}

// Models like "provider/model" and "provider-model" can sanitize to the same
// slug; uniquify with an index suffix so worktree paths and patch files never
// collide.
export function buildRacerLabels(models) {
  const seen = new Map();
  return models.map((model) => {
    const base = sanitizeModelForPath(model);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return { model, slug: count === 0 ? base : `${base}-${count + 1}` };
  });
}

export function buildRaceWorktreePath(baseDir, jobId, slug) {
  return path.join(baseDir, `pi-race-${jobId}`, slug);
}
