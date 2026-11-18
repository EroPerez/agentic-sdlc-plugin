#!/usr/bin/env node
// Deterministic safe upgrade between two checked-out distribution versions.
// Neither source directory nor project-owned lifecycle evidence is mutated.
import { existsSync, lstatSync, readFileSync, mkdirSync, mkdtempSync, writeFileSync, unlinkSync, rmSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, relative, resolve, sep, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, randomBytes } from 'node:crypto'
import { parseArgs, plannedFiles } from './sdlc-install.mjs'

const NEW_SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hash = value => createHash('sha256').update(value).digest('hex')

function safePath(root, relativeFile) {
  const dest = resolve(root, relativeFile)
  const rel = relative(root, dest)
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) {
    throw new Error('Unsafe destination path: ' + relativeFile)
  }
  let current = root
  for (const part of rel.split(sep)) {
    current = join(current, part)
    try {
      if (lstatSync(current).isSymbolicLink()) throw new Error('Symlink refused: ' + current)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  return dest
}

function requiredDirectory(path, label) {
  if (!existsSync(path) || !lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()) {
    throw new Error(label + ' must be an existing non-symlink directory')
  }
}

export function planUpgrade({ target, platforms, fromSource }, toSource = NEW_SOURCE) {
  const project = resolve(target)
  const previous = resolve(fromSource)
  const next = resolve(toSource)
  for (const [path, label] of [[project, 'Target'], [previous, 'Previous source'], [next, 'New source']]) {
    requiredDirectory(path, label)
  }
  if (previous === next || project === previous || project === next ||
      project.startsWith(previous + sep) || project.startsWith(next + sep)) {
    throw new Error('Source directories must be distinct from the target and each other')
  }
  const oldFiles = plannedFiles(platforms, previous, { allowMissingAssets: true })
  const newFiles = plannedFiles(platforms, next)
  const paths = [...new Set([...oldFiles.keys(), ...newFiles.keys()])].sort()
  const changes = []
  const blocked = []
  const unchanged = []
  for (const path of paths) {
    let dest
    try { dest = safePath(project, path) } catch (error) {
      blocked.push({ path, reason: 'unsafe-path', detail: error.message })
      continue
    }
    const before = oldFiles.get(path)
    const after = newFiles.get(path)
    if (!existsSync(dest)) {
      if (before !== undefined) {
        // A user may have removed the installed file; don't silently restore it.
        blocked.push({ path, reason: 'missing-previous-file' })
      } else if (after !== undefined) {
        changes.push({ path, action: 'add', afterSha256: hash(after) })
      }
      continue
    }
    if (!lstatSync(dest).isFile()) {
      blocked.push({ path, reason: 'not-regular-file' })
      continue
    }
    const actual = readFileSync(dest)
    if (before === undefined) {
      blocked.push({ path, reason: 'unmanaged-file-collision' })
    } else if (!actual.equals(Buffer.from(before))) {
      blocked.push({ path, reason: 'modified-file' })
    } else if (after === undefined) {
      changes.push({ path, action: 'remove', beforeSha256: hash(before) })
    } else if (actual.equals(Buffer.from(after))) {
      unchanged.push(path)
    } else {
      changes.push({ path, action: 'replace', beforeSha256: hash(before), afterSha256: hash(after) })
    }
  }
  return {
    ready: blocked.length === 0, target: project, platforms: [...platforms],
    previousSource: previous, newSource: next, changes, blocked, unchanged: unchanged.length
  }
}

export function upgrade(options, toSource = NEW_SOURCE) {
  const plan = planUpgrade(options, toSource)
  if (!options.apply || !plan.ready) return { ...plan, applied: false }
  const oldFiles = plannedFiles(options.platforms, options.fromSource, { allowMissingAssets: true })
  const newFiles = plannedFiles(options.platforms, toSource)
  // All preflight checks must pass before any write. Save original bytes for rollback.
  const snapshots = new Map()
  for (const { path, action } of plan.changes) {
    const dest = safePath(plan.target, path)
    if (action === 'add') {
      if (existsSync(dest)) throw new Error('Destination changed during upgrade: ' + path)
    } else {
      if (!existsSync(dest) || !lstatSync(dest).isFile() ||
          !readFileSync(dest).equals(Buffer.from(oldFiles.get(path)))) {
        throw new Error('Destination changed during upgrade: ' + path)
      }
      snapshots.set(path, readFileSync(dest))
    }
  }
  const backup = mkdtempSync(join(tmpdir(), 'agentic-sdlc-upgrade-'))
  const completed = []
  try {
    // Materialize durable-ish transaction backups before touching the target.
    for (const [path, bytes] of snapshots) {
      const file = join(backup, path)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 })
    }
    for (const { path, action } of plan.changes) {
      const dest = safePath(plan.target, path)
      // Recheck just before mutation: never overwrite user-modified or newly linked files.
      if (action === 'add' && existsSync(dest)) throw new Error('Destination changed during upgrade: ' + path)
      if (action !== 'add' && (!existsSync(dest) || !lstatSync(dest).isFile() ||
          !readFileSync(dest).equals(snapshots.get(path)))) {
        throw new Error('Destination changed during upgrade: ' + path)
      }
      if (action === 'remove') {
        unlinkSync(dest)
      } else {
        mkdirSync(dirname(dest), { recursive: true })
        // Stage content in the destination directory, then rename atomically.
        // A failed write cannot truncate the previously installed file.
        const staged = join(dirname(dest), '.sdlc-update-' + randomBytes(12).toString('hex'))
        try {
          writeFileSync(staged, Buffer.from(newFiles.get(path)), { flag: 'wx', mode: 0o600 })
          if (action === 'add' && existsSync(dest)) throw new Error('Destination changed during upgrade: ' + path)
          renameSync(staged, dest)
        } finally {
          if (existsSync(staged)) unlinkSync(staged)
        }
      }
      completed.push({ path, action })
    }
    return { ...plan, applied: true }
  } catch (error) {
    // Restore every changed path in reverse order. Never claim rollback worked if it fails.
    const rollbackErrors = []
    for (const { path, action } of completed.reverse()) {
      try {
        const dest = safePath(plan.target, path)
        if (action === 'add') {
          if (existsSync(dest)) unlinkSync(dest)
        } else {
          writeFileSync(dest, readFileSync(join(backup, path)))
        }
      } catch (rollbackError) { rollbackErrors.push(path + ': ' + rollbackError.message) }
    }
    if (rollbackErrors.length) throw new Error(error.message + '; rollback failed: ' + rollbackErrors.join('; '))
    throw error
  } finally {
    rmSync(backup, { recursive: true, force: true })
  }
}

function parseUpgradeArgs(argv) {
  const rest = []
  let fromSource
  let apply = false
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from-source' && argv[i + 1]) fromSource = argv[++i]
    else if (argv[i] === '--apply') apply = true
    else rest.push(argv[i])
  }
  if (!fromSource) throw new Error('--from-source is required (path to the installed distribution version)')
  return { ...parseArgs(rest), fromSource, apply }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = upgrade(parseUpgradeArgs(process.argv.slice(2)))
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    if (!report.ready) process.exitCode = 2
  } catch (error) {
    process.stderr.write('agentic-sdlc upgrade: ' + error.message + '\n')
    process.exitCode = 1
  }
}
