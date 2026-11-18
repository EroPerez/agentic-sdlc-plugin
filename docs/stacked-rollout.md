# Historical stacked-PR rollout (archived)

This file documents the **original development history**, not an installation procedure or list of currently open branches.

The initial cross-agent migration was developed as a stack of feature branches and merged. Its milestones included portable installation, native agent profiles for Codex/OpenCode/Copilot/Cursor/Claude, 35 role definitions per host, safety guards, installation integrity checks, independent worktree validation, runtime/certification contracts and native hook translations.

**Do not recreate or merge the old stack to use the tool.** Clone the current `main` branch and follow the [README](../README.md) or [agent-independent guide](agent-agnostic.md).

## Current operational tasks

- Confirm each supported coding host loads its native profiles and hooks, including effective permission boundaries.
- Run end-to-end scenarios in all five clients; collect genuine evidence and human approvals.
- Run the Node test matrix, installer and doctor checks.
- Use [safe upgrade](upgrade.md) for version changes that have an exact previous installed-source baseline.
- Verify [release certification](certification.md) before any production compatibility claim.

The previous rollout sequence is retained in Git history and closed PRs for audit purposes. New work should target `main` or a branch based on `main`, rather than old stacked PR branches.
