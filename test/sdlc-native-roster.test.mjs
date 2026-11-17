import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { generatedRoleEntrypoints, roleDefinitions } from '../scripts/sdlc-roles.mjs'
import { PLATFORMS, install } from '../scripts/sdlc-install.mjs'
import { diagnose } from '../scripts/sdlc-doctor.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('the 35 canonical roles generate 175 distinct native host profiles', () => {
  const roles = roleDefinitions(ROOT)
  assert.equal(roles.length, 35)
  const files = generatedRoleEntrypoints(PLATFORMS, ROOT)
  assert.equal(files.size, 175)
  assert.equal([...files.keys()].filter(path => path.endsWith('sdlc-develop-code-reviewer.md')).length, 3)
  for (const [path, body] of files) {
    assert.match(body, /\.agentic-sdlc\/agents\/sdlc-/)
    assert.ok(body.trim().length > 100, path)
  }
})

test('native reviewer roles have host-scoped read-only declarations', () => {
  const files = generatedRoleEntrypoints(PLATFORMS, ROOT)
  const name = 'sdlc-develop-code-reviewer'
  assert.match(files.get(`.codex/agents/${name}.toml`), /sandbox_mode = "read-only"/)
  assert.match(files.get(`.opencode/agents/${name}.md`), /action: edit\s+resource: "\*"\s+effect: deny/)
  assert.match(files.get(`.github/agents/${name}.agent.md`), /tools: \["read", "search"\]/)
  assert.match(files.get(`.claude/agents/${name}.md`), /tools: Read, Grep, Glob/)
  assert.match(files.get(`.cursor/agents/${name}.md`), /readonly: true/)
})

test('all five hosts install together and doctor verifies the complete role roster', () => {
  const target = mkdtempSync(join(tmpdir(), 'sdlc-all-roles-'))
  try {
    const installed = install({ target, platforms: PLATFORMS }, ROOT)
    assert.ok(installed.written >= 185)
    for (const host of PLATFORMS) {
      const fragment = { codex: '.codex/agents/sdlc-develop-code-reviewer.toml',
        opencode: '.opencode/agents/sdlc-develop-code-reviewer.md',
        copilot: '.github/agents/sdlc-develop-code-reviewer.agent.md',
        claude: '.claude/agents/sdlc-develop-code-reviewer.md',
        cursor: '.cursor/agents/sdlc-develop-code-reviewer.md' }[host]
      assert.ok(existsSync(join(target, fragment)), host)
    }
    assert.equal(diagnose({ target, platforms: PLATFORMS }, ROOT).ready, true)
    assert.equal(install({ target, platforms: PLATFORMS }, ROOT).written, 0)
  } finally { rmSync(target, { recursive: true, force: true }) }
})

test('rejects missing frontmatter and role filename mismatches before writing', () => {
  const temp = mkdtempSync(join(tmpdir(), 'sdlc-role-fixture-'))
  try {
    mkdirSync(join(temp, 'agents'))
    writeFileSync(join(temp, 'agents/wrong.md'), '---\nname: other\ndescription: mismatch\n---\n')
    assert.throws(() => roleDefinitions(temp), /Invalid SDLC role/)
    assert.throws(() => generatedRoleEntrypoints(['codex'], temp), /Invalid SDLC role/)
  } finally { rmSync(temp, { recursive: true, force: true }) }
})
