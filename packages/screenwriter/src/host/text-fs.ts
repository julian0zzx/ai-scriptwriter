/** Narrow filesystem port used by the store; the host binds it to `ctx.fs`. */

export interface FsCallOptions {
  signal?: AbortSignal | undefined
  session?: unknown
}

export type FsKind = 'file' | 'directory' | undefined

export interface TextFs {
  read(path: string, options?: FsCallOptions): Promise<string | undefined>
  write(path: string, text: string, options?: FsCallOptions): Promise<void>
  list(dir: string, options?: FsCallOptions): Promise<string[]>
  stat(path: string, options?: FsCallOptions): Promise<FsKind>
}
