import { createSettings } from '../src/core/project'
import { parseScript } from '../src/core/script'
import type { EpisodePlan, ProjectSettings, ScriptDoc } from '../src/core/types'

export const SCRIPT_BODY = `# 第1集 撞破

【本集任务】在葬礼上拿回母亲的遗物，完成第一次当众反击。
【转折】继母反咬她伪造遗嘱，周明远却站了出来。
【卡点】周明远看着她：「你姓林，对吗？」

1-1 日 内 林家灵堂
人物：林晚 继母 周明远 宾客X6

△灵堂正中摆着母亲的遗像。
继母（轻声）：这不是你该拿的东西。
林晚：这是我妈的。
林晚OS：她果然先动手了。

1-2 日 内 林家书房
人物：林晚 继母 周明远

△林晚把一份文件拍在桌上。
周明远（看着她）：你姓林，对吗？
`

export function makeSettings(overrides: Partial<ProjectSettings> = {}): ProjectSettings {
  return {
    ...createSettings({
      title: '重生后我成了首富的掌心娇',
      platform: '红果',
      genre: ['重生', '复仇'],
      audience: '女频',
      episodes: 10,
      secondsPerEpisode: 90,
      budgetTier: 'low',
    }),
    ...overrides,
  }
}

export function makeDoc(episode = 1, status: ScriptDoc['status'] = 'draft'): ScriptDoc {
  const parsed = parseScript(SCRIPT_BODY, { characters: ['林晚', '继母', '周明远'], charsPerSecond: 5.5 })
  return {
    ...parsed,
    episode,
    title: '撞破',
    status,
    hookType: '台词钩/身份暗示',
    file: `剧集/第${String(episode).padStart(3, '0')}集-撞破.md`,
    updatedAt: '2026-10-28T00:00:00.000Z',
    rawBody: SCRIPT_BODY,
  }
}

export function makePlan(number = 1, overrides: Partial<EpisodePlan> = {}): EpisodePlan {
  return {
    number,
    title: `第${String(number)}集`,
    stage: 1,
    goal: '在葬礼上拿回遗物，完成第一次反击',
    conflict: '继母反咬她伪造遗嘱',
    emotion: '反转打脸',
    size: number % 5 === 0 ? '大' : '小',
    infoGap: '配角和观众知道，主角不知道',
    hookType: '台词钩/身份暗示',
    hook: '周明远看着她：「你姓林，对吗？」',
    open30: { background: '林家葬礼', dilemma: '遗物被扣', motive: '拿回录音笔' },
    mid: { advance: '拿出第二份遗嘱', relation: '周明远替她说话', foreshadow: '遗嘱上的指纹' },
    close30: '周明远叫出她的本名',
    cast: ['林晚', '继母', '周明远'],
    locations: ['林家灵堂', '林家书房'],
    notes: '',
    ...overrides,
  }
}
