#!/usr/bin/env node
// Portable adapters for the shared Agentic SDLC playbooks. Node.js 18+; no dependencies.
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PLATFORMS = ['codex', 'opencode', 'copilot', 'claude', 'cursor']
const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = ['agents', 'commands', 'phases', 'references', 'scripts/sdlc-state.mjs',
  'scripts/sdlc-guard.mjs', 'skills', 'templates']
const DEST = '.agentic-sdlc'

export function parseArgs(argv) {
  let target = process.cwd()
  let platforms = PLATFORMS
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--target' && argv[i + 1]) target = argv[++i]
    else if (arg === '--platforms' && argv[i + 1]) {
      platforms = argv[++i].split(',').map(s => s.trim())
      if (!platforms.length || platforms.some(p => !PLATFORMS.includes(p)) || new Set(platforms).size !== platforms.length) {
        throw new Error(`Invalid platforms. Choose unique values from: ${PLATFORMS.join(', ')}`)
      }
    } else throw new Error(`Unknown or incomplete argument: ${arg}`)
  }
  return { target: resolve(target), platforms }
}

const shared = `# Agentic SDLC — shared orchestrator contract

Run the seven-phase lifecycle: Prepare → Define → Design → Develop → Verify → Release → Operate.
This repository includes a vendored, agent-independent SDLC engine in \`.agentic-sdlc/\`.

1. Read \`.agentic-sdlc/commands/sdlc.md\` as the authoritative lifecycle procedure.
2. Run \`node .agentic-sdlc/scripts/sdlc-state.mjs\` in the project root and inspect the returned JSON. Invoke the same script for every metadata transition; NEVER edit \`docs/requirements/sdlc-metadata.yml\` directly.
3. Read playbooks in \`.agentic-sdlc/phases/\`, reusable role briefs in \`.agentic-sdlc/agents/\`, and reference documents only when the orchestrator instructs you to do so.
4. Replace Claude Code's \`Task\` dispatch with the host's native subagent/delegation facility, if available. If not, execute role briefs sequentially in isolated steps, explicitly changing role context and recording evidence; do not claim parallelism or independent review when unavailable. A reviewer must not author or modify the material it reviews.
5. Interpret \`\${CLAUDE_PLUGIN_ROOT}\` in the vendored instructions as \`.agentic-sdlc\`, \`$ARGUMENTS\` as the user's invocation text, and \`CLAUDE.md\` as the project's instruction file (also inspect \`AGENTS.md\` when present). Tool names are conceptual capabilities (read/search/execute/edit), not literal requirements.
6. Preserve gates: parse \`VERDICT: PASS|FAIL\`; persist all gate outcomes and bounded retry counts with \`sdlc-state.mjs\`. Never invent tests, successful gate reports, or execution evidence. A role without a truly independent executor cannot certify its own independent review.
7. Before commit, tag, push, release, publish, or modification of SDLC metadata, require explicit human approval. The Claude hook guard is NOT automatically available in other hosts. Treat this as a mandatory workflow policy, not a claim of technically enforced sandbox protection.
8. Stop and request human authorization for Define and Design sign-off, and for an Operate cycle decision. Honor escalation and stop conditions described in the playbooks.

Start by displaying the phase board and offering to initialize or resume. Do not skip setup gating.
`

export function entrypoints(platforms) {
  const entries = new Map()
  for (const platform of platforms) {
    if (platform === 'codex') entries.set('.agents/skills/agentic-sdlc/SKILL.md',
      `---\nname: agentic-sdlc\ndescription: Run the seven-phase Agentic SDLC workflow with durable state and approval gates.\n---\n\n${shared}`)
    if (platform === 'opencode') entries.set('.opencode/commands/sdlc.md',
      `---\ndescription: Run or resume the Agentic SDLC workflow\n---\n\n${shared}`)
    if (platform === 'copilot') entries.set('.github/prompts/sdlc.prompt.md',
      `---\ndescription: Run or resume the seven-phase Agentic SDLC lifecycle\n---\n\n${shared}`)
    if (platform === 'claude') entries.set('.claude/commands/sdlc.md',
      `---\ndescription: Run or resume Agentic SDLC\nargument-hint: "[phase or change request]"\n---\n\n${shared}`)
    if (platform === 'cursor') entries.set('.cursor/rules/agentic-sdlc.mdc',
      `---\ndescription: Agentic SDLC seven-phase workflow\nglobs:\nalwaysApply: false\n---\n\n${shared}`)
  }
  return entries
}

function ensureSafeParents(target, path) {
  let current = target
  if (existsSync(current) && (!lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink())) {
    throw new Error(`Target must be a real directory: ${target}`)
  }
  for (const part of relative(target, path).split(sep)) {
    if (part === '..') throw new Error('Path escapes target')
    current = join(current, part)
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error(`Symlink refused: ${current}`)
  }
}

function collectFiles(base, prefix = '') {
  const names = readdirSync(join(base, prefix), { withFileTypes: true })
  const files = []
  for (const entry of names) {
    if (entry.isSymbolicLink()) throw new Error(`Source symlink refused: ${prefix}/${entry.name}`)
    const path = join(prefix, entry.name)
    if (entry.isDirectory()) files.push(...collectFiles(base, path))
    else if (entry.isFile()) files.push(path)
    else throw new Error(`Unsupported source entry: ${path}`)
  }
  return files
}

export function install({ target, platforms }, source = SOURCE) {
  target = resolve(target)
  source = resolve(source)
  if (target === source || target.startsWith(source + sep)) throw new Error('Target cannot be inside installer source')
  if (!existsSync(target) || !lstatSync(target).isDirectory()) throw new Error(`Project directory does not exist: ${target}`)
  const planned = new Map(entrypoints(platforms))
  for (const asset of ASSETS) {
    const sourcePath = join(source, asset)
    if (!existsSync(sourcePath)) throw new Error(`Missing distribution asset: ${asset}`)
    if (lstatSync(sourcePath).isSymbolicLink()) throw new Error(`Source symlink refused: ${asset}`)
    for (const file of lstatSync(sourcePath).isDirectory() ? collectFiles(source, asset) : [asset]) {
      planned.set(join(DEST, file), readFileSync(join(source, file)))
    }
  }
  // Preflight every destination before modifying anything: no collisions or symlink traversal.
  const changes = []
  for (const [path, content] of planned) {
    const dest = join(target, path)
    ensureSafeParents(target, dest)
    if (existsSync(dest)) {
      if (!lstatSync(dest).isFile()) throw new Error(`Existing non-file destination: ${dest}`)
      if (!readFileSync(dest).equals(Buffer.from(content))) throw new Error(`Refusing to overwrite modified file: ${dest}`)
    } else changes.push([dest, content])
  }
  for (const [dest, content] of changes) {
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, content, { flag: 'wx' })
  }
  return { target, platforms, written: changes.length, existing: planned.size - changes.length }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = install(parseArgs(process.argv.slice(2)))
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`)
  } catch (error) {
    process.stderr.write(`agentic-sdlc install: ${error.message}\n`)
    process.exitCode = 1
  }
}
