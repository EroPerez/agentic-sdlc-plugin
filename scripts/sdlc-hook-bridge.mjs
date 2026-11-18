#!/usr/bin/env node
// Native host hook bridge: Claude policy core -> Codex, Copilot and Cursor decisions.
// No automatic approval tokens. Hosts without an enforceable "ask" fail closed.
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decide } from './sdlc-guard.mjs'

function parseToolArgs(value) {
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : { command: value } }
    catch { return { command: value } }
  }
  return value && typeof value === 'object' ? value : {}
}

export function normalizeHookInput(host, event) {
  if (!event || typeof event !== 'object') throw new Error('Invalid hook input')
  const rawName = event.tool_name ?? event.toolName ?? (host === 'cursor-shell' ? 'Shell' : '')
  const tool = String(rawName).toLowerCase()
  const args = parseToolArgs(event.tool_input ?? event.toolArgs ?? (host === 'cursor-shell' ? { command: event.command } : {}))
  if (['bash', 'shell', 'powershell', 'functions.shell', 'functions.command'].includes(tool))
    return { tool_name: 'Bash', tool_input: { command: args.command ?? args.script ?? args.cmd ?? '' } }
  if (['apply_patch', 'patch'].includes(tool)) {
    const patch = args.command ?? args.patch ?? args.patch_text ?? args.input ?? ''
    return { tool_name: 'Patch', tool_input: { command: typeof patch === 'string' ? patch : '' } }
  }
  if (['edit', 'write', 'create', 'multiedit', 'notebookedit', 'str_replace_editor', 'fileedit'].includes(tool))
    return { tool_name: 'Edit', tool_input: {
      file_path: args.file_path ?? args.filePath ?? args.path ?? args.target_file ?? args.targetFile ?? args.notebook_path ?? ''
    } }
  return { tool_name: String(rawName), tool_input: args }
}

export function evaluateHook(host, event) {
  const normalized = normalizeHookInput(host, event)
  const decision = decide(normalized)
  return { ...normalized, decision }
}

export function renderHook(host, decision) {
  if (!decision) return null
  if (host === 'codex') {
    // Codex PreToolUse does not implement 'ask'; blocking triggers manual permission workflow.
    return { hookSpecificOutput: {
      hookEventName: 'PreToolUse', permissionDecision: 'deny',
      permissionDecisionReason: decision.reason
    } }
  }
  if (host === 'copilot') return {
    permissionDecision: decision.decision,
    permissionDecisionReason: decision.reason
  }
  if (host === 'cursor' || host === 'cursor-shell') {
    // Cursor preToolUse ignores "ask", but beforeShellExecution supports it.
    const permission = decision.decision === 'ask' && host !== 'cursor-shell' ? 'deny' : decision.decision
    return { permission, user_message: decision.reason, agent_message: decision.reason }
  }
  throw new Error(`Unsupported host hook: ${host}`)
}

export function evaluateAndRender(host, event) {
  return renderHook(host, evaluateHook(host, event).decision)
}

async function main() {
  const host = process.argv[2]
  if (!['codex', 'copilot', 'cursor', 'cursor-shell'].includes(host)) throw new Error('Unknown hook host')
  let text = ''
  for await (const chunk of process.stdin) {
    text += chunk
    if (text.length > 2 * 1024 * 1024) throw new Error('Hook input exceeds 2 MiB')
  }
  const result = evaluateAndRender(host, JSON.parse(text))
  if (result) process.stdout.write(JSON.stringify(result) + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`sdlc hook: ${error.message}\n`); process.exitCode = 2 })
}
