/** Course-derived enumerations and their accepted aliases. */

export const HOOK_TYPES = [
  '台词钩/未说完的质问',
  '台词钩/身份暗示',
  '台词钩/目标宣言',
  '画面钩/情感切掉',
  '画面钩/动作中断',
  '画面钩/意外身影',
  '画面钩/熟悉面孔',
  '突发危机',
  '关键人物登场',
  '怀疑未确认',
  '关键物件丢失',
] as const

export type HookType = (typeof HOOK_TYPES)[number]

export const EMOTION_TYPES = ['逆袭成功', '反转打脸', '意外收获', 'CP甜宠', '其他'] as const

export const INFO_GAPS = [
  '主角知道，观众和配角不知道',
  '配角和观众知道，主角不知道',
  '观众知道，主角和配角不知道',
  '主角和观众知道，配角不知道',
] as const

export const SIZES = ['大', '小'] as const

export const ROLES = ['主角', '反派', '核心伙伴', '功能角色'] as const
export const CAMPS = ['主角阵营', '反派阵营', '中立'] as const
export const COST_TIERS = ['主要', '配角', '客串'] as const

export const SCRIPT_STATUSES = ['draft', 'reviewed', 'final'] as const

const HOOK_ALIASES: Record<string, HookType> = {
  身份钩: '台词钩/身份暗示',
  '台词钩-身份暗示': '台词钩/身份暗示',
  '台词钩-未说完的质问': '台词钩/未说完的质问',
  '台词钩-目标宣言': '台词钩/目标宣言',
  '画面钩-情感切掉': '画面钩/情感切掉',
  '画面钩-动作中断': '画面钩/动作中断',
  '画面钩-意外身影': '画面钩/意外身影',
  '画面钩-熟悉面孔': '画面钩/熟悉面孔',
  意外身影: '画面钩/意外身影',
}

/** Normalize a hook label, returning undefined for a value the course does not name. */
export function normalizeHookType(value: string): HookType | undefined {
  const raw = value.trim()
  if ((HOOK_TYPES as readonly string[]).includes(raw)) return raw as HookType
  return HOOK_ALIASES[raw]
}

/** Normalize a status value written by hand. */
export function normalizeStatus(value: string): 'draft' | 'reviewed' | 'final' {
  const raw = value.trim().toLowerCase()
  if (raw === 'draft' || raw === '草稿') return 'draft'
  if (raw === 'reviewed' || raw === '待审' || raw === '已审') return 'reviewed'
  if (raw === 'final' || raw === '定稿' || raw === '已定稿') return 'final'
  return 'draft'
}

/** Display order and severity weight used by the finding sorter. */
export const SEVERITY_WEIGHT: Record<string, number> = { error: 0, warn: 1, info: 2 }
