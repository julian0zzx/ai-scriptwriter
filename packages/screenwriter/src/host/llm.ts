/** The one place the plugin calls a model. */

import type { Context } from '@deepseek-ai/cordis'
import {
  BlockAssembler,
  createUserMessage,
  ReasoningEffortId,
  type ContentBlock,
  type LlmRuntime,
} from '@deepseek-ai/dsh-llm'
import type { PluginConfig } from './config.js'
import type { ReviewRequest } from '../core/review.js'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'duanju-review': { kind: 'duanju-review' }
  }
}

export class ReviewError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReviewError'
  }
}

export interface ReviewRoute {
  provider: string
  model: string
  source: 'config' | 'default' | 'call'
}

interface DefaultModelService {
  currentSelection(): { provider: string; model: string }
}

interface ModelInfo {
  reasoning?: { efforts: Array<{ id: unknown }> }
}

export function resolveRoute(ctx: Context, config: PluginConfig, override: { provider?: string; model?: string }): ReviewRoute {
  const provider = override.provider === undefined || override.provider === '' ? undefined : override.provider
  const model = override.model === undefined || override.model === '' ? undefined : override.model
  if ((provider === undefined) !== (model === undefined)) {
    throw new ReviewError('provider 与 model 必须同时给出')
  }
  if (provider !== undefined && model !== undefined) return { provider, model, source: 'call' }
  if (config.reviewProvider !== '' && config.reviewModel !== '') {
    return { provider: config.reviewProvider, model: config.reviewModel, source: 'config' }
  }
  const service = ctx.reflect.get('agentDefaultModel') as DefaultModelService | undefined
  const selection = service?.currentSelection()
  if (selection === undefined || selection.provider === '' || selection.model === '') {
    throw new ReviewError('没有可用的模型路由：请配置 reviewProvider/reviewModel，或在会话里选择模型')
  }
  return { provider: selection.provider, model: selection.model, source: 'default' }
}

export interface ReviewCallResult {
  text: string
  route: ReviewRoute
}

export async function callModel(
  ctx: Context,
  config: PluginConfig,
  request: ReviewRequest,
  override: { provider?: string; model?: string },
  signal?: AbortSignal,
): Promise<ReviewCallResult> {
  const route = resolveRoute(ctx, config, override)
  const llm = ctx.reflect.get('llm') as LlmRuntime | undefined
  if (llm === undefined) throw new ReviewError('当前 profile 没有挂载 llm 服务；scriptwriter_review 需要模型')
  const timeout = AbortSignal.timeout(config.reviewTimeoutMs)
  const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
  const effort = await chooseEffort(llm, route, config.reviewReasoningEffort, combined)
  const assembler = new BlockAssembler()
  try {
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      system: request.system,
      messages: [
        createUserMessage({
          content: [{ type: 'text', text: request.user }],
          source: { kind: 'duanju-review' },
        }),
      ],
      maxTokens: config.reviewMaxTokens > 0 ? config.reviewMaxTokens : request.maxTokens,
      ...(effort === undefined ? {} : { reasoningEffort: ReasoningEffortId(effort) }),
      signal: combined,
    })) {
      assembler.push(chunk)
    }
  } catch (error) {
    if (timeout.aborted) throw new ReviewError(`评审超时（${String(config.reviewTimeoutMs)}ms）`)
    if (signal?.aborted === true) throw new ReviewError('评审被取消')
    throw new ReviewError(`评审调用失败：${error instanceof Error ? error.message : String(error)}`)
  }
  const finish = assembler.finish
  if (finish.kind === 'aborted' || finish.kind === 'error') {
    throw new ReviewError(`评审失败：${finish.kind === 'aborted' ? finish.failure.message : finish.failure.message}`)
  }
  const text = textOf(assembler.blocks())
  if (text.trim() === '') {
    const reasoning = assembler.blocks().flatMap((block) => (block.type === 'reasoning' ? [block.text] : [])).join('').length
    throw new ReviewError(`模型没有返回正文（finish=${finish.kind}${reasoning > 0 ? '，只有推理内容' : ''}）；调大 reviewMaxTokens 或换模型`)
  }
  return { text, route }
}

function textOf(blocks: readonly ContentBlock[]): string {
  return blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
}

async function chooseEffort(
  llm: LlmRuntime,
  route: ReviewRoute,
  wanted: string,
  signal: AbortSignal,
): Promise<string | undefined> {
  if (wanted === '') return undefined
  const lookup = (llm as unknown as { resolveModelInfo?: (provider: string, model: string, signal?: AbortSignal) => Promise<ModelInfo> }).resolveModelInfo
  if (lookup === undefined) return undefined
  try {
    const info = await lookup.call(llm, route.provider, route.model, signal)
    const offered = (info.reasoning?.efforts ?? []).map((effort) => String(effort.id))
    if (offered.includes(wanted)) return wanted
    if (offered.includes('off')) return 'off'
    return offered[0]
  } catch {
    return undefined
  }
}
