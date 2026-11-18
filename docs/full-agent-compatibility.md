# Cross-agent role distribution and real validation

The repository distributes one generic SDLC engine and generates **35 native role profiles per selected coding host** from the authoritative files under `agents/`. The supported hosts are Codex, OpenCode, Copilot, Claude Code and Cursor (175 generated role profiles for an all-host install). In addition, each host has its native entrypoint and guard hook.

## Install

```bash
node scripts/sdlc-install.mjs --target /absolute/project --platforms codex,opencode,copilot,claude,cursor
node scripts/sdlc-doctor.mjs --target /absolute/project --platforms codex,opencode,copilot,claude,cursor
```

An intact distribution yields `ready: true`. This proves file integrity, **not** that each client has loaded or enforced the generated declarations.

## Permission and delegation boundaries

- **Claude Code:** project `.claude/settings.json` contains `PreToolUse` guards; the original plugin can also run its own hook. Verify which install is active.
- **Codex:** uses native agent role definitions and `.codex/hooks.json`; reviewer instructions do not override the parent's OS sandbox. Where `ask` is unsupported, the publication hook denies.
- **OpenCode:** role definitions and project `tool.execute.before` plugin; the policy blocks sensitive operations for later manual authorization.
- **Copilot:** native agent profiles, prompt files and repository pre-tool hooks; cloud/interactive approval support differs. Do not rely only on hooks for release security.
- **Cursor:** generated agents/rules and project hooks; reviewer profiles request read-only behavior, but actual tool permissions require host verification.

The runtime contract `scripts/sdlc-runtime.mjs` checks capabilities, dispatch plans, independent reviewer identity and required evidence; it does not run the external agents itself. Use branch protection, least-privilege credentials, independent checks and real host E2E testing.

## Detached worktree validation

A committed version of a target repository can be checked with a trusted JSON checks file. Example file `/tmp/sdlc-checks.json`:

```json
{
  "schemaVersion": 1,
  "checks": [{
    "name": "unit",
    "command": "node",
    "args": ["--test"],
    "timeoutMs": 120000,
    "requireTests": true
  }]
}
```

Run:

```bash
node scripts/sdlc-review-runner.mjs \
  --repository /absolute/project \
  --config /tmp/sdlc-checks.json \
  --ref HEAD --allow-exec \
  --logs-dir /tmp/sdlc-validation-logs
```

The runner requires a clean working tree, executes commands in a detached temporary Git worktree and collects real exit status, test counts (TAP and spec for Node), SHA-256 output digest and optional **verbatim output logs**. The logs directory must be outside the repository and should be unique per run. `requireTests: true` rejects zero or unrecognized Node test counts. Do not use that Node-specific requirement for other frameworks without an equivalent detector.

**A Git worktree is not an OS sandbox:** configured binaries still have the invoking user's permissions and network access. Run untrusted workloads only in restricted environments; the explicit `--allow-exec` flag does not provide isolation.

## Upgrade and release certification

Use `scripts/sdlc-upgrade.mjs` with a matching previous source checkout to preview and apply conservative changes. See [upgrade and migration](upgrade.md). Direct `sdlc-install.mjs` still refuses changed files, by design.

For a release, obtain **real host E2E evidence** of role discovery, all seven phases, gate failure, state resume, enforced independent reviewer write denial, human checkpoints and publication permission. The release certification command verifies evidence files, digests and commit provenance but cannot certify the contents' truthfulness; independent human review is essential. See [certification criteria](certification.md).

Run `node --test` (Node 18/20/22 in CI) and inspect the host-specific guard behavior. **Production parity is not claimed** solely from generated profiles or unit tests.
