// Host-specific native integration files are declarative and installed atomically
// with the common engine by scripts/sdlc-install.mjs.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

const VALID = new Set(['codex', 'opencode', 'copilot', 'claude', 'cursor'])
const OWNED_PREFIXES = {
  codex: ['.codex/'],
  opencode: ['.opencode/'],
  copilot: ['.github/agents/', '.github/instructions/'],
  claude: ['.claude/agents/'],
  cursor: ['.cursor/agents/', '.cursor/rules/']
}

export function nativeEntrypoints(platforms, source) {
  const result = new Map()
  for (const platform of platforms) {
    if (!VALID.has(platform)) throw new Error(`Unsupported host: ${platform}`)
    const file = join(resolve(source), 'integrations', `${platform}.json`)
    if (!existsSync(file)) continue // Native adapters roll out independently.
    const definition = JSON.parse(readFileSync(file, 'utf8'))
    if (definition.schemaVersion !== 1 || !definition.files || typeof definition.files !== 'object' ||
        Array.isArray(definition.files)) throw new Error(`Invalid host manifest: ${file}`)
    for (const [path, body] of Object.entries(definition.files)) {
      const segments = path.split('/')
      if (!OWNED_PREFIXES[platform].some(prefix => path.startsWith(prefix)) ||
          segments.some(segment => !segment || segment === '.' || segment === '..') ||
          path.includes('\\') || path.includes('\0') ||
          typeof body !== 'string' || !body.trim()) {
        throw new Error(`Unsafe host entry: ${platform}: ${path}`)
      }
      if (result.has(path)) throw new Error(`Duplicate host entry: ${path}`)
      result.set(path, body)
    }
  }
  return result
}
