/** Rubric construction and response validation for the one model-backed tool. */

import { craftTopic } from './craft.js'
import { ProjectError } from './errors.js'
import { renderScript } from './script.js'
import type { Project, ReviewFinding, ReviewOutcome, Severity } from './types.js'

export const REVIEW_KINDS = ['opening', 'hook', 'emotion', 'dialogue', 'shootability', 'full'] as const
export type ReviewKind = (typeof REVIEW_KINDS)[number]

export interface ReviewRequest {
  system: string
  user: string
  rubricVersion: string
  episodes: number[]
  maxTokens: number
}

const RUBRICS: Record<ReviewKind, string> = {
  opening: `检查第 1–3 集，重点看第一集第一场（1-1）：
1. 身份、困境、目标是否在一集内讲清，且靠事件而非旁白。
2. 前 30 秒是否给出背景/困境/动机；前 20 秒是否有抓人的冲突或反差。
3. 五要素是否成立：清晰人设、主线目标、困境代入、情绪推进、信息密度。
4. 起/承+转/合是否完整；合是否悬而未决。
5. 六坑：节奏拖沓、台词冗余、人设模糊、受众错位、情绪空洞、缺少创新。
6. 是否值得观众点开第二集；第 3 集是否足以支撑「继续追」。`,
  hook: `逐集检查钩子：
1. 每集末是否有未完成感，是否把高潮拆成两半。
2. 钩子属于台词钩/画面钩的哪一类，是否自然。
3. 是否只是用 OS 复述目标或解释剧情（判为无效）。
4. 大期待是否最晚第 2 集给出；小期待是否按阶段推进。
5. 连续多集是否重复同一种钩子，是否可换信息差。`,
  emotion: `检查情绪点：
1. 本集情绪点类型是否清楚（逆袭/打脸/意外收获/CP）。
2. 是否有铺垫，是否「意料之外、情理之中」。
3. 大/小情绪点配比是否合理（每集 1 小点、每 5–10 集 1 大点）。
4. 痛点是否具体、是否贴合目标受众。
5. 是否有为爽而爽、反派降智、打脸路人的问题。`,
  dialogue: `检查台词：
1. 是否推动剧情/塑造人物/调节奏；删掉是否影响理解。
2. 是否符合人物身份、性格、时代语感；不同角色是否说得出不同的话。
3. OS/VO 是否过多，是否把心理描写当台词念。
4. 是否有水词、长句、解释性台词、不可表演的抽象句。
5. 朗读一遍，指出拗口处；给出「砍三分之一」的具体建议。`,
  shootability: `检查可拍性与成本：
1. 场景是否集中；每集场次、独立场景、出场人数是否可控。
2. 是否有水下/高空/飙车/爆破/大群演/特效/动物/儿童等高成本元素，是否核心卖点。
3. 动作与画面是否可执行；是否有「心碎了一地」这类无法拍的句子。
4. 关键信息是否由正文传递，而不是假设观众看过人物小传。
5. 以低成本/中成本/高成本档分别判断。`,
  full: `全剧体检：
1. 一句话是否成立（主角+目标+阻碍+亮点），主线是否清晰、是否有副线喧宾夺主。
2. 三阶段任务是否完成；第 10 集是否有情绪闸门。
3. 大期待是否在第 1–2 集出现并反复强化；小期待是否逐级递进。
4. 信息差是否在阶段之间变化。
5. 情绪曲线是否有大小点；钩子类型是否轮换。
6. 人物是否有记忆点、是否写着写着丢了。
7. 成本与合规风险（只提醒，不下结论）。`,
}

export function rubricVersion(kind: ReviewKind): string {
  return `${kind}@1`
}

export function reviewEpisodes(project: Project, kind: ReviewKind, requested?: readonly number[]): number[] {
  if (requested !== undefined && requested.length > 0) return [...requested].sort((a, b) => a - b)
  if (kind === 'opening') return [1, 2, 3]
  return [...project.scripts.keys()].sort((a, b) => a - b)
}

