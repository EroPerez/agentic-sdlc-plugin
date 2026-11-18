# Agentic SDLC — Complete user guide

Agentic SDLC is a **seven-phase software development lifecycle** for Claude Code, OpenAI Codex, OpenCode, GitHub Copilot and Cursor. It combines 35 specialized agent roles, reusable playbooks, deterministic project state, validation gates and human approval checkpoints.

**Important:** generating host-specific agent files is not proof that a host enforces permissions or completes independent review. Always verify behavior in your installed client. The original Claude Code plugin and the newer project-local portable integration use different installation methods.

## Contents

1. [Prerequisites](#prerequisites)
2. [Choose an installation method](#choose-an-installation-method)
3. [Portable installation for five agents](#portable-installation-for-five-agents)
4. [Native Claude Code plugin](#native-claude-code-plugin)
5. [First run and example workflow](#first-run-and-example-workflow)
6. [The seven phases](#the-seven-phases)
7. [Resume and operate project state](#resume-and-operate-project-state)
8. [Command reference](#command-reference)
9. [Approvals and native hooks](#approvals-and-native-hooks)
10. [Installation verification](#installation-verification)
11. [Independent test evidence](#independent-test-evidence)
12. [Updates and safe removal](#updates-and-safe-removal)
13. [Run this project's tests](#run-this-projects-tests)
14. [Troubleshooting](#troubleshooting)
15. [Outstanding limitations and references](#outstanding-limitations-and-references)

## Prerequisites

- **Node.js 18 or later** (Node 20/22 are also in the CI matrix).
- **Git** and a clone of this repository for portable installation.
- An existing target project directory and at least one supported coding agent.
- Human control over publishing, CI and release credentials.

Check versions:

~~~bash
node --version
git --version
~~~

This repository uses ESM JavaScript (.mjs) and the built-in Node test runner. **Do not run npm install or npm test** to test this repository; there is no root package.json. Use **node --test** instead.

## Choose an installation method

| Method | Use with | Installation destination | Start command |
|---|---|---|---|
| Portable project installation | Codex, OpenCode, Copilot, Claude Code, Cursor | Files in the **target project**; shared engine in .agentic-sdlc/ | Invoke installed skill, command or rule |
| Native Claude Code plugin | Claude Code | Loaded as a Claude plugin, without copying the engine into each project | /agentic-sdlc:sdlc |

Choose **one** method for Claude Code in a given project, or review and reconcile duplicate hooks and instructions. The upstream Claude marketplace release may not contain the same portable-agent changes as this repository.

## Portable installation for five agents

### Step 1 — Clone the source

~~~bash
git clone https://github.com/EroPerez/agentic-sdlc-plugin.git
cd agentic-sdlc-plugin
~~~

Run the following installer and doctor commands from **the cloned Agentic SDLC repository**. Substitute a real, existing absolute directory for the target project. The target cannot be inside the installer source checkout.

### Step 2 — Install

All five hosts:

~~~bash
node scripts/sdlc-install.mjs \
  --target /absolute/path/to/my-project \
  --platforms codex,opencode,copilot,claude,cursor
~~~

Only Codex, for example:

~~~bash
node scripts/sdlc-install.mjs \
  --target /absolute/path/to/my-project \
  --platforms codex
~~~

Omit the --platforms option to install for all five by default.

The target receives:

- **.agentic-sdlc/** — the shared lifecycle command, 35 role briefs, seven phase playbooks, templates, deterministic state CLI, guard, validator and other supporting scripts.
- **Native role definitions** — generated for each chosen agent, including the 35 SDLC roles and the host's own entrypoint.
- **Host-native hooks** — where supported, guarding direct metadata edits and publication commands.

The installer preflights all destinations, refuses symbolic-link traversal and does **not** overwrite an existing file with different content. Running it again against an identical installation is safe.

### Step 3 — Check installation

~~~bash
node scripts/sdlc-doctor.mjs \
  --target /absolute/path/to/my-project \
  --platforms codex,opencode,copilot,claude,cursor
~~~

The doctor reports **ready: true** when all expected files match. Use precisely the same host list as installation. It verifies file integrity, not agent execution.

### Step 4 — Start the workflow in your coding agent

| Agent | Installed entrypoint | Invocation |
|---|---|---|
| **OpenAI Codex** | .agents/skills/agentic-sdlc/SKILL.md | Open target project; explicitly invoke the agentic-sdlc skill |
| **OpenCode** | .opencode/commands/sdlc.md | Open target project; enter /sdlc |
| **GitHub Copilot** | .github/prompts/sdlc.prompt.md | Use the /sdlc prompt in a Copilot client supporting repository prompts |
| **Claude Code (portable)** | .claude/commands/sdlc.md | Open target project; enter /sdlc |
| **Cursor** | .cursor/rules/agentic-sdlc.mdc | Explicitly attach/apply the agentic-sdlc rule and ask it to start |

**Reload or restart** the agent after installing. Cursor's rule is opt-in, not always active. Skills, custom commands and permissions vary by client version. If slash commands are not recognized, explicitly instruct the agent to read **.agentic-sdlc/commands/sdlc.md** and run the state detector first.

## Native Claude Code plugin

For the original upstream marketplace plugin, enter inside Claude Code:

~~~text
/plugin marketplace add orchestratedbyalex/agentic-sdlc-plugin
/plugin install agentic-sdlc@agentic-sdlc-marketplace
/agentic-sdlc:sdlc
~~~

To use your current clone locally instead, launch Claude with the plugin directory:

~~~bash
claude --plugin-dir /ABSOLUTE/PATH/TO/agentic-sdlc-plugin
~~~

Then inside Claude Code:

~~~text
/reload-plugins
/agentic-sdlc:sdlc
~~~

The original plugin hooks use **hooks/hooks.json**. The project-local Claude adapter instead generates **.claude/settings.json**. Review potential duplicate or conflicting hook configurations if you mix both modes.

## First run and example workflow

1. Open the **target project** in a supported agent and invoke the installed SDLC entrypoint.
2. The orchestrator calls the state detector. It distinguishes **greenfield** (new/empty project), **existing** (code without lifecycle state) and **resume** (existing lifecycle metadata).
3. Review the seven-phase status board and confirm the recommended action.
4. For **greenfield**, supply purpose, users, language/stack and features; the wizard initializes lifecycle metadata and a minimal project skeleton.
5. For **existing**, supply or confirm a project name and version; the wizard initializes lifecycle metadata without replacing existing source code.
6. Select a model routing profile when offered: **balanced** (default), **quality**, or **economy**. The profile is saved in state. Native model tier behavior is host-dependent.
7. Have the agent work through playbook groups. Inspect requirements, design, code and real check results; approve human checkpoints explicitly.
8. On interruption, invoke SDLC again to resume from the saved phase, agent, plan and gate state.

From the **target project root**, you can inspect state yourself:

~~~bash
cd /absolute/path/to/my-project
node .agentic-sdlc/scripts/sdlc-state.mjs
~~~

The detector returns structured JSON including mode, phase board, next agent, setup completion, model profile and saved retry/gate state.

In **native Claude plugin mode**, use the state script from the plugin installation rather than the .agentic-sdlc directory, which may not exist in the target project.

## The seven phases

| Phase | Purpose | Typical artifacts / approvals |
|---|---|---|
| **1 — Prepare** | Explore project and record engineering context | Instructions such as CLAUDE.md |
| **2 — Define** | Functional and nonfunctional requirements; user stories | docs/requirements/; **human requirements sign-off** |
| **3 — Design** | Architecture, components, ADRs and security decisions | docs/design/; **human design/ADR sign-off** |
| **4 — Develop** | Plan, implement, test, review | Implementation plans, code changes and test evidence |
| **5 — Verify** | Review coverage, build and regression evidence | Independent gates ending in VERDICT: PASS or VERDICT: FAIL |
| **6 — Release** | Changelog, versioning, rollback and publication preparation | **Human approval before commit/tag/push/release/publish** |
| **7 — Operate** | Triage, monitoring, feedback and cycle planning | Operational notes; **human next-cycle go/defer/override** |

**Setup gating:** Prepare, Define and Design must be completed before entering Develop/Verify/Release/Operate. Gates are bounded; failures route work back to the responsible author and may escalate to a human. A reviewer cannot certify its own authored changes as independent work.

## Resume and operate project state

The target project owns its lifecycle evidence, primarily:

~~~text
docs/requirements/sdlc-metadata.yml
~~~

**Never edit this YAML file directly**. All lifecycle transitions are made with the deterministic state CLI or orchestrator commands that call it.

To resume:

~~~bash
cd /absolute/path/to/my-project
node .agentic-sdlc/scripts/sdlc-state.mjs
~~~

Reopen the agent and invoke SDLC. The state persists phase/agent progress, gate verdicts, bounded strike counts, clarifier rounds, active implementation plan, verification cycle and route-backs across sessions. If metadata is invalid, use the wizard's repair/reinitialize guidance rather than inventing statuses.

## Command reference

Run from the **target project root** after portable installation. These are examples of the CLI invoked by the orchestrator; do not call completion/gate commands without actual evidence and required human sign-offs.

~~~bash
# Inspect lifecycle status, no arguments
node .agentic-sdlc/scripts/sdlc-state.mjs

# Initialize a project without lifecycle metadata
node .agentic-sdlc/scripts/sdlc-state.mjs init \
  --name "My Project" --version "0.1.0" --mode existing

# Alternative for a genuinely new/empty project
node .agentic-sdlc/scripts/sdlc-state.mjs init \
  --name "New Project" --version "0.1.0" --mode greenfield

# Configure the model routing profile
node .agentic-sdlc/scripts/sdlc-state.mjs config --model-profile balanced

# Register and select an implementation plan
node .agentic-sdlc/scripts/sdlc-state.mjs plan-add --id PLAN-001
node .agentic-sdlc/scripts/sdlc-state.mjs plan-active --id PLAN-001

# Record an actual gate result
node .agentic-sdlc/scripts/sdlc-state.mjs gate-log \
  --phase develop --gate sdlc-develop-code-reviewer --verdict PASS

# Complete a phase only after validating its evidence and approvals
node .agentic-sdlc/scripts/sdlc-state.mjs complete \
  --phase prepare --evidence "gate VERDICT: PASS; reviewed artifacts"
~~~

Additional state commands:

| Command | What it records |
|---|---|
| **brief** | Project purpose, stack, users and key features |
| **counts** | Functional, nonfunctional and user-story totals |
| **complete --phase ... --agent ...** | Agent-level checkpoint |
| **clarifier-round --author ...** | Count clarification attempts |
| **loop-reset --phase ...** | Apply authorized escalation recovery |
| **reopen --phase ... --agent ...** | Reopen an earlier phase for targeted rework |
| **cycle --assessment ... --next-cycle ...** | Operate assessment and next-cycle transition |

Refer to [the wizard contract](commands/sdlc.md), [setup instructions](references/setup.md), [human checkpoints](references/checkpoints.md) and [phase playbooks](phases/) for exact preconditions and full syntax. Record real gate outcomes: the CLI cannot substitute for an independent review.

## Approvals and native hooks

A single shared policy, **scripts/sdlc-guard.mjs**, controls recognized operations:

- Direct modifications of **sdlc-metadata.yml** (including recognized file-edit tools, shell writes and apply_patch) are blocked. Use the state CLI.
- **git commit**, non-listing **git tag**, **git push**, modifying **gh release** commands and package publication need human authorization.

| Host | Installed hook | Sensitive publication action |
|---|---|---|
| Claude Code | .claude/settings.json, or hooks/hooks.json in plugin mode | Ask for permission |
| Codex | .codex/hooks.json | Deny; use a separately approved manual path |
| OpenCode | .opencode/plugins/agentic-sdlc-policy.js | Block; manual path required |
| Copilot | .github/hooks/agentic-sdlc.json | Ask where supported; cloud behavior differs |
| Cursor | .cursor/hooks.json | Shell permission prompt where supported; file edits denied |

The host must actually load/trust the hook. These rules are **defense in depth**, not a hardened OS sandbox: tool wrappers, APIs, unsupported event types or host permission semantics can bypass them. Enforce protected Git branches, least-privilege credentials and external approval records.

See [native hooks and security limitations](docs/native-guard-hooks.md).

## Installation verification

From the tool source checkout:

~~~bash
node scripts/sdlc-doctor.mjs \
  --target /absolute/path/to/my-project \
  --platforms codex,opencode,copilot,claude,cursor
~~~

Expect **ready: true** with an empty issues list for an intact installation.

You may also run a non-destructive hook protocol test:

~~~bash
printf '%s\n' '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' \
  | node scripts/sdlc-hook-bridge.mjs codex
~~~

Expect a **deny** decision for Codex. This verifies the bridge's JSON output, **not** whether Codex has actually registered the hook. Test registration in a disposable repository through the real coding client.

## Independent test evidence

The validator executes trusted commands against a committed snapshot in a **disposable detached Git worktree**. That is *repository isolation only*, **not OS/process/network sandboxing**.

Create a checks file outside your project, for example **/tmp/sdlc-checks.json**:

~~~json
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
~~~

From the tool repository:

~~~bash
node scripts/sdlc-review-runner.mjs \
  --repository /absolute/path/to/my-project \
  --config /tmp/sdlc-checks.json \
  --ref HEAD --allow-exec \
  --logs-dir /tmp/sdlc-verification-logs
~~~

The target checkout must be clean. The runner records commit SHA, command, exit status, duration, detected Node test count and output SHA-256. Supplying **--logs-dir** preserves verbatim output outside the target repository; use a fresh directory for repeated runs at the same SHA.

**Only execute trusted checks.** Commands run with your effective host privileges and may access files, credentials and network. For other testing frameworks, configure appropriate commands; the Node-specific **requireTests** option should only be used when Node's test count can be detected.

See [verification and certification](docs/certification.md).

## Updates and safe removal

The installer will **not force-overwrite** modified generated files. For an existing installation, use the **safe upgrade CLI** from a new distribution checkout and provide the **previous source checkout corresponding to the installed files**. Back up the project first.

Preview changes (this does not write to the target):

~~~bash
node scripts/sdlc-upgrade.mjs \
  --target /absolute/path/to/my-project \
  --platforms codex,opencode,copilot,claude,cursor \
  --from-source /absolute/path/to/previous-agentic-sdlc-checkout
~~~

After reviewing the JSON plan, add **--apply** to the same command and run `sdlc-doctor.mjs` to confirm integrity. The upgrader handles unchanged managed files and safely adds/replaces/removes changed distribution files. It **blocks custom modifications, unsafe paths and collisions**, instead of overwriting them. It does not fetch releases automatically; a prior source checkout and manual migration for incompatible historical generated formats are still required. See the [upgrade guide](docs/upgrade.md) for rollback and security limitations.

To uninstall, use the source checkout/version corresponding to the installed files and **preview** first:

~~~bash
node scripts/sdlc-uninstall.mjs \
  --target /absolute/path/to/my-project \
  --platforms codex,opencode,copilot,claude,cursor
~~~

If the report shows a safe removal plan:

~~~bash
node scripts/sdlc-uninstall.mjs \
  --target /absolute/path/to/my-project \
  --platforms codex,opencode,copilot,claude,cursor \
  --apply
~~~

Uninstall removes **only unmodified generated files**, refuses unsafe paths and does not delete unrelated project files. Preserve and back up the project's own lifecycle documents under **docs/** separately.

## Run this project's tests

From the source repository:

~~~bash
node --test
~~~

There is no root package.json. Running **npm test** produces ENOENT and is not the supported test command. CI uses Node 18/20/22 and performs a portable install/doctor/uninstall smoke test.

The number of tests changes as the project evolves, so this README does not hard-code a count. Inspect the actual runner's **pass** and **fail** totals.

Optional **real Claude agent evaluations** may incur charges and require a configured Claude Code CLI:

~~~bash
node evals/run.mjs --list
SDLC_EVALS=1 node evals/run.mjs
~~~

The agent evaluations are separate from the model-free unit suite. See [evals](evals/README.md) and [contributing](CONTRIBUTING.md).

## Troubleshooting

| Problem | Resolution |
|---|---|
| **npm ERR! ENOENT package.json** | Use **node --test**, not npm test. |
| **Installer target missing** | Create the destination directory and use an absolute path. |
| **Installer refuses overwrite** | Compare the existing generated/user configuration; merge explicitly. |
| **Doctor reports ready: false** | Inspect missing/modified/unsafe file entries and compare source versions. |
| **SDLC slash command is missing** | Restart the client, check supported entrypoints and invoke the skill/rule explicitly. Cursor's rule is opt-in. |
| **A guarded command is denied** | Codex/OpenCode fail closed for sensitive actions; perform the operation only through a separately approved manual path. |
| **Hook appears inactive** | Check host trust and hook loading in the real client; do not assume generated files are active. |
| **A gate claims PASS but did not run tests** | Require actual command output and positive test discovery. Zero tests are not evidence of passing tests. |
| **Resume fails on invalid metadata** | Use wizard repair/reinitialize guidance; avoid ad hoc YAML edits. |
| **Uninstall refuses modified files** | Review and back up customizations; the remover protects differing content. |

## Outstanding limitations and references

**Current verification boundary:** the unit tests and file-integrity checker do not certify that all five external clients execute the complete lifecycle or enforce equivalent approval/read-only policies. Production certification requires real-client evidence for role discovery, seven-phase execution, failing gates, resume, independent reviewer write denial, human checkpoints and publication approvals. The [certification guide](docs/certification.md) defines the evidence format and release gate.

Further reading:

- [Portable adapter architecture](docs/agent-agnostic.md) (contains historical rollout notes).
- [Native agent profiles and test runner](docs/full-agent-compatibility.md).
- [Native hook registration and host limitations](docs/native-guard-hooks.md).
- [Certification and release criteria](docs/certification.md).
- [Lifecycle orchestration contract](commands/sdlc.md).
- [Project diagrams](diagrams/README.md).

## License and attribution

[GNU AGPL-3.0-or-later](LICENSE.md). Original Claude plugin and marketplace credit: [@orchestratedbyalex](https://github.com/orchestratedbyalex). This repository also contains portable-agent integrations. Review the AGPL obligations when redistributing modifications or operating modified network services.
