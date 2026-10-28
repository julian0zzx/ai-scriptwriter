/** Project-file errors carry the path and source line the author must fix. */
export class ProjectError extends Error {
  constructor(
    message: string,
    readonly file: string,
    readonly line?: number,
  ) {
    super(line === undefined ? `${file}: ${message}` : `${file}:第 ${line} 行：${message}`)
    this.name = 'ProjectError'
  }
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}
