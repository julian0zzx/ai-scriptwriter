/** 故事大纲.md: one-sentence slots, core, differentiators, stages, promises. */

import { ProjectError } from './errors.js'
import {
  bulletList,
  parseFrontmatter,
  sectionBody,
  splitSections,
  tableRows,
  yamlBlock,
} from './markdown.js'
import { dumpYaml, parseYaml } from './yaml.js'
import type { PromiseEntry, Stage, Story } from './types.js'
import { STORY_FILE } from './paths.js'

const KNOWN = new Set(['一句话', '核心', '差异化', '对标', '阶段', '伏笔'])

export function emptyStory(): Story {
  return {
    sentence: '',
    protagonist: '',
    goal: '',
    obstacle: '',
    edge: '',
    desire: '',
    emotion: '',
    ending: '',
    differentiators: [],
    comparables: [],
    stages: [],
    promises: [],
  }
}

function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function yamlOf(text: string, file: string, line: number): unknown {
  try {
    return parseYaml(text)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ProjectError(message, file, line)
  }
}

export function readStory(text: string, file = STORY_FILE): Story {
  const { body, bodyLine } = parseFrontmatter(text, file)
  const sections = splitSections(body, bodyLine)
  const story = emptyStory()
  const one = yamlBlock(sections, '一句话')
  if (one !== undefined) {
    const data = asRecord(yamlOf(one, file, sections.find((section) => section.title === '一句话')?.line ?? 1))
    story.sentence = str(data.sentence)
    story.protagonist = str(data.protagonist)
    story.goal = str(data.goal)
    story.obstacle = str(data.obstacle)
    story.edge = str(data.edge)
  }
  const core = yamlBlock(sections, '核心')
  if (core !== undefined) {
    const data = asRecord(yamlOf(core, file, sections.find((section) => section.title === '核心')?.line ?? 1))
    story.desire = str(data.desire)
    story.emotion = str(data.emotion)
    story.ending = str(data.ending)
  }
  story.differentiators = bulletList(sectionBody(sections, '差异化'))
  story.comparables = bulletList(sectionBody(sections, '对标'))
  const stages = yamlBlock(sections, '阶段')
  if (stages !== undefined) {
    const parsed = yamlOf(stages, file, sections.find((section) => section.title === '阶段')?.line ?? 1)
    if (Array.isArray(parsed)) {
      story.stages = parsed.map((item, index) => normalizeStage(asRecord(item), index + 1))
    }
  }
  const promiseRows = tableRows(sectionBody(sections, '伏笔'))
  story.promises = promiseRows
    .filter((row) => row.length >= 5 && !/^id$/i.test(row[0] ?? ''))
    .map((row, index) => normalizePromise(row, index + 1))
    .filter((entry): entry is PromiseEntry => entry !== undefined)
  return story
}

function normalizeStage(data: Record<string, unknown>, fallbackIndex: number): Stage {
  return {
    index: Number(data.index ?? fallbackIndex),
    from: Number(data.from ?? 0),
    to: Number(data.to ?? 0),
    task: str(data.task),
    goal: str(data.goal),
    miniGoal: str(data.miniGoal),
    infoGap: str(data.infoGap),
  }
}

function episodeNumber(raw: string): number {
  const match = /(\d+)/u.exec(raw)
  return match === null ? 0 : Number(match[1])
}

function normalizePromise(row: string[], index: number): PromiseEntry | undefined {
  const status = (row[4] ?? '').trim()
  if (status !== '未回收' && status !== '已回收' && status !== '已放弃') return undefined
  return {
    id: (row[0] ?? `p-${String(index).padStart(3, '0')}`).trim(),
    plantedAt: episodeNumber(row[1] ?? ''),
    dueAt: episodeNumber(row[2] ?? ''),
    payoff: (row[3] ?? '').trim(),
    status,
  }
}

export function writeStory(story: Story, updatedAt: string, previous?: string): string {
  const unknown = previous === undefined ? [] : splitSections(parseFrontmatter(previous).body)
    .filter((section) => !KNOWN.has(section.title))
    .map((section) => `## ${section.title}\n\n${section.text.trim()}\n`)
  const sentence = story.sentence.trim() === ''
    ? [story.protagonist, story.goal, story.obstacle, story.edge].filter((part) => part.trim() !== '').join('；')
    : story.sentence
  const lines: string[] = [
    '---',
    `updatedAt: ${updatedAt}`,
    '---',
    '',
    '# 故事大纲',
    '',
    '## 一句话',
    '',
    '```yaml',
    dumpYaml({
      sentence,
      protagonist: story.protagonist,
      goal: story.goal,
      obstacle: story.obstacle,
      edge: story.edge,
    }).trimEnd(),
    '```',
    '',
    '## 核心',
    '',
    '```yaml',
    dumpYaml({ desire: story.desire, emotion: story.emotion, ending: story.ending }).trimEnd(),
    '```',
    '',
    '## 差异化',
    '',
    ...(story.differentiators.length === 0 ? ['（待补）'] : story.differentiators.map((item) => `- ${item}`)),
    '',
    '## 对标',
    '',
    ...(story.comparables.length === 0 ? [] : story.comparables.map((item) => `- ${item}`)),
    '',
    '## 阶段',
    '',
    '```yaml',
    dumpYaml(story.stages).trimEnd(),
    '```',
    '',
    '## 伏笔',
    '',
    '| id | 埋设 | 到期 | 回收 | 状态 |',
    '|---|---|---|---|---|',
    ...story.promises.map((entry) => `| ${entry.id} | 第${String(entry.plantedAt)}集 | 第${String(entry.dueAt)}集 | ${entry.payoff} | ${entry.status} |`),
    '',
  ]
  for (const extra of unknown) lines.push(extra.trimEnd(), '')
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}

export function storyComplete(story: Story): boolean {
  return story.protagonist !== '' && story.goal !== '' && story.obstacle !== '' && story.edge !== ''
    && story.desire !== '' && story.emotion !== '' && story.ending !== ''
}
