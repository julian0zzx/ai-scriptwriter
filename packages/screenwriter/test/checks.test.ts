import { describe, expect, it } from 'vitest'
import { runChecks } from '../src/core/checks'
import { emptyStory } from '../src/core/story'
import type { Character, EpisodePlan, Project, ScriptDoc } from '../src/core/types'
import { makeDoc, makePlan, makeSettings } from './fixtures'

function character(name: string, role = '主角'): Character {
  return {
    name, role, camp: role === '反派' ? '反派阵营' : '主角阵营',
    desire: '想要', painPoint: '痛点', personality: '性格', voice: '说话', arc: '弧光',
    costTier: role === '主角' ? '主要' : '配角', firstEpisode: 1, exitEpisode: null, relations: [], notes: '',
  }
}

function project(overrides: { doc?: ScriptDoc; plan?: EpisodePlan | undefined; plans?: EpisodePlan[]; scripts?: ScriptDoc[]; story?: Partial<ReturnType<typeof emptyStory>> } = {}): Project {
  const scripts = new Map<number, ScriptDoc>()
  for (const doc of overrides.scripts ?? [overrides.doc ?? makeDoc(1)]) scripts.set(doc.episode, doc)
  const plans = new Map<number, EpisodePlan>()
  if (overrides.plans !== undefined) for (const plan of overrides.plans) plans.set(plan.number, plan)
  else if (overrides.plan !== undefined) plans.set(overrides.plan.number, overrides.plan)
  else plans.set(1, makePlan(1))
  return {
    root: '/work',
    settings: makeSettings(),
    story: {
      ...emptyStory(),
      protagonist: '林晚', goal: '拿回公司', obstacle: '继母', edge: '听见遗物',
      desire: '让母亲的名字回来', emotion: '夺回', ending: '股东大会翻盘',
      differentiators: ['自己破局'],
      stages: [{ index: 1, from: 1, to: 10, task: '黄金窗口', goal: '立主线', miniGoal: '拿回遗物', infoGap: '配角和观众知道，主角不知道' }],
      ...overrides.story,
    },
    characters: [character('林晚'), character('继母', '反派'), character('周明远', '核心伙伴')],
    plans,
    scripts,
    dissections: [],
    confirmations: [],
  }
}

describe('deterministic checks', () => {
  it('finds no errors in a well-formed episode', () => {
    const result = runChecks(project(), { scope: 'episode', episode: 1 })
    expect(result.counts.error).toBe(0)
    expect(result.findings.some((item) => item.code === 'STR-008')).toBe(false)
  })

  it('reports a missing hook as an error', () => {
    const plan = makePlan(1, { hook: '' })
    const result = runChecks(project({ plan }), { scope: 'episode', episode: 1 })
    expect(result.counts.error).toBeGreaterThan(0)
    expect(result.findings.map((item) => item.code)).toContain('STR-008')
    expect(result.findings.find((item) => item.code === 'STR-008')?.ruleRef).toBe('DR-18')
  })

  it('reports an invalid hook type', () => {
    const plan = makePlan(1, { hookType: '随便钩' })
    const result = runChecks(project({ plan }), { scope: 'episode', episode: 1 })
    expect(result.findings.map((item) => item.code)).toContain('STR-009')
  })

  it('reports a script without an outline as an error', () => {
    const result = runChecks(project({ plans: [] }), { scope: 'episode', episode: 1 })
    expect(result.findings.map((item) => item.code)).toContain('STR-005')
    expect(result.findings.find((item) => item.code === 'STR-005')?.severity).toBe('error')
  })

  it('warns on a short episode and a long estimate', () => {
    const doc = makeDoc(1)
    doc.words = 100
    doc.seconds = 130
    const result = runChecks(project({ doc }), { scope: 'episode', episode: 1 })
    expect(result.findings.map((item) => item.code)).toEqual(expect.arrayContaining(['DUR-001', 'DUR-003']))
  })

  it('warns when a promise is overdue', () => {
    const doc = makeDoc(1)
    const doc2 = makeDoc(2)
    const projectWith = project({
      scripts: [doc, doc2],
      story: { promises: [{ id: 'p-001', plantedAt: 1, dueAt: 1, payoff: '录音', status: '未回收' }] },
    })
    const result = runChecks(projectWith, { scope: 'all' })
    expect(result.findings.map((item) => item.code)).toContain('STR-007')
  })

  it('reports a compliance reminder as info only', () => {
    const doc = makeDoc(1)
    const scene = doc.scenes[0]!
    scene.lines.push({ kind: 'action', text: '画面里出现血腥的断肢。', line: 99 })
    const result = runChecks(project({ doc }), { scope: 'episode', episode: 1 })
    const hit = result.findings.find((item) => item.code === 'CMP-001')
    expect(hit?.severity).toBe('info')
  })

  it('warns when all plans use the same information gap', () => {
    const plans = Array.from({ length: 6 }, (_, index) => makePlan(index + 1))
    const result = runChecks(project({ plans }), { scope: 'all' })
    expect(result.findings.map((item) => item.code)).toContain('STR-010')
  })

  it('reports a location that is not in the plan', () => {
    const doc = makeDoc(1)
    doc.scenes[0]!.location = '天台'
    const result = runChecks(project({ doc }), { scope: 'episode', episode: 1 })
    expect(result.findings.map((item) => item.code)).toContain('CON-004')
  })
})
