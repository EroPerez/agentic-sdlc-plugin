// Generate project-scoped native agent profiles from the 35 authoritative role briefs.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const HOSTS = new Set(['codex', 'opencode', 'copilot', 'claude', 'cursor'])
const RESTRICTED = /(?:^|-)reviewer$/
function quote(value) { return JSON.stringify(value) }
function yaml(value) { return quote(value) }

export function roleDefinitions(source) {
  const roles = []
  for (const file of readdirSync(join(source, 'agents')).sort()) {
    if (!file.endsWith('.md')) continue
    const content = readFileSync(join(source, 'agents', file), 'utf8')
    const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
    if (!fm) throw new Error(`Missing role frontmatter: ${file}`)
    const read = key => fm[1].split(/\r?\n/).find(line => line.startsWith(key + ':'))?.slice(key.length + 1).trim()
    const name = read('name')
    const description = read('description')
    if (!name || !/^[a-z][a-z0-9-]+$/.test(name) || name !== file.slice(0, -3) || !description) {
      throw new Error(`Invalid SDLC role: ${file}`)
    }
    roles.push({ name, description, reviewer: RESTRICTED.test(name) })
  }
  if (!roles.length) throw new Error('No SDLC role briefs found')
  return roles
}

function prompt(role) {
  const readOnly = role.reviewer
    ? 'This is an independent read-only review. Never edit or publish. Do not certify your own work. If verification requires execution that this role cannot perform, ask for a separate authorized runner and mark that limitation; do not claim independent execution.'
    : 'Only implement approved scope. Never edit docs/requirements/sdlc-metadata.yml directly. Request human authorization before commit, tag, push, release, or publish.'
  return `Role: ${role.name}. Read .agentic-sdlc/agents/${role.name}.md completely, then read the active .agentic-sdlc/phases/ playbook and applicable references. Follow the playbook's evidence and gate contracts. ${readOnly} Record actual command exit codes and supporting evidence. Never invent a VERDICT or claim checks that have not run.`
}

function render(role, host) {
  const id = role.name
  const description = yaml(role.description)
  const instruction = prompt(role)
  if (host === 'codex') return {
    path: `.codex/agents/${id}.toml`,
    body: `name = ${quote(id)}\ndescription = ${description}\n${role.reviewer ? 'sandbox_mode = "read-only"\n' : ''}developer_instructions = ${quote(instruction)}\n`
  }
  if (host === 'opencode') {
    const rules = role.reviewer
      ? ['edit', 'shell', 'execute', 'external_directory', 'subagent'].map(action =>
          `  - action: ${action}\n    resource: "*"\n    effect: deny`).join('\n')
      : `  - action: shell\n    resource: "*"\n    effect: ask\n  - action: external_directory\n    resource: "*"\n    effect: ask`
    return { path: `.opencode/agents/${id}.md`,
      body: `---\ndescription: ${description}\nmode: subagent\npermissions:\n${rules}\n---\n${instruction}\n` }
  }
  if (host === 'copilot') return {
    path: `.github/agents/${id}.agent.md`,
    body: `---\nname: ${id}\ndescription: ${description}\ntools: ${role.reviewer ? '["read", "search"]' : '["read", "search", "edit", "execute"]'}\n---\n${instruction}\n`
  }
  if (host === 'claude') return {
    path: `.claude/agents/${id}.md`,
    body: `---\nname: ${id}\ndescription: ${description}\ntools: ${role.reviewer ? 'Read, Grep, Glob' : 'Read, Grep, Glob, Bash, Write, Edit'}\n---\n${instruction}\n`
  }
  return {
    path: `.cursor/agents/${id}.md`,
    body: `---\nname: ${id}\ndescription: ${description}\nmodel: inherit\n${role.reviewer ? 'readonly: true\n' : ''}---\n${instruction}\n`
  }
}

export function generatedRoleEntrypoints(platforms, source) {
  const result = new Map()
  const roles = roleDefinitions(source)
  for (const host of platforms) {
    if (!HOSTS.has(host)) throw new Error(`Unsupported host: ${host}`)
    for (const role of roles) {
      const { path, body } = render(role, host)
      if (result.has(path)) throw new Error(`Duplicate generated role: ${path}`)
      result.set(path, body)
    }
  }
  return result
}
