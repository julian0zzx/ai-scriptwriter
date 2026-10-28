/** 人物设定.md: one `## name` section per character with a YAML block. */

import { ProjectError } from './errors.js'
import { parseFrontmatter, splitSections, yamlBlockOf } from './markdown.js'
import { dumpYaml, parseYaml } from './yaml.js'
import type { Character, Relation } from './types.js'
import { CAST_FILE } from './paths.js'

function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function toRelations(value: unknown): Relation[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const data = record(item)
    const relation: Relation = { target: str(data.target), kind: str(data.kind) }
    if (str(data.note) !== '') relation.note = str(data.note)
    return relation
  }).filter((relation) => relation.target !== '' && relation.kind !== '')
}

export function readCharacters(text: string, file = CAST_FILE): Character[] {
  const { body, bodyLine } = parseFrontmatter(text, file)
  const sections = splitSections(body, bodyLine)
  const out: Character[] = []
  for (const section of sections) {
    if (section.title === '' || section.title === '人物设定') continue
    const block = yamlBlockOf(section.text)
    if (block === undefined) continue
    let data: Record<string, unknown>
    try {
      data = record(parseYaml(block))
    } catch (error) {
      throw new ProjectError(error instanceof Error ? error.message : String(error), file, section.line)
    }
    const name = str(data.name) === '' ? section.title : str(data.name)
    const notes = section.text.replace(/```ya?ml[ \t]*\n[\s\S]*?```/i, '').trim()
    out.push({
      name,
      role: str(data.role),
      camp: str(data.camp),
      desire: str(data.desire),
      painPoint: str(data.painPoint),
      personality: str(data.personality),
      voice: str(data.voice),
      arc: str(data.arc),
      costTier: str(data.costTier) === '' ? '配角' : str(data.costTier),
      firstEpisode: Number(data.firstEpisode ?? 1) || 1,
      exitEpisode: data.exitEpisode === null || data.exitEpisode === undefined ? null : Number(data.exitEpisode),
      relations: toRelations(data.relations),
      notes,
    })
  }
  return out
}

export function writeCharacters(characters: readonly Character[]): string {
  const lines: string[] = ['# 人物设定', '']
  for (const character of characters) {
    lines.push(`## ${character.name}`, '', '```yaml')
    lines.push(dumpYaml({
      name: character.name,
      role: character.role,
      camp: character.camp,
      desire: character.desire,
      painPoint: character.painPoint,
      personality: character.personality,
      voice: character.voice,
      arc: character.arc,
      costTier: character.costTier,
      firstEpisode: character.firstEpisode,
      exitEpisode: character.exitEpisode,
      relations: character.relations,
    }).trimEnd())
    lines.push('```', '')
    if (character.notes.trim() !== '') lines.push(character.notes.trim(), '')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

export function validateCharacter(character: Character): string[] {
  const missing: string[] = []
  for (const [key, value] of Object.entries({
    role: character.role,
    camp: character.camp,
    desire: character.desire,
    painPoint: character.painPoint,
    personality: character.personality,
    voice: character.voice,
    arc: character.arc,
    costTier: character.costTier,
  })) {
    if (String(value).trim() === '') missing.push(key)
  }
  return missing
}
