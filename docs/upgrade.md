# Safe portable-install upgrade

This command updates **managed files** in an existing project from a known previous Agentic SDLC distribution checkout to the current distribution. It is offline, requires no package manager, does not alter project SDLC evidence under `docs/`, and is **preview-only by default**.

## Requirements

- Two **separate source checkouts**: the previous version whose generated files were installed in the target, and the new version whose `scripts/sdlc-upgrade.mjs` you are running.
- The existing installed project directory (not inside either checkout).
- Node.js 18 or newer and a backup or committed snapshot of the project.
- A consistent list of installed platforms (Codex, OpenCode, Copilot, Claude, Cursor). Do not expand the platform list during upgrade; install additional hosts separately once upgraded.

**Important constraint:** previously generated entrypoints and role definitions must still be reproducible with the current generator contract. The old checkout is used as the *content baseline*; if a generator format changed and the installed file no longer matches that baseline, the upgrade **refuses to proceed**. This is deliberate; there is no unsafe force flag.

## Preparation

Example using two local Git checkouts (select a real previous version/ref, not a placeholder):

```bash
git clone https://github.com/EroPerez/agentic-sdlc-plugin.git /tmp/agentic-sdlc-new
git clone https://github.com/EroPerez/agentic-sdlc-plugin.git /tmp/agentic-sdlc-old
git -C /tmp/agentic-sdlc-old checkout <previous-installed-commit-sha>
```

`<previous-installed-commit-sha>` is the commit corresponding to the files **actually installed** in your project. Do not guess it. If the previous source checkout is unavailable, this version of the upgrader cannot safely reconstruct all old file contents; back up your project and migrate manually.

## Preview the changes (required first)

From **the new checkout**:

```bash
cd /tmp/agentic-sdlc-new
node scripts/sdlc-upgrade.mjs \
  --target /absolute/path/to/project \
  --platforms codex,opencode,copilot,claude,cursor \
  --from-source /tmp/agentic-sdlc-old
```

The JSON report includes `ready`, `changes` (`add`, `replace`, `remove`), SHA-256 identifiers for before/after content, `unchanged` and `blocked`. A blocked plan never applies anything. Reasons include:

- `modified-file`: someone edited a managed file after installation
- `missing-previous-file`: a previously installed managed file disappeared
- `unmanaged-file-collision`: a newly generated path already belongs to the target project
- `unsafe-path`: symlink traversal or escaping the target project
- `not-regular-file`: the path is a directory or another incompatible object

It is not necessary to overwrite user customizations to run Agentic SDLC; inspect and merge them manually instead.

## Apply (only after reviewing and backing up)

```bash
node scripts/sdlc-upgrade.mjs \
  --target /absolute/path/to/project \
  --platforms codex,opencode,copilot,claude,cursor \
  --from-source /tmp/agentic-sdlc-old \
  --apply
```

The upgrader preflights all planned paths before writes, rechecks old file bytes before changing them, stages replacements in temporary sibling files, and saves backups of removed/replaced content for **best-effort rollback on handled failures**. Changed files, unknown destinations, missing previously owned files and symlinks are rejected. For removed managed files, it leaves empty directories in place rather than deleting any potentially shared directory.

**Crash durability boundary:** power failures, process termination or external concurrent file mutations can prevent rollback. This tool is **not a crash-safe transaction manager**; always keep a Git or filesystem backup. Do not run an upgrade while a coding agent or editor is actively modifying generated files.

After successful application:

```bash
node scripts/sdlc-doctor.mjs \
  --target /absolute/path/to/project \
  --platforms codex,opencode,copilot,claude,cursor
```

Expect `ready: true` and no issues. Restart or reload each agent; check native hook permissions with a disposable project and verify that SDLC resumes its previous metadata state.

## When the upgrade is blocked

1. Inspect the `blocked` entries.
2. Preserve any customizations to native agent profiles, local hooks and prompt files.
3. For an unreproducible old installation, perform a **manual three-way merge** between your project files and the two source versions, without overwriting project-owned state.
4. Run the doctor again and validate the host-specific hooks before resuming.
5. Do not bypass hook failures by disabling branch protection or granting a broader publication token.

## Scope and related tools

- `sdlc-install.mjs`: first installation; refuses altered destinations
- `sdlc-doctor.mjs`: read-only file integrity inspection
- `sdlc-upgrade.mjs`: offline preview/apply using the previous source as exact baseline
- `sdlc-uninstall.mjs`: conservative preview/removal using the matching source version

**Not yet automated:** fetching releases from the network, identifying an older installed source automatically without a baseline, detecting client version differences, migration across incompatible role-generation formats, and a fully crash-durable transaction journal. Those need explicit separate design and tests; this first version prioritizes no silent data loss.
