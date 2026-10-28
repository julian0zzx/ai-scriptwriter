import { describe, expect, it } from 'vitest'
import { registerTools, TOOL_NAMES } from '../src/host/tools'
import { normalizeConfig } from '../src/host/config'
import { ProjectStore } from '../src/host/store'
import { MemoryFs } from './memory-fs'
import { SCRIPT_BODY } from './fixtures'

interface RegisteredTool {
  name: string
  execute(args: Record<string, unknown>, exec: unknown): Promise<Record<string, any>>
}

function setup() {
  const fs = new MemoryFs()
  const store = new ProjectStore(fs, '/work')
  const defs: RegisteredTool[] = []
  const ctx = {
    tools: { register: (definition: RegisteredTool) => defs.push(definition) },
    reflect: { get: () => undefined },
  }
  const resolver = {
    rootFor: () => ({ root: '/work', source: 'config' as const }),
    storeFor: () => store,
    storeForSession: () => store,
  }
  registerTools(ctx as never, normalizeConfig({}), resolver as never)
  const exec = { agent: { session: { header: { cwd: '/work' } } }, signal: new AbortController().signal }
  const call = async (name: string, args: Record<string, unknown>) => {
    const definition = defs.find((item) => item.name === name)
    if (definition === undefined) throw new Error(`missing tool ${name}`)
    return definition.execute(args, exec)
  }
  return { fs, defs, call }
}

const INIT = {
  title: '重生后我成了首富的掌心娇',
  platform: '红果',
  genre: ['重生', '复仇'],
  audience: '女频',
  episodes: 10,
  secondsPerEpisode: 90,
}

const CAST = {
  operation: 'upsert',
  name: '林晚',
  role: '主角',
  camp: '主角阵营',
  desire: '拿回公司',
  painPoint: '被赶出家门',
  personality: '外柔内狠',
  voice: '短句，习惯反问',
  arc: '自己定规则',
  costTier: '主要',
  firstEpisode: 1,
}

describe('tool surface', () => {
  it('registers exactly the eleven public tools', () => {
    const { defs } = setup()
    expect(defs.map((item) => item.name).sort()).toEqual([...TOOL_NAMES].sort())
    expect(defs).toHaveLength(11)
  })

  it('initializes, gates, confirms and writes an episode', async () => {
    const { call } = setup()
    const init = await call('scriptwriter_init', INIT)
    expect(init.ok).toBe(true)
    expect(init.stage).toBe('pitch')

    const blocked = await call('scriptwriter_script', { operation: 'write', episode: 1, body: SCRIPT_BODY })
    expect(blocked.ok).toBe(false)
    expect(blocked.blockers[0].code).toBe('GATE_SETTINGS')

    const pitch = await call('scriptwriter_story', {
      operation: 'pitch',
      protagonist: '林晚', goal: '拿回公司', obstacle: '继母', edge: '听见遗物',
      desire: '让母亲的名字回来', emotion: '夺回', ending: '股东大会翻盘',
      differentiators: ['自己破局'],
    })
    expect(pitch.ok).toBe(true)

    const stage = await call('scriptwriter_story', {
      operation: 'stage',
      stages: [{ index: 1, from: 1, to: 10, task: '黄金窗口', goal: '立主线', miniGoal: '拿回遗物', infoGap: '配角和观众知道，主角不知道' }],
    })
    expect(stage.ok).toBe(true)

    const cast = await call('scriptwriter_cast', CAST)
    expect(cast.ok).toBe(true)

    const plan = await call('scriptwriter_outline', {
      operation: 'plan',
      number: 1,
      title: '撞破',
      stage: 1,
      goal: '拿回遗物',
      conflict: '继母反咬',
      emotion: '反转打脸',
      size: '大',
      infoGap: '配角和观众知道，主角不知道',
      hookType: '台词钩/身份暗示',
      hook: '你姓林，对吗？',
      open30: { background: '葬礼', dilemma: '遗物被扣', motive: '拿回录音笔' },
      mid: { advance: '拿出第二份遗嘱', relation: '周明远替她说话', foreshadow: '指纹' },
      close30: '周明远叫出本名',
      castList: ['林晚'],
      locations: ['林家灵堂', '林家书房'],
    })
    expect(plan.ok).toBe(true)

    const confirm = await call('scriptwriter_confirm', {
      kind: 'settings',
      summary: '立项：女频重生复仇，10 集 × 90 秒；一句话、人物、三阶段已定。',
      userWords: '可以，就按这个方向写。',
    })
    expect(confirm.ok).toBe(true)

    const bad = await call('scriptwriter_script', { operation: 'write', episode: 1, body: '第1集\n1-1 日 内 客厅\n人物：林晚\n△门开了。' })
    expect(bad.ok).toBe(false)
    expect(bad.blockers[0].code).toBe('PARSE_FATAL')

    const written = await call('scriptwriter_script', { operation: 'write', episode: 1, body: SCRIPT_BODY })
    expect(written.ok).toBe(true)
    expect(written.data.file).toBe('剧集/第001集-撞破.md')
    expect(written.data.words).toBeGreaterThan(50)

    const check = await call('scriptwriter_check', { scope: 'episode', episode: 1 })
    expect(check.ok).toBe(true)
    expect(check.data.counts.error).toBe(0)

    const status = await call('scriptwriter_status', { detail: 'dashboard' })
    expect(status.ok).toBe(true)
    expect(status.data.dashboard.progress.written).toBe(1)
  })

  it('serves craft sheets and gates submission behind delivery confirmation', async () => {
    const { call } = setup()
    const craft = await call('scriptwriter_status', { detail: 'craft', topic: 'hook' })
    expect(craft.ok).toBe(true)
    expect(craft.data.topic.id).toBe('hook')
    await call('scriptwriter_init', INIT)
    const exported = await call('scriptwriter_export', { kind: 'submission' })
    expect(exported.ok).toBe(false)
    expect(exported.blockers[0].code).toBe('GATE_DELIVERY')
  })

  it('returns a refusal with an unblock path when no project exists', async () => {
    const { call } = setup()
    const status = await call('scriptwriter_status', { detail: 'dashboard' })
    expect(status.ok).toBe(true)
    expect(status.data.stage).toBe('setup')
    const check = await call('scriptwriter_check', {})
    expect(check.ok).toBe(false)
    expect(check.blockers[0].code).toBe('NOT_FOUND')
  })
})
