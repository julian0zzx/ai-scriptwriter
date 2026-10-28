/** Deterministic checks. No model calls, no I/O. */

import { EMOTION_TYPES, INFO_GAPS, normalizeHookType } from './enums.js'
import { finding, mergeFindings } from './findings.js'
import type { CheckResult, EpisodePlan, Finding, Project, ScriptDoc } from './types.js'
import { checkResult } from './findings.js'
import { countWords } from './script.js'

export const RULES_VERSION = '2026-10-28.1'

export interface CheckOptions {
  scope?: 'all' | 'episode' | 'range'
  episode?: number
  from?: number
  to?: number
  dimensions?: string[]
}

const WATER_WORDS = ['呵呵', '哈哈', '没事', '随便', '你知道的', '听我说', '说实话', '不是我说', '你听我解释', '事情不是你想的那样']

const COMPLIANCE_RULES: Array<{ code: string; category: string; words: string[] }> = [
  { code: 'CMP-001', category: '暴力血腥', words: ['血腥', '断肢', '割喉', '爆头', '虐杀', '尸体', '血肉模糊'] },
  { code: 'CMP-002', category: '性暗示', words: ['床戏', '裸露', '强奸', '迷奸', '灌醉带走', '衣衫不整'] },
  { code: 'CMP-003', category: '赌博毒品', words: ['赌场', '赌博', '吸毒', '毒品', '冰毒', '摇头丸'] },
  { code: 'CMP-004', category: '未成年保护', words: ['未成年', '校园霸凌', '诱骗儿童', '儿童色情'] },
  { code: 'CMP-005', category: '虐待与家暴', words: ['虐待', '家暴', '铁链', '囚禁'] },
  { code: 'CMP-006', category: '价值观与法律', words: ['私刑', '刑讯逼供', '替身文学', '强制爱', '违法得利'] },
  { code: 'CMP-007', category: '迷信与诈骗', words: ['算命改命', '风水大师', '法事消灾', '转运符'] },
  { code: 'CMP-008', category: '炫富拜金', words: ['拜金', '炫富', '有钱就是爹', '穷人活该'] },
]

const HIGH_COST_TAGS = ['水下', '爆破', '飙车', '高空', '威亚', '雨戏', '大群演', '特效', '动物', '儿童', '古装']

export function runChecks(project: Project, options: CheckOptions = {}): CheckResult {
  const dims = options.dimensions === undefined || options.dimensions.length === 0
    ? new Set(['format', 'structure', 'duration', 'dialogue', 'cost', 'compliance', 'continuity'])
    : new Set(options.dimensions)
  const selected = selectEpisodes(project, options)
  const findings: Finding[] = []

  if (dims.has('structure')) findings.push(...projectChecks(project))
  for (const episode of selected) {
    const script = project.scripts.get(episode)
    if (script === undefined) continue
    const plan = project.plans.get(episode)
    if (dims.has('format')) findings.push(...formatChecks(script))
    if (dims.has('structure')) findings.push(...structureChecks(project, script, plan))
    if (dims.has('duration')) findings.push(...durationChecks(project, script))
    if (dims.has('dialogue')) findings.push(...dialogueChecks(script))
    if (dims.has('cost')) findings.push(...costChecks(project, script, plan))
    if (dims.has('compliance')) findings.push(...complianceChecks(script))
    if (dims.has('continuity')) findings.push(...continuityChecks(project, script, plan))
  }
  return checkResult(mergeFindings(findings), RULES_VERSION, selected)
}

function selectEpisodes(project: Project, options: CheckOptions): number[] {
  const written = [...project.scripts.keys()].sort((a, b) => a - b)
  if (options.scope === 'episode' && options.episode !== undefined) return written.includes(options.episode) ? [options.episode] : []
  if (options.scope === 'range') {
    const from = options.from ?? 1
    const to = options.to ?? project.settings.episodes
    return written.filter((episode) => episode >= from && episode <= to)
  }
  return written
}

