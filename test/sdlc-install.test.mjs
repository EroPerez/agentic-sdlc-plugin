import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { install, entrypoints, parseArgs, PLATFORMS } from '../scripts/sdlc-install.mjs'

function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'agentic-install-'))
  const src = join(root, 'source')
  const target = join(root, 'project')
  mkdirSync(src); mkdirSync(target)
  for (const name of ['agents', 'commands', 'phases', 'references', 'skills', 'templates', 'scripts']) mkdirSync(join(src, name))
  for (const name of ['agents/role.md', 'commands/sdlc.md', 'phases/phase.md', 'references/setup.md', 'skills/skill.md', 'templates/metadata.yml', 'scripts/sdlc-state.mjs', 'scripts/sdlc-guard.mjs']) writeFileSync(join(src, name), name)
  try { fn({ root, src, target }) } finally { rmSync(root, { recursive: true, force: true }) }
}

test('all five host entrypoints are generated with durable lifecycle contract', () => {
  const entries = entrypoints(PLATFORMS)
  assert.equal(entries.size, 5)
  for (const [path, body] of entries) {
    assert.match(body, /VERDICT: PASS\|FAIL/)
    assert.match(body, /human approval/)
    assert.match(body, /sdlc-state\.mjs/)
    assert.match(body, /reviewer must not author/)
    assert.ok(path.includes('sdlc'))
  }
})

test('installer copies portable engine and is idempotent', () => fixture(({ src, target }) => {
  const first = install({ target, platforms: PLATFORMS }, src)
  assert.ok(first.written >= 13)
  assert.equal(readFileSync(join(target, '.agentic-sdlc/scripts/sdlc-state.mjs'), 'utf8'), 'scripts/sdlc-state.mjs')
  assert.ok(existsSync(join(target, '.github/prompts/sdlc.prompt.md')))
  assert.ok(existsSync(join(target, '.agents/skills/agentic-sdlc/SKILL.md')))
  const second = install({ target, platforms: PLATFORMS }, src)
  assert.equal(second.written, 0)
  assert.equal(second.existing, first.written)
}))

test('collision preflight prevents partial writes', () => fixture(({ src, target }) => {
  mkdirSync(join(target, '.github/prompts'), { recursive: true })
  writeFileSync(join(target, '.github/prompts/sdlc.prompt.md'), 'user content')
  assert.throws(() => install({ target, platforms: PLATFORMS }, src), /Refusing to overwrite/)
  assert.equal(readFileSync(join(target, '.github/prompts/sdlc.prompt.md'), 'utf8'), 'user content')
  assert.equal(existsSync(join(target, '.agentic-sdlc')), false)
}))

test('refuses symlinked destination', () => fixture(({ src, target }) => {
  symlinkSync(src, join(target, '.agentic-sdlc'))
  assert.throws(() => install({ target, platforms: ['codex'] }, src), /Symlink refused/)
}))

test('argument parsing rejects unknown/duplicate platforms and missing flags', () => {
  assert.deepEqual(parseArgs(['--platforms', 'codex,cursor']).platforms, ['codex', 'cursor'])
  assert.throws(() => parseArgs(['--platforms', 'codex,codex']), /Invalid platforms/)
  assert.throws(() => parseArgs(['--platforms', 'other']), /Invalid platforms/)
  assert.throws(() => parseArgs(['--target']), /Unknown or incomplete/)
})
