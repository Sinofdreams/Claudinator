import { readdir, stat } from 'fs/promises'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import { join } from 'path'
import { homedir } from 'os'
import type {
  StatsSummary,
  DayTotals,
  RangeTotals,
  AllTime,
  DayStat,
  HourStat,
  ModelStat,
  ProjectStat
} from '@shared/stats'
import { EMPTY_SUMMARY } from '@shared/stats'

// ---- Pricing (USD per 1M tokens, list price as of 2026-07; cache write =
// 1.25x input for the default 5-min TTL, cache read = 0.1x input) ----
interface Pricing {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}
type Family = 'fable' | 'opus' | 'opusLegacy' | 'sonnet' | 'haiku' | 'default'
const PRICING: Record<Family, Pricing> = {
  fable: { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 },
  opus: { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  // Opus 4.1 and older were priced 3x higher than the 4.6+ generation
  opusLegacy: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  default: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }
}

function modelFamily(model: string): Family {
  const m = model.toLowerCase()
  if (m.includes('fable') || m.includes('mythos')) return 'fable'
  if (m.includes('opus')) {
    // Legacy = Opus 4.1, 4.0 (dated id: claude-opus-4-20250514) and Opus 3
    if (m.includes('opus-4-1') || m.includes('opus-4-0') || m.includes('opus-4-2025') || m.includes('3-opus')) return 'opusLegacy'
    return 'opus'
  }
  if (m.includes('sonnet')) return 'sonnet'
  if (m.includes('haiku')) return 'haiku'
  return 'default'
}

function modelLabel(model: string): string {
  const m = model.toLowerCase()
  if (m.includes('fable') || m.includes('mythos')) return 'Fable'
  if (m.includes('opus')) return 'Opus'
  if (m.includes('sonnet')) return 'Sonnet'
  if (m.includes('haiku')) return 'Haiku'
  return model
}

const MODEL_COLORS: Record<string, string> = {
  Fable: '#f472b6',
  Opus: '#a855f7',
  Sonnet: '#3b82f6',
  Haiku: '#22c55e'
}
function modelColor(label: string): string {
  return MODEL_COLORS[label] ?? '#94a3b8'
}

interface UsageTotals {
  input: number
  output: number
  cacheCreation: number
  cacheRead: number
}
function zero(): UsageTotals {
  return { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 }
}
function addInto(t: UsageTotals, s: UsageTotals): void {
  t.input += s.input
  t.output += s.output
  t.cacheCreation += s.cacheCreation
  t.cacheRead += s.cacheRead
}
function tokensOf(u: UsageTotals): number {
  return u.input + u.output + u.cacheCreation + u.cacheRead
}
function costFor(family: Family, u: UsageTotals): number {
  const p = PRICING[family]
  return (
    (u.input * p.input +
      u.output * p.output +
      u.cacheCreation * p.cacheWrite +
      u.cacheRead * p.cacheRead) /
    1_000_000
  )
}

// Local YYYY-MM-DD ('en-CA' formats as ISO date in local tz)
function localDay(ts: string): string {
  return new Date(ts).toLocaleDateString('en-CA')
}
function dayMinus(nowMs: number, n: number): string {
  return new Date(nowMs - n * 86_400_000).toLocaleDateString('en-CA')
}
function rangeLabel(days: number): string {
  if (days <= 0) return 'All time'
  if (days === 1) return 'Last 24 hours'
  return `Last ${days} days`
}

interface RawUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

// ---- Per-day bucket: retains model/project/hour sub-breakdowns so any time
// window can be derived later from a single scan without re-reading the files. ----
interface DayBucket {
  totals: UsageTotals
  messages: number
  toolCalls: number
  sessions: Set<string>
  models: Map<string, { totals: UsageTotals; family: Family }>
  projects: Map<string, { totals: UsageTotals; sessions: Set<string> }>
  hours: number[] // 24, tokens
}
function emptyBucket(): DayBucket {
  return {
    totals: zero(),
    messages: 0,
    toolCalls: 0,
    sessions: new Set(),
    models: new Map(),
    projects: new Map(),
    hours: new Array<number>(24).fill(0)
  }
}