function projectChecks(project: Project): Finding[] {
  const out: Finding[] = []
  const { story, settings, plans, characters } = project
  if (story.goal === '' || story.protagonist === '' || story.obstacle === '' || story.edge === '') {
    out.push(finding({
      code: 'STR-014', severity: 'warn', ruleRef: 'DR-09',
      message: '一句话四槽位不完整（主角/目标/阻碍/亮点）',
      suggestion: '补齐 scriptwriter_story operation=pitch 的四个槽位。',
    }))
  }
  if (story.ending === '') {
    out.push(finding({
      code: 'STR-012', severity: 'warn', ruleRef: 'DR-09',
      message: '故事结局还没有写', suggestion: '先写结局，再排高潮段，避免写到后面失去方向。',
    }))
  }
  if (story.stages.length === 0) {
    out.push(finding({
      code: 'STR-001', severity: 'warn', ruleRef: 'DR-03',
      message: '还没有三阶段', suggestion: 'scriptwriter_story operation=stage 设置 1–10/11–30/31–80。',
    }))
  } else {
    const sorted = [...story.stages].sort((a, b) => a.from - b.from)
    if (sorted[0]?.from !== 1 || sorted.at(-1)?.to !== settings.episodes) {
      out.push(finding({
        code: 'STR-002', severity: 'warn', ruleRef: 'DR-03',
        message: `阶段没有覆盖 1–${String(settings.episodes)} 集`,
        suggestion: '调整阶段区间，保证连续、不重叠。',
      }))
    }
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i]?.from !== (sorted[i - 1]?.to ?? 0) + 1) {
        out.push(finding({
          code: 'STR-002', severity: 'warn', ruleRef: 'DR-03',
          message: '阶段区间重叠或留空', suggestion: '让上一段的 to + 1 等于下一段的 from。',
        }))
        break
      }
    }
    if (sorted.some((stage) => stage.task === '')) {
      out.push(finding({ code: 'STR-011', severity: 'warn', ruleRef: 'DR-03', message: '有阶段没有填写阶段任务', suggestion: '每个阶段写一句「这一段要完成什么」。' }))
    }
  }
  if (characters.length === 0) {
    out.push(finding({ code: 'STR-015', severity: 'warn', ruleRef: 'DR-11', message: '人物表为空', suggestion: '至少登记主角与反派。' }))
  }
  const core = characters.filter((character) => character.role === '主角').length
  if (core > 0 && characters.length > 20) {
    out.push(finding({ code: 'CST-005', severity: 'warn', ruleRef: 'DR-28', message: `人物共 ${String(characters.length)} 人，超过课程给的 20 人参考线`, suggestion: '合并功能重复的配角；每个配角写一句「他为什么必须存在」。' }))
  }
  const overdue = story.promises.filter((entry) => entry.status === '未回收' && entry.dueAt > 0 && entry.dueAt < maxWritten(project))
  for (const entry of overdue) {
    out.push(finding({
      code: 'STR-007', severity: 'warn', ruleRef: 'DR-18',
      message: `伏笔 ${entry.id} 到期未回收（第 ${String(entry.dueAt)} 集到期）`,
      suggestion: '在最近一集回收，或把状态改成「已放弃」并说明原因。',
    }))
  }
  if (plans.size >= 6 && new Set([...plans.values()].map((plan) => plan.infoGap)).size === 1) {
    out.push(finding({
      code: 'STR-010', severity: 'warn', ruleRef: 'DR-17',
      message: '全剧只使用了一种信息差', suggestion: '阶段之间换一种信息差组合，避免悬念方式单一。',
    }))
  }
  const plansWithoutHook = [...plans.values()].filter((plan) => plan.hook.trim() === '')
  if (plansWithoutHook.length > 0) {
    out.push(finding({
      code: 'STR-008', severity: 'warn', ruleRef: 'DR-18',
      message: `${String(plansWithoutHook.length)} 集大纲没有钩子`, suggestion: '每集大纲必须有 hookType 与 hook。',
    }))
  }
  const bigPoints = [...plans.values()].filter((plan) => plan.size === '大').sort((a, b) => a.number - b.number)
  if (plans.size >= 10 && bigPoints.length === 0) {
    out.push(finding({ code: 'EMO-002', severity: 'warn', ruleRef: 'DR-23', message: '前 10 集没有任何大情绪点', suggestion: '课程建议每 5–10 集安排一个大情绪点。' }))
  }
  for (let i = 1; i < bigPoints.length; i += 1) {
    const gap = (bigPoints[i]?.number ?? 0) - (bigPoints[i - 1]?.number ?? 0)
    if (gap > 10) {
      out.push(finding({ code: 'EMO-002', severity: 'warn', ruleRef: 'DR-23', message: `两个大情绪点相隔 ${String(gap)} 集`, suggestion: '把间隔压到 5–10 集。' }))
    }
  }
  return out
}

