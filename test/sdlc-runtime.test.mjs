import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateRuntime, gateVerdict, planDispatch, requireApproval, roleCatalog } from '../scripts/sdlc-runtime.mjs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const caps = Object.freeze({ delegate: true, parallel: true, readOnlyReviewer: true,
  humanApproval: true, commandExecution: true, resume: true })
const runtime = (changes = {}) => ({ host: 'codex', version: 1, capabilities: { ...caps, ...changes } })
const proof = {
  verdict: 'PASS', role: 'sdlc-verify-validation-reviewer', authorId: 'author-run',
  reviewerId: 'independent-reviewer-run',
  evidence: [{ kind: 'execution', ref: 'node --test', exitCode: 0,
    commit: 'a'.repeat(40), sha256: 'b'.repeat(64) }]
}

test('runtime descriptor requires explicit boolean capabilities, not implicit privileges', () => {
  assert.equal(validateRuntime(runtime()).capabilities.readOnlyReviewer, true)
  assert.throws(() => validateRuntime({ host: 'other', version: 1, capabilities: caps }), /Invalid/)
  assert.throws(() => validateRuntime(runtime({ parallel: 'yes' })), /boolean/)
  assert.throws(() => validateRuntime(runtime({ unsupported: true })), /Unknown/)
})

test('all 35 canonical roles are discoverable through the runtime interface', () => {
  const roles = roleCatalog(ROOT)
  assert.equal(roles.length, 35)
  assert.ok(roles.some(role => role.name === 'sdlc-verify-validation-reviewer' && role.reviewer))
})

test('dispatch preserves ordering, only parallelizes when explicitly authorized', () => {
  const group = { availableRoles: ['sdlc-prepare-explorer', 'sdlc-prepare-claude-md'], parallel: true }
  const roles = [...group.availableRoles]
  assert.deepEqual(planDispatch({ runtime: runtime(), group, roles }).mode, 'parallel')
  assert.deepEqual(planDispatch({ runtime: runtime({ parallel: false }), group, roles }).mode, 'sequential')
  assert.deepEqual(planDispatch({ runtime: runtime({ delegate: false }), group, roles }).mode, 'sequential-manual')
  assert.deepEqual(planDispatch({ runtime: runtime({ readOnlyReviewer: false }), group, roles,
    requireIndependentReviewer: true }).mode, 'blocked')
  assert.throws(() => planDispatch({ runtime: runtime(), group, roles: ['sdlc-untrusted'] }), /Unknown role/)
})

test('gate denies self-review, unverified execution and missing logs', () => {
  assert.equal(gateVerdict(proof, { independent: true, requireExecution: true }).verdict, 'PASS')
  assert.equal(gateVerdict({ ...proof, reviewerId: proof.authorId }, { independent: true }).reason, 'reviewer-is-author')
  assert.equal(gateVerdict({ ...proof, evidence: [] }).reason, 'missing-evidence')
  assert.equal(gateVerdict({ ...proof, evidence: [{ ...proof.evidence[0], exitCode: 1 }] }).reason,
    'invalid-execution-evidence')
  assert.equal(gateVerdict({ ...proof, evidence: [{ kind: 'artifact', ref: 'docs/a.md' }] },
    { requireExecution: true }).reason, 'missing-execution-evidence')
  assert.equal(gateVerdict({ ...proof, verdict: 'FAIL' }).reason, 'reported-failure')
})

test('publication and lifecycle approvals require explicit recorded human decision', () => {
  assert.equal(requireApproval(runtime(), 'push', null).allowed, false)
  assert.equal(requireApproval(runtime({ humanApproval: false }), 'push',
    { action: 'push', decision: 'approve', actor: 'human', requestId: 'a' }).allowed, false)
  assert.equal(requireApproval(runtime(), 'push',
    { action: 'push', decision: 'approve', actor: 'human', requestId: 'a' }).allowed, true)
  assert.equal(requireApproval(runtime(), 'design-signoff',
    { action: 'push', decision: 'approve', actor: 'human', requestId: 'a' }).allowed, false)
  assert.throws(() => requireApproval(runtime(), 'unknown', null), /Unsupported/)
})
