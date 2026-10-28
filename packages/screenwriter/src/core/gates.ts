/** Stage derivation and author-confirmation gates. Pure. */

import type { Blocker, ConfirmationKind, Project, StageId } from './types.js'

export function hasConfirmation(project: Project, kind: ConfirmationKind): boolean {
  return project.confirmations.some((entry) => entry.kind === kind)
}

export function lastConfirmationAt(project: Project, kind: ConfirmationKind): string | null {
  const entries = project.confirmations.filter((entry) => entry.kind === kind)
  return entries.at(-1)?.at ?? null
}

export function deriveStage(project: Project): StageId {
  const { story, plans, scripts, settings, confirmations } = project
  const hasPitch = story.goal.trim() !== '' && story.stages.length > 0
  if (!hasPitch) return 'pitch'
  if (plans.size < 3) return 'outline'
  const openingWritten = [1, 2, 3].every((episode) => scripts.has(episode))
  if (!openingWritten || !confirmations.some((entry) => entry.kind === 'opening')) return 'opening'
  const delivery = confirmations.some((entry) => entry.kind === 'delivery')
  if (scripts.size < settings.episodes) return 'writing'
  return delivery ? 'delivery' : 'finale'
}

export function nextBlockers(project: Project): Blocker[] {
  const stage = deriveStage(project)
  const blockers: Blocker[] = []
  const { story, settings, plans, scripts } = project
  if (stage === 'pitch') {
    if (story.protagonist === '' || story.goal === '' || story.obstacle === '' || story.edge === '') {
      blockers.push({
        code: 'MISSING_PITCH',
        message: '一句话四槽位未填全（主角/目标/阻碍/亮点）',
        unblock: ['scriptwriter_story operation=pitch ...'],
      })
    }
    if (story.stages.length === 0) {
      blockers.push({
        code: 'MISSING_STAGE',
        message: '还没有三阶段',
        unblock: ['scriptwriter_story operation=stage stages=[...]'],
      })
    }
  }
  if (stage === 'outline') {
    blockers.push({
      code: 'OUTLINE_THIN',
      message: `只有 ${String(plans.size)} 集大纲，至少先排前 3 集`,
      unblock: ['scriptwriter_outline operation=batch entries=[...]'],
    })
    if (!hasConfirmation(project, 'settings')) {
      blockers.push({
        code: 'GATE_SETTINGS',
        message: '立项尚未由作者确认；写第 1 集前需要确认',
        unblock: ['scriptwriter_confirm kind=settings summary=... userWords=...'],
      })
    }
  }
  if (stage === 'opening') {
    const missing = [1, 2, 3].filter((episode) => !scripts.has(episode))
    if (missing.length > 0) {
      blockers.push({
        code: 'MISSING_OPENING',
        message: `前 3 集还缺第 ${missing.join('、')} 集`,
        unblock: [`scriptwriter_script operation=write episode=${String(missing[0] ?? 1)} body=...`],
      })
    }
    if (!hasConfirmation(project, 'opening')) {
      blockers.push({
        code: 'GATE_OPENING',
        message: '前三集还没有作者确认；第 4 集起会被拒绝',
        unblock: [
          'scriptwriter_review kind=opening episodes=[1,2,3]',
          'scriptwriter_confirm kind=opening summary=... userWords=...',
        ],
      })
    }
  }
  if (stage === 'writing' || stage === 'finale') {
    const missing: number[] = []
    for (let episode = 1; episode <= settings.episodes; episode += 1) {
      if (!scripts.has(episode)) missing.push(episode)
    }
    if (missing.length > 0) {
      blockers.push({
        code: 'MISSING_EPISODE',
        message: `计划 ${String(settings.episodes)} 集，还缺 ${String(missing.length)} 集（下一集：第 ${String(missing[0])} 集）`,
        unblock: [`scriptwriter_script operation=write episode=${String(missing[0])} body=...`],
      })
    }
    if (stage === 'finale' && !hasConfirmation(project, 'delivery')) {
      blockers.push({
        code: 'GATE_DELIVERY',
        message: '全剧已写，但作者尚未确认交付',
        unblock: ['scriptwriter_check scope=all', 'scriptwriter_confirm kind=delivery summary=... userWords=...'],
      })
    }
  }
  return blockers
}

