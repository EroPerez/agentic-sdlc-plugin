# SDLC installation doctor

Use the read-only doctor after installing the adapter bundle or pulling updates from the upstream plugin source:

```bash
node scripts/sdlc-install.mjs --target /path/to/project --platforms codex,opencode,copilot,claude,cursor
node scripts/sdlc-doctor.mjs --target /path/to/project --platforms codex,opencode,copilot,claude,cursor
```

The command compares every installed native entrypoint and vendored shared-engine file with the current source tree. It reports JSON with `ready`, `verified`, `expected`, and `issues` (path and status). Non-zero exit code 2 means the installation is incomplete, stale or modified; 1 indicates an argument or inspection error.

The doctor never runs installed scripts or overwrites project files. It explicitly refuses symlinked paths and handles incomplete installs by reporting missing files. It verifies **file integrity only**, not whether a particular host discovers the agent, enforces its security permissions, or runs the full SDLC correctly. Test those host-specific behaviors before production use.

A modified file is not automatically unsafe: the doctor reports it rather than replacing it. Inspect local changes, reconcile them manually, then reinstall or re-run the doctor.
