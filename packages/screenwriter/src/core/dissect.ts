/** 竞品拆解.md: one `## title` section per reference drama. */

import { ProjectError } from './errors.js'
import { parseFrontmatter, splitSections, yamlBlockOf } from './markdown.js'
import { dumpYaml, parseYaml } from './yaml.js'
import type { Dissection } from './types.js'
import { DISSECT_FILE } from './paths.js'

function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => str(item)).filter((item) => item !== '')
}

export function readDissections(text: string, file = DISSECT_FILE): Dissection[] {
  const { body, bodyLine } = parseFrontmatter(text, file)
  const out: Dissection[] = []
  for (const section of splitSections(body, bodyLine)) {
    const block = yamlBlockOf(section.text)
    if (block === undefined) continue
    let data: Record<string, unknown>
    try {
      data = record(parseYaml(block))
    } catch (error) {
      throw new ProjectError(error instanceof Error ? error.message : String(error), file, section.line)
    }
    out.push({
      title: str(data.title) === '' ? section.title : str(data.title),
      platform: str(data.platform),
      episodes: Number(data.episodes ?? 0) || 0,
      logline: str(data.logline),
      opening: str(data.opening),
      stages: Array.isArray(data.stages)
        ? data.stages.map((item) => {
          const stage = record(item)
          return { range: str(stage.range), task: str(stage.task), emotion: str(stage.emotion) }
        })
        : [],
      hooks: strings(data.hooks),
      emotions: strings(data.emotions),
      reusable: strings(data.reusable),
      notes: section.text.replace(/```ya?ml[ \t]*\n[\s\S]*?```/i, '').trim(),
    })
  }
  return out
}

export function writeDissections(items: readonly Dissection[]): string {
  const lines: string[] = ['# 竞品拆解', '']
  for (const item of items) {
    lines.push(`## ${item.title}`, '', '```yaml')
    lines.push(dumpYaml({
      title: item.title,
      platform: item.platform,
      episodes: item.episodes,
      logline: item.logline,
      opening: item.opening,
      stages: item.stages,
      hooks: item.hooks,
      emotions: item.emotions,
      reusable: item.reusable,
    }).trimEnd())
    lines.push('```', '')
    if (item.notes !== '') lines.push(item.notes, '')
  }
  return `${lines.join('\n').trimEnd()}\n`
}
