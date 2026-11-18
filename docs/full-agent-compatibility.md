# Complete host-role distribution and validation

This change builds on the stacked Agentic SDLC pull requests. It **does not replace the original seven playbooks or 35 role definitions**. The source of truth remains `agents/sdlc-*.md`.

## Installation

From the repository checkout containing this branch, run:

```bash
node scripts/sdlc-install.mjs --target /absolute/path/to/project --platforms codex,opencode,copilot,claude,cursor
node scripts/sdlc-doctor.mjs --target /absolute/path/to/project --platforms codex,opencode,copilot,claude,cursor
```

For each host, this generates **35 role-specific profiles** in addition to the existing implementer/reviewer profiles and the host's SDLC entrypoint. Five hosts yield 175 generated role profiles. Each generated profile points to the vendored original brief; the entire SDLC engine is copied into `.agentic-sdlc/`.

These profiles are host-specific *declarations*, not proof the models ran correctly. OpenCode roles use V2 action/resource/effect permissions; Cursor reviewers use `readonly: true`; Codex reviewer profiles request `sandbox_mode = "read-only"`; Copilot and Claude reviewers restrict their tool lists. **Platform versions, inherited permission rules and alternate tooling can weaken these policies.** Inspect actual agent permissions before granting external or publication credentials.

For Claude Code, installation also generates `.claude/settings.json` with `PreToolUse` hooks invoking the vendored `sdlc-guard.mjs`. If that file already exists with different contents, the installer refuses to replace it. **Merge the hook into existing settings manually** and verify it activates with the actual Claude host. The guard's shell parsing is deliberately approximate and is defense-in-depth, not an OS security boundary.

## Independent verification of committed code

The validator runs checks from a **detached temporary Git worktree** at a specific commit SHA. This avoids modifying the current checkout but it is **not an OS sandbox**: arbitrary check commands may access network, host environment variables and other files using the caller's privileges. Only use trusted check configurations and run with least-privilege credentials; ideally execute inside a network-restricted container.

Create a JSON file outside the repository, for example `/tmp/sdlc-checks.json`:

```json
{
  "schemaVersion": 1,
  "checks": [
    {
      "name": "unit",
      "command": "node",
      "args": ["--test"],
      "timeoutMs": 120000,
      "requireTests": true
    }
  ]
}
```

Then, explicitly authorize local command execution:

```bash
node scripts/sdlc-review-runner.mjs \
  --repository /absolute/path/to/project \
  --config /tmp/sdlc-checks.json \
  --ref HEAD \
  --allow-exec
```

The command exits 0 for PASS, 2 for failed checks, 1 for invalid inputs or environment failures. It records the commit SHA, command and argv, exit status, duration, output SHA-256 digest and detected Node TAP test count, if present. A check marked `requireTests` fails when TAP counts zero or no TAP count is found. For non-Node frameworks, define appropriate checks without `requireTests` and verify collected test counts through their native reporters.

No shell interpolation is used to invoke checks, but binaries can still perform arbitrary side effects; review the JSON configuration before setting `--allow-exec`. The script refuses dirty source trees, requires a full commit SHA or HEAD, and cleans up detached worktrees in a `finally` block. Only committed files are evaluated. Hashes are **not substitutes** for verbatim test logs required by some phase gates; save those logs separately in a controlled CI system.

## Review and release gates

1. Run `node --test` in a clean checkout with Node 18, 20 and 22.
2. Install all five hosts in a disposable project and run `sdlc-doctor.mjs`.
3. Verify the 35 native roles appear in each supported client version, and confirm the reviewer cannot modify code using a disposable test repository.
4. Execute one seven-phase scenario per host, with failing and passing gates, deterministic resume, three planned human checkpoints and publication attempts.
5. Protect GitHub branches and release environments; do not rely on prompts or heuristic shell hooks alone.
6. Confirm AGPL-3.0-or-later obligations for distributed modifications.

**Operational boundary:** this PR adds native role declarations and a real independent command-execution mechanism. It does **not** provide proof of end-to-end execution on all five external hosts, complete security parity, or native model routing parity. Do not mark the integration production-ready until external host checks and CI pass.

Platform documentation:
- https://learn.chatgpt.com/docs/agent-configuration/subagents
- https://opencode.ai/docs/agents/
- https://docs.github.com/en/copilot/reference/custom-agents-configuration
- https://cursor.com/docs/subagents
- https://claude.com/resources/articles/how-to-configure-hooks
