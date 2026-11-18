# Certification and release readiness

This branch adds **an executable runtime contract and a fail-closed production certification gate**, not a claim of completed vendor host certification.

## Runtime contract

`scripts/sdlc-runtime.mjs` validates versioned host descriptors, a 35-role catalog, sequential/parallel dispatch plans, proof-carrying gate decisions, author/reviewer separation and explicit approval records. Capabilities are **caller supplied**, not auto-probed. A caller must verify the host's effective policy before setting `readOnlyReviewer: true` or `humanApproval: true`; fabricating capabilities defeats the contract.

An independent reviewer requires a separate actor, actual execution evidence when the gate requests it, and must not certify its own authored work. The runtime does not execute remote agents: each host is responsible for providing an actual executor and enforcing the declared contract.

## Save independent verification output

Use the detached Git worktree validator on a **trusted** checks configuration. Only a commit is tested; the source checkout must be clean.

```bash
node scripts/sdlc-review-runner.mjs \
  --repository /absolute/project \
  --config /absolute/checks.json \
  --ref HEAD --allow-exec \
  --logs-dir /absolute/external-evidence
```

A unique log per commit/check is created with file mode 0600. The report contains command, argument list, exit status, output digest, TAP collection count (when available) and the evidence file path. The runner refuses to overwrite a previous log; use a new evidence folder for each run.

**Security note:** Git worktrees are not sandboxes. The configured binaries execute with the caller's full OS privileges and environment; they may access the network and host files. Use disposable containers or constrained CI machines with least-privilege credentials for untrusted repositories. The hash proves that the local bytes match the reported bytes, **not** that a remote coding agent behaved honestly.

## Mandatory client E2E checklist

For each of **Codex, OpenCode, GitHub Copilot, Claude Code and Cursor**, run an independently observable scenario on the exact commit being certified:

1. `role-discovery` — discover the correct 35 installed role definitions.
2. `seven-phase-run` — execute all seven playbooks and inspect produced artifacts.
3. `gate-failure` — inject a real failed check; confirm it blocks progression and records evidence.
4. `resume` — restart the host in a fresh session and resume persisted state.
5. `reviewer-write-denied` — request a write from the reviewer and verify it is denied by **effective host or OS controls**. A prompt refusal alone does not qualify.
6. `human-signoff` — verify Define, Design and Operate checkpoints cannot be skipped.
7. `publish-approval` — attempt publication with a test repo and verify approval enforcement before publication.

Record raw logs/screenshots outside the source repo. Create a JSON attestation file (not auto-generated as PASS) with this shape:

```json
{
  "schemaVersion": 1,
  "hosts": [
    {
      "host": "codex",
      "commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "clientVersion": "record-actual-version",
      "observedAt": "2026-11-18T12:00:00Z",
      "operator": "actual-test-operator",
      "checks": [
        {
          "name": "role-discovery",
          "status": "PASS",
          "evidenceRef": "codex/role-discovery.log",
          "evidenceSha256": "64-lowercase-hex-character-sha256-of-evidence"
        }
      ]
    }
  ]
}
```

The example intentionally omits other checks and hosts; it **cannot pass certification**. Fill all seven checks for all five hosts with actual evidence. Paths must be relative to the evidence root and cannot use symlinks or escape it.

```bash
node scripts/sdlc-certify.mjs \
  --input /absolute/host-e2e-attestations.json \
  --commit "$(git rev-parse HEAD)" \
  --evidence-root /absolute/e2e-logs
```

Exit 0 = structurally complete proof files with matching digests; 2 = missing or failed certification check; 1 = invalid arguments or configuration. This verifies file presence, integrity, host/commit matching and checklist completeness. A human reviewer must still inspect the *substance* of evidence before release; the tool cannot prove honesty or enforce external client behavior.

## Release conditions

- `node --test` green on Node 18, 20 and 22.
- Installer and Doctor complete with no missing/modified files across all five hosts.
- Independent reviewer + human approval enforcement demonstrated under effective host permissions.
- Certification CLI exits 0 for the exact release commit and human review approves the evidence.
- GitHub protected branch and release environment configured; do not issue tokens with more privilege than necessary.
- AGPL-3.0-or-later distribution obligations reviewed.

The default is **not certified** until real five-client evidence exists. Do not publish a GA release on the strength of generated prompts, local unit tests or invented attestations.

## Conservative removal

The installer can be removed without deleting project-owned files. Run a dry-run first:

```bash
node scripts/sdlc-uninstall.mjs --target /absolute/path/to/project \\
  --platforms codex,opencode,copilot,claude,cursor
```

After reviewing the JSON plan, run the same command with `--apply`. Uninstall blocks **all deletion** when it detects changed files, symlinks or unexpected directories. It only removes exact matches to the current source bundle, so do not use a different checkout/version from the one installed. It leaves unrelated project files untouched. File updates are not automatically overwritten by this tool; reconcile manually and back up before upgrading.