interface RawBuckets {
  byDay: Map<string, DayBucket>
  firstDate: string
  fileCount: number
  generatedAt: number // ms
}

async function listTranscripts(root: string): Promise<string[]> {
  const out: string[] = []
  let entries: import('fs').Dirent[]
  try {
    entries = await readdir(root, { withFileTypes: true, recursive: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith('.jsonl')) {
      // Dirent.parentPath (Node 20+) gives the containing dir
      const parent =
        (e as unknown as { parentPath?: string; path?: string }).parentPath ??
        (e as unknown as { path?: string }).path ??
        root
      out.push(join(parent, e.name))
    }
  }
  return out
}

// Stream a single file line-by-line; never holds the whole file in memory.
function streamOne(file: string, onLine: (line: string) => void): Promise<void> {
  return new Promise((resolve) => {
    const stream = createReadStream(file, { encoding: 'utf-8' })
    stream.on('error', () => resolve())
    const rl = createInterface({ input: stream, crlfDelay: Infinity })
    rl.on('line', (line) => {
      try {
        onLine(line)
      } catch {
        // skip malformed line
      }
    })
    rl.on('close', () => resolve())
    rl.on('error', () => resolve())
  })
}

// Process files with bounded concurrency to keep peak memory flat.
async function streamFiles(
  files: string[],
  onLine: (line: string, file: string) => void,
  concurrency: number
): Promise<void> {
  let idx = 0
  const worker = async (): Promise<void> => {
    while (idx < files.length) {
      const f = files[idx++]
      await streamOne(f, (line) => onLine(line, f))
    }
  }
  const n = Math.max(1, Math.min(concurrency, files.length))
  await Promise.all(Array.from({ length: n }, () => worker()))
}

// In-memory raw-bucket cache + in-flight dedupe. Scanning ~1 GB of transcripts is
// non-trivial, so we scan ONCE into rich per-day buckets, cache those for a few
// minutes, and derive each requested time window from them cheaply — flipping the
// range picker never triggers a re-scan. The in-flight promise ensures only one
// scan runs at a time no matter how many callers (dashboard mount, refresh
// interval, the badge poll) ask at once.
let rawCache: { raw: RawBuckets; at: number } | null = null
let inflight: Promise<RawBuckets> | null = null
const CACHE_MS = 300_000

export async function computeStatsSummary(rangeDays = 0, force = false): Promise<StatsSummary> {
  const fresh = !force && rawCache && Date.now() - rawCache.at < CACHE_MS
  if (fresh && rawCache) return buildSummary(rawCache.raw, rangeDays)
  if (inflight) return inflight.then((raw) => buildSummary(raw, rangeDays))
  inflight = scanRaw().finally(() => {
    inflight = null
  })
  const raw = await inflight
  return buildSummary(raw, rangeDays)
}

async function scanRaw(): Promise<RawBuckets> {
  const nowMs = Date.now()
  const projectsRoot = join(homedir(), '.claude', 'projects')
  const files = await listTranscripts(projectsRoot)

  const byDay = new Map<string, DayBucket>()
  let firstDate = ''

  const addUsage = (t: UsageTotals, u: RawUsage): number => {
    const i = u.input_tokens ?? 0
    const o = u.output_tokens ?? 0
    const cc = u.cache_creation_input_tokens ?? 0
    const cr = u.cache_read_input_tokens ?? 0
    t.input += i
    t.output += o
    t.cacheCreation += cc
    t.cacheRead += cr
    return i + o + cc + cr
  }

  // Claude Code writes one transcript line per content block — every line of
  // the same API response repeats the identical usage object. Track the last
  // request id per file (block lines are contiguous) and count usage once.
  const lastRequestIdByFile = new Map<string, string>()

  const handleLine = (line: string, file: string): void => {
    if (line.length < 2 || line[0] !== '{') return
    let obj: {
      type?: string
      timestamp?: string
      sessionId?: string
      requestId?: string
      cwd?: string
      message?: { id?: string; model?: string; usage?: RawUsage; content?: unknown }
    }
    try {
      obj = JSON.parse(line)
    } catch {
      return
    }
    const ts = obj.timestamp
    const sid = obj.sessionId

    if (obj.type === 'assistant' && obj.message?.usage && ts) {
      const day = localDay(ts)
      if (!firstDate || day < firstDate) firstDate = day
      const b = byDay.get(day) ?? emptyBucket()

      // Tool calls: one line per content block, so count blocks on every line
      const content = obj.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (
            block &&
            typeof block === 'object' &&
            (block as { type?: string }).type === 'tool_use'
          ) {
            b.toolCalls += 1
          }
        }
      }

      const requestId = obj.requestId ?? obj.message.id ?? null
      const isDuplicate = requestId !== null && lastRequestIdByFile.get(file) === requestId
      if (requestId !== null) lastRequestIdByFile.set(file, requestId)

      if (!isDuplicate) {
        const usage = obj.message.usage
        const model = obj.message.model ?? 'unknown'
        const family = modelFamily(model)

        const total = addUsage(b.totals, usage)
        b.messages += 1
        if (sid) b.sessions.add(sid)

        b.hours[new Date(ts).getHours()] += total

        const mEntry = b.models.get(model) ?? { totals: zero(), family }
        addUsage(mEntry.totals, usage)
        b.models.set(model, mEntry)

        const cwd = obj.cwd
        if (cwd) {
          const pEntry = b.projects.get(cwd) ?? { totals: zero(), sessions: new Set<string>() }
          addUsage(pEntry.totals, usage)
          if (sid) pEntry.sessions.add(sid)
          b.projects.set(cwd, pEntry)
        }
      }

      byDay.set(day, b)
    } else if (obj.type === 'user' && ts) {
      // Count genuine user prompts (string content), not tool_result echoes
      const content = obj.message?.content
      if (typeof content === 'string') {
        const day = localDay(ts)
        const b = byDay.get(day) ?? emptyBucket()
        b.messages += 1
        if (sid) b.sessions.add(sid)
        byDay.set(day, b)
      }
    }
  }

  // Stream each file line-by-line with bounded concurrency so memory stays flat
  // regardless of total transcript size (yours can exceed 1 GB).
  await streamFiles(files, handleLine, 4)

  const raw: RawBuckets = { byDay, firstDate, fileCount: files.length, generatedAt: nowMs }
  rawCache = { raw, at: nowMs }
  return raw
}

