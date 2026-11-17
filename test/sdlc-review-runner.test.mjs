import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { parseChecks, validateCommit } from '../scripts/sdlc-review-runner.mjs'

function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-validation-test-'))
  const repository = join(root, 'repo')
  const config = join(root, 'checks.json')
  mkdirSync(repository)
  try {
    const git = (...args) => execFileSync('git', args, { cwd: repository, stdio: 'pipe' })
    git('init', '-q')
    git('config', 'user.name', 'SDLC Test')
    git('config', 'user.email', 'sdlc-test@example.invalid')
    mkdirSync(join(repository, 'test'))
    writeFileSync(join(repository, 'test', 'sample.test.mjs'),
      "import { test } from 'node:test'\nimport assert from 'node:assert/strict'\ntest('one', () => assert.ok(true))\n")
    git('add', '.')
    git('commit', '-qm', 'fixture')
    const configure = checks => writeFileSync(config, JSON.stringify({ schemaVersion: 1, checks }))
    fn({ root, repository, config, configure })
  } finally { rmSync(root, { recursive: true, force: true }) }
}

test('strict validation configuration rejects invalid or empty checks', () => {
  assert.throws(() => parseChecks('{"schemaVersion":1,"checks":[]}'), /Expected schemaVersion/)
  assert.throws(() => parseChecks('{"schemaVersion":1,"checks":[{"name":"run","command":"node","args":[]},{"name":"run","command":"node","args":[]}]}'), /Invalid check/)
  assert.throws(() => parseChecks('{"schemaVersion":1,"checks":[{"name":"a","command":"node","args":[],"timeoutMs":0}]}'), /Invalid check/)
})

test('runner refuses command execution without explicit opt-in', () => fixture(({ repository, config, configure }) => {
  configure([{ name: 'unit', command: process.execPath, args: ['--test'], requireTests: true }])
  assert.throws(() => validateCommit({ repository, config }), /--allow-exec/)
}))

test('runner verifies detached worktree and records real test evidence', () => fixture(({ repository, config, configure }) => {
  configure([{ name: 'unit', command: process.execPath, args: ['--test'], requireTests: true }])
  const result = validateCommit({ repository, config, allowExec: true })
  assert.equal(result.verdict, 'PASS')
  assert.equal(result.checks[0].testCount, 1)
  assert.match(result.checks[0].outputSha256, /^[0-9a-f]{64}$/)
  assert.match(result.commit, /^[0-9a-f]{40}$/)
  assert.equal(result.isolation, 'detached-git-worktree-not-sandbox')
}))

test('runner fails when tests are not collected even if exit code is zero', () => fixture(({ repository, config, configure }) => {
  configure([{ name: 'empty', command: process.execPath,
    args: ['-e', 'console.log("# tests 0")'], requireTests: true }])
  const result = validateCommit({ repository, config, allowExec: true })
  assert.equal(result.verdict, 'FAIL')
  assert.equal(result.checks[0].testCount, 0)
}))

test('runner refuses dirty source and untrusted refs', () => fixture(({ repository, config, configure }) => {
  configure([{ name: 'unit', command: process.execPath, args: ['--test'], requireTests: true }])
  assert.throws(() => validateCommit({ repository, config, ref: 'main;echo hacked', allowExec: true }), /Ref must/)
  writeFileSync(join(repository, 'dirty.txt'), 'untracked')
  assert.throws(() => validateCommit({ repository, config, allowExec: true }), /dirty source tree/)
}))
