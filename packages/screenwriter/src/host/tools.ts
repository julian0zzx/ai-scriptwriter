/** The 11 model-facing tools. */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ParameterPropertySpec, type ParameterSchemaSpec, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { CAMPS, COST_TIERS, INFO_GAPS, ROLES, normalizeHookType, normalizeStatus } from '../core/enums.js'
import { ProjectError } from '../core/errors.js'
import { deriveStage, confirmationPrereqs, nextBlockers, scriptGate, submissionGate } from '../core/gates.js'
import { runChecks } from '../core/checks.js'
import { buildDashboard } from '../core/status.js'
import { createSettings } from '../core/project.js'
import { parseScript, renderScript } from '../core/script.js'
import { submissionMarkdown, scriptsMarkdown, outlineMarkdown } from '../core/export.js'
import { CRAFT_IDS, craftIndex, craftTopic } from '../core/craft.js'
import { buildReviewRequest, parseReviewResponse, reviewReport, REVIEW_KINDS, type ReviewKind } from '../core/review.js'
import { validatePlan } from '../core/outline.js'
import type { Character, Confirmation, ConfirmationKind, Dissection, EpisodePlan, Finding, Project, Relation, Stage } from '../core/types.js'
import type { PluginConfig } from './config.js'
import { callModel } from './llm.js'
import { ProjectResolver } from './resolver.js'
import type { ProjectStore } from './store.js'

const str = (description: string, required = false): ParameterPropertySpec => ({ type: 'string', description, ...(required ? { required: true } : {}) })
const int = (description: string, required = false): ParameterPropertySpec => ({ type: 'integer', description, ...(required ? { required: true } : {}) })
const bool = (description: string, required = false): ParameterPropertySpec => ({ type: 'boolean', description, ...(required ? { required: true } : {}) })
const arr = (description: string, required = false): ParameterPropertySpec => ({ type: 'array', description, items: { type: 'string' }, ...(required ? { required: true } : {}) })
const json = (description: string, required = false): ParameterPropertySpec => ({ type: 'json', description, ...(required ? { required: true } : {}) })

class ToolFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly unblock: string[] = [],
  ) {
    super(message)
    this.name = 'ToolFailure'
  }
}

interface ToolDeps {
  ctx: Context
  config: PluginConfig
  resolver: ProjectResolver
}

interface EnvelopeInput {
  tool: string
  operation?: string
  root: string
  project?: Project | undefined
  summary: string
  data?: unknown
  findings?: Finding[]
  warnings?: string[]
  blockers?: Array<{ code: string; message: string; unblock: string[] }>
  next?: string[]
}

function projectInfo(project: Project | undefined, root: string) {
  return {
    title: project?.settings.title ?? '',
    root,
    plannedEpisodes: project?.settings.episodes ?? 0,
  }
}

function envelope(input: EnvelopeInput): Record<string, unknown> {
  return {
    ok: true,
    tool: input.tool,
    ...(input.operation === undefined ? {} : { operation: input.operation }),
    stage: input.project === undefined ? 'setup' : deriveStage(input.project),
    project: projectInfo(input.project, input.root),
    summary: input.summary,
    ...(input.data === undefined ? {} : { data: input.data }),
    ...(input.findings === undefined ? {} : { findings: input.findings }),
    ...(input.warnings === undefined || input.warnings.length === 0 ? {} : { warnings: input.warnings }),
    ...(input.blockers === undefined ? {} : { blockers: input.blockers }),
    next: input.next ?? [],
  }
}

function refusal(tool: string, operation: string | undefined, root: string, project: Project | undefined, failure: ToolFailure): Record<string, unknown> {
  return {
    ok: false,
    tool,
    ...(operation === undefined ? {} : { operation }),
    stage: project === undefined ? 'setup' : deriveStage(project),
    project: projectInfo(project, root),
    summary: failure.message,
    blockers: [{ code: failure.code, message: failure.message, unblock: failure.unblock }],
    next: failure.unblock.length === 0 ? ['scriptwriter_status detail=dashboard'] : failure.unblock,
  }
}

function sessionOf(exec: ToolRunContext): { header?: { cwd?: string } } | undefined {
  return (exec.agent as unknown as { session?: { header?: { cwd?: string } } } | undefined)?.session
}

function render(value: unknown): string {
  if (typeof value === 'string') return value
  const record = value as Record<string, unknown>
  if (record?.ok === false) {
    const blockers = Array.isArray(record.blockers) ? record.blockers as Array<Record<string, unknown>> : []
    return [
      `❌ ${String(record.summary ?? '操作被拒绝')}`,
      ...blockers.map((blocker) => `- [${String(blocker.code)}] ${String(blocker.message)}\n  解锁：${Array.isArray(blocker.unblock) ? (blocker.unblock as string[]).join(' / ') : ''}`),
      '',
      JSON.stringify(value, null, 2),
    ].join('\n')
  }
  return `${String(record?.summary ?? '')}\n\n${JSON.stringify(value, null, 2)}`
}

function tool(
  deps: ToolDeps,
  name: string,
  description: string,
  parameters: ParameterSchemaSpec,
  handler: (args: Record<string, any>, exec: ToolRunContext) => Promise<Record<string, unknown>>,
) {
  return defineTool({
    name,
    description,
    parameters,
    output: {
      schema: { type: 'json' },
      render: (_args: Record<string, unknown>, value: unknown) => [{ type: 'text' as const, text: render(value) }],
    },
    execute: async (args: Record<string, unknown>, exec: ToolRunContext) => {
      try {
        return (await handler(args as Record<string, any>, exec)) as never
      } catch (error) {
        const session = sessionOf(exec)
        const root = deps.resolver.rootFor(session).root
        if (error instanceof ToolFailure) return refusal(name, undefined, root, undefined, error) as never
        if (error instanceof ProjectError) {
          return refusal(name, undefined, root, undefined, new ToolFailure('PARSE_ERROR', error.message, ['检查文件语法后重试'])) as never
        }
        throw error
      }
    },
  } as never)
}

