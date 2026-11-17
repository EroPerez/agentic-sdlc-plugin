import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nativeEntrypoints } from '../scripts/sdlc-hosts.mjs'

function withManifest(name, manifest, fn) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-host-'))
  mkdirSync(join(root, 'integrations'))
  writeFileSync(join(root, 'integrations', name + '.json'), JSON.stringify(manifest))
  try { fn(root) } finally { rmSync(root, { recursive: true, force: true }) }
}

test('missing native manifest leaves legacy entrypoints available', () => {
  withManifest('cursor', { schemaVersion: 1, files: {} }, root => {
    assert.equal(nativeEntrypoints(['codex'], root).size, 0)
  })
})

test('accepts only host-owned files', () => {
  withManifest('codex', { schemaVersion: 1, files: { '.codex/agents/reviewer.toml': 'name = "reviewer"' } }, root => {
    assert.equal(nativeEntrypoints(['codex'], root).size, 1)
  })
})

test('rejects path traversal and files outside host namespace', () => {
  for (const path of ['.codex/../outside', '.github/agents/hack.md', '.codex//bad']) {
    withManifest('codex', { schemaVersion: 1, files: { [path]: 'unsafe' } }, root => {
      assert.throws(() => nativeEntrypoints(['codex'], root), /Unsafe host entry/)
    })
  }
})

test('rejects malformed manifest and empty content', () => {
  withManifest('opencode', { files: {} }, root => {
    assert.throws(() => nativeEntrypoints(['opencode'], root), /Invalid host manifest/)
  })
  withManifest('opencode', { schemaVersion: 1, files: { '.opencode/agents/a.md': '' } }, root => {
    assert.throws(() => nativeEntrypoints(['opencode'], root), /Unsafe host entry/)
  })
})
