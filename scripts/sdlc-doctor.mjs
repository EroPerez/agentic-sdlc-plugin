#!/usr/bin/env node
// Offline, read-only integrity inspection of generated SDLC adapters.
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, plannedFiles } from './sdlc-install.mjs'

const SOURCE = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function diagnose({ target, platforms }, source = SOURCE) {
  const root = resolve(target)
  if (!existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) {
    throw new Error('Target must be an existing non-symlink directory')
  }
  const expected = plannedFiles(platforms, source)
  const issues = []
  let verified = 0
  for (const [path, content] of expected) {
    const dest = join(root, path)
    let current = root
    let unsafe = false
    for (const part of relative(root, dest).split(sep)) {
      if (part === '..' || part === '.') { unsafe = true; break }
      current = join(current, part)
      if (existsSync(current) && lstatSync(current).isSymbolicLink()) { unsafe = true; break }
    }
    if (unsafe) { issues.push({ path, status: 'unsafe-path' }); continue }
    if (!existsSync(dest)) { issues.push({ path, status: 'missing' }); continue }
    if (!lstatSync(dest).isFile()) { issues.push({ path, status: 'not-file' }); continue }
    if (!readFileSync(dest).equals(Buffer.from(content))) {
      issues.push({ path, status: 'modified' })
      continue
    }
    verified++
  }
  return { ready: issues.length === 0, target: root, platforms, verified, expected: expected.size, issues }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = diagnose(parseArgs(process.argv.slice(2)))
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    if (!report.ready) process.exitCode = 2
  } catch (error) {
    process.stderr.write(`agentic-sdlc doctor: ${error.message}\n`)
    process.exitCode = 1
  }
}
