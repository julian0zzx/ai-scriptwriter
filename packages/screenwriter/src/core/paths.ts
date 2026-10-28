/** Canonical project paths. All paths are relative to the session workspace root. */

export const PROJECT_DIR = '.duanju'
export const PROJECT_FILE = '.duanju/project.json'
export const REPORTS_DIR = '.duanju/reports'
export const STORY_FILE = '故事大纲.md'
export const CAST_FILE = '人物设定.md'
export const OUTLINE_DIR = '分集大纲'
export const EPISODES_DIR = '剧集'
export const DISSECT_FILE = '竞品拆解.md'
export const CHECK_SUMMARY_FILE = '审查报告.md'
export const SUBMISSION_FILE = '投稿包.md'
export const SCRIPTS_EXPORT_FILE = '全剧剧本.md'
export const OUTLINE_EXPORT_FILE = '分集大纲.md'
export const LAST_CHECK_FILE = '.duanju/last-check.json'

const OUTLINE_BATCH = 10

export function pad3(value: number): string {
  return String(value).padStart(3, '0')
}

export function sanitizeTitle(title: string): string {
  return title
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/^[\s.]+|[\s.]+$/g, '')
    .slice(0, 20)
}

export function scriptFileName(episode: number, title: string): string {
  const suffix = sanitizeTitle(title)
  return `${EPISODES_DIR}/第${pad3(episode)}集${suffix === '' ? '' : `-${suffix}`}.md`
}

export function outlineBatchFor(episode: number): { from: number; to: number } {
  const from = Math.floor((episode - 1) / OUTLINE_BATCH) * OUTLINE_BATCH + 1
  return { from, to: from + OUTLINE_BATCH - 1 }
}

export function outlineFileName(from: number, to: number): string {
  return `${OUTLINE_DIR}/第${pad3(from)}-${pad3(to)}集.md`
}

export function outlineFileFor(episode: number): string {
  const batch = outlineBatchFor(episode)
  return outlineFileName(batch.from, batch.to)
}

export function reportFileName(kind: 'check' | 'review', stamp: string, scope: string): string {
  return `${REPORTS_DIR}/${kind}-${stamp}-${scope.replace(/[^\w-]/g, '')}.md`
}

export function timestamp(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

export function isoNow(date = new Date()): string {
  return date.toISOString()
}
