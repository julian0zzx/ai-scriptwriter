/** The file-first project store: load a tree, save one layer at a time. */

import { readCharacters, writeCharacters } from '../core/cast.js'
import { readDissections, writeDissections } from '../core/dissect.js'
import { ProjectError } from '../core/errors.js'
import { finding } from '../core/findings.js'
import {
  CHECK_SUMMARY_FILE,
  DISSECT_FILE,
  LAST_CHECK_FILE,
  OUTLINE_DIR,
  PROJECT_FILE,
  STORY_FILE,
  CAST_FILE,
  EPISODES_DIR,
  outlineBatchFor,
  outlineFileName,
  reportFileName,
  scriptFileName,
  timestamp,
} from '../core/paths.js'
import { normalizeSettings } from '../core/project.js'
import { readOutline, writeBatch } from '../core/outline.js'
import { parseScript, renderScript } from '../core/script.js'
import { emptyStory, readStory, writeStory } from '../core/story.js'
import type {
  Character,
  Confirmation,
  ConfirmationKind,
  Dissection,
  EpisodePlan,
  Project,
  ProjectSettings,
  ScriptDoc,
  ScriptStatus,
  Story,
} from '../core/types.js'
import { normalizeStatus } from '../core/enums.js'
import type { LastCheck } from '../core/status.js'
import type { FsCallOptions, TextFs } from './text-fs.js'
import { parseFrontmatter } from '../core/markdown.js'
import { dumpYaml } from '../core/yaml.js'

export interface StoreOptions {
  now?: () => Date
}

export class ProjectStore {
  private readonly now: () => Date

