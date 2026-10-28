/** One store per workspace root, resolved from the calling session. */

import { resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { PluginConfig } from './config.js'
import { ContextFs } from './fs-adapter.js'
import { ProjectStore } from './store.js'

export interface SessionLike {
  readonly header?: { readonly cwd?: string }
}

export interface RootInfo {
  root: string
  source: 'session' | 'config' | 'process'
}

export class ProjectResolver {
  private readonly stores = new Map<string, ProjectStore>()

  constructor(
    private readonly ctx: Context,
    private readonly config: PluginConfig,
  ) {}

  rootFor(session?: SessionLike | undefined): RootInfo {
    const cwd = session?.header?.cwd
    if (cwd !== undefined && cwd !== '') return { root: resolve(cwd), source: 'session' }
    if (this.config.workspaceRoot !== '') return { root: resolve(this.config.workspaceRoot), source: 'config' }
    return { root: resolve(process.cwd()), source: 'process' }
  }

  storeFor(root: string): ProjectStore {
    const existing = this.stores.get(root)
    if (existing !== undefined) return existing
    const store = new ProjectStore(new ContextFs(this.ctx, root), root)
    this.stores.set(root, store)
    return store
  }

  storeForSession(session?: SessionLike | undefined): ProjectStore {
    return this.storeFor(this.rootFor(session).root)
  }
}
