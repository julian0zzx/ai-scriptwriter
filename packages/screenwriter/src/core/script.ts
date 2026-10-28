/** The course's script format: parse, validate, render. Pure, no I/O. */

import type {
  DialogueLine,
  Finding,
  Scene,
  SceneLine,
  ScriptDoc,
  ScriptHeader,
  ScriptStatus,
} from './types.js'

const DAYS = new Set(['日', '夜', '黄昏', '清晨', '傍晚', '早晨', '中午', '凌晨'])
const INT_EXT = new Set(['内', '外', '内外'])

export interface ParseOptions {
  file?: string
  characters?: readonly string[]
  charsPerSecond?: number
  status?: ScriptStatus
  updatedAt?: string
}

export interface ParsedScript {
  episode: number
  title: string
  header: ScriptHeader
  scenes: Scene[]
  hookScene: string
  words: number
  seconds: number
  findings: Finding[]
}

export function countWords(text: string): number {
  return text
    .replace(/\s+/gu, '')
    .replace(/[，。！？、；：“”‘’（）《》〈〉【】…—·,.!?;:'"()[\]{}<>~`@#$%^&*_+=|\\/-]/gu, '')
    .length
}

function chineseNumber(raw: string): number | undefined {
  if (/^\d+$/.test(raw)) return Number(raw)
  const digits: Record<string, number> = {
    零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  }
  let total = 0
  let section = 0
  let current = 0
  for (const ch of raw) {
    if (ch in digits) {
      current = digits[ch]!
      continue
    }
    if (ch === '十' || ch === '百') {
      const unit = ch === '十' ? 10 : 100
      section += (current === 0 ? 1 : current) * unit
      current = 0
      continue
    }
    return undefined
  }
  total += section + current
  return total > 0 ? total : undefined
}

function episodeLine(line: string): { episode: number; title: string } | undefined {
  const match = /^#?\s*第\s*([0-9零一二三四五六七八九十百两]+)\s*集\s*[：:]?\s*(.*)$/u.exec(line.trim())
  if (match === null) return undefined
  const episode = chineseNumber(match[1] ?? '')
  if (episode === undefined) return undefined
  return { episode, title: (match[2] ?? '').trim() }
}

function finding(
  code: string,
  severity: 'error' | 'warn' | 'info',
  ruleRef: string,
  message: string,
  line?: number,
  evidence?: string,
  suggestion?: string,
): Finding {
  return {
    code,
    severity,
    ruleRef,
    message,
    ...(line === undefined ? {} : { location: { line } }),
    ...(evidence === undefined ? {} : { evidence: evidence.slice(0, 80) }),
    ...(suggestion === undefined ? {} : { suggestion }),
  }
}

function splitSpeaker(
  prefix: string,
  names: readonly string[],
): { speaker: string; action?: string; paren?: string; registered: boolean } {
  let base = prefix.trim()
  let paren: string | undefined
  const before = /^(.*?)[（(]([^）)]*)[）)]\s*$/u.exec(base)
  if (before !== null) {
    base = (before[1] ?? '').trim()
    paren = (before[2] ?? '').trim()
  }
  const ordered = [...names].sort((a, b) => b.length - a.length)
  for (const name of ordered) {
    if (name !== '' && base.startsWith(name)) {
      const action = base.slice(name.length).replace(/^[\s，,、]+/u, '').trim()
      return {
        speaker: name,
        ...(action === '' ? {} : { action }),
        ...(paren === undefined ? {} : { paren }),
        registered: true,
      }
    }
  }
  return {
    speaker: base === '' ? '未知角色' : base,
    ...(paren === undefined ? {} : { paren }),
    registered: false,
  }
}

/** Parse one episode body (frontmatter already stripped). */
export function parseScript(body: string, options: ParseOptions = {}): ParsedScript {
  const names = options.characters ?? []
  const charsPerSecond = options.charsPerSecond ?? 5.5
  const findings: Finding[] = []
  const scenes: Scene[] = []
  const header: ScriptHeader = { task: '', turn: '', hook: '' }
  let episode = 0
  let title = ''
  let current: Scene | undefined
  let pendingDay = ''
  let pendingInt = ''
  let pendingLocation = ''
  let flashDepth = 0
  const lines = body.replace(/\r\n?/g, '\n').split('\n')

  const add = (
    code: string,
    severity: 'error' | 'warn' | 'info',
    ruleRef: string,
    message: string,
    line: number,
    evidence?: string,
    suggestion?: string,
  ): void => {
    findings.push(finding(code, severity, ruleRef, message, line, evidence, suggestion))
  }

  const pushScene = (no: string, dayNight: string, intExt: string, location: string, line: number): void => {
    if (scenes.some((scene) => scene.no === no)) {
      add('FMT-004', 'error', 'DR-13', `场号 ${no} 重复`, line, no, '同一集内场号必须唯一，按顺序重排。')
    }
    current = { no, dayNight, intExt, location, cast: [], lines: [], startLine: line }
    scenes.push(current)
  }

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? ''
    const line = raw.trim()
    const no = i + 1
    if (line === '' || line.startsWith('<!--')) continue

    const episodeMatch = episodeLine(line)
    if (episodeMatch !== undefined) {
      episode = episodeMatch.episode
      if (episodeMatch.title !== '') title = episodeMatch.title
      continue
    }

    const tag = /^【\s*([^】]+?)\s*】\s*(.*)$/u.exec(line)
    if (tag !== null) {
      const inside = tag[1] ?? ''
      const rest = (tag[2] ?? '').trim()
      const colon = inside.indexOf('：') >= 0 ? inside.indexOf('：') : inside.indexOf(':')
      const label = colon >= 0 ? inside.slice(0, colon).trim() : inside.trim()
      const value = colon >= 0 ? inside.slice(colon + 1).trim() : ''
      const content = value !== '' ? value : rest
      if (label.includes('卡点')) header.hook = content
      else if (label.includes('转折')) header.turn = content
      else if (header.task === '') header.task = content
      continue
    }

    const compact = /^(?:场\s*)?(\d+)\s*[-－]\s*(\d+)\s+([日夜晚黄昏清晨傍晚早晨中午凌晨]+)\s+(内外|内|外)\s+(.+)$/u.exec(line)
    if (compact !== null && DAYS.has(compact[3] ?? '') && INT_EXT.has(compact[4] ?? '')) {
      pendingDay = ''
      pendingInt = ''
      pendingLocation = ''
      pushScene(
        `${compact[1]}-${compact[2]}`,
        compact[3] ?? '',
        compact[4] ?? '',
        (compact[5] ?? '').trim(),
        no,
      )
      continue
    }

    if (DAYS.has(line)) {
      pendingDay = line
      continue
    }
    if (INT_EXT.has(line)) {
      pendingInt = line
      continue
    }
    const loc = /^地点\s*[:：]\s*(.+)$/u.exec(line)
    if (loc !== null) {
      pendingLocation = (loc[1] ?? '').trim()
      continue
    }
    const sceneNo = /^(?:场\s*)?(\d+)\s*[-－]\s*(\d+)\s*$/u.exec(line)
    if (sceneNo !== null) {
      if (pendingDay === '' || pendingInt === '' || pendingLocation === '') {
        add('FMT-003', 'error', 'DR-13', '四行式场头缺少日/夜、内/外或地点', no, line, '补齐四项，或改用一行式：1-1 日 内 地点。')
      } else {
        pushScene(`${sceneNo[1]}-${sceneNo[2]}`, pendingDay, pendingInt, pendingLocation, no)
        pendingDay = ''
        pendingInt = ''
        pendingLocation = ''
      }
      continue
    }

    const cast = /^人物\s*[:：]\s*(.*)$/u.exec(line)
    if (cast !== null) {
      if (current === undefined) {
        add('FMT-003', 'error', 'DR-13', '人物行出现在场次之外', no, line, '先写场头，再写人物行。')
      } else {
        current.cast = (cast[1] ?? '').split(/[\s　]+/u).map((name) => name.trim()).filter((name) => name !== '')
      }
      continue
    }

    if (current === undefined) {
      add('FMT-003', 'error', 'DR-13', '动作或台词出现在场次之外', no, line, '先写场头（例如 1-1 日 内 客厅）。')
      continue
    }

    const action = /^[△▲]\s*(.*)$/u.exec(line)
    if (action !== null) {
      let text = (action[1] ?? '').trim()
      const subtitle = /^（字幕\s*[:：]\s*(.*)）$/u.exec(text)
      if (subtitle !== null) {
        current.lines.push({ kind: 'subtitle', text: (subtitle[1] ?? '').trim(), line: no })
        continue
      }
      for (const marker of text.match(/【[^】]+】/gu) ?? []) {
        if (/闪回|闪出/.test(marker)) {
          const isOut = /闪出|结束/u.test(marker)
          current.lines.push({ kind: 'flashback', phase: isOut ? 'out' : 'in', line: no })
          flashDepth += isOut ? -1 : 1
          text = text.replace(marker, '').trim()
        }
      }
      if (text !== '') current.lines.push({ kind: 'action', text, line: no })
      continue
    }

    const standaloneSubtitle = /^（字幕\s*[:：]\s*(.*)）$/u.exec(line)
    if (standaloneSubtitle !== null) {
      current.lines.push({ kind: 'subtitle', text: (standaloneSubtitle[1] ?? '').trim(), line: no })
      continue
    }

    let prefix = ''
    let text = ''
    let mode: 'line' | 'os' | 'vo' = 'line'
    const vo = /^VO\s*([^:：]+)[:：]\s*(.*)$/u.exec(line)
    if (vo !== null) {
      prefix = (vo[1] ?? '').trim()
      text = (vo[2] ?? '').trim()
      mode = 'vo'
    } else {
      const os = /^(.*?)\bOS\b\s*[:：]\s*(.*)$/u.exec(line)
      if (os !== null) {
        prefix = (os[1] ?? '').trim()
        text = (os[2] ?? '').trim()
        mode = 'os'
      } else {
        const colon = firstColon(line)
        if (colon >= 0) {
          prefix = line.slice(0, colon).trim()
          text = line.slice(colon + 1).trim()
        }
      }
    }

    if (prefix === '' || text === '') {
      add('FMT-009', 'error', 'DR-13', '无法识别的行', no, line, '台词写成「角色：台词」；动作以 △ 开头；或写成「（字幕：…）」。')
      continue
    }

    const speaker = splitSpeaker(prefix, names)
    const afterParen = /^[（(]([^）)]*)[）)]\s*(.*)$/u.exec(text)
    if (afterParen !== null && speaker.paren === undefined) {
      speaker.paren = (afterParen[1] ?? '').trim()
      text = (afterParen[2] ?? '').trim()
    }
    if (text === '') {
      add('FMT-006', 'error', 'DR-13', `「${speaker.speaker}」的台词为空`, no, line, '补台词，或把这一行改成动作。')
      continue
    }
    if (!speaker.registered) {
      add('CON-001', 'warn', 'DR-13', `未登记人物「${speaker.speaker}」出现在剧本中`, no, line, '先调用 scriptwriter_cast upsert 登记，或改成已有人物。')
    }
    const dialogue: DialogueLine = {
      kind: 'dialogue',
      speaker: speaker.speaker,
      speakerRegistered: speaker.registered,
      ...(speaker.action === undefined ? {} : { speakerAction: speaker.action }),
      ...(speaker.paren === undefined ? {} : { paren: speaker.paren }),
      mode,
      text,
      line: no,
    }
    current.lines.push(dialogue)
  }

  if (episode === 0) {
    add('FMT-001', 'error', 'DR-13', '缺少「第N集」行', 1, lines.slice(0, 3).join(' / '), '在第一行写「第1集 标题」。')
  }
  if (scenes.length === 0) {
    add('FMT-008', 'error', 'DR-13', '剧本没有任何可解析的场次', 1, undefined, '至少写一个场头：1-1 日 内 地点。')
  }
  if (header.hook === '') {
    add('FMT-002', 'error', 'DR-18', '集头缺少【卡点】', 1, undefined, '在集头写【卡点】一句话；它同时是钩子的检查依据。')
  }
  if (flashDepth !== 0) {
    add('FMT-007', 'error', 'DR-13', '闪回标记未闭合', 1, undefined, '每个【闪回】都要有对应的【闪出】。')
  }

  const texts: string[] = []
  for (const scene of scenes) {
    texts.push(scene.location, ...scene.cast)
    for (const item of scene.lines) {
      if (item.kind === 'dialogue' || item.kind === 'action' || item.kind === 'subtitle') texts.push(item.text)
      if (item.kind === 'dialogue' && item.speakerAction !== undefined) texts.push(item.speakerAction)
    }
  }
  const words = countWords(texts.join(''))
  const seconds = charsPerSecond > 0 ? Math.round(words / charsPerSecond) : 0

  return {
    episode,
    title,
    header,
    scenes,
    hookScene: scenes.at(-1)?.no ?? '',
    words,
    seconds,
    findings: findings.sort((a, b) => (a.location?.line ?? 0) - (b.location?.line ?? 0)),
  }
}

