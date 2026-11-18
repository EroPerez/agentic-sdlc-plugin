#!/usr/bin/env node
// Require externally gathered host E2E evidence before a production release.
import { readFileSync, lstatSync, realpathSync } from 'node:fs'
import { resolve, relative, isAbsolute, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { HOSTS } from './sdlc-runtime.mjs'

export const REQUIRED = Object.freeze([
  'role-discovery', 'seven-phase-run', 'gate-failure', 'resume',
  'reviewer-write-denied', 'human-signoff', 'publish-approval'
])

export function certifyAttestations(input, expectedCommit, evidenceRoot) {
  if (!input || input.schemaVersion !== 1 || !Array.isArray(input.hosts) ||
      !/^[a-f0-9]{40}$/.test(expectedCommit)) throw new Error('Invalid certification input or commit')
  if (typeof evidenceRoot !== 'string' || !evidenceRoot.trim()) throw new Error('Evidence root is required')
  const root = realpathSync(resolve(evidenceRoot))
  if (!lstatSync(root).isDirectory()) throw new Error('Evidence root must be a directory')
  const issues = []
  const seen = new Set()
  for (const record of input.hosts) {
    if (!record || !HOSTS.includes(record.host) || seen.has(record.host)) {
      issues.push({ host: record?.host ?? null, code: 'invalid-or-duplicate-host' })
      continue
    }
    seen.add(record.host)
    if (record.commit !== expectedCommit || typeof record.clientVersion !== 'string' ||
        !record.clientVersion.trim() || typeof record.observedAt !== 'string' ||
        !Number.isFinite(Date.parse(record.observedAt)) ||
        typeof record.operator !== 'string' || !record.operator.trim()) {
      issues.push({ host: record.host, code: 'invalid-provenance' })
      continue
    }
    const proofs = record.checks
    if (!Array.isArray(proofs) || new Set(proofs.map(c => c?.name)).size !== proofs.length) {
      issues.push({ host: record.host, code: 'invalid-checks' })
      continue
    }
    for (const name of REQUIRED) {
      const check = proofs.find(item => item?.name === name)
      if (!check || check.status !== 'PASS' || typeof check.evidenceSha256 !== 'string' ||
          !/^[a-f0-9]{64}$/.test(check.evidenceSha256) ||
          typeof check.evidenceRef !== 'string' || !check.evidenceRef.trim()) {
        issues.push({ host: record.host, code: 'missing-verifiable-check', check: name })
      } else {
        try {
          const candidate = resolve(root, check.evidenceRef)
          const relativePath = relative(root, candidate)
          if (!relativePath || relativePath === '..' || relativePath.startsWith('..' + sep) || isAbsolute(relativePath)) {
            throw new Error('Evidence path escapes root')
          }
          // Reject symlinks in every component, including symlinked directories.
          let current = root
          for (const component of relativePath.split(sep)) {
            current = resolve(current, component)
            if (lstatSync(current).isSymbolicLink()) throw new Error('Evidence symlink rejected')
          }
          if (!lstatSync(candidate).isFile()) throw new Error('Evidence not a regular file')
          const actual = createHash('sha256').update(readFileSync(candidate)).digest('hex')
          if (actual !== check.evidenceSha256) throw new Error('Evidence hash mismatch')
        } catch {
          issues.push({ host: record.host, code: 'evidence-file-unverified', check: name })
        }
      }
    }
  }
  for (const host of HOSTS) {
    if (!seen.has(host)) issues.push({ host, code: 'missing-host' })
  }
  return { ready: issues.length === 0, commit: expectedCommit,
    checkedHosts: [...seen].filter(host => HOSTS.includes(host)).sort(), issues }
}

export function hashEvidence(text) {
  if (typeof text !== 'string') throw new Error('Evidence must be text')
  return createHash('sha256').update(text).digest('hex')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 6 || args[0] !== '--input' || args[2] !== '--commit' || args[4] !== '--evidence-root') {
      throw new Error('Usage: node scripts/sdlc-certify.mjs --input <file> --commit <40-char-sha> --evidence-root <folder>')
    }
    const report = certifyAttestations(JSON.parse(readFileSync(resolve(args[1]), 'utf8')), args[3], args[5])
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    if (!report.ready) process.exitCode = 2
  } catch (error) {
    process.stderr.write(`sdlc certification: ${error.message}\n`)
    process.exitCode = 1
  }
}
