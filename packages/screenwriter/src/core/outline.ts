/** 分集大纲/第NNN-MMM集.md: ten episodes per file, one `## 第N集` section each. */

import { ProjectError } from './errors.js'
import { parseFrontmatter, splitSections, yamlBlockOf } from './markdown.js'
import { dumpYaml, parseYaml } from './yaml.js'
import type { EpisodePlan, Mid, Open30 } from './types.js'
import { outlineBatchFor, outlineFileName } from './paths.js'

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

function open30Of(value: unknown): Open30 {
  const data = record(value)
  return { background: str(data.background), dilemma: str(data.dilemma), motive: str(data.motive) }
}

function midOf(value: unknown): Mid {
  const data = record(value)
  return { advance: str(data.advance), relation: str(data.relation), foreshadow: str(data.foreshadow) }
}

export function readOutline(text: string, file: string): EpisodePlan[] {
  const { body, bodyLine } = parseFrontmatter(text, file)
  const sections = splitSections(body, bodyLine)
  const out: EpisodePlan[] = []
  for (const section of sections) {
    const match = /^第\s*(\d+)\s*集\s*(.*)$/u.exec(section.title)
    if (match === null) continue
    const block = yamlBlockOf(section.text)
    if (block === undefined) throw new ProjectError(`第 ${match[1]} 集缺少 yaml 块`, file, section.line)
    let data: Record<string, unknown>
    try {
      data = record(parseYaml(block))
    } catch (error) {
      throw new ProjectError(error instanceof Error ? error.message : String(error), file, section.line)
    }
    const notes = section.text.replace(/```ya?ml[ \t]*\n[\s\S]*?```/i, '').trim()
    out.push({
      number: Number(match[1]),
      title: (match[2] ?? '').trim(),
      stage: Number(data.stage ?? 1) || 1,
      goal: str(data.goal),
      conflict: str(data.conflict),
      emotion: str(data.emotion) === '' ? '其他' : str(data.emotion),
      size: data.size === '大' ? '大' : '小',
      infoGap: str(data.infoGap),
      hookType: str(data.hookType),
      hook: str(data.hook),
      open30: open30Of(data.open30),
      mid: midOf(data.mid),
      close30: str(data.close30),
      cast: strings(data.cast),
      locations: strings(data.locations),
      notes,
    })
  }
  return out
}

export function validatePlan(plan: EpisodePlan): string[] {
  const missing: string[] = []
  for (const [key, value] of Object.entries({
    goal: plan.goal,
    conflict: plan.conflict,
    emotion: plan.emotion,
    infoGap: plan.infoGap,
    hookType: plan.hookType,
    hook: plan.hook,
    close30: plan.close30,
  })) {
    if (String(value).trim() === '') missing.push(key)
  }
  if (plan.open30.background === '' || plan.open30.dilemma === '' || plan.open30.motive === '') missing.push('open30')
  if (plan.mid.advance === '' || plan.mid.relation === '' || plan.mid.foreshadow === '') missing.push('mid')
  if (plan.cast.length === 0) missing.push('cast')
  if (plan.locations.length === 0) missing.push('locations')
  return missing
}

export function writeBatch(plans: readonly EpisodePlan[], updatedAt: string, batch: { from: number; to: number }): { file: string; text: string } {
  const sorted = [...plans].filter((plan) => plan.number >= batch.from && plan.number <= batch.to).sort((a, b) => a.number - b.number)
  const lines: string[] = [
    '---',
    `range: [${String(batch.from)}, ${String(batch.to)}]`,
    `updatedAt: ${updatedAt}`,
    '---',
    '',
    `# 分集大纲 第${String(batch.from)}–${String(batch.to)}集`,
    '',
  ]
  for (const plan of sorted) {
    lines.push(`## 第${String(plan.number)}集${plan.title === '' ? '' : ` ${plan.title}`}`, '', '```yaml')
    lines.push(dumpYaml({
      stage: plan.stage,
      goal: plan.goal,
      conflict: plan.conflict,
      emotion: plan.emotion,
      size: plan.size,
      infoGap: plan.infoGap,
      hookType: plan.hookType,
      hook: plan.hook,
      open30: plan.open30,
      mid: plan.mid,
      close30: plan.close30,
      cast: plan.cast,
      locations: plan.locations,
    }).trimEnd())
    lines.push('```', '')
    if (plan.notes.trim() !== '') lines.push(plan.notes.trim(), '')
  }
  return { file: outlineFileName(batch.from, batch.to), text: `${lines.join('\n').trimEnd()}\n` }
}

export function writeAllBatches(plans: readonly EpisodePlan[], updatedAt: string): Array<{ file: string; text: string }> {
  const batches = new Map<string, { from: number; to: number }>()
  for (const plan of plans) {
    const batch = outlineBatchFor(plan.number)
    batches.set(`${String(batch.from)}-${String(batch.to)}`, batch)
  }
  return [...batches.values()]
    .sort((a, b) => a.from - b.from)
    .map((batch) => writeBatch(plans, updatedAt, batch))
}
