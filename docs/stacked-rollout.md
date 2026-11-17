# Stacked host integration rollout

These branches deliberately form a linear **stack**. Review and merge them from top to bottom by merging the first PR into `main`, then retargeting each dependent PR to `main` once its parent is merged. Do not squash a child branch into `main` while its parent is unmerged, or the resulting diff includes every ancestor's changes.

| Order | Branch | Base | Scope |
|---|---|---|---|
| 1 | `feat/agent-agnostic-adapters` | `main` | Portable engine and host entrypoints |
| 2 | `feat/agent-host-contracts` | `feat/agent-agnostic-adapters` | Native host manifest loader and preflight |
| 3 | `feat/sdlc-codex-native` | `feat/agent-host-contracts` | Codex reviewer and implementer |
| 4 | `feat/sdlc-opencode-native` | `feat/sdlc-codex-native` | OpenCode reviewer and implementer |
| 5 | `feat/sdlc-copilot-native` | `feat/sdlc-opencode-native` | Copilot reviewer and implementer |
| 6 | `feat/sdlc-cursor-native` | `feat/sdlc-copilot-native` | Cursor reviewer and implementer |
| 7 | `feat/sdlc-claude-native` | `feat/sdlc-cursor-native` | Claude reviewer and implementer |
| 8 | `test/sdlc-cross-agent-contracts` | `feat/sdlc-claude-native` | Distribution smoke tests and manifest validation |

## Development and verification

On the final stack tip, use Node 18 or newer:

```bash
node --test
node scripts/sdlc-install.mjs --target /path/to/empty-test-project
```

The installer is intentionally conservative: it refuses to overwrite differing files, refuses symlinks, and validates the native host manifest paths. New native manifests in `integrations/<host>.json` are discovered by the installer; each is a `schemaVersion: 1` object with a `files` map. Role prompts are version-controlled beside the common engine, but the installer vendors them into each target project.

## Remaining release gates

- Run the Node tests and inspect the complete result, including installer smoke tests.
- Run an end-to-end lifecycle in each host, including state resume, human sign-off, test evidence, and a failed gate.
- Verify publishing controls under actual host permissions, not only prompt instructions.
- Check model routing and native delegation separately; two native profiles per host do **not** imply that all 35 source role briefs are registered as native subagents.
- Confirm applicable AGPL-3.0-or-later distribution obligations.

No branch in this stack automatically merges, deploys or publishes the plugin. Production compatibility is not claimed until the above checks pass.