  constructor(
    private readonly fs: TextFs,
    readonly root: string,
    options: StoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date())
  }

  async readFile(path: string, options?: FsCallOptions): Promise<string | undefined> {
    return this.fs.read(path, options)
  }

  async writeFile(path: string, text: string, options?: FsCallOptions): Promise<void> {
    await this.fs.write(path, text, options)
  }

  async exists(path: string, options?: FsCallOptions): Promise<boolean> {
    return (await this.fs.stat(path, options)) !== undefined
  }

  async load(options?: FsCallOptions): Promise<Project | undefined> {
    const settings = await this.loadSettings(options)
    if (settings === undefined) return undefined
    const story = await this.loadStory(options)
    const characters = await this.loadCharacters(options)
    const plans = await this.loadPlans(options)
    const scripts = await this.loadScripts(characters, plans, settings, options)
    const dissections = await this.loadDissections(options)
    return {
      root: this.root,
      settings,
      story,
      characters,
      plans,
      scripts,
      dissections,
      confirmations: await this.loadConfirmations(options),
    }
  }

  async loadSettings(options?: FsCallOptions): Promise<ProjectSettings | undefined> {
    const text = await this.fs.read(PROJECT_FILE, options)
    if (text === undefined) return undefined
    try {
      return normalizeSettings(JSON.parse(text))
    } catch (error) {
      throw new ProjectError(error instanceof Error ? error.message : String(error), PROJECT_FILE)
    }
  }

  async loadStory(options?: FsCallOptions): Promise<Story> {
    const text = await this.fs.read(STORY_FILE, options)
    return text === undefined ? emptyStory() : readStory(text, STORY_FILE)
  }

  async loadCharacters(options?: FsCallOptions): Promise<Character[]> {
    const text = await this.fs.read(CAST_FILE, options)
    return text === undefined ? [] : readCharacters(text, CAST_FILE)
  }

  async loadPlans(options?: FsCallOptions): Promise<Map<number, EpisodePlan>> {
    const files = (await this.fs.list(OUTLINE_DIR, options)).filter((name) => name.endsWith('.md'))
    const plans = new Map<number, EpisodePlan>()
    for (const file of files) {
      const text = await this.fs.read(`${OUTLINE_DIR}/${file}`, options)
      if (text === undefined) continue
      const parsed = readOutline(text, `${OUTLINE_DIR}/${file}`)
      for (const plan of parsed) plans.set(plan.number, plan)
    }
    return plans
  }

  async loadScripts(
    characters: readonly Character[],
    plans: ReadonlyMap<number, EpisodePlan>,
    settings: ProjectSettings,
    options?: FsCallOptions,
  ): Promise<Map<number, ScriptDoc>> {
    const files = (await this.fs.list(EPISODES_DIR, options)).filter((name) => name.endsWith('.md'))
    const scripts = new Map<number, ScriptDoc>()
    for (const name of files) {
      const file = `${EPISODES_DIR}/${name}`
      const text = await this.fs.read(file, options)
      if (text === undefined) continue
      const front = parseFrontmatter(text, file)
      const parsed = parseScript(front.body, {
        file,
        characters: characters.map((character) => character.name),
        charsPerSecond: settings.charsPerSecond,
      })
      const fileNameEpisode = (/第(\d+)集/u.exec(name) ?? [])[1]
      const episode = Number(front.data.episode ?? fileNameEpisode ?? parsed.episode)
      if (!Number.isFinite(episode) || episode <= 0) throw new ProjectError('无法确定集号', file, 1)
      const plan = plans.get(episode)
      const findings = [...parsed.findings]
      if (parsed.episode !== 0 && parsed.episode !== episode) {
        findings.push(finding({
          code: 'FMT-010', severity: 'error', ruleRef: 'DR-13',
          message: `文件是第 ${String(episode)} 集，正文写的是第 ${String(parsed.episode)} 集`,
          file, episode,
        }))
      }
      const status = normalizeStatus(String(front.data.status ?? 'draft'))
      const doc: ScriptDoc = {
        episode,
        title: String(front.data.title ?? parsed.title ?? ''),
        status: status as ScriptStatus,
        header: parsed.header,
        scenes: parsed.scenes,
        hookType: String(front.data.hookType ?? plan?.hookType ?? ''),
        hookScene: String(front.data.hookScene ?? parsed.hookScene),
        words: parsed.words,
        seconds: parsed.seconds,
        file,
        updatedAt: String(front.data.updatedAt ?? this.now().toISOString()),
        rawBody: front.body,
        findings,
      }
      scripts.set(episode, doc)
    }
    return scripts
  }

  async loadDissections(options?: FsCallOptions): Promise<Dissection[]> {
    const text = await this.fs.read(DISSECT_FILE, options)
    return text === undefined ? [] : readDissections(text, DISSECT_FILE)
  }

  async loadConfirmations(options?: FsCallOptions): Promise<Confirmation[]> {
    const text = await this.fs.read(PROJECT_FILE, options)
    if (text === undefined) return []
    try {
      const raw = JSON.parse(text) as Record<string, unknown>
      if (!Array.isArray(raw.confirmations)) return []
      return raw.confirmations.flatMap((entry): Confirmation[] => {
        if (entry === null || typeof entry !== 'object') return []
        const data = entry as Record<string, unknown>
        const kind = data.kind
        if (kind !== 'settings' && kind !== 'opening' && kind !== 'episode' && kind !== 'delivery') return []
        return [{
          kind: kind as ConfirmationKind,
          at: String(data.at ?? ''),
          summary: String(data.summary ?? ''),
          userWords: String(data.userWords ?? ''),
          episodes: Array.isArray(data.episodes) ? data.episodes.map(Number).filter((value) => Number.isFinite(value)) : [],
        }]
      })
    } catch {
      return []
    }
  }

  async init(settings: ProjectSettings, overwrite = false, options?: FsCallOptions): Promise<{ created: boolean; files: string[] }> {
    const existing = await this.fs.read(PROJECT_FILE, options)
    if (existing !== undefined && !overwrite) return { created: false, files: [] }
    const files: string[] = []
    const previous = existing === undefined ? {} : safeJson(existing)
    await this.writeSettings(settings, previous, options)
    files.push(PROJECT_FILE)
    if (!(await this.exists(STORY_FILE, options))) {
      await this.fs.write(STORY_FILE, writeStory(emptyStory(), this.now().toISOString()), options)
      files.push(STORY_FILE)
    }
    if (!(await this.exists(CAST_FILE, options))) {
      await this.fs.write(CAST_FILE, writeCharacters([]), options)
      files.push(CAST_FILE)
    }
    if (!(await this.exists(DISSECT_FILE, options))) {
      await this.fs.write(DISSECT_FILE, writeDissections([]), options)
      files.push(DISSECT_FILE)
    }
    return { created: true, files }
  }

  private async writeSettings(settings: ProjectSettings, previous: Record<string, unknown>, options?: FsCallOptions): Promise<void> {
    const payload = {
      ...previous,
      ...settings,
      updatedAt: this.now().toISOString(),
      confirmations: Array.isArray(previous.confirmations) ? previous.confirmations : [],
      reports: previous.reports ?? {},
    }
    await this.fs.write(PROJECT_FILE, `${JSON.stringify(payload, null, 2)}\n`, options)
  }

  async saveStory(story: Story, options?: FsCallOptions): Promise<void> {
    const previous = await this.fs.read(STORY_FILE, options)
    await this.fs.write(STORY_FILE, writeStory(story, this.now().toISOString(), previous), options)
  }

  async saveCharacters(characters: readonly Character[], options?: FsCallOptions): Promise<void> {
    await this.fs.write(CAST_FILE, writeCharacters(characters), options)
  }

  async saveDissections(items: readonly Dissection[], options?: FsCallOptions): Promise<void> {
    await this.fs.write(DISSECT_FILE, writeDissections(items), options)
  }

  async savePlans(plans: readonly EpisodePlan[], options?: FsCallOptions): Promise<string[]> {
    const batches = new Map<string, { from: number; to: number }>()
    for (const plan of plans) {
      const batch = outlineBatchFor(plan.number)
      batches.set(`${String(batch.from)}-${String(batch.to)}`, batch)
    }
    const written: string[] = []
    for (const batch of [...batches.values()].sort((a, b) => a.from - b.from)) {
      const file = outlineFileName(batch.from, batch.to)
      const text = await this.fs.read(file, options)
      const merged = new Map<number, EpisodePlan>()
      if (text !== undefined) for (const plan of readOutline(text, file)) merged.set(plan.number, plan)
      for (const plan of plans) {
        if (plan.number >= batch.from && plan.number <= batch.to) merged.set(plan.number, plan)
      }
      await this.fs.write(file, writeBatch([...merged.values()], this.now().toISOString(), batch).text, options)
      written.push(file)
    }
    return written
  }

  async removePlan(number: number, options?: FsCallOptions): Promise<string> {
    const batch = outlineBatchFor(number)
    const file = outlineFileName(batch.from, batch.to)
    const text = await this.fs.read(file, options)
    const plans = text === undefined ? [] : readOutline(text, file).filter((plan) => plan.number !== number)
    await this.fs.write(file, writeBatch(plans, this.now().toISOString(), batch).text, options)
    return file
  }

  async saveScript(doc: ScriptDoc, options?: FsCallOptions): Promise<string> {
    const file = scriptFileName(doc.episode, doc.title)
    const front = dumpYaml({
      episode: doc.episode,
      title: doc.title,
      status: doc.status,
      seconds: doc.seconds,
      words: doc.words,
      hookType: doc.hookType,
      hookScene: doc.hookScene,
      updatedAt: this.now().toISOString(),
    }).trimEnd()
    await this.fs.write(file, `---\n${front}\n---\n\n${renderScript(doc)}`, options)
    return file
  }

  async saveConfirmation(confirmation: Confirmation, options?: FsCallOptions): Promise<void> {
    const text = await this.fs.read(PROJECT_FILE, options)
    if (text === undefined) throw new ProjectError('项目还未初始化', PROJECT_FILE)
    const raw = safeJson(text)
    const list = Array.isArray(raw.confirmations) ? raw.confirmations : []
    raw.confirmations = [...list, confirmation]
    raw.updatedAt = this.now().toISOString()
    await this.fs.write(PROJECT_FILE, `${JSON.stringify(raw, null, 2)}\n`, options)
  }

  async writeCheckResult(report: string, scope: string, last: { at: string; counts: { error: number; warn: number; info: number }; episodes: number[] }, options?: FsCallOptions): Promise<string> {
    const path = reportFileName('check', timestamp(this.now()), scope)
    await this.fs.write(path, report, options)
    await this.fs.write(CHECK_SUMMARY_FILE, report, options)
    await this.fs.write(LAST_CHECK_FILE, `${JSON.stringify(last, null, 2)}\n`, options)
    return path
  }

  async writeReviewReport(text: string, scope: string, options?: FsCallOptions): Promise<string> {
    const path = reportFileName('review', timestamp(this.now()), scope)
    await this.fs.write(path, text, options)
    return path
  }

  async readLastCheck(options?: FsCallOptions): Promise<LastCheck | undefined> {
    const text = await this.fs.read(LAST_CHECK_FILE, options)
    if (text === undefined) return undefined
    try {
      const raw = JSON.parse(text) as Record<string, unknown>
      const counts = raw.counts as Record<string, unknown> | undefined
      return {
        at: String(raw.at ?? ''),
        counts: {
          error: Number(counts?.error ?? 0),
          warn: Number(counts?.warn ?? 0),
          info: Number(counts?.info ?? 0),
        },
      }
    } catch {
      return undefined
    }
  }
}

function safeJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
