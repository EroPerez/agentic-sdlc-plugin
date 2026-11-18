// Explicit, versioned runtime contract for portable Agentic SDLC orchestration.
// The host executor is injected by the caller; this module never simulates a host.
import { roleDefinitions } from './sdlc-roles.mjs'

export const HOSTS = Object.freeze(['codex', 'opencode', 'copilot', 'claude', 'cursor'])
export const PHASES = Object.freeze(['prepare', 'define', 'design', 'develop', 'verify', 'release', 'operate'])
const CAPABILITIES = Object.freeze(['delegate', 'parallel', 'readOnlyReviewer', 'humanApproval', 'commandExecution', 'resume'])
const CAPABILITY_SET = new Set(CAPABILITIES)

export function validateRuntime(runtime) {
  if (!runtime || typeof runtime !== 'object' || !HOSTS.includes(runtime.host) ||
      runtime.version !== 1 || !runtime.capabilities || typeof runtime.capabilities !== 'object') {
    throw new Error('Invalid agent runtime descriptor')
  }
  const capabilities = {}
  for (const key of CAPABILITIES) {
    if (typeof runtime.capabilities[key] !== 'boolean') throw new Error(`Missing boolean capability: ${key}`)
    capabilities[key] = runtime.capabilities[key]
  }
  for (const key of Object.keys(runtime.capabilities)) {
    if (!CAPABILITY_SET.has(key)) throw new Error(`Unknown runtime capability: ${key}`)
  }
  return { host: runtime.host, version: 1, capabilities }
}

export function gateVerdict(result, { independent = false, requireExecution = false } = {}) {
  if (!result || typeof result !== 'object' ||
      !['PASS', 'FAIL'].includes(result.verdict) ||
      typeof result.role !== 'string' || !result.role ||
      typeof result.authorId !== 'string' || !result.authorId ||
      typeof result.reviewerId !== 'string' || !result.reviewerId ||
      !Array.isArray(result.evidence)) return { verdict: 'FAIL', reason: 'invalid-gate-result' }
  if (result.verdict === 'FAIL') return { verdict: 'FAIL', reason: 'reported-failure' }
  if (independent && result.authorId === result.reviewerId) {
    return { verdict: 'FAIL', reason: 'reviewer-is-author' }
  }
  if (!result.evidence.length) return { verdict: 'FAIL', reason: 'missing-evidence' }
  for (const item of result.evidence) {
    if (!item || typeof item !== 'object' || typeof item.kind !== 'string' ||
        !['artifact', 'execution'].includes(item.kind) ||
        typeof item.ref !== 'string' || !item.ref.trim()) {
      return { verdict: 'FAIL', reason: 'invalid-evidence' }
    }
    if (item.kind === 'execution' &&
        (item.exitCode !== 0 || typeof item.commit !== 'string' ||
        !/^[a-f0-9]{40}$/.test(item.commit) ||
        typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256))) {
      return { verdict: 'FAIL', reason: 'invalid-execution-evidence' }
    }
  }
  if (requireExecution && !result.evidence.some(item => item.kind === 'execution')) {
    return { verdict: 'FAIL', reason: 'missing-execution-evidence' }
  }
  return { verdict: 'PASS', reason: 'evidence-accepted' }
}

export function planDispatch({ runtime, roles, group, requireIndependentReviewer = false }) {
  const { capabilities, host } = validateRuntime(runtime)
  if (!roles || !Array.isArray(roles) || !roles.length ||
      roles.some(role => typeof role !== 'string' || !/^sdlc-[a-z0-9-]+$/.test(role))) {
    throw new Error('Dispatch must specify SDLC roles')
  }
  const allowed = new Set(group?.availableRoles || [])
  if (!allowed.size || roles.some(role => !allowed.has(role))) throw new Error('Unknown role in dispatch')
  if (requireIndependentReviewer && !capabilities.readOnlyReviewer) {
    return { host, mode: 'blocked', reason: 'independent-reviewer-not-enforced', roles: [] }
  }
  if (!capabilities.delegate) {
    return { host, mode: 'sequential-manual', reason: 'native-delegation-unavailable', roles: [...roles] }
  }
  return { host, mode: capabilities.parallel && group.parallel === true ? 'parallel' : 'sequential',
    reason: null, roles: [...roles] }
}

export function roleCatalog(source) {
  return roleDefinitions(source).map(({ name, description, reviewer }) =>
    ({ name, description, reviewer }))
}

export function requireApproval(runtime, action, approval) {
  const { capabilities } = validateRuntime(runtime)
  const sensitive = new Set(['commit', 'tag', 'push', 'release', 'publish', 'define-signoff', 'design-signoff', 'operate-cycle'])
  if (!sensitive.has(action)) throw new Error(`Unsupported sensitive action: ${action}`)
  if (!capabilities.humanApproval) return { allowed: false, reason: 'human-approval-not-enforced' }
  if (!approval || approval.action !== action || approval.decision !== 'approve' ||
      typeof approval.actor !== 'string' || !approval.actor.trim() ||
      typeof approval.requestId !== 'string' || !approval.requestId.trim()) {
    return { allowed: false, reason: 'explicit-approval-required' }
  }
  return { allowed: true, reason: 'explicit-approval-recorded' }
}
