import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { nativeEntrypoints } from '../scripts/sdlc-hosts.mjs'
import { install, PLATFORMS } from '../scripts/sdlc-install.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('all five native integration manifests are present and have two distinct roles', () => {
  const entries = nativeEntrypoints(PLATFORMS, ROOT)
  assert.equal(entries.size, 10, 'expected 2 native role profiles for each of 5 hosts')
  const suffixes = ['sdlc-reviewer', 'sdlc-implementer']
  for (const platform of PLATFORMS) {
    const file = join(ROOT, 'integrations', platform + '.json')
    assert.ok(existsSync(file), `missing ${platform} manifest`)
    const manifest = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(manifest.schemaVersion, 1)
    const names = Object.keys(manifest.files)
    assert.equal(names.length, 2)
    for (const suffix of suffixes) assert.ok(names.some(n => n.includes(suffix)), `missing ${platform}/${suffix}`)
    for (const body of Object.values(manifest.files)) {
      assert.match(body, /VERDICT:|approved|approval|authorization|approval|authoriz/i)
    }
  }
})

test('opencode reviewer denies filesystem changes and shell execution', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'integrations/opencode.json'), 'utf8'))
  const body = manifest.files['.opencode/agents/sdlc-reviewer.md']
  assert.match(body, /action: edit\s+resource: "\*"\s+effect: deny/)
  assert.match(body, /action: shell\s+resource: "\*"\s+effect: deny/)
})

test('cursor reviewer requests a read-only agent', () => {
  const files = JSON.parse(readFileSync(join(ROOT, 'integrations/cursor.json'), 'utf8')).files
  assert.match(files['.cursor/agents/sdlc-reviewer.md'], /readonly: true/)
})

test('native roles and common engine install together, then remain unchanged on rerun', () => {
  const temp = mkdtempSync(join(tmpdir(), 'sdlc-cross-host-'))
  try {
    const first = install({ target: temp, platforms: PLATFORMS }, ROOT)
    assert.ok(first.written > 40)
    assert.ok(existsSync(join(temp, '.codex/agents/sdlc-reviewer.toml')))
    assert.ok(existsSync(join(temp, '.opencode/agents/sdlc-reviewer.md')))
    assert.ok(existsSync(join(temp, '.github/agents/sdlc-reviewer.agent.md')))
    assert.ok(existsSync(join(temp, '.cursor/agents/sdlc-reviewer.md')))
    assert.ok(existsSync(join(temp, '.claude/agents/sdlc-reviewer.md')))
    const second = install({ target: temp, platforms: PLATFORMS }, ROOT)
    assert.equal(second.written, 0)
    assert.equal(second.existing, first.written)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
