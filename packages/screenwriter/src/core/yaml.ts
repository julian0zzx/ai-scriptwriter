/**
 * A deliberately small YAML subset for the project files.
 *
 * The project format only needs mappings, sequences, flow arrays, quoted
 * scalars and block scalars. A full YAML implementation would be a dependency
 * and a compatibility surface; this parser accepts exactly what the codecs emit
 * and what a human is likely to type, and reports a line number otherwise.
 */

export class YamlError extends Error {
  constructor(message: string, readonly line: number) {
    super(`YAML 第 ${line} 行：${message}`)
    this.name = 'YamlError'
  }
}

interface Line {
  indent: number
  text: string
  no: number
}

function tokenize(text: string): Line[] {
  const out: Line[] = []
  const raw = text.replace(/\r\n?/g, '\n').split('\n')
  for (let i = 0; i < raw.length; i += 1) {
    const line = raw[i] ?? ''
    if (line.trim() === '') continue
    if (line.trimStart().startsWith('#')) continue
    const expanded = line.replace(/\t/g, '  ')
    const indent = /^ */.exec(expanded)?.[0].length ?? 0
    out.push({ indent, text: expanded.slice(indent).replace(/\s+$/u, ''), no: i + 1 })
  }
  return out
}

class Parser {
  private index = 0

  constructor(private readonly lines: Line[]) {}

  private peek(): Line | undefined {
    return this.lines[this.index]
  }

  private next(): Line {
    const line = this.lines[this.index]
    if (line === undefined) throw new YamlError('意外的文件结尾', 1)
    this.index += 1
    return line
  }

  parseDocument(): unknown {
    const first = this.peek()
    if (first === undefined) return null
    const value = this.parseBlock(first.indent)
    const rest = this.peek()
    if (rest !== undefined) throw new YamlError('缩进或结构无法识别', rest.no)
    return value
  }

  private parseBlock(indent: number): unknown {
    const first = this.peek()
    if (first === undefined || first.indent < indent) return null
    const actual = first.indent
    return first.text.startsWith('- ') || first.text === '-' ? this.parseSequence(actual) : this.parseMapping(actual)
  }

  private parseSequence(indent: number): unknown[] {
    const out: unknown[] = []
    while (true) {
      const line = this.peek()
      if (line === undefined || line.indent !== indent) break
      if (!(line.text === '-' || line.text.startsWith('- '))) break
      this.next()
      const rest = line.text.slice(1).trim()
      if (rest === '') {
        const next = this.peek()
        out.push(next !== undefined && next.indent > indent ? this.parseBlock(next.indent) : null)
        continue
      }
      if (isMappingStart(rest)) {
        const item: Record<string, unknown> = {}
        this.consumePair(rest, item, indent, line.no)
        while (true) {
          const cont = this.peek()
          if (cont === undefined || cont.indent <= indent) break
          const block = this.parseMapping(cont.indent)
          Object.assign(item, block)
        }
        out.push(item)
      } else {
        out.push(parseScalar(rest, line.no))
      }
    }
    return out
  }

  private parseMapping(indent: number): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    while (true) {
      const line = this.peek()
      if (line === undefined || line.indent !== indent) break
      if (line.text.startsWith('- ')) break
      this.next()
      this.consumePair(line.text, out, indent, line.no)
    }
    return out
  }

  private consumePair(text: string, out: Record<string, unknown>, parentIndent: number, lineNo: number): void {
    const colon = findColon(text)
    if (colon < 0) throw new YamlError('缺少冒号，无法识别为键值', lineNo)
    const key = text.slice(0, colon).trim()
    if (key === '') throw new YamlError('键名为空', lineNo)
    const rest = text.slice(colon + 1).trim()
    if (rest === '') {
      const next = this.peek()
      out[key] = next !== undefined && next.indent > parentIndent ? this.parseBlock(next.indent) : null
      return
    }
    if (rest === '|' || rest === '|-') {
      out[key] = this.blockScalar(parentIndent)
      return
    }
    out[key] = parseScalar(rest, lineNo)
  }

  private blockScalar(parentIndent: number): string {
    const collected: Line[] = []
    while (true) {
      const line = this.peek()
      if (line === undefined || line.indent <= parentIndent) break
      collected.push(this.next())
    }
    if (collected.length === 0) return ''
    const min = Math.min(...collected.map((line) => line.indent))
    return collected.map((line) => line.text.slice(min - line.indent)).join('\n')
  }
}

