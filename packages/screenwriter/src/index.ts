/**
 * Duanju Studio — host plugin for DeepSeek Harness.
 *
 * Registers 11 model-facing tools on `ctx.tools` and contributes a short,
 * session-scoped project orientation to the runtime context. All project state
 * lives in Markdown beside `.duanju/project.json`; nothing here reads the
 * process working directory when the session names its own.
 *
 * @module @ai-scriptwriter/scriptwriter
 */

import type { Context } from '@deepseek-ai/cordis'
import { normalizeConfig, type PluginConfig } from './host/config.js'
import { ProjectResolver } from './host/resolver.js'
import { registerPrompt } from './host/prompt.js'
import { registerTools } from './host/tools.js'

/** Stable Cordis plugin name. */
export const name = 'ai-scriptwriter'

/** Services required before tools can read or write project state. */
export const inject = ['tools', 'fs']

/** Defaults documented in the profile patch; kept as a plain object because the loader does not require a schema. */
export const DEFAULT_CONFIG: PluginConfig = normalizeConfig({})

/**
 * Mount the plugin.
 * @param ctx - agent-scoped Cordis context.
 * @param config - optional profile configuration.
 */
export function apply(ctx: Context, config?: unknown): void {
  const normalized = normalizeConfig(config)
  const resolver = new ProjectResolver(ctx, normalized)
  registerTools(ctx, normalized, resolver)
  registerPrompt(ctx, resolver)
}

export { normalizeConfig } from './host/config.js'
export type { PluginConfig } from './host/config.js'
export { ProjectResolver } from './host/resolver.js'
export { TOOL_NAMES } from './host/tools.js'
export { registerPrompt, renderProjectContext } from './host/prompt.js'
export { ProjectStore } from './host/store.js'
export { ContextFs } from './host/fs-adapter.js'
export type { TextFs } from './host/text-fs.js'
