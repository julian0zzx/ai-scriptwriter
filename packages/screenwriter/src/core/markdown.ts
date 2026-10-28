/** Frontmatter, `##` sections, fenced YAML and tables — the project's Markdown dialect. */

import { ProjectError } from './errors.js'
import { parseYaml, YamlError } from './yaml.js'

export interface Section {
  title: string
  text: string
  line: number
}

export interface Frontmatter {
  data: Record<string, unknown>
  body: string
  bodyLine: number
}

export function parseFrontmatter(text: string, file = 'file'): Frontmatter {
  const normalized = text.replace(/\r\n?/g, '\n')
  if (!normalized.startsWith('---\n')) return { data: {}, body: normalized, bodyLine: 1 }
  const end = normalized.indexOf('\n---\n', 4)
  if (end < 0) throw new ProjectError('frontmatter 未闭合（缺少结束的 ---）', file, 1)
  const raw = normalized.slice(4, end)
  let data: Record<string, unknown> = {}
  try {
    const parsed = parseYaml(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>
  } catch (error) {
    if (error instanceof YamlError) throw new ProjectError(error.message, file, error.line + 1)
    throw error
  }
  const bodyStart = end + 5
  return { data, body: normalized.slice(bodyStart), bodyLine: normalized.slice(0, bodyStart).split('\n').length }
}

export function splitSections(body: string, startLine = 1): Section[] {
  const lines = body.split('\n')
  const sections: Section[] = []
  let current: Section | undefined
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    const match = /^##\s+(.+?)\s*$/.exec(line)
    if (match !== null) {
      if (current !== undefined) current.text = current.text.replace(/\s+$/u, '')
      current = { title: match[1] ?? '', text: '', line: startLine + i }
      sections.push(current)
      continue
    }
    if (current !== undefined) current.text += `${line}\n`
  }
  return sections
}

export function sectionOf(sections: readonly Section[], title: string): Section | undefined {
  return sections.find((section) => section.title === title)
}

export function sectionBody(sections: readonly Section[], title: string): string {
  return sectionOf(sections, title)?.text.trim() ?? ''
}

export function yamlBlockOf(text: string): string | undefined {
  const match = /```ya?ml[ \t]*\n([\s\S]*?)```/i.exec(text)
  return match?.[1]?.trim()
}

export function yamlBlock(sections: readonly Section[], title: string): string | undefined {
  return yamlBlockOf(sectionBody(sections, title))
}

export function bulletList(text: string): string[] {
  const out: string[] = []
  for (const line of text.split('\n')) {
    const match = /^\s*[-*]\s+(.+?)\s*$/.exec(line)
    if (match !== null) out.push(match[1] ?? '')
  }
  return out.filter((item) => item !== '')
}

export function tableRows(text: string): string[][] {
  const rows: string[][] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('|')) continue
    if (/^\|[\s:|-]+\|$/.test(trimmed)) continue
    const cells = trimmed.slice(1, -1).split('|').map((cell) => cell.trim())
    if (cells.length === 0) continue
    rows.push(cells)
  }
  return rows
}

/** Extract a heading's own line number (1-based) for diagnostics. */
export function lineOfHeading(body: string, title: string, startLine = 1): number | undefined {
  const lines = body.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    if (new RegExp(`^##\\s+${escapeRegExp(title)}\\s*$`).test(lines[i] ?? '')) return startLine + i
  }
  return undefined
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
