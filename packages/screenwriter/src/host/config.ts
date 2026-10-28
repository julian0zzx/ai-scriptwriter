/** Plugin configuration with working defaults. */

export interface PluginConfig {
  workspaceRoot: string
  reviewProvider: string
  reviewModel: string
  reviewMaxTokens: number
  reviewTimeoutMs: number
  reviewReasoningEffort: 'off' | 'low' | 'high' | 'max' | ''
}

export function normalizeConfig(raw: unknown): PluginConfig {
  const data = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const effort = data.reviewReasoningEffort
  return {
    workspaceRoot: typeof data.workspaceRoot === 'string' ? data.workspaceRoot : '',
    reviewProvider: typeof data.reviewProvider === 'string' ? data.reviewProvider : '',
    reviewModel: typeof data.reviewModel === 'string' ? data.reviewModel : '',
    reviewMaxTokens: positive(data.reviewMaxTokens, 4096),
    reviewTimeoutMs: positive(data.reviewTimeoutMs, 120000),
    reviewReasoningEffort: effort === 'low' || effort === 'high' || effort === 'max' || effort === '' ? effort : 'off',
  }
}

function positive(value: unknown, fallback: number): number {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : fallback
}