function requireString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || value.trim() === '') throw new ToolFailure('MISSING_ARG', `缺少参数 ${key}`, [])
  return value.trim()
}

function optionalString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value.trim() : ''
}

function optionalInt(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key]
  if (value === undefined || value === null || value === '') return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function requireInt(args: Record<string, unknown>, key: string): number {
  const value = optionalInt(args, key)
  if (value === undefined) throw new ToolFailure('MISSING_ARG', `缺少参数 ${key}`, [])
  return value
}

function objectArray<T>(value: unknown, key: string): T[] {
  if (!Array.isArray(value)) throw new ToolFailure('MISSING_ARG', `${key} 必须是数组`, [])
  return value as T[]
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter((item) => item !== '') : []
}

async function loadOrFail(deps: ToolDeps, exec: ToolRunContext): Promise<{ store: ProjectStore; project: Project; root: string; session: ReturnType<typeof sessionOf> }> {
  const session = sessionOf(exec)
  const store = deps.resolver.storeForSession(session)
  const project = await store.load({ session, signal: exec.signal })
  if (project === undefined) {
    throw new ToolFailure('NOT_FOUND', '当前工作区还没有短剧项目', ['scriptwriter_init title=... platform=... genre=[...] audience=...'])
  }
  return { store, project, root: store.root, session }
}

function nextAfter(project: Project): string[] {
  return nextBlockers(project).flatMap((blocker) => blocker.unblock).slice(0, 4)
}

