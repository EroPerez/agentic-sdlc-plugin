import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { childProcessEnvironment, detectTestCount, parseChecks, validateCommit } from '../scripts/sdlc-review-runner.mjs'

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

test('runner saves verbatim evidence securely and reports matching digest', () => fixture(({ root, repository, config, configure }) => {
  const logsDir = join(root, 'evidence')
  configure([{ name: 'unit', command: process.execPath, args: ['--test'], requireTests: true }])
  const report = validateCommit({ repository, config, allowExec: true, logsDir })
  assert.equal(report.verdict, 'PASS')
  const evidenceFile = report.checks[0].evidenceFile
  assert.ok(existsSync(evidenceFile))
  const output = readFileSync(evidenceFile)
  assert.equal(createHash('sha256').update(output).digest('hex'), report.checks[0].outputSha256)
  assert.match(output.toString('utf8'), /^(?:#|ℹ) tests 1\s*$/m)
  assert.throws(() => validateCommit({ repository, config, allowExec: true, logsDir }), /EEXIST/)
}))

test('test count parser supports TAP, spec, ANSI colors and absent summaries', () => {
  assert.equal(detectTestCount('TAP version 13\n# tests 12\n# pass 12\n'), 12)
  assert.equal(detectTestCount('✔ one (1ms)\nℹ tests 1\nℹ pass 1\n'), 1)
  assert.equal(detectTestCount('\u001b[32mℹ tests 2\u001b[0m\n'), 2)
  assert.equal(detectTestCount('application stdout with no test summary'), null)
  assert.equal(detectTestCount('# tests 0\n'), 0)
})

test('runner accepts a real Node spec reporter with collected tests', () => fixture(({ repository, config, configure }) => {
  configure([{ name: 'spec', command: process.execPath,
    args: ['--test', '--test-reporter=spec'], requireTests: true }])
  const result = validateCommit({ repository, config, allowExec: true })
  assert.equal(result.verdict, 'PASS')
  assert.equal(result.checks[0].exitCode, 0)
  assert.equal(result.checks[0].testCount, 1)
}))

test('runner accepts a real Node TAP reporter with collected tests', () => fixture(({ repository, config, configure }) => {
  configure([{ name: 'tap', command: process.execPath,
    args: ['--test', '--test-reporter=tap'], requireTests: true }])
  const result = validateCommit({ repository, config, allowExec: true })
  assert.equal(result.verdict, 'PASS')
  assert.equal(result.checks[0].exitCode, 0)
  assert.equal(result.checks[0].testCount, 1)
}))

test('child environment removes inherited NODE_TEST_CONTEXT without mutating parent variables', () => {
  const parent = { NODE_TEST_CONTEXT: 'child-v8', NODE_OPTIONS: '--no-warnings',
    CUSTOM_TEST_VARIABLE: 'preserve' }
  const env = childProcessEnvironment(parent)
  assert.equal(env.NODE_TEST_CONTEXT, undefined)
  assert.equal(env.NODE_OPTIONS, '--no-warnings')
  assert.equal(env.CUSTOM_TEST_VARIABLE, 'preserve')
  assert.equal(env.GIT_TERMINAL_PROMPT, '0')
  assert.equal(parent.NODE_TEST_CONTEXT, 'child-v8')
})

test('detached runner executes nested Node tests despite an inherited test context', () => fixture(({ repository, config, configure }) => {
  configure([{ name: 'nested', command: process.execPath,
    args: ['--test', '--test-reporter=spec'], requireTests: true }])
  const previous = process.env.NODE_TEST_CONTEXT
  try {
    process.env.NODE_TEST_CONTEXT = 'child-v8'
    const report = validateCommit({ repository, config, allowExec: true })
    assert.equal(report.verdict, 'PASS')
    assert.equal(report.checks[0].exitCode, 0)
    assert.equal(report.checks[0].testCount, 1)
  } finally {
    if (previous === undefined) delete process.env.NODE_TEST_CONTEXT
    else process.env.NODE_TEST_CONTEXT = previous
  }
}))
