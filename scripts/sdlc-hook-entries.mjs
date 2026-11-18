// Additional project-local hook manifests distributed alongside native SDLC roles.
export function hookEntrypoints(platforms) {
  const files = new Map()
  const bridge = '.agentic-sdlc/scripts/sdlc-hook-bridge.mjs'
  if (platforms.includes('codex')) {
    const command = 'node "$(git rev-parse --show-toplevel)/' + bridge + '" codex'
    files.set('.codex/hooks.json', JSON.stringify({
      description: 'Agentic SDLC metadata and publication policy',
      hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command, timeout: 10 }] }] }
    }, null, 2) + '\n')
  }
  if (platforms.includes('copilot')) {
    files.set('.github/hooks/agentic-sdlc.json', JSON.stringify({
      version: 1,
      hooks: { preToolUse: [{ type: 'command', bash: 'node ' + bridge + ' copilot', timeoutSec: 10 }] }
    }, null, 2) + '\n')
  }
  if (platforms.includes('cursor')) {
    files.set('.cursor/hooks.json', JSON.stringify({
      version: 1,
      hooks: {
        // preToolUse does not enforce ask: handle write/patch and delegate shell to beforeShellExecution.
        preToolUse: [{ command: 'node ' + bridge + ' cursor', matcher: 'Write|Edit|Delete|MCP:.*', failClosed: true }],
        beforeShellExecution: [{ command: 'node ' + bridge + ' cursor-shell', failClosed: true }]
      }
    }, null, 2) + '\n')
  }
  if (platforms.includes('opencode')) {
    files.set('.opencode/plugins/agentic-sdlc-policy.js', `// OpenCode local plugin. Explicitly block sensitive actions if approval cannot be established.
import { evaluateHook } from '../../.agentic-sdlc/scripts/sdlc-hook-bridge.mjs'

export const AgenticSdlcPolicy = async () => ({
  'tool.execute.before': async (input, output) => {
    const tool = input?.tool
    const args = output?.args ?? input?.args ?? {}
    const { decision } = evaluateHook('opencode', { tool_name: tool, tool_input: args })
    if (decision) {
      // V1 before hook has no portable ask response; fail closed rather than silently permit.
      throw new Error(decision.reason + (decision.decision === 'ask'
        ? ' Run this sensitive action manually after explicit human approval.' : ''))
    }
  }
})
`)
  }
  return files
}