function firstColon(line: string): number {
  let depth = 0
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (ch === '（' || ch === '(') depth += 1
    if (ch === '）' || ch === ')') depth = Math.max(0, depth - 1)
    if ((ch === '：' || ch === ':') && depth === 0) return i
  }
  return -1
}

function renderDialogue(line: DialogueLine): string {
  const action = line.speakerAction === undefined ? '' : ` ${line.speakerAction}`
  const paren = line.paren === undefined ? '' : `（${line.paren}）`
  if (line.mode === 'vo') return `VO${line.speaker}${action}${paren}：${line.text}`
  if (line.mode === 'os') return `${line.speaker}${action}${paren}OS：${line.text}`
  return `${line.speaker}${action}${paren}：${line.text}`
}

/** Render a canonical episode body (no frontmatter). */
export function renderScript(doc: ScriptDoc): string {
  const out: string[] = [`# 第${doc.episode}集${doc.title === '' ? '' : ` ${doc.title}`}`, '']
  if (doc.header.task !== '') out.push(`【本集任务】${doc.header.task}`)
  if (doc.header.turn !== '') out.push(`【转折】${doc.header.turn}`)
  if (doc.header.hook !== '') out.push(`【卡点】${doc.header.hook}`)
  if (out.length > 2) out.push('')
  for (const scene of doc.scenes) {
    out.push(`${scene.no} ${scene.dayNight} ${scene.intExt} ${scene.location}`)
    if (scene.cast.length > 0) out.push(`人物：${scene.cast.join(' ')}`)
    out.push('')
    for (const line of scene.lines) {
      if (line.kind === 'action') out.push(`△${line.text}`)
      else if (line.kind === 'subtitle') out.push(`△（字幕：${line.text}）`)
      else if (line.kind === 'flashback') out.push(line.phase === 'in' ? '△【闪回】' : '△【闪出】')
      else out.push(renderDialogue(line))
    }
    out.push('')
  }
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`
}
