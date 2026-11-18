#!/usr/bin/env node
// Execute configured checks against a detached Git commit in a disposable worktree.
// This isolates repository changes; it is NOT an OS sandbox or a publication guard.
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync, lstatSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const DEFAULT_TIMEOUT = 120000

function processResult(command, args, cwd, timeoutMs = DEFAULT_TIMEOUT) {
  const start = Date.now()
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', shell: false, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  })
  const output = (result.stdout || '') + (result.stderr || '')
  return {
    exitCode: result.status ?? -1,
    signal: result.signal ?? null,
    error: result.error?.message ?? null,
    durationMs: Date.now() - start,
    outputSha256: createHash('sha256').update(output).digest('hex'),
    testCount: detectTestCount(output),
    output
  }
}

export function detectTestCount(output) {
  // Node's test runner can output TAP ("# tests 1") or spec ("ℹ tests 1").
  // Reporter choice varies with Node version and TTY; inspect only summary lines.
  const normalized = output.replace(/\x1b\[[0-9;]*m/g, '')
  const summaries = [...normalized.matchAll(/^(?:#|ℹ) tests (\d+)\s*$/gm)]
  return summaries.length ? Number(summaries[summaries.length - 1][1]) : null
}

export function parseChecks(content) {
  const data = JSON.parse(content)
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.checks) || data.checks.length === 0 ||
      data.checks.length > 30) throw new Error('Expected schemaVersion 1 with 1-30 checks')
  const names = new Set()
  return data.checks.map(check => {
    if (!check || typeof check.name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(check.name) ||
        names.has(check.name) || typeof check.command !== 'string' || !check.command.trim() ||
        !Array.isArray(check.args) || check.args.some(arg => typeof arg !== 'string') ||
        check.args.length > 100 || (check.timeoutMs !== undefined &&
        (!Number.isInteger(check.timeoutMs) || check.timeoutMs < 1000 || check.timeoutMs > 1800000))) {
      throw new Error('Invalid check definition')
    }
    names.add(check.name)
    return {
      name: check.name, command: check.command, args: check.args,
      timeoutMs: check.timeoutMs ?? DEFAULT_TIMEOUT, requireTests: check.requireTests === true
    }
  })
}

function git(cwd, args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8', shell: false, timeout: 30000, maxBuffer: 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  if (run.status !== 0) throw new Error(`git ${args[0]} failed: ${(run.stderr || run.error?.message || '').trim()}`)
  return run.stdout.trim()
}

export function validateCommit({ repository, config, ref = 'HEAD', allowExec = false, logsDir = null }) {
  if (!allowExec) throw new Error('Execution requires explicit --allow-exec')
  const root = resolve(repository)
  const checks = parseChecks(readFileSync(resolve(config), 'utf8'))
  if (!/^(HEAD|[a-f0-9]{40})$/.test(ref)) throw new Error('Ref must be HEAD or a full commit SHA')
  const repoRoot = git(root, ['rev-parse', '--show-toplevel'])
  const dirty = git(root, ['status', '--porcelain'])
  if (dirty) throw new Error('Refusing dirty source tree; commit or stash changes first')
  const sha = git(root, ['rev-parse', '--verify', `${ref}^{commit}`])
  if (logsDir !== null) {
    const dest = resolve(logsDir)
    if (dest === repoRoot || dest.startsWith(repoRoot + sep)) {
      throw new Error('Evidence output directory must be outside the repository')
    }
    mkdirSync(dest, { recursive: true, mode: 0o700 })
    if (!lstatSync(dest).isDirectory() || lstatSync(dest).isSymbolicLink()) {
      throw new Error('Evidence output must be a non-symlink directory')
    }
  }
  const parent = mkdtempSync(join(tmpdir(), 'agentic-sdlc-validation-'))
  const checkout = join(parent, 'checkout')
  let attached = false
  try {
    git(repoRoot, ['worktree', 'add', '--detach', checkout, sha])
    attached = true
    const results = []
    for (const check of checks) {
      const { output, ...evidence } = processResult(check.command, check.args, checkout, check.timeoutMs)
      const evidenceFile = logsDir ? join(resolve(logsDir), `${sha}-${check.name}.log`) : null
      if (evidenceFile) writeFileSync(evidenceFile, output, { flag: 'wx', mode: 0o600 })
      const status = evidence.exitCode === 0 && !evidence.signal && !evidence.error &&
        (!check.requireTests || (evidence.testCount !== null && evidence.testCount > 0))
        ? 'PASS' : 'FAIL'
      results.push({ name: check.name, command: check.command, args: check.args,
        requireTests: check.requireTests, ...evidence, evidenceFile, status })
      if (status === 'FAIL') break
    }
    return { schemaVersion: 1, commit: sha, checks: results,
      verdict: results.length === checks.length && results.every(result => result.status === 'PASS') ? 'PASS' : 'FAIL',
      isolation: 'detached-git-worktree-not-sandbox' }
  } finally {
    try {
      if (attached) git(repoRoot, ['worktree', 'remove', '--force', checkout])
    } finally { rmSync(parent, { recursive: true, force: true }) }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const argv = process.argv.slice(2)
    let repository = process.cwd()
    let config
    let ref = 'HEAD'
    let allowExec = false
    let logsDir = null
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === '--repository' && argv[i + 1]) repository = argv[++i]
      else if (argv[i] === '--config' && argv[i + 1]) config = argv[++i]
      else if (argv[i] === '--ref' && argv[i + 1]) ref = argv[++i]
      else if (argv[i] === '--allow-exec') allowExec = true
      else if (argv[i] === '--logs-dir' && argv[i + 1]) logsDir = argv[++i]
      else throw new Error(`Unknown argument: ${argv[i]}`)
    }
    if (!config) throw new Error('--config is required')
    const report = validateCommit({ repository, config, ref, allowExec, logsDir })
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    if (report.verdict !== 'PASS') process.exitCode = 2
  } catch (error) {
    process.stderr.write(`sdlc validation: ${error.message}\n`)
    process.exitCode = 1
  }
}
