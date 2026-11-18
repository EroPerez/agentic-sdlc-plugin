import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { hookEntrypoints } from '../scripts/sdlc-hook-entries.mjs'
import { evaluateHook, evaluateAndRender, normalizeHookInput } from '../scripts/sdlc-hook-bridge.mjs'
import { install } from '../scripts/sdlc-install.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('native hook configurations register all four host integrations', () => {
  const entries = hookEntrypoints(['codex', 'opencode', 'copilot', 'cursor'])
  assert.equal(entries.size, 4)
  const codex = JSON.parse(entries.get('.codex/hooks.json'))
  assert.equal(codex.hooks.PreToolUse[0].matcher, '*')
  const copilot = JSON.parse(entries.get('.github/hooks/agentic-sdlc.json'))
  assert.equal(copilot.hooks.preToolUse[0].type, 'command')
  const cursor = JSON.parse(entries.get('.cursor/hooks.json'))
  assert.equal(cursor.hooks.beforeShellExecution[0].failClosed, true)
  assert.equal(cursor.hooks.preToolUse[0].failClosed, true)
  assert.match(entries.get('.opencode/plugins/agentic-sdlc-policy.js'), /tool.execute.before/)
})

test('host-specific tool arguments are normalized to the canonical Claude policy', () => {
  for (const event of [
    { host: 'codex', input: { tool_name: 'Bash', tool_input: { command: 'git push origin main' } } },
    { host: 'copilot', input: { toolName: 'bash', toolArgs: { command: 'git push origin main' } } },
    { host: 'cursor-shell', input: { command: 'git push origin main' } },
    { host: 'opencode', input: { tool_name: 'bash', tool_input: { command: 'git push origin main' } } }
  ]) {
    assert.equal(evaluateHook(event.host, event.input).decision?.decision, 'ask', event.host)
  }
  assert.equal(normalizeHookInput('copilot', { toolName: 'create', toolArgs: { file_path: 'x' } }).tool_name, 'Edit')
})

test('direct SDLC metadata writes are denied across file and patch tools', () => {
  const writes = [
    ['codex', { tool_name: 'apply_patch', tool_input: { command: '*** Begin Patch\n*** Update File: docs/requirements/sdlc-metadata.yml\n@@\n-hello\n+bye\n*** End Patch' } }],
    ['copilot', { toolName: 'edit', toolArgs: { file_path: 'docs/requirements/sdlc-metadata.yml' } }],
    ['cursor', { tool_name: 'Write', tool_input: { file_path: 'docs/requirements/sdlc-metadata.yml' } }],
    ['cursor', { tool_name: 'Delete', tool_input: { path: 'docs/requirements/sdlc-metadata.yml' } }],
    ['opencode', { tool_name: 'write', tool_input: { filePath: 'docs/requirements/sdlc-metadata.yml' } }],
    ['codex', { tool_name: 'mcp__fs__write_file', tool_input: { path: 'docs/requirements/sdlc-metadata.yml' } }]
  ]
  for (const [host, event] of writes) {
    assert.equal(evaluateHook(host, event).decision?.decision, 'deny', host)
  }
  assert.equal(evaluateHook('codex', { tool_name: 'Bash',
    tool_input: { command: 'node .agentic-sdlc/scripts/sdlc-state.mjs' } }).decision, null)
})

test('native responses use enforceable host decisions, never unsupported ask', () => {
  const shell = { toolName: 'bash', toolArgs: { command: 'git commit -m test' } }
  assert.equal(evaluateAndRender('copilot', shell).permissionDecision, 'ask')
  assert.equal(evaluateAndRender('codex', { tool_name: 'Bash', tool_input: shell.toolArgs })
    .hookSpecificOutput.permissionDecision, 'deny')
  assert.equal(evaluateAndRender('cursor-shell', { command: 'git push' }).permission, 'ask')
  assert.equal(evaluateAndRender('cursor', { tool_name: 'Shell', tool_input: { command: 'git push' } }).permission, 'deny')
  assert.equal(evaluateAndRender('copilot', { toolName: 'bash', toolArgs: { command: 'git status' } }), null)
})

test('hook bridge CLI emits the native decision from each host', () => {
  const script = join(ROOT, 'scripts/sdlc-hook-bridge.mjs')
  for (const [host, input, expected] of [
    ['codex', { tool_name: 'Bash', tool_input: { command: 'git push' } }, 'deny'],
    ['copilot', { toolName: 'bash', toolArgs: { command: 'git push' } }, 'ask'],
    ['cursor-shell', { command: 'git push' }, 'ask']
  ]) {
    const result = spawnSync(process.execPath, [script, host], {
      encoding: 'utf8', input: JSON.stringify(input), env: { ...process.env, NODE_TEST_CONTEXT: undefined }
    })
    assert.equal(result.status, 0, result.stderr)
    const output = JSON.parse(result.stdout)
    assert.equal(output.hookSpecificOutput?.permissionDecision ?? output.permissionDecision ?? output.permission,
      expected)
  }
})

test('installer and doctor include native policy files without modifying user data', () => {
  const root = mkdtempSync(join(tmpdir(), 'sdlc-native-hooks-'))
  try {
    const result = install({ target: root, platforms: ['codex', 'opencode', 'copilot', 'cursor'] }, ROOT)
    assert.ok(result.written > 100)
    for (const filename of hookEntrypoints(['codex', 'opencode', 'copilot', 'cursor']).keys()) {
      assert.ok(existsSync(join(root, filename)), filename)
      assert.ok(readFileSync(join(root, filename), 'utf8').length > 30)
    }
    assert.ok(existsSync(join(root, '.agentic-sdlc/scripts/sdlc-hook-bridge.mjs')))
    assert.equal(install({ target: root, platforms: ['codex', 'opencode', 'copilot', 'cursor'] }, ROOT).written, 0)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
