/** Derived project state for the dashboard. Pure. */

import { deriveStage } from './gates.js'
import type { CheckCounts, Dashboard, Project } from './types.js'

export interface LastCheck {
  at: string
  counts: CheckCounts
}

export function buildDashboard(project: Project, lastCheck?: LastCheck): Dashboard {
  const scripts = [...project.scripts.values()]
  const words = scripts.map((script) => script.words)
  const seconds = scripts.map((script) => script.seconds)
  const locations = new Set(scripts.flatMap((script) => script.scenes.map((scene) => scene.location)))
  const cast = new Set(project.characters.map((character) => character.name))
  const text = scripts.flatMap((script) => script.scenes.flatMap((scene) => [scene.location, ...scene.lines.filter((line) => line.kind === 'action').map((line) => line.text)])).join('\n')
  const highCostTags = ['水下', '爆破', '飙车', '高空', '雨戏', '大群演', '特效', '动物', '儿童', '古装'].filter((tag) => text.includes(tag))
  const confirmations: Record<string, string | null> = {}
  for (const kind of ['settings', 'opening', 'episode', 'delivery']) {
    confirmations[kind] = project.confirmations.filter((entry) => entry.kind === kind).at(-1)?.at ?? null
  }
  return {
    stage: deriveStage(project),
    progress: {
      planned: project.settings.episodes,
      outlined: project.plans.size,
      written: scripts.length,
      final: scripts.filter((script) => script.status === 'final').length,
    },
    length: {
      avgWords: words.length === 0 ? 0 : Math.round(words.reduce((sum, value) => sum + value, 0) / words.length),
      minWords: words.length === 0 ? 0 : Math.min(...words),
      maxWords: words.length === 0 ? 0 : Math.max(...words),
      avgSeconds: seconds.length === 0 ? 0 : Math.round(seconds.reduce((sum, value) => sum + value, 0) / seconds.length),
    },
    checks: {
      ...(lastCheck === undefined ? {} : { lastAt: lastCheck.at }),
      error: lastCheck?.counts.error ?? 0,
      warn: lastCheck?.counts.warn ?? 0,
      info: lastCheck?.counts.info ?? 0,
    },
    promises: {
      open: project.story.promises.filter((entry) => entry.status === '未回收').length,
      overdue: project.story.promises.filter((entry) => entry.status === '未回收' && entry.dueAt > 0 && entry.dueAt < Math.max(0, ...project.scripts.keys())).length,
    },
    cost: { uniqueLocations: locations.size, uniqueCast: cast.size, highCostTags },
    confirmations,
  }
}
