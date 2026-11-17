# OpenCode V2 security policy

The `opencode` adapter uses Markdown agent frontmatter under `.opencode/agents/`.

- `sdlc-reviewer` denies `edit`, `shell`, `execute`, `external_directory`, and `subagent` actions. It can analyze supplied evidence, but it cannot independently re-run commands with this restricted profile. A gate requiring independent command execution **cannot PASS** on delegated logs alone; run an authorized independent validation in an isolated reviewer execution context.
- `sdlc-implementer` asks before **every shell command**, denies direct edits of `docs/requirements/sdlc-metadata.yml`, and asks before access outside the worktree.
- Neither profile grants general approval for releases or publication: the three human SDLC checkpoints must still be recorded through the deterministic state workflow.

This is defensive by default. OpenCode V2 permission rules are ordered: later matches take precedence. Inspect inherited policies and locally saved approvals before enabling trusted automation. A third-party tool or externally spawned process may bypass agent-level prompts unless isolated at the OS level.

**Version caveat:** some OpenCode V2 releases have reported that `permissions:` rules in Markdown frontmatter are parsed but not applied to the actual session. Validate the running OpenCode version by issuing controlled test requests from both roles in a disposable repository. Do not treat the Markdown policy as a verified security boundary until those tests demonstrate enforcement.

References:
- https://opencode.ai/docs/permissions/
- https://github.com/anomalyco/opencode/issues/50598

For stricter production isolation, run the reviewer in a separate read-only filesystem sandbox and run the implementer with least-privilege credentials and protected GitHub branches. These are deployment requirements, not features automatically installed by this repository.
