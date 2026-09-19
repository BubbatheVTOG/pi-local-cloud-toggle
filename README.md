# pi-local-cloud-toggle

A small Pi extension that toggles the entire inherited Pi/subagent fleet between an existing local model and the previously selected cloud model. It follows the command/status pattern used by [agent-voice](https://github.com/BubbatheVTOG/agent-voice).

## Usage

- `/local` or `/local toggle` — switch modes
- `/local on` — select the configured local model
- `/local off` — restore the previous cloud model
- `/local status` — show the active mode and model references
- `Ctrl+Shift+L` — toggle modes

The footer status displays `LOCAL` or `CLOUD`.

## Configuration

Both models must already exist in Pi's available model list. At session startup,
the extension registers `/local` and its shortcut only when enabled and its local
model is available. Otherwise it hides its footer item and leaves the current
model unchanged. Reload Pi after enabling the extension or configuring a missing
model. No endpoint probes, model requests, installation, or service startup run
as part of this check; registry availability does not prove backend health.

Configure only the local model reference:

```json
{
  "modelToggle": {
    "enabled": true,
    "localModel": "josh/bubba"
  }
}
```

The extension classifies the active model at startup: the configured local model starts in LOCAL mode, and every other model starts in CLOUD mode. Selecting the local model enters LOCAL; selecting any other model enters CLOUD and remembers it. Turning local mode off restores the remembered cloud model. The memory is session-only: there is no duplicate provider configuration, endpoint configuration, environment variable, or state file.

Before switching, the extension compares the current context size with the local model's registered context window. If the context is too large, it warns before allowing the switch and compacts on the current cloud model first. When `pi-vcc` is not installed, the warning explicitly says that Pi's normal compaction will run on the cloud model. Declining the warning or a failed compaction leaves the session on cloud.

The extension does not automatically fall back to cloud after a local request failure. A failed switch or request remains visible as an error rather than silently changing the fleet's provider.
