import type { FsCallOptions, FsKind, TextFs } from '../src/host/text-fs'

/** In-memory TextFs for store and tool tests. */
export class MemoryFs implements TextFs {
  readonly files = new Map<string, string>()

  constructor(seed: Record<string, string> = {}) {
    for (const [path, text] of Object.entries(seed)) this.files.set(path, text)
  }

  async read(path: string, _options?: FsCallOptions): Promise<string | undefined> {
    return this.files.get(path)
  }

  async write(path: string, text: string, _options?: FsCallOptions): Promise<void> {
    this.files.set(path, text)
  }

  async list(dir: string, _options?: FsCallOptions): Promise<string[]> {
    const prefix = `${dir}/`
    const names = new Set<string>()
    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue
      const rest = path.slice(prefix.length)
      if (!rest.includes('/')) names.add(rest)
    }
    return [...names].sort()
  }

  async stat(path: string, _options?: FsCallOptions): Promise<FsKind> {
    if (this.files.has(path)) return 'file'
    const prefix = `${path}/`
    for (const key of this.files.keys()) if (key.startsWith(prefix)) return 'directory'
    return undefined
  }
}