function isMappingStart(text: string): boolean {
  return findColon(text) >= 0 && !text.startsWith('[') && !text.startsWith('{')
}

function findColon(text: string): number {
  let quote: '"' | "'" | undefined
  let depth = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quote !== undefined) {
      if (ch === quote) quote = undefined
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '[' || ch === '{') depth += 1
    if (ch === ']' || ch === '}') depth -= 1
    if (ch === ':' && depth === 0) return i
  }
  return -1
}

function parseScalar(text: string, line: number): unknown {
  const value = text.trim()
  if (value === '' || value === 'null' || value === 'Null' || value === 'NULL' || value === '~') return null
  if (value === 'true' || value === 'True' || value === 'TRUE') return true
  if (value === 'false' || value === 'False' || value === 'FALSE') return false
  if (value.startsWith('"') || value.startsWith("'")) return parseQuoted(value, line)
  if (value.startsWith('[')) return parseFlowArray(value, line)
  if (value.startsWith('{')) return parseFlowMap(value, line)
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value)
  return value
}

function parseQuoted(value: string, line: number): string {
  const quote = value[0]
  if (value.length < 2 || value[value.length - 1] !== quote) throw new YamlError('引号未闭合', line)
  const body = value.slice(1, -1)
  if (quote === '"') {
    try {
      return JSON.parse(`"${body.replace(/"/g, '\\"').replace(/\\"/g, '"')}"`) as string
    } catch {
      return body.replace(/\\"/g, '"').replace(/\\n/g, '\n')
    }
  }
  return body.replace(/''/g, "'")
}

function splitFlow(text: string): string[] {
  const parts: string[] = []
  let quote: '"' | "'" | undefined
  let depth = 0
  let start = 0
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (quote !== undefined) {
      if (ch === quote) quote = undefined
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '[' || ch === '{') depth += 1
    else if (ch === ']' || ch === '}') depth -= 1
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i))
      start = i + 1
    }
  }
  parts.push(text.slice(start))
  return parts.map((part) => part.trim()).filter((part) => part !== '')
}

function parseFlowArray(value: string, line: number): unknown[] {
  if (!value.endsWith(']')) throw new YamlError('数组未闭合', line)
  return splitFlow(value.slice(1, -1)).map((part) => parseScalar(part, line))
}

function parseFlowMap(value: string, line: number): Record<string, unknown> {
  if (!value.endsWith('}')) throw new YamlError('对象未闭合', line)
  const out: Record<string, unknown> = {}
  for (const part of splitFlow(value.slice(1, -1))) {
    const colon = findColon(part)
    if (colon < 0) throw new YamlError(`内联对象缺少冒号：${part}`, line)
    out[part.slice(0, colon).trim()] = parseScalar(part.slice(colon + 1).trim(), line)
  }
  return out
}

