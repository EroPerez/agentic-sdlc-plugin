import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, symlinkSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { install } from '../scripts/sdlc-install.mjs'
import { uninstall } from '../scripts/sdlc-uninstall.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
function project(fn) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-uninstall-'))
  try { fn(root) } finally { rmSync(root, { recursive: true, force: true }) }
}

test('uninstall defaults to dry run and explicit apply removes only installed files', () => project(target => {
  const installed = install({ target, platforms: ['codex'] }, ROOT)
  writeFileSync(join(target, 'user-owned.txt'), 'keep')
  const plan = uninstall({ target, platforms: ['codex'] }, ROOT)
  assert.equal(plan.applied, false)
  assert.equal(plan.ready, true)
  assert.equal(plan.managed, installed.written)
  assert.equal(uninstall({ target, platforms: ['codex'], apply: true }, ROOT).removed, installed.written)
  assert.equal(readFileSync(join(target, 'user-owned.txt'), 'utf8'), 'keep')
  assert.equal(existsSync(join(target, '.agents/skills/agentic-sdlc/SKILL.md')), false)
}))

test('uninstall refuses all removal when a generated file has been modified', () => project(target => {
  install({ target, platforms: ['cursor'] }, ROOT)
  const changed = join(target, '.cursor/rules/agentic-sdlc.mdc')
  const another = join(target, '.cursor/agents/sdlc-reviewer.md')
  writeFileSync(changed, 'custom content')
  const result = uninstall({ target, platforms: ['cursor'], apply: true }, ROOT)
  assert.equal(result.applied, false)
  assert.equal(result.ready, false)
  assert.ok(result.blocked.some(item => item.status === 'modified'))
  assert.equal(readFileSync(changed, 'utf8'), 'custom content')
  assert.equal(existsSync(another), true)
}))

test('uninstall refuses symlinks even when they target a matching file', () => project(target => {
  install({ target, platforms: ['copilot'] }, ROOT)
  const path = join(target, '.github/prompts/sdlc.prompt.md')
  unlinkSync(path)
  symlinkSync(join(ROOT, 'README.md'), path)
  const result = uninstall({ target, platforms: ['copilot'], apply: true }, ROOT)
  assert.equal(result.applied, false)
  assert.ok(result.blocked.some(item => item.status === 'unsafe-path'))
}))

test('uninstall is idempotent when already removed', () => project(target => {
  install({ target, platforms: ['opencode'] }, ROOT)
  const first = uninstall({ target, platforms: ['opencode'], apply: true }, ROOT)
  assert.ok(first.removed > 0)
  const again = uninstall({ target, platforms: ['opencode'], apply: true }, ROOT)
  assert.equal(again.removed, 0)
  assert.equal(again.ready, true)
}))
