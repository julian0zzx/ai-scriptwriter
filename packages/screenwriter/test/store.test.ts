import { describe, expect, it } from 'vitest'
import { ProjectStore } from '../src/host/store'
import { MemoryFs } from './memory-fs'
import { makeDoc, makePlan, makeSettings } from './fixtures'
import { emptyStory } from '../src/core/story'
import { writeStory } from '../src/core/story'

describe('ProjectStore', () => {
  it('initializes a project and loads it back', async () => {
    const fs = new MemoryFs()
    const store = new ProjectStore(fs, '/work', { now: () => new Date('2026-10-28T00:00:00.000Z') })
    const result = await store.init(makeSettings())
    expect(result.created).toBe(true)
    expect(fs.files.has('.duanju/project.json')).toBe(true)
    const project = await store.load()
    expect(project?.settings.title).toContain('掌心娇')
    expect(project?.characters).toEqual([])
  })

  it('is idempotent unless overwrite is requested', async () => {
    const fs = new MemoryFs()
    const store = new ProjectStore(fs, '/work')
    await store.init(makeSettings())
    const again = await store.init(makeSettings({ title: '别的' }))
    expect(again.created).toBe(false)
    const project = await store.load()
    expect(project?.settings.title).toBe(makeSettings().title)
  })

  it('persists story, cast, plans and scripts', async () => {
    const fs = new MemoryFs()
    const store = new ProjectStore(fs, '/work')
    await store.init(makeSettings())
    await store.saveStory({
      ...emptyStory(),
      protagonist: '林晚',
      goal: '拿回公司',
      obstacle: '继母',
      edge: '听见遗物',
      desire: '让母亲的名字回来',
      emotion: '夺回',
      ending: '股东大会翻盘',
      differentiators: ['自己破局'],
      stages: [
        { index: 1, from: 1, to: 10, task: '黄金窗口', goal: '立主线', miniGoal: '拿回遗物', infoGap: '配角和观众知道，主角不知道' },
      ],
    })
    await store.saveCharacters([{
      name: '林晚', role: '主角', camp: '主角阵营', desire: '拿回公司', painPoint: '被赶出家门',
      personality: '外柔内狠', voice: '短句', arc: '自己定规则', costTier: '主要', firstEpisode: 1, exitEpisode: null, relations: [], notes: '',
    }])
    await store.savePlans([makePlan(1)])
    await store.saveScript(makeDoc(1))
    const project = await store.load()
    expect(project?.story.goal).toBe('拿回公司')
    expect(project?.characters[0]?.name).toBe('林晚')
    expect(project?.plans.get(1)?.hookType).toBe('台词钩/身份暗示')
    expect(project?.scripts.get(1)?.scenes).toHaveLength(2)
    expect(project?.scripts.get(1)?.file).toBe('剧集/第001集-撞破.md')
  })

  it('adopts a hand-edited story file as authoritative', async () => {
    const fs = new MemoryFs()
    const store = new ProjectStore(fs, '/work')
    await store.init(makeSettings())
    await store.saveStory({ ...emptyStory(), goal: '旧目标' })
    const before = fs.files.get('故事大纲.md') ?? ''
    fs.files.set('故事大纲.md', before.replaceAll('旧目标', '手改后的目标'))
    const project = await store.load()
    expect(project?.story.goal).toBe('手改后的目标')
  })

  it('merges plans into the same batch file', async () => {
    const fs = new MemoryFs()
    const store = new ProjectStore(fs, '/work')
    await store.init(makeSettings())
    await store.savePlans([makePlan(1)])
    await store.savePlans([makePlan(2)])
    const project = await store.load()
    expect([...project?.plans.keys() ?? []]).toEqual([1, 2])
  })

  it('records and reads the last check', async () => {
    const fs = new MemoryFs()
    const store = new ProjectStore(fs, '/work')
    await store.init(makeSettings())
    const path = await store.writeCheckResult('# 报告\n', 'all', {
      at: '2026-10-28T00:00:00.000Z',
      counts: { error: 1, warn: 2, info: 3 },
      episodes: [1],
    })
    expect(path).toMatch(/^\.duanju\/reports\/check-/)
    const last = await store.readLastCheck()
    expect(last?.counts).toEqual({ error: 1, warn: 2, info: 3 })
  })

  it('does not overwrite a hand-written story when rewriting another layer', async () => {
    const fs = new MemoryFs()
    const store = new ProjectStore(fs, '/work')
    await store.init(makeSettings())
    const story = writeStory({ ...emptyStory(), goal: '目标' }, '2026-10-28T00:00:00.000Z')
    fs.files.set('故事大纲.md', `${story}\n## 手写备注\n\n保留\n`)
    await store.savePlans([makePlan(1)])
    expect(fs.files.get('故事大纲.md')).toContain('保留')
  })
})
