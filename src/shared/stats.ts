// Shared stats types — used by the main-process aggregator, preload, and the renderer dashboard.

export interface DayTotals {
  date: string // local YYYY-MM-DD
  tokens: number // input + output + cache create + cache read
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  messages: number
  sessions: number
  toolCalls: number
  cost: number // estimated USD
}

export interface DayStat {
  date: string
  tokens: number
  inputTokens: number
  outputTokens: number
  messages: number
  sessions: number
  cost: number
}

export interface ModelStat {
  model: string // raw model id
  label: string // friendly label
  tokens: number
  cost: number
  color: string
}

export interface HourStat {
  hour: number // 0..23 (local)
  tokens: number
}

export interface ProjectStat {
  project: string // cwd
  label: string // basename
  tokens: number
  sessions: number
}

export interface AllTime {
  tokens: number
  inputTokens: number
  outputTokens: number
  messages: number
  sessions: number
  toolCalls: number
  cost: number
  firstDate: string
}

// Totals for the currently-selected time window (driven by the dashboard range picker).
export interface RangeTotals extends DayTotals {
  label: string // human label, e.g. "Last 7 days"
  days: number // window size in days; 0 = all time
}

export interface StatsSummary {
  today: DayTotals // always today, regardless of selected range
  range: RangeTotals // totals over the selected window
  allTime: AllTime // always full history, regardless of selected range
  daily: DayStat[] // window series, chronological
  models: ModelStat[] // window, sorted desc by tokens
  hourly: HourStat[] // window, 24 entries
  projects: ProjectStat[] // window, top, sorted desc by tokens
  computedFromFiles: number
  generatedAt: string // ISO
}

export const EMPTY_SUMMARY: StatsSummary = {
  today: {
    date: '',
    tokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    messages: 0,
    sessions: 0,
    toolCalls: 0,
    cost: 0
  },
  range: {
    date: '',
    label: 'All time',
    days: 0,
    tokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    messages: 0,
    sessions: 0,
    toolCalls: 0,
    cost: 0
  },
  allTime: {
    tokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    messages: 0,
    sessions: 0,
    toolCalls: 0,
    cost: 0,
    firstDate: ''
  },
  daily: [],
  models: [],
  hourly: [],
  projects: [],
  computedFromFiles: 0,
  generatedAt: ''
}
