# Changelog

## 0.1.0

- Publish the first independently maintained release of `pi-codex-plugin`
  under LightningLeader.
- Provide a native, Codex-only `pi-codex` plugin for delegating investigation
  and implementation tasks to Pi.
- Include task, parallel-task, continuation, status, watch, result, cancel,
  setup, and local Control Center skills.
- Support foreground, background, and supervised-background tasks, along with
  model selection, effort settings, model fallback, model racing, and output
  files.
- Store runtime state in a private, platform-standard `pi-codex-plugin` data
  directory, with `PI_CODEX_DATA_DIR` available as an explicit override.