// ---- Pure derivation: collapse a set of days into one merged view ----
interface Merged {
  totals: UsageTotals
  messages: number
  toolCalls: number
  sessions: Set<string>
  models: Map<string, { totals: UsageTotals; family: Family }>
  projects: Map<string, { totals: UsageTotals; sessions: Set<string> }>
  hours: number[]
}
function aggregate(byDay: Map<string, DayBucket>, days: string[]): Merged {
  const m: Merged = {
    totals: zero(),
    messages: 0,
    toolCalls: 0,
    sessions: new Set(),
    models: new Map(),
    projects: new Map(),
    hours: new Array<number>(24).fill(0)
  }
  for (const d of days) {
    const b = byDay.get(d)
    if (!b) continue
    addInto(m.totals, b.totals)
    m.messages += b.messages
    m.toolCalls += b.toolCalls
    for (const s of b.sessions) m.sessions.add(s)
    for (const [model, mv] of b.models) {
      const e = m.models.get(model) ?? { totals: zero(), family: mv.family }
      addInto(e.totals, mv.totals)
      m.models.set(model, e)
    }
    for (const [proj, pv] of b.projects) {
      const e = m.projects.get(proj) ?? { totals: zero(), sessions: new Set<string>() }
      addInto(e.totals, pv.totals)
      for (const s of pv.sessions) e.sessions.add(s)
      m.projects.set(proj, e)
    }
    for (let h = 0; h < 24; h++) m.hours[h] += b.hours[h]
  }
  return m
}

