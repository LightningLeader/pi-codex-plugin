---
name: ui
description: "Start, inspect, or stop the local Pi RPC web Control Center. Use for dashboard URL, background startup, server status, or explicit Control Center shutdown."
---

# Pi Control Center

Treat the directory containing this `SKILL.md` as `<skill-root>`. Resolve `<plugin-root>` as `<skill-root>/../..`. Do not assume a fixed checkout path.

Run `node <plugin-root>/scripts/pi-companion.mjs ui` with requested `--foreground`, `--status`, `--stop`, `--host`, `--port`, `--allow-remote`, or `--cwd` options. Starting with no mode flag runs the Control Center in the background and returns its URL. Use `--foreground` only when the user requests foreground operation or needs startup diagnostics. `--background` remains accepted as a compatibility alias for the default behavior.

Do not open a browser automatically. Return the authenticated URL exactly as emitted and remind the user to keep its token private only when that is relevant.