function maxWritten(project: Project): number {
  return Math.max(0, ...[...project.scripts.keys()])
}

function formatChecks(script: ScriptDoc): Finding[] {
  return script.findings.map((item) => ({
    ...item,
    location: { file: script.file, episode: script.episode, ...(item.location ?? {}) },
  }))
}

function structureChecks(project: Project, script: ScriptDoc, plan: EpisodePlan | undefined): Finding[] {
  const out: Finding[] = []
  if (plan === undefined) {
    out.push(finding({
      code: 'STR-005', severity: 'error', ruleRef: 'DR-12',
      message: `第 ${String(script.episode)} 集有剧本但没有分集大纲`,
      file: script.file, episode: script.episode,
      suggestion: '先补 scriptwriter_outline operation=plan，再写剧本。',
    }))
    return out
  }
  if (plan.hook.trim() === '') {
    out.push(finding({ code: 'STR-008', severity: 'error', ruleRef: 'DR-18', message: '本集大纲没有钩子', file: script.file, episode: script.episode }))
  }
  if (normalizeHookType(plan.hookType) === undefined) {
    out.push(finding({ code: 'STR-009', severity: 'error', ruleRef: 'DR-18', message: `钩子类型「${plan.hookType}」不在课程枚举内`, file: script.file, episode: script.episode }))
  }
  if (script.hookScene !== '' && script.hookScene !== script.scenes.at(-1)?.no) {
    out.push(finding({ code: 'STR-013', severity: 'warn', ruleRef: 'DR-18', message: 'hookScene 不是最后一场', file: script.file, episode: script.episode, suggestion: '钩子必须落在末场；重写最后一两场。' }))
  }
  if (plan.cast.length > 0) {
    const sceneCast = new Set(script.scenes.flatMap((scene) => scene.cast))
    for (const name of sceneCast) {
      if (!plan.cast.some((planned) => planned === name)) {
        out.push(finding({ code: 'CON-002', severity: 'warn', ruleRef: 'DR-28', message: `剧本出现大纲未列的「${name}」`, file: script.file, episode: script.episode }))
      }
    }
  }
  return out
}

function durationChecks(project: Project, script: ScriptDoc): Finding[] {
  const out: Finding[] = []
  const { min, max } = project.settings.wordWindow
  if (script.words < min) {
    out.push(finding({ code: 'DUR-001', severity: 'warn', ruleRef: 'CFG-DUR', message: `本集 ${String(script.words)} 字，低于字数窗口 ${String(min)}–${String(max)}`, file: script.file, episode: script.episode, suggestion: '补冲突或情绪落点，不要靠水词凑字。' }))
  }
  if (script.words > max) {
    out.push(finding({ code: 'DUR-002', severity: 'warn', ruleRef: 'CFG-DUR', message: `本集 ${String(script.words)} 字，高于字数窗口 ${String(min)}–${String(max)}`, file: script.file, episode: script.episode, suggestion: '删不推主线的桥段与重复解释。' }))
  }
  const target = project.settings.secondsPerEpisode
  const low = Math.round(target * 0.8)
  const high = Math.round(target * 1.2)
  if (script.seconds < low || script.seconds > high) {
    out.push(finding({ code: 'DUR-003', severity: 'warn', ruleRef: 'CFG-DUR', message: `估计 ${String(script.seconds)} 秒，超出目标 ${String(target)} 秒的 ±20%`, file: script.file, episode: script.episode, evidence: `字数 ${String(script.words)}，按 ${String(project.settings.charsPerSecond)} 字/秒估算`, suggestion: '这是估算，不是实测；按删补后的字数复核。' }))
  }
  return out
}

function dialogueLines(script: ScriptDoc) {
  return script.scenes.flatMap((scene) => scene.lines.filter((line) => line.kind === 'dialogue'))
}

