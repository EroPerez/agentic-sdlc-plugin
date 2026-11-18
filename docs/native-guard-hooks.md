# Native SDLC guard hooks — Codex, OpenCode, Copilot, Cursor

The original Claude Code `PreToolUse` policy lives in `scripts/sdlc-guard.mjs`. Other supported agents now reuse **that same decision function**, not separate regular-expression lists.

| Host | Native registration | Hook | Sensitive command | Direct metadata edit |
|---|---|---|---|---|
| Claude Code | `.claude/settings.json` | `PreToolUse` | `ask` | `deny` |
| Codex CLI | `.codex/hooks.json` | `PreToolUse` | `deny` (manual approval outside hook) | `deny` |
| GitHub Copilot CLI | `.github/hooks/agentic-sdlc.json` | `preToolUse` | `ask` (cloud agent treats as deny) | `deny` |
| OpenCode | `.opencode/plugins/agentic-sdlc-policy.js` | `tool.execute.before` | throw/block (manual approval outside hook) | throw/block |
| Cursor | `.cursor/hooks.json` | `beforeShellExecution` for shell, `preToolUse` for edits | `ask` for shell | `deny` |

All four generated hook configurations are installed alongside `.agentic-sdlc/scripts/sdlc-hook-bridge.mjs` and the existing `sdlc-guard.mjs`.

## Controls inherited from Claude

- Block direct writes to `sdlc-metadata.yml` through recognized file-edit tools, shell redirection, `sed -i`, `tee`, `cp`/`mv`, or `apply_patch`. Use `sdlc-state.mjs` for state transitions.
- Require human authorization for `git commit`, `git tag` (except listing), `git push`, modifying `gh release` commands, and `npm`/`pnpm`/`yarn publish`. Existing dry-run/listing exclusions remain unchanged.
- Reuse the original shell-command detection rules; they are heuristic and cannot cover every shell language, API client, alias, wrapper or external process. Do **not** use these hooks as the sole security boundary.

## Install and inspect

```bash
node scripts/sdlc-install.mjs --target /absolute/path/to/project \
  --platforms codex,opencode,copilot,claude,cursor
node scripts/sdlc-doctor.mjs --target /absolute/path/to/project \
  --platforms codex,opencode,copilot,claude,cursor
node --test
```

The installer **will not overwrite conflicting user-managed hooks configuration**. Merge existing `.codex/hooks.json`, `.cursor/hooks.json`, or Copilot hooks with the generated entries manually. OpenCode plugins load from the project's `.opencode/plugins` directory.

## Quick manual protocol tests

```bash
printf '%s\n' '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' \
  | node scripts/sdlc-hook-bridge.mjs codex
printf '%s\n' '{"toolName":"bash","toolArgs":{"command":"git push origin main"}}' \
  | node scripts/sdlc-hook-bridge.mjs copilot
printf '%s\n' '{"command":"git push origin main"}' \
  | node scripts/sdlc-hook-bridge.mjs cursor-shell
printf '%s\n' '{"tool_name":"apply_patch","tool_input":{"command":"*** Begin Patch\\n*** Update File: docs/requirements/sdlc-metadata.yml\\n@@\\n-a\\n+b\\n*** End Patch"}}' \
  | node scripts/sdlc-hook-bridge.mjs codex
```

Expected outcomes: Codex denies publication, Copilot requests approval, Cursor shell requests approval, and Codex denies metadata patching.

## Verify the host actually loads hooks

- **Codex:** project hooks require a trusted repository and review in `/hooks`; versions can require re-trust after updates. `PreToolUse` currently does **not** support the `ask` result; publication is blocked rather than silently approved.
- **Copilot:** repository hook file in `.github/hooks/` works in CLI/cloud when repository hooks are enabled. Cloud and autopilot have no interactive approval and treat `ask` as a denial. Copilot hook **timeouts fail open**, so enforce publication policy with protected branches or credentials too.
- **Cursor:** project hooks require workspace trust. Cursor's `preToolUse` does **not** enforce `ask`; this integration handles shell commands with `beforeShellExecution`, which does. Setting `failClosed: true` reduces the risk of silent hook errors; check IDE/CLI event coverage on your version.
- **OpenCode:** the local plugin registers `tool.execute.before` and throws to prevent the action. Since this hook does not expose a universally reliable `ask` response, sensitive actions are blocked and must be executed manually after explicit authorization.

Other tools or externally spawned processes can bypass the hooks. Configure branch protection, separate release credentials and immutable external approval logs. Tests validate registration and decision translation; actual host E2E authorization tests are still required before production certification.

References:
- https://learn.chatgpt.com/docs/hooks
- https://docs.github.com/en/copilot/reference/hooks-reference
- https://cursor.com/docs/hooks
- https://opencode.ai/docs/plugins/
