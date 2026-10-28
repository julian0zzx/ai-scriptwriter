import { describe, expect, it } from 'vitest'
import { dumpYaml, parseYaml } from '../src/core/yaml'

describe('yaml subset', () => {
  it('parses mappings, nested lists and flow arrays', () => {
    const value = parseYaml(`
sentence: 他看着她：「你姓林？」
stages:
  - index: 1
    from: 1
    to: 10
    task: 黄金窗口
    infoGap: 配角和观众知道，主角不知道
  - index: 2
    from: 11
    to: 30
    task: 稳固发展
      `)
    expect(value).toMatchObject({
      sentence: '他看着她：「你姓林？」',
    })
    const stages = (value as { stages: Array<Record<string, unknown>> }).stages
    expect(stages).toHaveLength(2)
    expect(stages[0]).toMatchObject({ index: 1, from: 1, to: 10, task: '黄金窗口' })
    expect(stages[1]).toMatchObject({ index: 2, from: 11, to: 30 })
  })

  it('parses flow arrays and inline objects', () => {
    const value = parseYaml('range: [1, 10]\ncast: [林晚, 继母]\nmeta: {a: 1, b: "x"}')
    expect(value).toEqual({ range: [1, 10], cast: ['林晚', '继母'], meta: { a: 1, b: 'x' } })
  })

  it('parses quoted and block scalars', () => {
    const value = parseYaml('a: "含: 冒号"\nb: |\n  第一行\n  第二行\n') as Record<string, unknown>
    expect(value.a).toBe('含: 冒号')
    expect(value.b).toBe('第一行\n第二行')
  })

  it('round-trips the subset it emits', () => {
    const input = {
      title: '撞破',
      count: 2,
      ok: true,
      empty: null,
      list: ['a', 'b'],
      nested: { a: 1, b: '两' },
      rows: [{ target: '周明远', kind: '旧识' }, { target: '继母', kind: '宿敌' }],
    }
    expect(parseYaml(dumpYaml(input))).toEqual(input)
  })

  it('reports a line number for malformed input', () => {
    expect(() => parseYaml('a: [1, 2')).toThrow(/第 1 行/)
  })
})