function dialogueChecks(script: ScriptDoc): Finding[] {
  const out: Finding[] = []
  const lines = dialogueLines(script)
  const os = lines.filter((line) => line.mode !== 'line').length
  if (lines.length > 0 && os / lines.length > 0.3) {
    out.push(finding({ code: 'DLG-003', severity: 'warn', ruleRef: 'CFG-DLG', message: `OS/VO 占对白 ${String(Math.round((os / lines.length) * 100))}%，课程要求少用`, file: script.file, episode: script.episode, suggestion: '优先用动作或对白外化心理。' }))
  }
  let consecutive = 0
  for (const line of script.scenes.flatMap((scene) => scene.lines)) {
    if (line.kind === 'dialogue') {
      consecutive += 1
      if (consecutive === 7) {
        out.push(finding({ code: 'DLG-004', severity: 'warn', ruleRef: 'DR-20', message: '连续对白超过 6 行', file: script.file, episode: script.episode, line: line.line, suggestion: '插入动作或画面，别让戏变成两个人站着说话。' }))
      }
    } else if (line.kind === 'action') {
      consecutive = 0
    }
  }
  for (const line of lines) {
    if (line.text.length > 60) {
      out.push(finding({ code: 'DLG-001', severity: 'warn', ruleRef: 'CFG-DLG', message: `单句 ${String(line.text.length)} 字，偏长`, file: script.file, episode: script.episode, line: line.line, evidence: line.text, suggestion: '拆成两拍，或删掉解释性内容。' }))
    }
    for (const word of WATER_WORDS) {
      if (line.text.includes(word)) {
        out.push(finding({ code: 'DLG-005', severity: 'info', ruleRef: 'DR-20', message: `疑似水词「${word}」`, file: script.file, episode: script.episode, line: line.line, evidence: line.text, suggestion: '如果删掉不影响剧情，就删。' }))
      }
    }
  }
  for (const scene of script.scenes) {
    for (const line of scene.lines) {
      if (line.kind === 'action' && line.text.length > 100) {
        out.push(finding({ code: 'DLG-006', severity: 'warn', ruleRef: 'DR-22', message: `动作段 ${String(line.text.length)} 字，镜头化不足`, file: script.file, episode: script.episode, scene: scene.no, line: line.line, suggestion: '拆成更短、可执行的动作。' }))
      }
    }
  }
  const text = script.scenes.flatMap((scene) => scene.lines).filter((line) => line.kind === 'dialogue' || line.kind === 'action').map((line) => line.text).join('\n')
  const aiFlavor = (text.match(/仿佛|宛如|不禁|缓缓|微微|一丝|一抹|不是[^。]{0,12}而是/gu) ?? []).length
  if (aiFlavor >= 6) {
    out.push(finding({ code: 'DLG-007', severity: 'warn', ruleRef: 'CFG-DLG', message: `抽象/套式表达出现 ${String(aiFlavor)} 次`, file: script.file, episode: script.episode, suggestion: '换成具体动作：手在抖、杯子摔了、话说到一半停住。' }))
  }
  return out
}

function costChecks(project: Project, script: ScriptDoc, plan: EpisodePlan | undefined): Finding[] {
  const out: Finding[] = []
  const scenes = script.scenes
  if (scenes.length > 8) {
    out.push(finding({ code: 'CST-001', severity: 'warn', ruleRef: 'DR-27', message: `本集 ${String(scenes.length)} 场，场景偏多`, file: script.file, episode: script.episode, suggestion: '合并同一地点的场次；每加一场可能多一天拍摄。' }))
  }
  const locations = new Set(scenes.map((scene) => scene.location))
  if (locations.size > 3) {
    out.push(finding({ code: 'CST-002', severity: 'warn', ruleRef: 'DR-27', message: `本集 ${String(locations.size)} 个独立场景`, file: script.file, episode: script.episode, suggestion: '低成本档尽量控制在 3 个以内。' }))
  }
  const cast = new Set(scenes.flatMap((scene) => scene.cast.map((name) => name.replace(/X\d+$/u, ''))))
  if (cast.size > 8) {
    out.push(finding({ code: 'CST-003', severity: 'warn', ruleRef: 'DR-28', message: `本集出场 ${String(cast.size)} 人`, file: script.file, episode: script.episode, suggestion: '合并功能重复的群演或配角。' }))
  }
  const text = `${plan?.notes ?? ''}\n${script.scenes.flatMap((scene) => [scene.location, ...scene.lines.filter((line) => line.kind === 'action').map((line) => line.text)]).join('\n')}`
  for (const tag of HIGH_COST_TAGS) {
    if (text.includes(tag)) {
      out.push(finding({ code: 'CST-004', severity: 'warn', ruleRef: 'DR-27', message: `命中高成本元素「${tag}」`, file: script.file, episode: script.episode, suggestion: `当前成本档为 ${project.settings.budgetTier}；确认它是核心卖点，否则简化。` }))
    }
  }
  return out
}

