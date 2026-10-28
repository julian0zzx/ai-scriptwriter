/** Project settings: defaults, normalization and validation. */

import type { BudgetTier, ProjectSettings } from './types.js'

export const PLUGIN_VERSION = '0.1.0'
export const SCHEMA_VERSION = 1 as const

export interface SettingsInput {
  title: string
  platform: string
  genre: string[]
  audience: string
  episodes?: number | undefined
  secondsPerEpisode?: number | undefined
  budgetTier?: BudgetTier | undefined
  wordWindow?: { min: number; max: number } | undefined
  charsPerSecond?: number | undefined
  createdAt?: string | undefined
}

export function createSettings(input: SettingsInput, now = new Date()): ProjectSettings {
  const episodes = clampInt(input.episodes ?? 80, 10, 150)
  const seconds = clampInt(input.secondsPerEpisode ?? 90, 60, 180)
  const window = input.wordWindow ?? { min: 500, max: 800 }
  if (input.title.trim() === '') throw new Error('title 不能为空')
  if (input.platform.trim() === '') throw new Error('platform 不能为空')
  if (input.audience.trim() === '') throw new Error('audience 不能为空')
  if (!Array.isArray(input.genre) || input.genre.length === 0) throw new Error('genre 至少一个标签')
  const created = input.createdAt ?? now.toISOString()
  return {
    schemaVersion: SCHEMA_VERSION,
    pluginVersion: PLUGIN_VERSION,
    title: input.title.trim(),
    platform: input.platform.trim(),
    genre: input.genre.map((tag) => tag.trim()).filter((tag) => tag !== ''),
    audience: input.audience.trim(),
    episodes,
    secondsPerEpisode: seconds,
    wordWindow: {
      min: clampInt(window.min, 100, 5000),
      max: clampInt(window.max, 100, 5000),
    },
    charsPerSecond: clampNumber(input.charsPerSecond ?? 5.5, 1, 20),
    budgetTier: input.budgetTier ?? 'low',
    createdAt: created,
    updatedAt: now.toISOString(),
  }
}

export function normalizeSettings(raw: unknown): ProjectSettings {
  if (raw === null || typeof raw !== 'object') throw new Error('project.json 不是对象')
  const data = raw as Record<string, unknown>
  const wordWindow = (data.wordWindow ?? {}) as Record<string, unknown>
  const settings = createSettings({
    title: String(data.title ?? ''),
    platform: String(data.platform ?? ''),
    genre: Array.isArray(data.genre) ? data.genre.map(String) : [],
    audience: String(data.audience ?? ''),
    episodes: Number(data.episodes ?? 80),
    secondsPerEpisode: Number(data.secondsPerEpisode ?? 90),
    budgetTier: (data.budgetTier === 'medium' || data.budgetTier === 'high' ? data.budgetTier : 'low') as BudgetTier,
    wordWindow: { min: Number(wordWindow.min ?? 500), max: Number(wordWindow.max ?? 800) },
    charsPerSecond: Number(data.charsPerSecond ?? 5.5),
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
  })
  const version = Number(data.schemaVersion ?? SCHEMA_VERSION)
  if (version > SCHEMA_VERSION) {
    throw new Error(`项目格式版本 ${version} 高于插件支持的 ${SCHEMA_VERSION}；请升级插件，不要写入。`)
  }
  settings.updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : settings.updatedAt
  return settings
}

function clampInt(value: number, min: number, max: number): number {
  const rounded = Math.round(Number.isFinite(value) ? value : min)
  return Math.min(max, Math.max(min, rounded))
}

function clampNumber(value: number, min: number, max: number): number {
  const finite = Number.isFinite(value) ? value : min
  return Math.min(max, Math.max(min, finite))
}
