# Agent-independent SDLC adapters (initial compatibility layer)

The shared engine is the existing seven-phase lifecycle, 35 role briefs, templates and deterministic `sdlc-state.mjs`. The installer vendors these resources into each target project and generates host-specific entrypoints; Claude's original marketplace plugin continues to work unchanged.

## Install

Clone this repository locally, then run from the cloned repository:

```bash
node scripts/sdlc-install.mjs --target /absolute/path/to/your-project
```

To select hosts instead of installing all five:

```bash
node scripts/sdlc-install.mjs --target /absolute/path/to/your-project --platforms codex,opencode,copilot,claude,cursor
```

The target directory must already exist. The installer never overwrites differing destination files and refuses to traverse symbolic links. Re-running on an identical installation is safe. There is intentionally no force flag; back up and reconcile changes manually before upgrading a modified installation.

| Host | Installed entrypoint | Invocation |
|---|---|---|
| OpenAI Codex | `.agents/skills/agentic-sdlc/SKILL.md` | Invoke the `agentic-sdlc` skill |
| OpenCode | `.opencode/commands/sdlc.md` | `/sdlc` |
| GitHub Copilot | `.github/prompts/sdlc.prompt.md` | `/sdlc` prompt in supported Copilot chat clients |
| Claude Code | `.claude/commands/sdlc.md` | `/sdlc` command |
| Cursor | `.cursor/rules/agentic-sdlc.mdc` | Explicitly attach/apply the `agentic-sdlc` rule |

Host support for prompt files, skill discovery, slash commands and delegation depends on the installed version and environment. Restart the host or reload its project instructions after installing. For Cursor, the rule is opt-in (`alwaysApply: false`).

## Common runtime contract

- The adapter reads `.agentic-sdlc/commands/sdlc.md`, its phase playbooks and role briefs.
- Treat `${CLAUDE_PLUGIN_ROOT}` in the original instructions as `.agentic-sdlc`; treat Claude-only tool names as abstract capabilities.
- Run `node .agentic-sdlc/scripts/sdlc-state.mjs` from the target project root; use the state script for every state transition, not direct metadata editing.
- Delegation uses the host's available agent feature. Without an equivalent Task facility, run roles sequentially. Do not claim parallel execution or independent review that did not occur.
- Preserve the three human checkpoints, bounded gate retries, execution evidence and human authorization before publishing.

## Security / parity limitations

**This is workflow-level portability, not full enforcement parity.** The Claude Code `PreToolUse` hook and its automatic publish/metadata mutation guard are **not installed as native hooks** for Codex, OpenCode, Copilot or Cursor. Their adapters instruct the agent to request authorization, but a prompt cannot enforce an OS-level security boundary. Use branch protection, protected environments, least-privilege credentials and host-native approval policies to enforce the boundaries.

Host-specific subagent prompts, model routing, sandbox control and telemetry are not yet fully mapped to each agent's native API. This adapter does not claim those features are implemented or that the end-to-end SDLC has been verified on all five hosts.

## Verification

```bash
node --test
node scripts/sdlc-install.mjs --target /path/to/a/throwaway-project
```

The installer tests exercise five entrypoint formats, idempotency, collision preflight, symlink refusal and input validation.
