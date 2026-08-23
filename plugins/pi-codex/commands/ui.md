---
description: Start, inspect, or stop the local Pi RPC control center
argument-hint: '[--background|--status|--stop] [--host 127.0.0.1] [--port 43120]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Run the local Pi Control Center command:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/pi-companion.mjs" ui $ARGUMENTS
```

Return stdout verbatim. The authenticated URL contains a local control token;
do not rewrite or omit it. Do not open the browser automatically.
