/** Shared domain types for Duanju Studio. Pure data; no I/O. */

export type Severity = 'error' | 'warn' | 'info'

export type ScriptStatus = 'draft' | 'reviewed' | 'final'

export type BudgetTier = 'low' | 'medium' | 'high'

export type ConfirmationKind = 'settings' | 'opening' | 'episode' | 'delivery'

export type StageId = 'setup' | 'pitch' | 'outline' | 'opening' | 'writing' | 'finale' | 'delivery'

export interface ProjectSettings {
  schemaVersion: 1
  pluginVersion: string
  title: string
  platform: string
  genre: string[]
  audience: string
  episodes: number
  secondsPerEpisode: number
  wordWindow: { min: number; max: number }
  charsPerSecond: number
  budgetTier: BudgetTier
  createdAt: string
  updatedAt: string
}

export interface Stage {
  index: number
  from: number
  to: number
  task: string
  goal: string
  miniGoal: string
  infoGap: string
}

export interface PromiseEntry {
  id: string
  plantedAt: number
  dueAt: number
  payoff: string
  status: '未回收' | '已回收' | '已放弃'
}

export interface Story {
  sentence: string
  protagonist: string
  goal: string
  obstacle: string
  edge: string
  desire: string
  emotion: string
  ending: string
  differentiators: string[]
  comparables: string[]
  stages: Stage[]
  promises: PromiseEntry[]
}

export interface Relation {
  target: string
  kind: string
  note?: string
}

export interface Character {
  name: string
  role: string
  camp: string
  desire: string
  painPoint: string
  personality: string
  voice: string
  arc: string
  costTier: string
  firstEpisode: number
  exitEpisode: number | null
  relations: Relation[]
  notes: string
}

export interface Open30 {
  background: string
  dilemma: string
  motive: string
}

export interface Mid {
  advance: string
  relation: string
  foreshadow: string
}

export interface EpisodePlan {
  number: number
  title: string
  stage: number
  goal: string
  conflict: string
  emotion: string
  size: '大' | '小'
  infoGap: string
  hookType: string
  hook: string
  open30: Open30
  mid: Mid
  close30: string
  cast: string[]
  locations: string[]
  notes: string
}

export interface ActionLine {
  kind: 'action'
  text: string
  line: number
}

export interface SubtitleLine {
  kind: 'subtitle'
  text: string
  line: number
}

export interface FlashbackMark {
  kind: 'flashback'
  phase: 'in' | 'out'
  line: number
}

export interface DialogueLine {
  kind: 'dialogue'
  speaker: string
  speakerRegistered: boolean
  speakerAction?: string
  paren?: string
  mode: 'line' | 'os' | 'vo'
  text: string
  line: number
}

export type SceneLine = ActionLine | SubtitleLine | FlashbackMark | DialogueLine

export interface Scene {
  no: string
  dayNight: string
  intExt: string
  location: string
  cast: string[]
  lines: SceneLine[]
  startLine: number
}

export interface ScriptHeader {
  task: string
  turn: string
  hook: string
}

export interface ScriptDoc {
  episode: number
  title: string
  status: ScriptStatus
  header: ScriptHeader
  scenes: Scene[]
  hookType: string
  hookScene: string
  words: number
  seconds: number
  file: string
  updatedAt: string
  rawBody: string
  findings: Finding[]
}

export interface Confirmation {
  kind: ConfirmationKind
  at: string
  summary: string
  userWords: string
  episodes: number[]
}

export interface Dissection {
  title: string
  platform: string
  episodes: number
  logline: string
  opening: string
  stages: Array<{ range: string; task: string; emotion: string }>
  hooks: string[]
  emotions: string[]
  reusable: string[]
  notes: string
}

export interface FindingLocation {
  file?: string
  episode?: number
  scene?: string
  line?: number
}

export interface Finding {
  code: string
  severity: Severity
  ruleRef: string
  message: string
  location?: FindingLocation
  evidence?: string
  suggestion?: string
}

export interface Blocker {
  code: string
  message: string
  unblock: string[]
}

export interface CheckCounts {
  error: number
  warn: number
  info: number
}

export interface CheckResult {
  counts: CheckCounts
  findings: Finding[]
  rulesVersion: string
  checkedEpisodes: number[]
  report: string
}

export interface ReviewFinding {
  severity: Severity
  episode?: number
  quote: string
  issue: string
  fix: string
}

export interface ReviewOutcome {
  kind: string
  rubricVersion: string
  verdict: 'pass' | 'revise' | 'fail'
  findings: ReviewFinding[]
  provider: string
  model: string
  routeSource: 'config' | 'default' | 'call'
  at: string
}

export interface Project {
  root: string
  settings: ProjectSettings
  story: Story
  characters: Character[]
  plans: Map<number, EpisodePlan>
  scripts: Map<number, ScriptDoc>
  dissections: Dissection[]
  confirmations: Confirmation[]
}

export interface Dashboard {
  stage: StageId
  progress: { planned: number; outlined: number; written: number; final: number }
  length: { avgWords: number; minWords: number; maxWords: number; avgSeconds: number }
  checks: { lastAt?: string; error: number; warn: number; info: number }
  promises: { open: number; overdue: number }
  cost: { uniqueLocations: number; uniqueCast: number; highCostTags: string[] }
  confirmations: Record<string, string | null>
}
