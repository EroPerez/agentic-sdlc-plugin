import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { install } from '../scripts/sdlc-install.mjs'
import { planUpgrade, upgrade } from '../scripts/sdlc-upgrade.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-upgrade-test-'))
  const oldSource = join(root, 'old')
  const target = join(root, 'project')
  mkdirSync(oldSource); mkdirSync(target)
  try {
    for (const name of ['agents', 'commands', 'phases', 'references', 'skills', 'templates', 'scripts', 'integrations']) {
      cpSync(join(ROOT, name), join(oldSource, name), { recursive: true })
    }
    const changed = join(oldSource, 'agents', 'sdlc-prepare-explorer.md')
    writeFileSync(changed, readFileSync(changed, 'utf8') + '\nPrevious release fixture\n')
    install({ target, platforms: ['codex'] }, oldSource)
    fn({ root, oldSource, target })
  } finally { rmSync(root, { recursive: true, force: true }) }
}

test('upgrade defaults to preview and applies only baseline-verified changes', () => fixture(({ oldSource, target }) => {
  const relativePath = '.agentic-sdlc/agents/sdlc-prepare-explorer.md'
  const before = readFileSync(join(target, relativePath))
  const plan = planUpgrade({ target, fromSource: oldSource, platforms: ['codex'] }, ROOT)
  assert.equal(plan.ready, true)
  assert.ok(plan.changes.some(x => x.path === relativePath && x.action === 'replace'))
  const preview = upgrade({ target, fromSource: oldSource, platforms: ['codex'] }, ROOT)
  assert.equal(preview.applied, false)
  assert.deepEqual(readFileSync(join(target, relativePath)), before)
  writeFileSync(join(target, 'owned-by-project.txt'), 'untouched')
  const applied = upgrade({ target, fromSource: oldSource, platforms: ['codex'], apply: true }, ROOT)
  assert.equal(applied.applied, true)
  assert.equal(readFileSync(join(target, relativePath), 'utf8'),
    readFileSync(join(ROOT, 'agents', 'sdlc-prepare-explorer.md'), 'utf8'))
  assert.equal(readFileSync(join(target, 'owned-by-project.txt'), 'utf8'), 'untouched')
  // Version sources must be distinct: no accidental self-upgrade.
  assert.throws(() => planUpgrade({ target, fromSource: ROOT, platforms: ['codex'] }, ROOT), /Source directories/)
}))

test('upgrade preflight blocks user-modified files without partial writes', () => fixture(({ oldSource, target }) => {
  const path = join(target, '.agentic-sdlc/agents/sdlc-prepare-explorer.md')
  writeFileSync(path, 'my custom changes')
  const plan = planUpgrade({ target, fromSource: oldSource, platforms: ['codex'] }, ROOT)
  assert.equal(plan.ready, false)
  assert.ok(plan.blocked.some(x => x.reason === 'modified-file'))
  assert.equal(upgrade({ target, fromSource: oldSource, platforms: ['codex'], apply: true }, ROOT).applied, false)
  assert.equal(readFileSync(path, 'utf8'), 'my custom changes')
}))

test('upgrade refuses unrelated collisions, missing old files and symlink substitutions', () => fixture(({ oldSource, target }) => {
  const file = join(target, '.agentic-sdlc/agents/sdlc-prepare-explorer.md')
  rmSync(file)
  let result = planUpgrade({ target, fromSource: oldSource, platforms: ['codex'] }, ROOT)
  assert.ok(result.blocked.some(x => x.reason === 'missing-previous-file'))
  symlinkSync(join(ROOT, 'README.md'), file)
  result = planUpgrade({ target, fromSource: oldSource, platforms: ['codex'] }, ROOT)
  assert.ok(result.blocked.some(x => x.reason === 'unsafe-path'))
}))

test('upgrade does not edit the previous version source or target when a source is invalid', () => fixture(({ oldSource, target }) => {
  const file = join(target, '.agentic-sdlc/agents/sdlc-prepare-explorer.md')
  const original = readFileSync(file)
  assert.throws(() => planUpgrade({ target, fromSource: target, platforms: ['codex'] }, ROOT), /Source directories/)
  assert.deepEqual(readFileSync(file), original)
  assert.equal(existsSync(join(oldSource, 'agents/sdlc-prepare-explorer.md')), true)
}))

test('upgrader can safely add a new asset absent from previous distribution', () => fixture(({ oldSource, target }) => {
  const olderAsset = join(oldSource, 'scripts/sdlc-upgrade.mjs')
  const destination = join(target, '.agentic-sdlc/scripts/sdlc-upgrade.mjs')
  // Model a legacy version that did not distribute the upgrade command.
  rmSync(olderAsset)
  rmSync(destination)
  const preview = planUpgrade({ target, fromSource: oldSource, platforms: ['codex'] }, ROOT)
  assert.equal(preview.ready, true)
  assert.ok(preview.changes.some(change => change.path === '.agentic-sdlc/scripts/sdlc-upgrade.mjs'
    && change.action === 'add'))
  const result = upgrade({ target, fromSource: oldSource, platforms: ['codex'], apply: true }, ROOT)
  assert.equal(result.applied, true)
  assert.equal(existsSync(destination), true)
}))