export function scriptGate(project: Project, episode: number): Blocker | undefined {
  if (episode <= 3) {
    if (!hasConfirmation(project, 'settings')) {
      return {
        code: 'GATE_SETTINGS',
        message: '写第 1–3 集前，需要作者先确认立项（一句话/人物/三阶段）',
        unblock: [
          'scriptwriter_story operation=pitch ...（补齐四槽位与核心）',
          'scriptwriter_cast operation=upsert ...（至少主角）',
          'scriptwriter_confirm kind=settings summary=... userWords=...',
        ],
      }
    }
    return undefined
  }
  if (!hasConfirmation(project, 'opening')) {
    return {
      code: 'GATE_OPENING',
      message: '第 4 集起需要先确认前三集（正文给作者看，评审结果一并给出）',
      unblock: [
        'scriptwriter_review kind=opening episodes=[1,2,3]',
        '把三集正文与评审交给用户；得到明确认可后 scriptwriter_confirm kind=opening summary=... userWords=...',
      ],
    }
  }
  return undefined
}

export function submissionGate(project: Project): Blocker | undefined {
  if (!hasConfirmation(project, 'delivery')) {
    return {
      code: 'GATE_DELIVERY',
      message: '导出投稿包前需要作者确认交付',
      unblock: ['scriptwriter_check scope=all', 'scriptwriter_confirm kind=delivery summary=... userWords=...'],
    }
  }
  return undefined
}

export function confirmationPrereqs(project: Project, kind: ConfirmationKind): Blocker[] {
  const blockers: Blocker[] = []
  if (kind === 'settings') {
    const { story, characters, settings } = project
    if (story.protagonist === '' || story.goal === '' || story.obstacle === '' || story.edge === '') {
      blockers.push({
        code: 'MISSING_PITCH',
        message: '一句话四槽位未填全',
        unblock: ['scriptwriter_story operation=pitch ...'],
      })
    }
    if (story.desire === '' || story.emotion === '' || story.ending === '') {
      blockers.push({
        code: 'MISSING_CORE',
        message: '核心欲望/情绪/结局未写全',
        unblock: ['scriptwriter_story operation=pitch ...'],
      })
    }
    if (!characters.some((character) => character.role === '主角')) {
      blockers.push({
        code: 'MISSING_PROTAGONIST',
        message: '人物表里还没有「主角」',
        unblock: ['scriptwriter_cast operation=upsert name=... role=主角 ...'],
      })
    }
    if (story.stages.length === 0) {
      blockers.push({
        code: 'MISSING_STAGE',
        message: '还没有三阶段',
        unblock: ['scriptwriter_story operation=stage stages=[...]'],
      })
    } else {
      const covered = story.stages.length > 0
        && story.stages[0]?.from === 1
        && story.stages.at(-1)?.to === settings.episodes
        && story.stages.every((stage, index) => index === 0 || stage.from === (story.stages[index - 1]?.to ?? 0) + 1)
      if (!covered) {
        blockers.push({
          code: 'STAGE_COVERAGE',
          message: `阶段必须连续覆盖 1–${String(settings.episodes)} 集，不能重叠或留空`,
          unblock: ['scriptwriter_story operation=stage stages=[...]'],
        })
      }
    }
  }
  if (kind === 'opening') {
    const missing = [1, 2, 3].filter((episode) => !project.scripts.has(episode))
    if (missing.length > 0) {
      blockers.push({
        code: 'MISSING_OPENING',
        message: `前 3 集还没写齐（缺 ${missing.join('、')}）`,
        unblock: ['scriptwriter_script operation=write episode=... body=...'],
      })
    }
  }
  if (kind === 'delivery') {
    if (project.story.goal === '') blockers.push({ code: 'MISSING_PITCH', message: '故事层未完成', unblock: ['scriptwriter_story operation=pitch ...'] })
    if (project.plans.size === 0) blockers.push({ code: 'MISSING_OUTLINE', message: '分集大纲为空', unblock: ['scriptwriter_outline operation=batch ...'] })
    const missing = [1, 2, 3].filter((episode) => !project.scripts.has(episode))
    if (missing.length > 0) blockers.push({ code: 'MISSING_OPENING', message: `前 3 集未写齐（缺 ${missing.join('、')}）`, unblock: ['scriptwriter_script operation=write episode=...'] })
  }
  return blockers
}