/** Parse a YAML subset. Throws {@link YamlError} with a source line. */
export function parseYaml(text: string): unknown {
  return new Parser(tokenize(text)).parseDocument()
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function scalar(value: string | number | boolean | null): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null'
  if (value === '') return '""'
  if (
    /^(true|false|null|~|-?\d+(?:\.\d+)?)$/i.test(value)
    || /^[\[\]{}&*!|>'"%@`#]/.test(value)
    || value.startsWith('- ')
    || /[:#]\s/.test(value)
    || /^\s|\s$/.test(value)
    || value.includes('\n')
  ) {
    return JSON.stringify(value)
  }
  return value
}

function pad(indent: number): string {
  return ' '.repeat(indent)
}

function dumpMapping(value: Record<string, unknown>, indent: number): string[] {
  const lines: string[] = []
  for (const [key, child] of Object.entries(value)) {
    const safeKey = /[:#\s]/.test(key) ? JSON.stringify(key) : key
    if (isScalar(child)) {
      lines.push(`${pad(indent)}${safeKey}: ${scalar(child)}`)
    } else if (typeof child === 'string') {
      lines.push(`${pad(indent)}${safeKey}: ${JSON.stringify(child)}`)
    } else if (Array.isArray(child)) {
      if (child.length === 0) lines.push(`${pad(indent)}${safeKey}: []`)
      else {
        lines.push(`${pad(indent)}${safeKey}:`)
        lines.push(...dumpSequence(child, indent + 2))
      }
    } else if (child !== null && typeof child === 'object') {
      const entries = Object.entries(child as Record<string, unknown>)
      if (entries.length === 0) lines.push(`${pad(indent)}${safeKey}: {}`)
      else {
        lines.push(`${pad(indent)}${safeKey}:`)
        lines.push(...dumpMapping(child as Record<string, unknown>, indent + 2))
      }
    } else {
      lines.push(`${pad(indent)}${safeKey}: null`)
    }
  }
  return lines
}

function dumpSequence(value: unknown[], indent: number): string[] {
  const lines: string[] = []
  for (const item of value) {
    if (isScalar(item)) {
      lines.push(`${pad(indent)}- ${scalar(item)}`)
    } else if (Array.isArray(item)) {
      if (item.length === 0) lines.push(`${pad(indent)}- []`)
      else {
        lines.push(`${pad(indent)}-`)
        lines.push(...dumpSequence(item, indent + 2))
      }
    } else if (item !== null && typeof item === 'object') {
      const entries = Object.entries(item as Record<string, unknown>)
      if (entries.length === 0) {
        lines.push(`${pad(indent)}- {}`)
        continue
      }
      const [firstKey, firstValue] = entries[0]!
      const key = /[:#\s]/.test(firstKey) ? JSON.stringify(firstKey) : firstKey
      if (isScalar(firstValue) || (typeof firstValue === 'string' && !firstValue.includes('\n'))) {
        lines.push(`${pad(indent)}- ${key}: ${scalar(firstValue as string | number | boolean | null)}`)
      } else if (firstValue !== null && typeof firstValue === 'object' && !Array.isArray(firstValue)) {
        const nested = dumpMapping(firstValue as Record<string, unknown>, indent + 4)
        lines.push(`${pad(indent)}- ${key}:`)
        lines.push(...nested)
      } else if (Array.isArray(firstValue)) {
        lines.push(`${pad(indent)}- ${key}:`)
        lines.push(...dumpSequence(firstValue, indent + 4))
      } else {
        lines.push(`${pad(indent)}- ${key}: null`)
      }
      for (const [otherKey, otherValue] of entries.slice(1)) {
        const safeKey = /[:#\s]/.test(otherKey) ? JSON.stringify(otherKey) : otherKey
        if (isScalar(otherValue)) {
          lines.push(`${pad(indent + 2)}${safeKey}: ${scalar(otherValue)}`)
        } else if (Array.isArray(otherValue)) {
          if (otherValue.length === 0) lines.push(`${pad(indent + 2)}${safeKey}: []`)
          else {
            lines.push(`${pad(indent + 2)}${safeKey}:`)
            lines.push(...dumpSequence(otherValue, indent + 4))
          }
        } else {
          lines.push(`${pad(indent + 2)}${safeKey}:`)
          lines.push(...dumpMapping(otherValue as Record<string, unknown>, indent + 4))
        }
      }
    } else {
      lines.push(`${pad(indent)}- null`)
    }
  }
  return lines
}

/** Serialize a value as the same YAML subset the parser accepts. */
export function dumpYaml(value: unknown): string {
  if (value === null || isScalar(value)) return `${scalar(value)}\n`
  if (Array.isArray(value)) return `${dumpSequence(value, 0).join('\n')}\n`
  return `${dumpMapping(value as Record<string, unknown>, 0).join('\n')}\n`
}
