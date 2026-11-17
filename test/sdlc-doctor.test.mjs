import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, unlinkSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { diagnose } from '../scripts/sdlc-doctor.mjs'
import { install } from '../scripts/sdlc-install.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function project(fn) {
  const temp = mkdtempSync(join(tmpdir(), 'sdlc-doctor-'))
  try { fn(temp) } finally { rmSync(temp, { recursive: true, force: true }) }
}

test('doctor reports a complete, unchanged installation', () => project(target => {
  install({ target, platforms: ['codex', 'opencode'] }, ROOT)
  const report = diagnose({ target, platforms: ['codex', 'opencode'] }, ROOT)
  assert.equal(report.ready, true)
  assert.equal(report.verified, report.expected)
  assert.deepEqual(report.issues, [])
}))

test('doctor detects missing and modified files without overwriting them', () => project(target => {
  install({ target, platforms: ['cursor'] }, ROOT)
  const entry = join(target, '.cursor/rules/agentic-sdlc.mdc')
  const role = join(target, '.cursor/agents/sdlc-reviewer.md')
  const before = readFileSync(entry, 'utf8')
  writeFileSync(entry, before + 'modified')
  unlinkSync(role)
  const report = diagnose({ target, platforms: ['cursor'] }, ROOT)
  assert.equal(report.ready, false)
  assert.ok(report.issues.some(issue => issue.path === '.cursor/rules/agentic-sdlc.mdc' && issue.status === 'modified'))
  assert.ok(report.issues.some(issue => issue.path === '.cursor/agents/sdlc-reviewer.md' && issue.status === 'missing'))
  assert.equal(readFileSync(entry, 'utf8'), before + 'modified')
}))

test('doctor detects symlink replacements instead of following them', () => project(target => {
  install({ target, platforms: ['codex'] }, ROOT)
  const entry = join(target, '.agents/skills/agentic-sdlc/SKILL.md')
  unlinkSync(entry)
  symlinkSync(join(ROOT, 'README.md'), entry)
  const report = diagnose({ target, platforms: ['codex'] }, ROOT)
  assert.equal(report.ready, false)
  assert.ok(report.issues.some(issue => issue.path === '.agents/skills/agentic-sdlc/SKILL.md' && issue.status === 'unsafe-path'))
}))

test('doctor rejects a symlinked target root', () => project(target => {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-target-link-'))
  try {
    const link = join(root, 'link')
    symlinkSync(target, link)
    assert.throws(() => diagnose({ target: link, platforms: ['codex'] }, ROOT), /non-symlink directory/)
  } finally { rmSync(root, { recursive: true, force: true }) }
}))