interface ModelBuild {
  models: ModelStat[]
  cost: number
  input: number
  output: number
  tokens: number
}
function buildModels(models: Map<string, { totals: UsageTotals; family: Family }>): ModelBuild {
  let cost = 0
  let input = 0
  let output = 0
  let tokens = 0
  // Collapse multiple model ids into friendly family labels.
  const byLabel = new Map<string, { tokens: number; cost: number }>()
  for (const [model, { totals, family }] of models) {
    const c = costFor(family, totals)
    const tk = tokensOf(totals)
    cost += c
    input += totals.input
    output += totals.output
    tokens += tk
    if (tk <= 0) continue
    const label = modelLabel(model)
    const agg = byLabel.get(label) ?? { tokens: 0, cost: 0 }
    agg.tokens += tk
    agg.cost += c
    byLabel.set(label, agg)
  }
  const out: ModelStat[] = []
  for (const [label, agg] of byLabel) {
    out.push({ model: label, label, tokens: agg.tokens, cost: agg.cost, color: modelColor(label) })
  }
  out.sort((a, b) => b.tokens - a.tokens)
  return { models: out, cost, input, output, tokens }
}

function buildSummary(raw: RawBuckets, rangeDays: number): StatsSummary {
  const nowMs = raw.generatedAt
  if (raw.byDay.size === 0) {
    return { ...EMPTY_SUMMARY, generatedAt: new Date(nowMs).toISOString() }
  }

  const allDays = [...raw.byDay.keys()].sort()
  const todayKey = new Date(nowMs).toLocaleDateString('en-CA')
  const cutoff = rangeDays > 0 ? dayMinus(nowMs, rangeDays - 1) : ''
  const windowDays = rangeDays > 0 ? allDays.filter((d) => d >= cutoff) : allDays

  // ---- Selected window ----
  const win = aggregate(raw.byDay, windowDays)
  const winModels = buildModels(win.models)
  const winCostPerToken = winModels.tokens > 0 ? winModels.cost / winModels.tokens : 0

  const daily: DayStat[] = windowDays.map((d) => {
    const b = raw.byDay.get(d)!
    const tk = tokensOf(b.totals)
    return {
      date: d,
      tokens: tk,
      inputTokens: b.totals.input,
      outputTokens: b.totals.output,
      messages: b.messages,
      sessions: b.sessions.size,
      cost: tk * winCostPerToken
    }
  })

  const hourly: HourStat[] = win.hours.map((tokens, hour) => ({ hour, tokens }))

  const projects: ProjectStat[] = [...win.projects.entries()]
    .map(([project, v]) => ({
      project,
      label: basename(project),
      tokens: tokensOf(v.totals),
      sessions: v.sessions.size
    }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 8)

  const range: RangeTotals = {
    label: rangeLabel(rangeDays),
    days: rangeDays,
    date: '',
    tokens: tokensOf(win.totals),
    inputTokens: win.totals.input,
    outputTokens: win.totals.output,
    cacheCreationTokens: win.totals.cacheCreation,
    cacheReadTokens: win.totals.cacheRead,
    messages: win.messages,
    sessions: win.sessions.size,
    toolCalls: win.toolCalls,
    cost: winModels.cost
  }

  // ---- All time (always full history) ----
  const all = rangeDays > 0 ? aggregate(raw.byDay, allDays) : win
  const allModels = rangeDays > 0 ? buildModels(all.models) : winModels
  const allCostPerToken = allModels.tokens > 0 ? allModels.cost / allModels.tokens : 0

  const allTime: AllTime = {
    tokens: tokensOf(all.totals),
    inputTokens: all.totals.input,
    outputTokens: all.totals.output,
    messages: all.messages,
    sessions: all.sessions.size,
    toolCalls: all.toolCalls,
    cost: allModels.cost,
    firstDate: raw.firstDate
  }

  // ---- Today (always today) ----
  const tb = raw.byDay.get(todayKey)
  const todayTokens = tb ? tokensOf(tb.totals) : 0
  const today: DayTotals = {
    date: todayKey,
    tokens: todayTokens,
    inputTokens: tb ? tb.totals.input : 0,
    outputTokens: tb ? tb.totals.output : 0,
    cacheCreationTokens: tb ? tb.totals.cacheCreation : 0,
    cacheReadTokens: tb ? tb.totals.cacheRead : 0,
    messages: tb ? tb.messages : 0,
    sessions: tb ? tb.sessions.size : 0,
    toolCalls: tb ? tb.toolCalls : 0,
    cost: todayTokens * allCostPerToken
  }

  return {
    today,
    range,
    allTime,
    daily,
    models: winModels.models,
    hourly,
    projects,
    computedFromFiles: raw.fileCount,
    generatedAt: new Date(nowMs).toISOString()
  }
}

function basename(p: string): string {
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || p
}

// ---- Per-conversation cost (the "what did this card cost" badge) ----

export interface SessionCost {
  cost: number
  tokens: number
}

// Keyed by transcript path; recomputed only when the file changes, so frequent
// UI polling stays cheap even for multi-MB transcripts.
const sessionCostCache = new Map<string, { mtimeMs: number; size: number; value: SessionCost }>()

/**
 * Total usage + estimated cost of one Claude conversation, summed per model
 * family across every assistant message in its transcript.
 *
 * `sessionDir` is the directory the Claude session runs in (worktree-aware) —
 * the same key Claude Code uses for ~/.claude/projects.
 */
export async function computeSessionCost(
  sessionDir: string,
  claudeSessionId: string
): Promise<SessionCost | null> {
  const projectKey = sessionDir.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+$/, '')
  const file = join(homedir(), '.claude', 'projects', projectKey, claudeSessionId + '.jsonl')

  let fileStat: Awaited<ReturnType<typeof stat>>
  try {
    fileStat = await stat(file)
  } catch {
    return null // no transcript (yet)
  }

  const cached = sessionCostCache.get(file)
  if (cached && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
    return cached.value
  }

  const perFamily = new Map<Family, UsageTotals>()
  // Claude Code writes one line per content block, and every line of the same
  // API response repeats the identical usage object — count each request once.
  let lastRequestId: string | null = null
  await streamOne(file, (line) => {
    if (line.length < 2 || line[0] !== '{') return
    const obj = JSON.parse(line) as {
      type?: string
      requestId?: string
      message?: { id?: string; model?: string; usage?: RawUsage }
    }
    if (obj.type !== 'assistant' || !obj.message?.usage) return
    const requestId = obj.requestId ?? obj.message.id ?? null
    if (requestId && requestId === lastRequestId) return
    lastRequestId = requestId
    const family = modelFamily(obj.message.model ?? 'unknown')
    const t = perFamily.get(family) ?? zero()
    const u = obj.message.usage
    t.input += u.input_tokens ?? 0
    t.output += u.output_tokens ?? 0
    t.cacheCreation += u.cache_creation_input_tokens ?? 0
    t.cacheRead += u.cache_read_input_tokens ?? 0
    perFamily.set(family, t)
  })

  let cost = 0
  let tokens = 0
  for (const [family, totals] of perFamily) {
    cost += costFor(family, totals)
    tokens += tokensOf(totals)
  }

  const value: SessionCost = { cost, tokens }
  sessionCostCache.set(file, { mtimeMs: fileStat.mtimeMs, size: fileStat.size, value })
  return value
}
