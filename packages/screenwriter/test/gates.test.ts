import { describe, expect, it } from 'vitest'
import { deriveStage, confirmationPrereqs, scriptGate, submissionGate } from '../src/core/gates'
import type { Project } from '../src/core/types'
import { makeDoc, makePlan, makeSettings } from './fixtures'
import { emptyStory } from '../src/core/story'

function project(overrides: Partial<Project> = {}): Project {
  return {
    root: '/work',
    settings: makeSettings(),
    story: {
      ...emptyStory(),
      protagonist: '林晚', goal: '拿回公司', obstacle: '继母', edge: '听见遗物',
      desire: '让母亲的名字回来', emotion: '夺回', ending: '股东大会翻盘',
      stages: [{ index: 1, from: 1, to: 10, task: '黄金窗口', goal: '立主线', miniGoal: '拿回遗物', infoGap: '配角和观众知道，主角不知道' }],
    },
    characters: [],
    plans: new Map([[1, makePlan(1)]]),
    scripts: new Map(),
    dissections: [],
    confirmations: [],
    ...overrides,
  }
}

describe('gates', () => {
  it('requires settings confirmation before episode 1', () => {
    const gate = scriptGate(project(), 1)
    expect(gate?.code).toBe('GATE_SETTINGS')
    const confirmed = project({ confirmations: [{ kind: 'settings', at: 'x', summary: 's', userWords: '可以', episodes: [] }] })
    expect(scriptGate(confirmed, 1)).toBeUndefined()
  })

  it('requires opening confirmation before episode 4', () => {
    const confirmed = project({ confirmations: [{ kind: 'settings', at: 'x', summary: 's', userWords: '可以', episodes: [] }] })
    expect(scriptGate(confirmed, 4)?.code).toBe('GATE_OPENING')
  })

  it('requires delivery confirmation before submission', () => {
    expect(submissionGate(project())?.code).toBe('GATE_DELIVERY')
  })

  it('derives setup stages from data', () => {
    expect(deriveStage(project({ story: emptyStory() }))).toBe('pitch')
    expect(deriveStage(project())).toBe('outline')
    const withOpening = project({
      plans: new Map([[1, makePlan(1)], [2, makePlan(2)], [3, makePlan(3)]]),
      scripts: new Map([[1, makeDoc(1)], [2, makeDoc(2)], [3, makeDoc(3)]]),
      confirmations: [{ kind: 'settings', at: 'x', summary: 's', userWords: '可以', episodes: [] }],
    })
    expect(deriveStage(withOpening)).toBe('opening')
  })

  it('refuses settings confirmation without a protagonist', () => {
    const blockers = confirmationPrereqs(project(), 'settings')
    expect(blockers.map((item) => item.code)).toContain('MISSING_PROTAGONIST')
  })
})
