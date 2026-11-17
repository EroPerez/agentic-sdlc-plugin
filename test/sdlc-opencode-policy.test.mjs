import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const files = JSON.parse(readFileSync(join(ROOT, 'integrations/opencode.json'), 'utf8')).files

function rulesFor(agent) {
  const body = files[`.opencode/agents/sdlc-${agent}.md`]
  assert.ok(body, `missing ${agent} definition`)
  const block = body.match(/^---\n([\s\S]*?)\n---/)[1]
  const lines = block.split('\n')
  const result = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^  - action: ([a-z_]+)$/)
    if (!m) continue
    const resource = lines[i + 1]?.match(/^    resource: "([^"]+)"$/)
    const effect = lines[i + 2]?.match(/^    effect: (allow|deny|ask)$/)
    assert.ok(resource && effect, `incomplete permission: ${lines[i]}`)
    result.push({ action: m[1], resource: resource[1], effect: effect[1] })
  }
  return result
}

test('OpenCode reviewer refuses editing, shell, Code Mode and delegation', () => {
  const rules = rulesFor('reviewer')
  for (const action of ['edit', 'shell', 'execute', 'external_directory', 'subagent']) {
    assert.ok(rules.some(r => r.action === action && r.resource === '*' && r.effect === 'deny'),
      `reviewer must deny ${action}`)
  }
})

test('OpenCode implementer asks for all shell commands and cannot hand-edit metadata', () => {
  const rules = rulesFor('implementer')
  assert.ok(rules.some(r => r.action === 'shell' && r.resource === '*' && r.effect === 'ask'))
  assert.ok(rules.some(r => r.action === 'edit' &&
    r.resource === 'docs/requirements/sdlc-metadata.yml' && r.effect === 'deny'))
  assert.ok(rules.some(r => r.action === 'external_directory' && r.effect === 'ask'))
  assert.ok(!rules.some(r => r.action === 'shell' && r.effect === 'allow'))
})

test('OpenCode policies use V2 action/resource/effect not legacy bash names', () => {
  for (const body of Object.values(files)) {
    assert.match(body, /\npermissions:\n/)
    assert.doesNotMatch(body, /\npermission:\n|action: bash/)
  }
})
