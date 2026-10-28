/** Finding merge, ordering, counting and report rendering. Pure. */

import { SEVERITY_WEIGHT } from './enums.js'
import type { CheckCounts, CheckResult, Finding, Severity } from './types.js'

export interface FindingInput {
  code: string
  severity: Severity
  ruleRef: string
  message: string
  file?: string
  episode?: number
  scene?: string
  line?: number
  evidence?: string
  suggestion?: string
}

export function finding(input: FindingInput): Finding {
  const location = {
    ...(input.file === undefined ? {} : { file: input.file }),
    ...(input.episode === undefined ? {} : { episode: input.episode }),
    ...(input.scene === undefined ? {} : { scene: input.scene }),
    ...(input.line === undefined ? {} : { line: input.line }),
  }
  return {
    code: input.code,
    severity: input.severity,
    ruleRef: input.ruleRef,
    message: input.message,
    ...(Object.keys(location).length === 0 ? {} : { location }),
    ...(input.evidence === undefined ? {} : { evidence: input.evidence.slice(0, 80) }),
    ...(input.suggestion === undefined ? {} : { suggestion: input.suggestion }),
  }
}

function sortKey(item: Finding): [number, number, string, number, string] {
  return [
    SEVERITY_WEIGHT[item.severity] ?? 9,
    item.location?.episode ?? 0,
    item.location?.scene ?? '',
    item.location?.line ?? 0,
    item.code,
  ]
}

export function mergeFindings(...groups: ReadonlyArray<readonly Finding[]>): Finding[] {
  const seen = new Set<string>()
  const out: Finding[] = []
  for (const item of groups.flat()) {
    const key = [item.code, item.location?.file ?? '', item.location?.episode ?? '', item.location?.scene ?? '', item.location?.line ?? ''].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out.sort((a, b) => {
    const left = sortKey(a)
    const right = sortKey(b)
    for (let i = 0; i < left.length; i += 1) {
      const l = left[i]
      const r = right[i]
      if (l === r) continue
      return typeof l === 'number' && typeof r === 'number' ? l - r : String(l).localeCompare(String(r), 'zh-CN')
    }
    return 0
  })
}

export function countFindings(findings: readonly Finding[]): CheckCounts {
  const counts: CheckCounts = { error: 0, warn: 0, info: 0 }
  for (const item of findings) counts[item.severity] += 1
  return counts
}

export function checkResult(findings: Finding[], rulesVersion: string, checkedEpisodes: number[]): CheckResult {
  const merged = mergeFindings(findings)
  return {
    counts: countFindings(merged),
    findings: merged,
    rulesVersion,
    checkedEpisodes,
    report: renderCheckReport(merged, rulesVersion, checkedEpisodes),
  }
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

export function renderCheckReport(findings: readonly Finding[], rulesVersion: string, episodes: readonly number[]): string {
  const counts = countFindings(findings)
  const lines: string[] = [
    '---',
    'kind: check',
    `rulesVersion: ${rulesVersion}`,
    `episodes: [${episodes.join(', ')}]`,
    `counts: { error: ${String(counts.error)}, warn: ${String(counts.warn)}, info: ${String(counts.info)} }`,
    '---',
    '',
    '# 审查报告',
    '',
    '## 摘要',
    '',
    `- 检查集数：${episodes.length === 0 ? '无' : episodes.map((episode) => `第${String(episode)}集`).join('、')}`,
    `- error ${String(counts.error)} / warn ${String(counts.warn)} / info ${String(counts.info)}`,
    `- 规则版本：${rulesVersion}`,
    '',
  ]
  if (findings.length === 0) {
    lines.push('没有发现符合当前规则的问题。机检通过不等于剧本合格，仍需作者与评审判断。', '')
    return lines.join('\n')
  }
  const errors = findings.filter((item) => item.severity === 'error')
  if (errors.length > 0) {
    lines.push('## 必须先修（error）', '', '| 代码 | 规则 | 位置 | 问题 | 建议 |', '|---|---|---|---|---|')
    for (const item of errors) {
      lines.push(`| ${item.code} | ${item.ruleRef} | ${escapeCell(locationText(item))} | ${escapeCell(item.message)} | ${escapeCell(item.suggestion ?? '')} |`)
    }
    lines.push('')
  }
  lines.push('## 全部问题', '', '| 级别 | 代码 | 规则 | 位置 | 问题 | 证据 | 建议 |', '|---|---|---|---|---|---|---|')
  for (const item of findings) {
    lines.push(`| ${item.severity} | ${item.code} | ${item.ruleRef} | ${escapeCell(locationText(item))} | ${escapeCell(item.message)} | ${escapeCell(item.evidence ?? '')} | ${escapeCell(item.suggestion ?? '')} |`)
  }
  lines.push('', '> 合规类（CMP-*）只是提醒清单，需人工复核；本报告不构成合规结论。', '')
  return lines.join('\n')
}

export function locationText(item: Finding): string {
  const parts: string[] = []
  if (item.location?.file !== undefined) parts.push(item.location.file)
  if (item.location?.episode !== undefined) parts.push(`第${String(item.location.episode)}集`)
  if (item.location?.scene !== undefined) parts.push(item.location.scene)
  if (item.location?.line !== undefined) parts.push(`第${String(item.location.line)}行`)
  return parts.join(' ') === '' ? '—' : parts.join(' ')
}

export function summaryLine(counts: CheckCounts): string {
  return `error ${String(counts.error)} / warn ${String(counts.warn)} / info ${String(counts.info)}`
}