export function registerTools(ctx: Context, config: PluginConfig, resolver: ProjectResolver): void {
  const deps: ToolDeps = { ctx, config, resolver }

  ctx.tools.register(tool(deps, 'scriptwriter_init',
    '创建/读取短剧项目，设置平台、题材、受众、集数与单集秒数。已有项目默认不覆盖。',
    {
      title: str('剧名', true),
      platform: str('平台：红果/抖音/快手/其他', true),
      genre: arr('题材标签，至少一个', true),
      audience: str('受众：男频/女频/通用，可带人群描述', true),
      episodes: int('计划集数，默认 80，范围 10–150'),
      secondsPerEpisode: int('单集目标秒数，默认 90，范围 60–180'),
      budgetTier: { type: 'string', enum: ['low', 'medium', 'high'], description: '成本档，默认 low' },
      wordMin: int('单集字数下限，默认 500'),
      wordMax: int('单集字数上限，默认 800'),
      logline: str('一句话（可后补）'),
      overwrite: bool('显式覆盖已有设置（不删内容文件）'),
    },
    async (args, exec) => {
      const session = sessionOf(exec)
      const store = deps.resolver.storeForSession(session)
      const genre = stringArray(args.genre)
      if (genre.length === 0) throw new ToolFailure('MISSING_ARG', 'genre 至少一个题材标签', ['scriptwriter_init ... genre=["重生","复仇"]'])
      const wordMin = optionalInt(args, 'wordMin') ?? 500
      const wordMax = optionalInt(args, 'wordMax') ?? 800
      if (wordMin >= wordMax) throw new ToolFailure('CONFLICT', 'wordMin 必须小于 wordMax', [])
      const episodesInput = optionalInt(args, 'episodes')
      if (episodesInput !== undefined && (episodesInput < 10 || episodesInput > 150)) throw new ToolFailure('CONFLICT', 'episodes 必须在 10–150 之间', [])
      const secondsInput = optionalInt(args, 'secondsPerEpisode')
      if (secondsInput !== undefined && (secondsInput < 60 || secondsInput > 180)) throw new ToolFailure('CONFLICT', 'secondsPerEpisode 必须在 60–180 之间', [])
      const settings = createSettings({
        title: requireString(args, 'title'),
        platform: requireString(args, 'platform'),
        genre,
        audience: requireString(args, 'audience'),
        episodes: optionalInt(args, 'episodes'),
        secondsPerEpisode: optionalInt(args, 'secondsPerEpisode'),
        budgetTier: args.budgetTier === 'medium' || args.budgetTier === 'high' ? args.budgetTier : 'low',
        wordWindow: {
          min: wordMin,
          max: wordMax,
        },
        charsPerSecond: 5.5,
      })
      const result = await store.init(settings, args.overwrite === true, { session, signal: exec.signal })
      const project = await store.load({ session, signal: exec.signal })
      if (project === undefined) throw new ToolFailure('IO_ERROR', '初始化后无法读取项目', [])
      return envelope({
        tool: 'scriptwriter_init',
        root: store.root,
        project,
        summary: result.created ? `已创建《${settings.title}》` : `《${project.settings.title}》已存在，未覆盖`,
        data: { created: result.created, files: result.files, settings },
        warnings: result.created ? [] : ['项目已存在；如需改设置，用 overwrite=true（不会删除内容）'],
        next: result.created ? ['scriptwriter_story operation=pitch ...', 'scriptwriter_cast operation=upsert ...'] : nextAfter(project),
      })
    },
  ))

  ctx.tools.register(tool(deps, 'scriptwriter_story',
    '写故事层：一句话四槽位、核心欲望/情绪/结局、差异化、三阶段、伏笔台账。',
    {
      operation: { type: 'string', enum: ['read', 'pitch', 'stage', 'promise'], required: true, description: '操作' },
      sentence: str('一句话（可选；缺失时由四槽位拼）'),
      protagonist: str('主角是谁'),
      goal: str('目标（具体）'),
      obstacle: str('阻碍'),
      edge: str('亮点/金手指/独特设定'),
      desire: str('核心欲望'),
      emotion: str('核心情绪'),
      ending: str('结局'),
      differentiators: arr('差异化，至少一条'),
      comparables: arr('对标剧'),
      stages: json('阶段数组：[{index,from,to,task,goal,miniGoal,infoGap}]'),
      promiseId: str('伏笔 id（可省，自动 p-001）'),
      plantedAt: int('埋设集'),
      dueAt: int('到期集'),
      payoff: str('回收方式'),
      promiseStatus: { type: 'string', enum: ['未回收', '已回收', '已放弃'], description: '伏笔状态' },
    },
    async (args, exec) => {
      const { store, project, root, session } = await loadOrFail(deps, exec)
      const operation = requireString(args, 'operation')
      if (operation === 'read') {
        return envelope({ tool: 'scriptwriter_story', operation, root, project, summary: '故事层', data: project.story, next: nextAfter(project) })
      }
      if (operation === 'pitch') {
        const differentiators = stringArray(args.differentiators)
        if (differentiators.length === 0) throw new ToolFailure('MISSING_ARG', '不同意为空：至少写一条差异化', ['scriptwriter_story operation=pitch ... differentiators=[...]'])
        const story = {
          ...project.story,
          sentence: optionalString(args, 'sentence'),
          protagonist: requireString(args, 'protagonist'),
          goal: requireString(args, 'goal'),
          obstacle: requireString(args, 'obstacle'),
          edge: requireString(args, 'edge'),
          desire: requireString(args, 'desire'),
          emotion: requireString(args, 'emotion'),
          ending: requireString(args, 'ending'),
          differentiators,
          comparables: stringArray(args.comparables),
        }
        await store.saveStory(story, { session, signal: exec.signal })
        const updated = { ...project, story }
        return envelope({ tool: 'scriptwriter_story', operation, root, project: updated, summary: '一句话与核心已写入', data: { story }, next: nextAfter(updated) })
      }
      if (operation === 'stage') {
        const raw = objectArray<Record<string, unknown>>(args.stages, 'stages')
        const stages: Stage[] = raw.map((item, index) => ({
          index: Number(item.index ?? index + 1),
          from: Number(item.from ?? 0),
          to: Number(item.to ?? 0),
          task: String(item.task ?? '').trim(),
          goal: String(item.goal ?? '').trim(),
          miniGoal: String(item.miniGoal ?? '').trim(),
          infoGap: String(item.infoGap ?? '').trim(),
        }))
        if (stages.length === 0) throw new ToolFailure('MISSING_ARG', '阶段不能为空', [])
        for (const stage of stages) {
          if (stage.from < 1 || stage.to > project.settings.episodes || stage.from > stage.to) throw new ToolFailure('CONFLICT', `阶段区间 ${String(stage.from)}–${String(stage.to)} 越界`, [])
          if (!(INFO_GAPS as readonly string[]).includes(stage.infoGap)) throw new ToolFailure('CONFLICT', `信息差「${stage.infoGap}」不在四种模型内`, ['scriptwriter_status detail=craft topic=hook'])
        }
        const story = { ...project.story, stages }
        await store.saveStory(story, { session, signal: exec.signal })
        const updated = { ...project, story }
        return envelope({ tool: 'scriptwriter_story', operation, root, project: updated, summary: `已写入 ${String(stages.length)} 个阶段`, data: { stages }, next: nextAfter(updated) })
      }
      if (operation === 'promise') {
        const plantedAt = requireInt(args, 'plantedAt')
        const dueAt = requireInt(args, 'dueAt')
        if (plantedAt >= dueAt) throw new ToolFailure('CONFLICT', '伏笔的埋设集必须早于到期集', [])
        const id = optionalString(args, 'promiseId') || `p-${String(project.story.promises.length + 1).padStart(3, '0')}`
        const entry = {
          id,
          plantedAt,
          dueAt,
          payoff: requireString(args, 'payoff'),
          status: (args.promiseStatus ?? '未回收') as '未回收' | '已回收' | '已放弃',
        }
        const promises = project.story.promises.some((item) => item.id === id)
          ? project.story.promises.map((item) => (item.id === id ? entry : item))
          : [...project.story.promises, entry]
        const story = { ...project.story, promises }
        await store.saveStory(story, { session, signal: exec.signal })
        return envelope({ tool: 'scriptwriter_story', operation, root, project: { ...project, story }, summary: `已记录伏笔 ${id}`, data: { promise: entry }, next: nextAfter({ ...project, story }) })
      }
      throw new ToolFailure('MISSING_ARG', `未知 operation: ${operation}`, [])
    },
  ))

  ctx.tools.register(tool(deps, 'scriptwriter_cast',
    '维护人物小传：欲望、痛点、性格、说话方式、弧光、成本档、进出场、关系。',
    {
      operation: { type: 'string', enum: ['list', 'upsert', 'remove'], required: true, description: '操作' },
      name: str('人物名（即 id）'),
      role: { type: 'string', enum: [...ROLES], description: '角色定位' },
      camp: { type: 'string', enum: [...CAMPS], description: '阵营' },
      desire: str('欲望'),
      painPoint: str('痛点'),
      personality: str('性格底色与压力下的反应'),
      voice: str('说话方式：句长、口头禅、称呼、情绪外化'),
      arc: str('成长弧'),
      costTier: { type: 'string', enum: [...COST_TIERS], description: '成本档' },
      firstEpisode: int('首次出场集'),
      exitEpisode: int('退场集；null/省略表示未退场'),
      relations: json('关系数组：[{target,kind,note?}]'),
      removeExit: bool('remove 时忽略引用强制删除'),
    },
    async (args, exec) => {
      const { store, project, root, session } = await loadOrFail(deps, exec)
      const operation = requireString(args, 'operation')
      if (operation === 'list') {
        return envelope({ tool: 'scriptwriter_cast', operation, root, project, summary: `${String(project.characters.length)} 个人物`, data: { characters: project.characters }, next: nextAfter(project) })
      }
      if (operation === 'upsert') {
        const name = requireString(args, 'name')
        const relations = Array.isArray(args.relations) ? (args.relations as Relation[]).map((relation) => ({ target: String(relation.target ?? ''), kind: String(relation.kind ?? ''), ...(relation.note === undefined ? {} : { note: String(relation.note) }) })) : []
        for (const relation of relations) {
          if (!project.characters.some((character) => character.name === relation.target) && relation.target !== name) {
            throw new ToolFailure('MISSING_CHARACTER', `关系目标「${relation.target}」还未登记`, [`scriptwriter_cast operation=upsert name=${relation.target} ...`])
          }
        }
        const character: Character = {
          name,
          role: requireString(args, 'role'),
          camp: requireString(args, 'camp'),
          desire: requireString(args, 'desire'),
          painPoint: requireString(args, 'painPoint'),
          personality: requireString(args, 'personality'),
          voice: requireString(args, 'voice'),
          arc: requireString(args, 'arc'),
          costTier: requireString(args, 'costTier'),
          firstEpisode: optionalInt(args, 'firstEpisode') ?? 1,
          exitEpisode: optionalInt(args, 'exitEpisode') ?? null,
          relations,
          notes: '',
        }
        const characters = project.characters.some((item) => item.name === name)
          ? project.characters.map((item) => (item.name === name ? { ...character, notes: item.notes } : item))
          : [...project.characters, character]
        await store.saveCharacters(characters, { session, signal: exec.signal })
        return envelope({ tool: 'scriptwriter_cast', operation, root, project: { ...project, characters }, summary: `已写入人物「${name}」`, data: { character }, next: nextAfter({ ...project, characters }) })
      }
      if (operation === 'remove') {
        const name = requireString(args, 'name')
        const inPlan = [...project.plans.values()].some((plan) => plan.cast.includes(name))
        const inScript = [...project.scripts.values()].some((script) => script.scenes.some((scene) => scene.cast.some((castName) => castName.replace(/X\d+$/u, '') === name)))
        if ((inPlan || inScript) && args.removeExit !== true) {
          throw new ToolFailure('CONFLICT', `人物「${name}」仍被分集大纲或剧本引用`, ['先改引用，或 removeExit=true 强制删除（会留下 CON-001）'])
        }
        const characters = project.characters.filter((character) => character.name !== name)
        await store.saveCharacters(characters, { session, signal: exec.signal })
        return envelope({ tool: 'scriptwriter_cast', operation, root, project: { ...project, characters }, summary: `已删除人物「${name}」`, next: nextAfter({ ...project, characters }) })
      }
      throw new ToolFailure('MISSING_ARG', `未知 operation: ${operation}`, [])
    },
  ))

  ctx.tools.register(tool(deps, 'scriptwriter_outline',
    '写分集大纲：每集目标、冲突、情绪点、信息差、钩子、前30秒/中段/末30秒。',
    {
      operation: { type: 'string', enum: ['read', 'plan', 'batch', 'remove'], required: true, description: '操作' },
      number: int('集号'),
      title: str('集标题'),
      stage: int('阶段 1/2/3'),
      goal: str('本集目标'),
      conflict: str('本集冲突'),
      emotion: { type: 'string', enum: ['逆袭成功', '反转打脸', '意外收获', 'CP甜宠', '其他'], description: '情绪点类型' },
      size: { type: 'string', enum: ['大', '小'], description: '大小情绪点' },
      infoGap: { type: 'string', enum: [...INFO_GAPS], description: '信息差' },
      hookType: str('钩子类型（课程枚举）'),
      hook: str('钩子文本/画面'),
      open30: json('前 30 秒：{background,dilemma,motive}'),
      mid: json('中段：{advance,relation,foreshadow}'),
      close30: str('末 30 秒'),
      castList: arr('本集出场人物名'),
      locations: arr('本集场景名'),
      notes: str('备注'),
      entries: json('batch：数组，每项同 plan 字段'),
      from: int('read 起始集'),
      to: int('read 结束集'),
    },
    async (args, exec) => {
      const { store, project, root, session } = await loadOrFail(deps, exec)
      const operation = requireString(args, 'operation')
      if (operation === 'read') {
        const from = optionalInt(args, 'from') ?? 1
        const to = optionalInt(args, 'to') ?? project.settings.episodes
        const plans = [...project.plans.values()].filter((plan) => plan.number >= from && plan.number <= to).sort((a, b) => a.number - b.number)
        return envelope({ tool: 'scriptwriter_outline', operation, root, project, summary: `第 ${String(from)}–${String(to)} 集大纲`, data: { plans }, next: nextAfter(project) })
      }
      if (operation === 'remove') {
        const number = requireInt(args, 'number')
        if (project.scripts.has(number)) throw new ToolFailure('CONFLICT', `第 ${String(number)} 集已有剧本，不能直接删大纲`, ['先处理剧本文件'])
        await store.removePlan(number, { session, signal: exec.signal })
        const plans = new Map(project.plans)
        plans.delete(number)
        return envelope({ tool: 'scriptwriter_outline', operation, root, project: { ...project, plans }, summary: `已删除第 ${String(number)} 集大纲`, next: nextAfter({ ...project, plans }) })
      }
      const entries = operation === 'batch' ? objectArray<Record<string, unknown>>(args.entries, 'entries') : [args as Record<string, unknown>]
      if (entries.length === 0) throw new ToolFailure('MISSING_ARG', 'entries 不能为空', [])
      const names = new Set(project.characters.map((character) => character.name))
      const plans: EpisodePlan[] = []
      for (const entry of entries) {
        const number = Number(entry.number)
        if (!Number.isFinite(number) || number < 1 || number > project.settings.episodes) throw new ToolFailure('CONFLICT', `集号 ${String(entry.number)} 超出 1–${String(project.settings.episodes)}`, [])
        const hookType = normalizeHookType(String(entry.hookType ?? ''))
        if (hookType === undefined) throw new ToolFailure('CONFLICT', `钩子类型「${String(entry.hookType ?? '')}」不在课程枚举内`, ['可用类型见 scriptwriter_status detail=craft topic=hook'])
        const infoGap = String(entry.infoGap ?? '').trim()
        if (!(INFO_GAPS as readonly string[]).includes(infoGap)) throw new ToolFailure('CONFLICT', `信息差「${infoGap}」不在四种模型内`, ['scriptwriter_status detail=craft topic=hook'])
        const emotion = String(entry.emotion ?? '其他').trim()
        if (!['逆袭成功', '反转打脸', '意外收获', 'CP甜宠', '其他'].includes(emotion)) throw new ToolFailure('CONFLICT', `情绪点「${emotion}」不在课程四类内`, ['scriptwriter_status detail=craft topic=emotion'])
        const cast = stringArray(entry.castList)
        for (const name of cast) if (!names.has(name)) throw new ToolFailure('MISSING_CHARACTER', `人物「${name}」还未登记`, [`scriptwriter_cast operation=upsert name=${name} ...`])
        const open30 = (entry.open30 ?? {}) as Record<string, unknown>
        const mid = (entry.mid ?? {}) as Record<string, unknown>
        const plan: EpisodePlan = {
          number,
          title: String(entry.title ?? '').trim(),
          stage: Number(entry.stage ?? 1),
          goal: String(entry.goal ?? '').trim(),
          conflict: String(entry.conflict ?? '').trim(),
          emotion,
          size: entry.size === '大' ? '大' : '小',
          infoGap,
          hookType,
          hook: String(entry.hook ?? '').trim(),
          open30: { background: String(open30.background ?? '').trim(), dilemma: String(open30.dilemma ?? '').trim(), motive: String(open30.motive ?? '').trim() },
          mid: { advance: String(mid.advance ?? '').trim(), relation: String(mid.relation ?? '').trim(), foreshadow: String(mid.foreshadow ?? '').trim() },
          close30: String(entry.close30 ?? '').trim(),
          cast,
          locations: stringArray(entry.locations),
          notes: String(entry.notes ?? '').trim(),
        }
        if (plan.stage < 1 || plan.stage > 3) throw new ToolFailure('CONFLICT', `阶段 ${String(plan.stage)} 超出 1–3`, [])
        const missing = validatePlan(plan)
        if (missing.length > 0) throw new ToolFailure('MISSING_ARG', `第 ${String(number)} 集大纲缺字段：${missing.join('、')}`, [])
        plans.push(plan)
      }
      const written = await store.savePlans(plans, { session, signal: exec.signal })
      const nextPlans = new Map(project.plans)
      for (const plan of plans) nextPlans.set(plan.number, plan)
      return envelope({
        tool: 'scriptwriter_outline',
        operation,
        root,
        project: { ...project, plans: nextPlans },
        summary: `已写入 ${String(plans.length)} 集大纲`,
        data: { written, plans },
        next: nextAfter({ ...project, plans: nextPlans }),
      })
    },
  ))

  ctx.tools.register(tool(deps, 'scriptwriter_script',
    '写入一集完整剧本（课程格式，整集替换）。格式错误会拒绝并给行号。',
    {
      operation: { type: 'string', enum: ['read', 'write'], required: true, description: '操作' },
      episode: int('集号'),
      title: str('集标题'),
      body: str('完整单集剧本正文'),
      status: { type: 'string', enum: ['draft', 'reviewed', 'final'], description: '状态' },
    },
    async (args, exec) => {
      const { store, project, root, session } = await loadOrFail(deps, exec)
      const operation = requireString(args, 'operation')
      const episode = requireInt(args, 'episode')
      if (episode < 1 || episode > project.settings.episodes) throw new ToolFailure('CONFLICT', `集号 ${String(episode)} 超出 1–${String(project.settings.episodes)}`, [])
      if (operation === 'read') {
        const doc = project.scripts.get(episode)
        if (doc === undefined) throw new ToolFailure('NOT_FOUND', `第 ${String(episode)} 集还没有剧本`, ['scriptwriter_script operation=write episode=... body=...'])
        return envelope({ tool: 'scriptwriter_script', operation, root, project, summary: `第 ${String(episode)} 集剧本`, data: { script: doc, plan: project.plans.get(episode) }, next: nextAfter(project) })
      }
      const gate = scriptGate(project, episode)
      if (gate !== undefined) throw new ToolFailure(gate.code, gate.message, gate.unblock)
      const body = requireString(args, 'body')
      const parsed = parseScript(body, {
        file: `第${String(episode)}集`,
        characters: project.characters.map((character) => character.name),
        charsPerSecond: project.settings.charsPerSecond,
      })
      const fatal = parsed.findings.filter((item) => item.severity === 'error')
      if (fatal.length > 0) {
        return {
          ...envelope({
            tool: 'scriptwriter_script',
            operation,
            root,
            project,
            summary: `剧本未写入：${String(fatal.length)} 个格式错误`,
            data: { findings: fatal, parsed: { episode: parsed.episode, scenes: parsed.scenes.length, words: parsed.words } },
            next: ['按 findings 的行号修格式后重试'],
          }),
          ok: false,
          blockers: [{ code: 'PARSE_FATAL', message: `剧本未写入：${String(fatal.length)} 个格式错误`, unblock: ['按 findings 的行号修格式后重试'] }],
        }
      }
      const plan = project.plans.get(episode)
      const status = normalizeStatus(String(args.status ?? 'draft'))
      const doc = {
        episode,
        title: optionalString(args, 'title') || parsed.title || project.scripts.get(episode)?.title || '',
        status,
        header: parsed.header,
        scenes: parsed.scenes,
        hookType: plan?.hookType ?? '',
        hookScene: parsed.hookScene,
        words: parsed.words,
        seconds: parsed.seconds,
        file: '',
        updatedAt: new Date().toISOString(),
        rawBody: body,
        findings: parsed.findings,
      }
      if (status === 'final') {
        const copy = { ...project, scripts: new Map(project.scripts).set(episode, doc) }
        const check = runChecks(copy, { scope: 'episode', episode })
        if (check.counts.error > 0) {
          throw new ToolFailure('GATE_FINAL', `第 ${String(episode)} 集机检有 ${String(check.counts.error)} 个 error，不能标 final`, ['先修 error，再重试 scriptwriter_script status=final'])
        }
      }
      const file = await store.saveScript(doc, { session, signal: exec.signal })
      doc.file = file
      const nextScripts = new Map(project.scripts)
      nextScripts.set(episode, doc)
      return envelope({
        tool: 'scriptwriter_script',
        operation,
        root,
        project: { ...project, scripts: nextScripts },
        summary: `已写入第 ${String(episode)} 集（${String(doc.words)} 字，约 ${String(doc.seconds)} 秒）`,
        data: { file, words: doc.words, seconds: doc.seconds, hookType: doc.hookType, hookScene: doc.hookScene, parseWarnings: parsed.findings.filter((item) => item.severity !== 'error') },
        next: nextAfter({ ...project, scripts: nextScripts }),
      })
    },
  ))

  ctx.tools.register(tool(deps, 'scriptwriter_check',
    '确定性机检：格式/结构/时长/台词/成本/合规提醒/连续性。不调用模型。',
    {
      scope: { type: 'string', enum: ['all', 'episode', 'range'], description: '范围，默认 all' },
      episode: int('scope=episode 的集号'),
      from: int('scope=range 起始集'),
      to: int('scope=range 结束集'),
      dimensions: arr('维度子集：format,structure,duration,dialogue,cost,compliance,continuity'),
    },
    async (args, exec) => {
      const { store, project, root, session } = await loadOrFail(deps, exec)
      const scope = (args.scope === 'episode' || args.scope === 'range' ? args.scope : 'all') as 'all' | 'episode' | 'range'
      if (scope === 'episode' && optionalInt(args, 'episode') === undefined) throw new ToolFailure('MISSING_ARG', 'scope=episode 需要 episode', [])
      const options = {
        scope,
        ...(optionalInt(args, 'episode') === undefined ? {} : { episode: optionalInt(args, 'episode') }),
        ...(optionalInt(args, 'from') === undefined ? {} : { from: optionalInt(args, 'from') }),
        ...(optionalInt(args, 'to') === undefined ? {} : { to: optionalInt(args, 'to') }),
        dimensions: stringArray(args.dimensions),
      }
      const result = runChecks(project, options)
      const scopeLabel = scope === 'episode' ? `ep${String(options.episode ?? 0).padStart(3, '0')}` : scope === 'range' ? `ep${String(options.from ?? 1).padStart(3, '0')}-${String(options.to ?? project.settings.episodes).padStart(3, '0')}` : 'all'
      const reportPath = await store.writeCheckResult(result.report, scopeLabel, {
        at: new Date().toISOString(),
        counts: result.counts,
        episodes: result.checkedEpisodes,
      }, { session, signal: exec.signal })
      return envelope({
        tool: 'scriptwriter_check',
        root,
        project,
        summary: `机检完成：error ${String(result.counts.error)} / warn ${String(result.counts.warn)} / info ${String(result.counts.info)}`,
        data: { counts: result.counts, findings: result.findings, reportPath, rulesVersion: result.rulesVersion, checkedEpisodes: result.checkedEpisodes },
        next: result.counts.error > 0 ? ['先修 error，再跑 scriptwriter_check'] : ['scriptwriter_review kind=opening', 'scriptwriter_status detail=dashboard'],
      })
    },
  ))

  ctx.tools.register(tool(deps, 'scriptwriter_review',
    '模型评审：开篇/钩子/情绪/台词/可拍性/全剧。只判断，不改正文。',
    {
      kind: { type: 'string', enum: [...REVIEW_KINDS], required: true, description: '评审类型' },
      episodes: { type: 'array', description: '集号数组（可选）', items: { type: 'integer' } },
      provider: str('临时覆盖 provider'),
      model: str('临时覆盖 model'),
      maxTokens: int('输出预算'),
    },
    async (args, exec) => {
      const { store, project, root, session } = await loadOrFail(deps, exec)
      const kind = requireString(args, 'kind') as ReviewKind
      if (!(REVIEW_KINDS as readonly string[]).includes(kind)) throw new ToolFailure('MISSING_ARG', `未知评审类型：${kind}`, [])
      const requested = Array.isArray(args.episodes) ? (args.episodes as unknown[]).map(Number).filter((value) => Number.isFinite(value)) : undefined
      const request = buildReviewRequest(project, kind, requested)
      const call = await callModel(deps.ctx, deps.config, request, { provider: optionalString(args, 'provider'), model: optionalString(args, 'model') }, exec.signal)
      const parsed = parseReviewResponse(call.text)
      const findings = parsed.findings.map((item) => {
        if (item.episode === undefined || item.quote === '') return item
        const doc = project.scripts.get(item.episode)
        if (doc === undefined) return item
        return renderScript(doc).includes(item.quote) ? item : { ...item, severity: 'info' as const, issue: `${item.issue}（引用未能在原文定位）` }
      })
      const outcome = {
        kind,
        rubricVersion: request.rubricVersion,
        verdict: parsed.verdict,
        findings,
        provider: call.route.provider,
        model: call.route.model,
        routeSource: call.route.source,
        at: new Date().toISOString(),
      }
      const reportPath = await store.writeReviewReport(reviewReport(outcome, project), `${String(kind)}-${String(request.episodes[0] ?? 0)}-${String(request.episodes.at(-1) ?? 0)}`, { session, signal: exec.signal })
      return envelope({
        tool: 'scriptwriter_review',
        root,
        project,
        summary: `评审完成：${outcome.verdict}（${outcome.provider}/${outcome.model}）`,
        data: { ...outcome, reportPath },
        warnings: findings.some((item) => item.issue.includes('引用未能')) ? ['有引用无法在原文定位，已降级为 info'] : [],
        next: ['把评审与正文交给用户；得到明确认可后再 scriptwriter_confirm'],
      })
    },
  ))

  ctx.tools.register(tool(deps, 'scriptwriter_confirm',
    '记录作者确认（立项/前三集/单集/交付）。只在用户明确认可后调用；必须带用户原话。',
    {
      kind: { type: 'string', enum: ['settings', 'opening', 'episode', 'delivery'], required: true, description: '确认层' },
      summary: str('被批准的版本摘要', true),
      userWords: str('用户原话（不能由模型代写）', true),
      episodes: { type: 'array', description: '集号（opening 默认 1,2,3；episode 必填）', items: { type: 'integer' } },
    },
    async (args, exec) => {
      const { store, project, root } = await loadOrFail(deps, exec)
      const kind = requireString(args, 'kind') as ConfirmationKind
      const summary = requireString(args, 'summary')
      const userWords = requireString(args, 'userWords')
      if (summary === userWords) throw new ToolFailure('CONFLICT', 'userWords 不能等于 summary：请记录用户本人的话', [])
      const prereqs = confirmationPrereqs(project, kind)
      if (prereqs.length > 0) throw new ToolFailure(prereqs[0]?.code ?? 'CONFLICT', prereqs[0]?.message ?? '前置未满足', prereqs.flatMap((item) => item.unblock).slice(0, 4))
      const episodes = Array.isArray(args.episodes) ? (args.episodes as unknown[]).map(Number).filter((value) => Number.isFinite(value)) : kind === 'opening' ? [1, 2, 3] : []
      if (kind === 'episode' && episodes.length !== 1) throw new ToolFailure('MISSING_ARG', 'episode 确认需要且只需要一个集号', [])
      if (kind === 'episode' && !project.scripts.has(episodes[0] ?? 0)) throw new ToolFailure('NOT_FOUND', `第 ${String(episodes[0])} 集剧本不存在`, [])
      if (kind === 'delivery') {
        const last = await store.readLastCheck()
        if (last === undefined) throw new ToolFailure('GATE_DELIVERY', '交付确认前至少需要一次全量机检', ['scriptwriter_check scope=all'])
      }
      const confirmation: Confirmation = { kind, at: new Date().toISOString(), summary, userWords, episodes }
      await store.saveConfirmation(confirmation, { signal: exec.signal })
      const updated = { ...project, confirmations: [...project.confirmations, confirmation] }
      return envelope({
        tool: 'scriptwriter_confirm',
        root,
        project: updated,
        summary: `已记录 ${kind} 确认`,
        data: { confirmation },
        next: kind === 'settings' ? ['scriptwriter_outline operation=batch ...', 'scriptwriter_script operation=write episode=1 ...'] : nextAfter(updated),
      })
    },
  ))

  ctx.tools.register(tool(deps, 'scriptwriter_status',
    '查看阶段、下一步、进度、成本、伏笔、确认状态或技法表。只读。',
    {
      detail: { type: 'string', enum: ['dashboard', 'bible', 'plan', 'episode', 'craft'], description: '视图' },
      episode: int('detail=episode 的集号'),
      topic: str(`detail=craft 的主题：${CRAFT_IDS.join('/')}`),
    },
    async (args, exec) => {
      const session = sessionOf(exec)
      const store = deps.resolver.storeForSession(session)
      const project = await store.load({ session, signal: exec.signal })
      const detail = String(args.detail ?? 'dashboard')
      if (detail === 'craft') {
        const topic = optionalString(args, 'topic')
        if (topic === '') return envelope({ tool: 'scriptwriter_status', root: store.root, project, summary: '技法主题', data: { topics: craftIndex() }, next: ['scriptwriter_status detail=craft topic=hook'] })
        const sheet = craftTopic(topic)
        if (sheet === undefined) throw new ToolFailure('NOT_FOUND', `未知技法主题：${topic}`, [`可用：${CRAFT_IDS.join('/')}`])
        return envelope({ tool: 'scriptwriter_status', root: store.root, project, summary: sheet.title, data: { topic: sheet }, next: [] })
      }
      if (project === undefined) {
        return envelope({
          tool: 'scriptwriter_status',
          root: store.root,
          summary: '当前工作区还没有项目',
          data: { stage: 'setup' },
          next: ['scriptwriter_init title=... platform=... genre=[...] audience=...'],
        })
      }
      if (detail === 'bible') {
        return envelope({ tool: 'scriptwriter_status', root: store.root, project, summary: '人物/阶段/伏笔', data: { story: project.story, characters: project.characters, stages: project.story.stages, promises: project.story.promises }, next: nextAfter(project) })
      }
      if (detail === 'plan') {
        const plans = [...project.plans.values()].sort((a, b) => a.number - b.number)
        return envelope({ tool: 'scriptwriter_status', root: store.root, project, summary: '故事与分集大纲', data: { story: project.story, plans }, next: nextAfter(project) })
      }
      if (detail === 'episode') {
        const episode = requireInt(args, 'episode')
        const script = project.scripts.get(episode)
        if (script === undefined) throw new ToolFailure('NOT_FOUND', `第 ${String(episode)} 集还没有剧本`, [])
        return envelope({ tool: 'scriptwriter_status', root: store.root, project, summary: `第 ${String(episode)} 集`, data: { script, plan: project.plans.get(episode), findings: script.findings }, next: nextAfter(project) })
      }
      const last = await store.readLastCheck()
      const dashboard = buildDashboard(project, last)
      return envelope({
        tool: 'scriptwriter_status',
        root: store.root,
        project,
        summary: `《${project.settings.title}》· ${dashboard.stage}`,
        data: { dashboard, blockers: nextBlockers(project), confirmations: project.confirmations },
        next: nextAfter(project),
      })
    },
  ))

  ctx.tools.register(tool(deps, 'scriptwriter_export',
    '导出投稿包、全剧本、分集大纲或审查报告。',
    {
      kind: { type: 'string', enum: ['submission', 'scripts', 'outline', 'report', 'all'], required: true, description: '导出类型' },
      path: str('自定义相对路径（可选）'),
    },
    async (args, exec) => {
      const { store, project, root, session } = await loadOrFail(deps, exec)
      const kind = requireString(args, 'kind')
      if (kind === 'submission') {
        const gate = submissionGate(project)
        if (gate !== undefined) throw new ToolFailure(gate.code, gate.message, gate.unblock)
      }
      const check = runChecks(project, { scope: 'all' })
      const files: string[] = []
      const write = async (path: string, text: string): Promise<void> => {
        await store.writeFile(path, text, { session, signal: exec.signal })
        files.push(path)
      }
      if (kind === 'submission' || kind === 'all') await write(optionalString(args, 'path') || '投稿包.md', submissionMarkdown(project, check))
      if (kind === 'scripts' || kind === 'all') await write('全剧剧本.md', scriptsMarkdown(project))
      if (kind === 'outline' || kind === 'all') await write('分集大纲.md', outlineMarkdown(project))
      if (kind === 'report' || kind === 'all') await write('审查报告.md', check.report)
      return envelope({ tool: 'scriptwriter_export', root, project, summary: `已导出 ${String(files.length)} 个文件`, data: { files }, next: ['把投稿包交给作者检查'] })
    },
  ))

  ctx.tools.register(tool(deps, 'scriptwriter_dissect',
    '结构化拆解对标剧：一句话、开场、阶段任务、钩子、情绪点、可复用点。',
    {
      operation: { type: 'string', enum: ['list', 'upsert', 'read', 'remove'], required: true, description: '操作' },
      title: str('剧名'),
      platform: str('平台'),
      episodes: int('集数'),
      logline: str('一句话'),
      opening: str('1-1 开场/前 30 秒'),
      stages: json('阶段数组：[{range,task,emotion}]'),
      hooks: arr('钩子模式'),
      emotions: arr('情绪点'),
      reusable: arr('可复用点（具体，不接受空话）'),
      notes: str('备注'),
    },
    async (args, exec) => {
      const { store, project, root, session } = await loadOrFail(deps, exec)
      const operation = requireString(args, 'operation')
      if (operation === 'list') {
        return envelope({ tool: 'scriptwriter_dissect', operation, root, project, summary: `${String(project.dissections.length)} 部竞品`, data: { items: project.dissections.map((item) => ({ title: item.title, logline: item.logline })) }, next: [] })
      }
      if (operation === 'read') {
        const title = requireString(args, 'title')
        const item = project.dissections.find((entry) => entry.title === title)
        if (item === undefined) throw new ToolFailure('NOT_FOUND', `没有《${title}》的拆解`, [])
        return envelope({ tool: 'scriptwriter_dissect', operation, root, project, summary: item.title, data: { item }, next: [] })
      }
      if (operation === 'remove') {
        const title = requireString(args, 'title')
        const items = project.dissections.filter((entry) => entry.title !== title)
        await store.saveDissections(items, { session, signal: exec.signal })
        return envelope({ tool: 'scriptwriter_dissect', operation, root, project: { ...project, dissections: items }, summary: `已删除《${title}》`, next: [] })
      }
      if (operation !== 'upsert') throw new ToolFailure('MISSING_ARG', `未知 operation: ${operation}`, [])
      const title = requireString(args, 'title')
      const reusable = stringArray(args.reusable)
      const warnings = reusable.filter((item) => item.length < 10).map((item) => `可复用点太笼统：「${item}」`)
      const item: Dissection = {
        title,
        platform: optionalString(args, 'platform'),
        episodes: optionalInt(args, 'episodes') ?? 0,
        logline: requireString(args, 'logline'),
        opening: requireString(args, 'opening'),
        stages: Array.isArray(args.stages) ? (args.stages as Array<Record<string, unknown>>).map((stage) => ({ range: String(stage.range ?? ''), task: String(stage.task ?? ''), emotion: String(stage.emotion ?? '') })) : [],
        hooks: stringArray(args.hooks),
        emotions: stringArray(args.emotions),
        reusable,
        notes: optionalString(args, 'notes'),
      }
      const items = project.dissections.some((entry) => entry.title === title)
        ? project.dissections.map((entry) => (entry.title === title ? item : entry))
        : [...project.dissections, item]
      await store.saveDissections(items, { session, signal: exec.signal })
      return envelope({ tool: 'scriptwriter_dissect', operation, root, project: { ...project, dissections: items }, summary: `已记录《${title}》`, data: { item }, warnings, next: [] })
    },
  ))
}

/** Exported for tests: the exact set of tool names this plugin registers. */
export const TOOL_NAMES = [
  'scriptwriter_init', 'scriptwriter_story', 'scriptwriter_cast', 'scriptwriter_outline', 'scriptwriter_script',
  'scriptwriter_check', 'scriptwriter_review', 'scriptwriter_confirm', 'scriptwriter_status', 'scriptwriter_export', 'scriptwriter_dissect',
] as const