export function buildReviewRequest(project: Project, kind: ReviewKind, requested?: readonly number[]): ReviewRequest {
  const episodes = reviewEpisodes(project, kind, requested)
  if (episodes.length === 0) throw new ProjectError('还没有可评审的剧本', '剧集')
  if (kind === 'opening' && !episodes.includes(1)) throw new ProjectError('开篇评审必须包含第 1 集', '剧集')
  if (kind === 'full' && episodes.length < 3) throw new ProjectError('全剧评审至少需要 3 集', '剧集')
  const { story, characters, settings, plans } = project
  const storyBlock = [
    `剧名：${settings.title}`,
    `平台/题材/受众：${settings.platform} / ${settings.genre.join('、')} / ${settings.audience}`,
    `体量：${String(settings.episodes)} 集 × ${String(settings.secondsPerEpisode)} 秒`,
    `一句话：${story.sentence}`,
    `核心目标：${story.goal}`,
    `阻碍：${story.obstacle}`,
    `亮点：${story.edge}`,
    `核心情绪：${story.emotion}`,
    `结局：${story.ending}`,
    `差异化：${story.differentiators.join('；')}`,
  ].join('\n')
  const castBlock = characters.map((character) => `- ${character.name}（${character.role}）：欲望=${character.desire}；痛点=${character.painPoint}；性格=${character.personality}；说话=${character.voice}`).join('\n')
  const planBlock = episodes.map((episode) => {
    const plan = plans.get(episode)
    if (plan === undefined) return `第${String(episode)}集：无大纲`
    return `第${String(episode)}集《${plan.title}》：目标=${plan.goal}；冲突=${plan.conflict}；情绪=${plan.emotion}/${plan.size}；信息差=${plan.infoGap}；钩子=${plan.hookType}｜${plan.hook}`
  }).join('\n')
  const scriptBlock = episodes.map((episode) => {
    const script = project.scripts.get(episode)
    return script === undefined ? `第${String(episode)}集：尚未写` : `===== 第${String(episode)}集 =====\n${renderScript(script).trim()}`
  }).join('\n\n')
  const craft = craftTopic(kind === 'shootability' ? 'compliance' : kind === 'full' ? 'pitch' : kind)?.body ?? ''
  const system = `你是短剧编剧评审，不是改写者。按红果《短剧编剧第一课》的方法论判断稿件，只输出判断，不改写正文。

规则：
- 必须引用原文作为证据；quote 必须能在对应集正文里找到（可以截取片段）。
- 只报具体问题，不报「整体不错」这类空话；每条给出可执行的修改方向。
- 数字与阈值不是课程原文时，不要伪装成课程规定。
- 只输出一个 JSON 对象，不要 Markdown 代码围栏，不要额外解释：
{"verdict":"pass|revise|fail","findings":[{"severity":"error|warn|info","episode":1,"quote":"原文片段","issue":"问题","fix":"怎么改"}]}
- verdict 的含义：pass=可以作为当前阶段定稿；revise=需要改；fail=方向或结构要重做。

课程要点（${rubricVersion(kind)}）：
${RUBRICS[kind]}
${craft === '' ? '' : `\n补充材料：\n${craft}`}`
  const user = `项目：
${storyBlock}

人物：
${castBlock === '' ? '（未登记）' : castBlock}

分集大纲：
${planBlock}

剧本：
${scriptBlock}

请评 ${episodes.map((episode) => `第${String(episode)}集`).join('、')}，严格按 JSON 输出。`
  return { system, user, rubricVersion: rubricVersion(kind), episodes, maxTokens: 4096 }
}

export function parseReviewResponse(text: string): { verdict: ReviewOutcome['verdict']; findings: ReviewFinding[] } {
  const stripped = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start < 0 || end <= start) throw new ProjectError('评审没有返回 JSON 对象', 'review')
  let raw: unknown
  try {
    raw = JSON.parse(stripped.slice(start, end + 1))
  } catch (error) {
    throw new ProjectError(`评审 JSON 解析失败：${error instanceof Error ? error.message : String(error)}`, 'review')
  }
  if (raw === null || typeof raw !== 'object') throw new ProjectError('评审 JSON 不是对象', 'review')
  const data = raw as Record<string, unknown>
  const verdict = data.verdict
  if (verdict !== 'pass' && verdict !== 'revise' && verdict !== 'fail') {
    throw new ProjectError('评审 verdict 必须是 pass/revise/fail', 'review')
  }
  const rawFindings = Array.isArray(data.findings) ? data.findings : []
  const findings: ReviewFinding[] = []
  for (const item of rawFindings) {
    if (item === null || typeof item !== 'object') continue
    const entry = item as Record<string, unknown>
    const severity = entry.severity
    if (severity !== 'error' && severity !== 'warn' && severity !== 'info') continue
    const quote = String(entry.quote ?? '').trim()
    const issue = String(entry.issue ?? '').trim()
    const fix = String(entry.fix ?? '').trim()
    if (issue === '') continue
    findings.push({
      severity: severity as Severity,
      ...(entry.episode === undefined ? {} : { episode: Number(entry.episode) }),
      quote,
      issue,
      fix,
    })
  }
  return { verdict, findings }
}

export function reviewReport(outcome: ReviewOutcome, project: Project): string {
  const lines: string[] = [
    '---',
    'kind: review',
    `reviewKind: ${outcome.kind}`,
    `rubricVersion: ${outcome.rubricVersion}`,
    `verdict: ${outcome.verdict}`,
    `provider: ${outcome.provider}`,
    `model: ${outcome.model}`,
    `routeSource: ${outcome.routeSource}`,
    `at: ${outcome.at}`,
    '---',
    '',
    `# ${outcome.kind} 评审`,
    '',
    `项目：${project.settings.title}`,
    '',
    '## 总判断',
    '',
    `${outcome.verdict}（${outcome.rubricVersion}，${outcome.provider}/${outcome.model}）`,
    '',
  ]
  if (outcome.findings.length === 0) lines.push('没有逐条问题。评审通过不等于平台会过稿；仍需作者判断。', '')
  else {
    lines.push('| 级别 | 集 | 原文 | 问题 | 怎么改 |', '|---|---|---|---|---|')
    for (const item of outcome.findings) {
      const quote = item.quote.replace(/\|/g, '\\|').replace(/\n/g, ' ')
      lines.push(`| ${item.severity} | ${item.episode === undefined ? '—' : `第${String(item.episode)}集`} | ${quote} | ${item.issue.replace(/\|/g, '\\|')} | ${item.fix.replace(/\|/g, '\\|')} |`)
    }
    lines.push('')
  }
  lines.push('> 评审只给判断，不修改剧本；verdict 不是门禁，门禁只看作者确认与机检 error。', '')
  return lines.join('\n')
}
