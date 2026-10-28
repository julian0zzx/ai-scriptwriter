/** Bind the harness filesystem service to the store's narrow port. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-fs'
import type { FsCallOptions, FsKind, TextFs } from './text-fs.js'

interface SandboxService {
  resolve(request?: { session?: unknown }): unknown
}

export class ContextFs implements TextFs {
  constructor(
    private readonly ctx: Context,
    private readonly root: string,
  ) {}

  private async target(path: string) {
    return this.ctx.fs.resolve(path, { cwd: this.root })
  }

  async read(path: string, options?: FsCallOptions): Promise<string | undefined> {
    const target = await this.target(path)
    const info = await this.ctx.fs.stat(target, options?.signal)
    if (info === undefined) return undefined
    if (info.type !== 'file') throw new Error(`${path} 不是文件`)
    return this.ctx.fs.readText(target, options?.signal)
  }

  async write(path: string, text: string, options?: FsCallOptions): Promise<void> {
    const target = await this.target(path)
    const sandbox = this.ctx.reflect.get('sandboxPolicy') as SandboxService | undefined
    const policy = sandbox?.resolve({ session: options?.session })
    await this.ctx.fs.writeText(target, text, undefined, options?.signal, policy as never)
  }

  async list(dir: string, options?: FsCallOptions): Promise<string[]> {
    const target = await this.target(dir)
    const info = await this.ctx.fs.stat(target, options?.signal)
    if (info === undefined || info.type !== 'directory') return []
    const entries = await this.ctx.fs.listDir(target, options?.signal)
    return entries.filter((entry) => entry.type === 'file').map((entry) => entry.name).sort()
  }

  async stat(path: string, options?: FsCallOptions): Promise<FsKind> {
    const target = await this.target(path)
    const info = await this.ctx.fs.stat(target, options?.signal)
    return info?.type === 'file' || info?.type === 'directory' ? info.type : undefined
  }
}
