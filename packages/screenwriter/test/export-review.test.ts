import { describe, expect, it } from 'vitest'
import { runChecks } from '../src/core/checks'
import { submissionMarkdown, outlineMarkdown, scriptsMarkdown } from '../src/core/export'
import { emptyStory } from '../src/core/story'
import { parseReviewResponse, buildReviewRequest } from '../src/core/review'
import type { Character, Project } from '../src/core/types'
import { makeDoc, makePlan, makeSettings } from './fixtures'

const CHARACTERS: Character[] = [
  { name: '林晚', role: '主角', camp: '主角阵营', desire: '拿回公司', painPoint: '被赶出家门', personality: '外柔内狠', voice: '短句', arc: '自己定规则', costTier: '主要', firstEpisode: 1, exitEpisode: null, relations: [], notes: '' },
  { name: '继母', role: '反派', camp: '反派阵营', desire: '保住位置', painPoint: '续弦', personality: '体面', voice: '敬语', arc: '被体面反噬', costTier: '主要', firstEpisode: 1, exitEpisode: null, relations: [], notes: '' },
]

export function sampleProject(): Project {
  return {
    root: '/work',
    settings: makeSettings(),
    story: {
      ...emptyStory(),
      sentence: '被赶出家门的真千金，要在三个月内拿回母亲的公司。',
      protagonist: '林晚', goal: '拿回公司', obstacle: '继母', edge: '听见遗物',
      desire: '让母亲的名字回来', emotion: '夺回', ending: '股东大会翻盘',
      differentiators: ['自己破局'],
      stages: [
        { index: 1, from: 1, to: 10, task: '黄金窗口', goal: '立主线', miniGoal: '拿回遗物', infoGap: '配角和观众知道，主角不知道' },
        { index: 2, from: 11, to: 30, task: '稳固发展', goal: '拿回文件', miniGoal: '进董事会', infoGap: '主角和观众知道，配角不知道' },
        { index: 3, from: 31, to: 80, task: '高潮收束', goal: '翻盘', miniGoal: '继母认罪', infoGap: '观众知道，主角和配角不知道' },
      ],
      promises: [{ id: 'p-001', plantedAt: 1, dueAt: 10, payoff: '录音笔', status: '未回收' }],
    },
    characters: CHARACTERS,
    plans: new Map([[1, makePlan(1)]]),
    scripts: new Map([[1, makeDoc(1)]]),
    dissections: [],
    confirmations: [{ kind: 'settings', at: '2026-10-28T00:00:00.000Z', summary: '立项', userWords: '可以', episodes: [] }],
  }
}

describe('exports', () => {
  it('builds a submission with the nine required parts', () => {
    const project = sampleProject()
    const check = runChecks(project, { scope: 'all' })
    const text = submissionMarkdown(project, check)
    for (const heading of ['1. 作品信息', '2. 一句话', '3. 卖点与差异化', '4. 人物小传', '5. 三阶段', '6. 分集大纲', '7. 前三集剧本', '8. 检查摘要', '9. 待确认事项']) {
      expect(text).toContain(heading)
    }
    expect(text).toContain('林晚')
  })

  it('renders all scripts and the outline', () => {
    const project = sampleProject()
    expect(scriptsMarkdown(project)).toContain('第1集')
    expect(outlineMarkdown(project)).toContain('黄金窗口')
  })
})

describe('review parsing', () => {
  it('parses fenced JSON and normalizes findings', () => {
    const result = parseReviewResponse('```json\n{"verdict":"revise","findings":[{"severity":"warn","episode":1,"quote":"你姓林，对吗？","issue":"钩子够，但身份揭示依赖台词","fix":"改成动作"}]}\n```')
    expect(result.verdict).toBe('revise')
    expect(result.findings[0]?.episode).toBe(1)
  })

  it('rejects an unknown verdict', () => {
    expect(() => parseReviewResponse('{"verdict":"maybe","findings":[]}')).toThrow(/verdict/)
  })

  it('builds an opening request with the first three episodes', () => {
    const project = sampleProject()
    project.scripts.set(2, makeDoc(2))
    project.scripts.set(3, makeDoc(3))
    const request = buildReviewRequest(project, 'opening')
    expect(request.rubricVersion).toBe('opening@1')
    expect(request.episodes).toEqual([1, 2, 3])
    expect(request.user).toContain('第1集')
  })
})
