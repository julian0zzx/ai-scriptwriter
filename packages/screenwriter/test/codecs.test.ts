import { describe, expect, it } from 'vitest'
import { emptyStory, readStory, writeStory } from '../src/core/story'
import { readCharacters, writeCharacters } from '../src/core/cast'
import { readOutline, writeAllBatches, writeBatch } from '../src/core/outline'
import { makePlan } from './fixtures'
import type { Character, Story } from '../src/core/types'

const STORY: Story = {
  ...emptyStory(),
  protagonist: '林晚，被赶出家门的林家真千金',
  goal: '三个月内拿回母亲的公司',
  obstacle: '继母买通董事会，握有伪造遗嘱',
  edge: '能听见死者遗物上的声音',
  desire: '让母亲的名字重新挂回公司门口',
  emotion: '被夺走一切的人，把名字一件件拿回来',
  ending: '股东大会上播放母亲录音，继母当众认罪',
  differentiators: ['不是霸总救我，是女主自己破局'],
  comparables: ['《XX》'],
  stages: [
    { index: 1, from: 1, to: 10, task: '黄金窗口', goal: '立主线', miniGoal: '拿回遗物', infoGap: '配角和观众知道，主角不知道' },
    { index: 2, from: 11, to: 30, task: '稳固发展', goal: '拿到原始文件', miniGoal: '进入董事会', infoGap: '主角和观众知道，配角不知道' },
    { index: 3, from: 31, to: 80, task: '高潮收束', goal: '股东大会翻盘', miniGoal: '继母自认伪造', infoGap: '观众知道，主角和配角不知道' },
  ],
  promises: [
    { id: 'p-001', plantedAt: 1, dueAt: 10, payoff: '录音笔', status: '未回收' },
    { id: 'p-002', plantedAt: 3, dueAt: 35, payoff: '指纹报告', status: '已回收' },
  ],
}

const CHARACTER: Character = {
  name: '林晚',
  role: '主角',
  camp: '主角阵营',
  desire: '拿回公司',
  painPoint: '被赶出家门',
  personality: '外柔内狠',
  voice: '短句，习惯反问',
  arc: '从求认可到自己定规则',
  costTier: '主要',
  firstEpisode: 1,
  exitEpisode: null,
  relations: [{ target: '周明远', kind: '旧识' }],
  notes: '记忆点：左手腕有一道旧疤',
}

describe('story codec', () => {
  it('round-trips slots, stages and promises', () => {
    const text = writeStory(STORY, '2026-10-28T00:00:00.000Z')
    const back = readStory(text)
    expect(back.goal).toBe(STORY.goal)
    expect(back.stages).toHaveLength(3)
    expect(back.promises).toHaveLength(2)
    expect(back.promises[0]?.id).toBe('p-001')
    expect(back.differentiators).toEqual(STORY.differentiators)
  })

  it('composes a sentence from slots when missing', () => {
    const text = writeStory({ ...STORY, sentence: '' }, '2026-10-28T00:00:00.000Z')
    expect(readStory(text).sentence).toContain('林晚')
  })

  it('preserves unknown sections', () => {
    const text = writeStory(STORY, '2026-10-28T00:00:00.000Z')
    const withExtra = `${text}\n## 备注\n\n不要删我\n`
    const rewritten = writeStory(STORY, '2026-10-29T00:00:00.000Z', withExtra)
    expect(rewritten).toContain('不要删我')
  })
})

describe('cast codec', () => {
  it('round-trips a character with relations and notes', () => {
    const text = writeCharacters([CHARACTER])
    const back = readCharacters(text)
    expect(back).toHaveLength(1)
    expect(back[0]).toMatchObject({ name: '林晚', role: '主角', costTier: '主要' })
    expect(back[0]?.relations[0]).toMatchObject({ target: '周明远', kind: '旧识' })
    expect(back[0]?.notes).toContain('旧疤')
  })
})

describe('outline codec', () => {
  it('round-trips plans in a 10-episode batch', () => {
    const batch = { from: 1, to: 10 }
    const text = writeBatch([makePlan(1), makePlan(2)], '2026-10-28T00:00:00.000Z', batch).text
    const back = readOutline(text, '分集大纲/第001-010集.md')
    expect(back).toHaveLength(2)
    expect(back[0]?.number).toBe(1)
    expect(back[0]?.open30.motive).toBe('拿回录音笔')
    expect(back[0]?.cast).toEqual(['林晚', '继母', '周明远'])
  })

  it('splits episodes into separate batch files', () => {
    const files = writeAllBatches([makePlan(1), makePlan(12)], '2026-10-28T00:00:00.000Z')
    expect(files.map((file) => file.file)).toEqual(['分集大纲/第001-010集.md', '分集大纲/第011-020集.md'])
  })
})
