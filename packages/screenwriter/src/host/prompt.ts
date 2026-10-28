/**
 * Runtime context: a short, session-scoped orientation. Rendering is
 * synchronous and reads a 1.5s snapshot; a miss triggers a background refresh.
 */

import type { Context } from '@deepseek-ai/cordis'
import { deriveStage, nextBlockers } from '../core/gates.js'
import { buildDashboard } from '../core/status.js'
import type { Project, StageId } from '../core/types.js'
import { ProjectResolver, type SessionLike } from './resolver.js'

export const PROMPT_CONTEXT_NAME = 'ai-scriptwriter:project'
const TTL_MS = 1500

const STAGE_LABEL: Record<StageId, string> = {
  setup: '未立项',
  pitch: '故事层',
  outline: '分集大纲',
  opening: '前三集',
  writing: '逐集写作',
  finale: '全剧已完成',
  delivery: '已确认交付',
}

export function renderProjectContext(project: Project | undefined): string {
  if (project === undefined) {
    return 'Duanju Studio：当前工作区还没有短剧项目。用户要写短剧时，先调用 scriptwriter_init 立项。'
  }
  const stage = deriveStage(project)
  const dashboard = buildDashboard(project)
  const blockers = nextBlockers(project)
  const lines = [
    `Duanju Studio：《${project.settings.title}》`,
    `- 阶段：${STAGE_LABEL[stage]}（${stage}）`,
    `- 进度：大纲 ${String(dashboard.progress.outlined)}/${String(dashboard.progress.planned)}，剧本 ${String(dashboard.progress.written)}，定稿 ${String(dashboard.progress.final)}`,
    `- 确认：立项=${dashboard.confirmations.settings ?? '未确认'}；前三集=${dashboard.confirmations.opening ?? '未确认'}；交付=${dashboard.confirmations.delivery ?? '未确认'}`,
    `- 机检：error ${String(dashboard.checks.error)} / warn ${String(dashboard.checks.warn)} / info ${String(dashboard.checks.info)}`,
  ]
  if (blockers.length > 0) lines.push(`- 下一步：${blockers[0]?.unblock[0] ?? blockers[0]?.message ?? 'scriptwriter_status'}`)
  lines.push('机检只管齐不齐；评审只管好不好；合规需人工复核，工具不给「合规通过」。')
  return lines.join('\n')
}

class SnapshotCache {
  private readonly values = new Map<string, { text: string; at: number }>()
  private readonly inflight = new Map<string, Promise<void>>()

  constructor(private readonly resolver: ProjectResolver) {}

  text(session: SessionLike | undefined): string {
    const { root } = this.resolver.rootFor(session)
    const hit = this.values.get(root)
    if (hit !== undefined && Date.now() - hit.at < TTL_MS) return hit.text
    void this.refresh(root, session)
    return hit?.text ?? ''
  }

  private refresh(root: string, session: SessionLike | undefined): Promise<void> {
    const running = this.inflight.get(root)
    if (running !== undefined) return running
    const task = this.resolver.storeFor(root).load({ session })
      .then((project) => {
        this.values.set(root, { text: renderProjectContext(project), at: Date.now() })
      })
      .catch((error: unknown) => {
        this.values.set(root, {
          text: `Duanju Studio：项目读取失败（${error instanceof Error ? error.message : String(error)}）。调用 scriptwriter_status 查看详情。`,
          at: Date.now(),
        })
      })
      .finally(() => {
        this.inflight.delete(root)
      })
    this.inflight.set(root, task)
    return task
  }
}

export function registerPrompt(ctx: Context, resolver: ProjectResolver): void {
  const cache = new SnapshotCache(resolver)
  ctx.inject(['systemPrompt'], (promptCtx: any) => {
    let order = 88
    try {
      order = Number(promptCtx.systemPrompt.getContextOrder('SANDBOX_POLICY')) + 8
    } catch {
      // keep the fallback order
    }
    promptCtx.systemPrompt.context({
      name: PROMPT_CONTEXT_NAME,
      order,
      interpolate: false,
      text: (assembly: any) => cache.text(assembly?.agent?.session),
    })
  })
}
