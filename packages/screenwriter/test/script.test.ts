import { describe, expect, it } from 'vitest'
import { parseScript, renderScript } from '../src/core/script'
import type { ScriptDoc } from '../src/core/types'

const BODY = `# 第1集 撞破

【本集任务】在葬礼上拿回母亲的遗物，完成第一次当众反击。
【转折】继母反咬她伪造遗嘱，周明远却站了出来。
【卡点】周明远看着她：「你姓林，对吗？」

1-1 日 内 林家灵堂
人物：林晚 继母 周明远 宾客X6

△灵堂正中摆着母亲的遗像。
△（字幕：十年前）
继母（轻声，带笑）：这不是你该拿的东西。
林晚：这是我妈的。
林晚OS：她果然先动手了。
VO林晚：那年我十岁。
△【闪回】十年前的雨夜，林晚被赶出家门。
△【闪出】

1-2 日 内 林家书房
人物：林晚 继母 周明远

△林晚把一份文件拍在桌上。
周明远（看着她）：你姓林，对吗？
`

function docOf(body = BODY): ScriptDoc {
  const parsed = parseScript(body, { characters: ['林晚', '继母', '周明远'], charsPerSecond: 5.5 })
  return {
    ...parsed,
    status: 'draft',
    hookType: '台词钩/身份暗示',
    file: '剧集/第001集-撞破.md',
    updatedAt: '2026-10-28T00:00:00.000Z',
    rawBody: body,
  }
}

describe('script parser', () => {
  it('parses headers, scenes, cast and dialogue modes', () => {
    const parsed = parseScript(BODY, { characters: ['林晚', '继母', '周明远'] })
    expect(parsed.episode).toBe(1)
    expect(parsed.header.task).toContain('遗物')
    expect(parsed.header.hook).toContain('你姓林')
    expect(parsed.scenes).toHaveLength(2)
    expect(parsed.scenes[0]?.cast).toEqual(['林晚', '继母', '周明远', '宾客X6'])
    const lines = parsed.scenes[0]?.lines ?? []
    expect(lines.some((line) => line.kind === 'subtitle')).toBe(true)
    expect(lines.some((line) => line.kind === 'flashback')).toBe(true)
    expect(lines.some((line) => line.kind === 'dialogue' && line.mode === 'os')).toBe(true)
    expect(lines.some((line) => line.kind === 'dialogue' && line.mode === 'vo')).toBe(true)
    expect(lines.some((line) => line.kind === 'dialogue' && line.speaker === '继母' && line.paren === '轻声，带笑')).toBe(true)
    expect(parsed.hookScene).toBe('1-2')
    expect(parsed.words).toBeGreaterThan(0)
    expect(parsed.findings.filter((item) => item.severity === 'error')).toEqual([])
  })

  it('round-trips structure through render', () => {
    const doc = docOf()
    const rendered = renderScript(doc)
    const again = parseScript(rendered, { characters: ['林晚', '继母', '周明远'], charsPerSecond: 5.5 })
    expect(again.scenes.map((scene) => scene.no)).toEqual(['1-1', '1-2'])
    expect(again.scenes[0]?.cast).toEqual(doc.scenes[0]?.cast)
    expect(again.episode).toBe(1)
    expect(again.header.hook).toBe(doc.header.hook)
  })

  it('reports a missing episode line', () => {
    const parsed = parseScript('1-1 日 内 客厅\n人物：甲\n△门开了。', { characters: ['甲'] })
    expect(parsed.findings.map((item) => item.code)).toContain('FMT-001')
  })

  it('reports an unrecognized line and an unregistered speaker', () => {
    const parsed = parseScript('第1集\n【卡点】门开了\n1-1 日 内 客厅\n人物：甲\n这一行不是任何格式', { characters: [] })
    expect(parsed.findings.map((item) => item.code)).toContain('FMT-009')
  })

  it('accepts the four-line scene header', () => {
    const parsed = parseScript('第1集\n【卡点】她回头\n夜\n内\n地点：车厢\n场1-1\n人物：林晚\n林晚：开车。', { characters: ['林晚'] })
    expect(parsed.findings.filter((item) => item.severity === 'error')).toEqual([])
    expect(parsed.scenes[0]).toMatchObject({ no: '1-1', dayNight: '夜', intExt: '内', location: '车厢' })
  })
})
