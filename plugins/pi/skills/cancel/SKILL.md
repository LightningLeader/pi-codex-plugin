---
name: cancel
description: "Cancel a running Pi background job by job ID. Use only when the user requests cancellation of a tracked Pi job; this is distinct from terminating an idle Control Session RPC."
---

# Pi Cancel

Treat the directory containing this `SKILL.md` as `<skill-root>`. Resolve `<plugin-root>` as `<skill-root>/../..`. Do not assume a fixed checkout path.

Run `node <plugin-root>/scripts/pi-companion.mjs cancel <job-id>` with `--json` when requested. If no job ID was provided, ask for one or use the status skill to discover it.

Return stdout without paraphrasing. Explain only if the CLI reports that no cancellable job exists.