function complianceChecks(script: ScriptDoc): Finding[] {
  const out: Finding[] = []
  const text = script.scenes.flatMap((scene) => scene.lines.filter((line) => line.kind === 'dialogue' || line.kind === 'action').map((line) => line.text)).join('\n')
  for (const rule of COMPLIANCE_RULES) {
    const hit = rule.words.find((word) => text.includes(word))
    if (hit !== undefined) {
      out.push(finding({ code: rule.code, severity: 'info', ruleRef: 'DR-26', message: `合规提醒（${rule.category}）：命中「${hit}」`, file: script.file, episode: script.episode, evidence: hit, suggestion: '需人工复核；这是提醒清单，不是合规结论。' }))
    }
  }
  return out
}

function continuityChecks(project: Project, script: ScriptDoc, plan: EpisodePlan | undefined): Finding[] {
  const out: Finding[] = []
  const names = new Set(project.characters.map((character) => character.name))
  for (const scene of script.scenes) {
    for (const name of scene.cast) {
      const base = name.replace(/X\d+$/u, '')
      if (!names.has(base)) {
        out.push(finding({ code: 'CON-001', severity: 'warn', ruleRef: 'DR-13', message: `未登记人物「${base}」出现在人物行`, file: script.file, episode: script.episode, scene: scene.no }))
      }
      const character = project.characters.find((item) => item.name === base)
      if (character?.exitEpisode !== null && character?.exitEpisode !== undefined && script.episode > character.exitEpisode) {
        out.push(finding({ code: 'CON-003', severity: 'warn', ruleRef: 'DR-13', message: `「${base}」已在第 ${String(character.exitEpisode)} 集退场，却再次出现`, file: script.file, episode: script.episode, scene: scene.no }))
      }
    }
    if (plan !== undefined) {
      const planned = new Set(plan.locations)
      if (!planned.has(scene.location)) {
        out.push(finding({ code: 'CON-004', severity: 'warn', ruleRef: 'DR-27', message: `地点「${scene.location}」不在本集大纲中`, file: script.file, episode: script.episode, scene: scene.no, suggestion: '补进大纲 locations，或改用已有场景。' }))
      }
      const duplicates = scene.cast.filter((name, index) => scene.cast.indexOf(name) !== index)
      if (duplicates.length > 0) {
        out.push(finding({ code: 'CON-005', severity: 'warn', ruleRef: 'DR-13', message: `人物行重复：${duplicates.join('、')}`, file: script.file, episode: script.episode, scene: scene.no }))
      }
    }
  }
  return out
}

export function checkEpisode(project: Project, episode: number): Finding[] {
  return runChecks(project, { scope: 'episode', episode }).findings
}

export function checksForOptions(project: Project, options: CheckOptions): CheckResult {
  return runChecks(project, options)
}

/** Exported for tests and for the status dashboard. */
export function emotionTypeValid(value: string): boolean {
  return (EMOTION_TYPES as readonly string[]).includes(value)
}

export function infoGapValid(value: string): boolean {
  return (INFO_GAPS as readonly string[]).includes(value)
}

export function plannedWordEstimate(episodeSeconds: number, charsPerSecond: number): number {
  return Math.round(episodeSeconds * charsPerSecond)
}

/** A convenience for tests: total words of a list of lines. */
export function totalWords(lines: readonly string[]): number {
  return countWords(lines.join(''))
}
