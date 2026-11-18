import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { certifyAttestations, hashEvidence, REQUIRED } from '../scripts/sdlc-certify.mjs'
import { HOSTS } from '../scripts/sdlc-runtime.mjs'

const commit = 'a'.repeat(40)

function fixture(fn) {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-attestation-'))
  try {
    const hosts = HOSTS.map(name => ({
      host: name, commit, clientVersion: '2026.11', observedAt: '2026-11-18T12:00:00Z',
      operator: 'qa-operator',
      checks: REQUIRED.map(check => {
        const dir = join(root, name)
        mkdirSync(dir, { recursive: true })
        const evidenceRef = name + '/' + check + '.log'
        const body = `host:${name} check:${check} outcome:PASS\n`
        writeFileSync(join(root, evidenceRef), body)
        return { name: check, status: 'PASS', evidenceRef, evidenceSha256: hashEvidence(body) }
      })
    }))
    fn({ root, matrix: { schemaVersion: 1, hosts } })
  } finally { rmSync(root, { recursive: true, force: true }) }
}

test('five-host complete evidence matrix is accepted after checking local file digests', () => fixture(({ root, matrix }) => {
  const report = certifyAttestations(matrix, commit, root)
  assert.equal(report.ready, true)
  assert.equal(report.issues.length, 0)
}))

test('missing host and missing E2E evidence fail release', () => fixture(({ root, matrix }) => {
  matrix.hosts.pop()
  matrix.hosts[0].checks = matrix.hosts[0].checks.filter(c => c.name !== 'reviewer-write-denied')
  const result = certifyAttestations(matrix, commit, root)
  assert.equal(result.ready, false)
  assert.ok(result.issues.some(issue => issue.code === 'missing-host'))
  assert.ok(result.issues.some(issue => issue.check === 'reviewer-write-denied'))
}))

test('wrong commit, forged hash and duplicate entries fail', () => fixture(({ root, matrix }) => {
  matrix.hosts[0].commit = 'b'.repeat(40)
  matrix.hosts[1].checks[0].evidenceSha256 = 'f'.repeat(64)
  matrix.hosts.push({ ...matrix.hosts[4] })
  const result = certifyAttestations(matrix, commit, root)
  assert.equal(result.ready, false)
  assert.ok(result.issues.some(issue => issue.code === 'invalid-provenance'))
  assert.ok(result.issues.some(issue => issue.code === 'evidence-file-unverified'))
  assert.ok(result.issues.some(issue => issue.code === 'invalid-or-duplicate-host'))
}))

test('rejects symlink and path escape in evidence references', () => fixture(({ root, matrix }) => {
  const check = matrix.hosts[0].checks[0]
  unlinkSync(join(root, check.evidenceRef))
  symlinkSync(join(root, 'cursor', REQUIRED[0] + '.log'), join(root, check.evidenceRef))
  let result = certifyAttestations(matrix, commit, root)
  assert.equal(result.ready, false)
  assert.ok(result.issues.some(issue => issue.code === 'evidence-file-unverified'))
  check.evidenceRef = '../escape.log'
  result = certifyAttestations(matrix, commit, root)
  assert.equal(result.ready, false)
  assert.ok(result.issues.some(issue => issue.code === 'evidence-file-unverified'))
}))

test('deterministic digests and structurally invalid matrices', () => fixture(({ root, matrix }) => {
  assert.match(hashEvidence('real log'), /^[a-f0-9]{64}$/)
  assert.equal(hashEvidence('real log'), hashEvidence('real log'))
  assert.throws(() => certifyAttestations({}, commit, root), /Invalid certification/)
  assert.throws(() => certifyAttestations(matrix, 'main', root), /Invalid certification/)
  assert.throws(() => certifyAttestations(matrix, commit), /Evidence root/)
}))
