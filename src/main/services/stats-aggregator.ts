import { readdir } from 'fs/promises'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'
import { join } from 'path'
import { homedir } from 'os'
import type {
  StatsSummary,
  DayTotals,
  ModelStat,
  ProjectStat
} from '@shared/stats'
import { EMPTY_SUMMARY } from '@shared/stats'

// ---- Pricing (USD per 1M tokens, approximate list price) ----
interface Pricing {
  input: number
  output: number
  cacheWrite: number
  cacheRead: number
}
const PRICING: Record<'opus' | 'sonnet' | 'haiku' | 'default', Pricing> = {
  opus: { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  sonnet: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  haiku: { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
  default: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }
}

function modelFamily(model: string): 'opus' | 'sonnet' | 'haiku' | 'default' {
  const m = model.toLowerCase()
  if (m.includes('opus')) return 'opus'
  if (m.includes('sonnet')) return 'sonnet'
  if (m.includes('haiku')) return 'haiku'
  return 'default'
}

function modelLabel(model: string): string {
  const m = model.toLowerCase()
  if (m.includes('opus')) return 'Opus'
  if (m.includes('sonnet')) return 'Sonnet'
  if (m.includes('haiku')) return 'Haiku'
  return model
}

const MODEL_COLORS: Record<string, string> = {
  Opus: '#a855f7',
  Sonnet: '#3b82f6',
  Haiku: '#22c55e'
}
function modelColor(label: string): string {
  return MODEL_COLORS[label] ?? '#94a3b8'
}

function costFor(family: keyof typeof PRICING, u: UsageTotals): number {
  const p = PRICING[family]
  return (
    (u.input * p.input +
      u.output * p.output +
      u.cacheCreation * p.cacheWrite +
      u.cacheRead * p.cacheRead) /
    1_000_000
  )
}

interface UsageTotals {
  input: number
  output: number
  cacheCreation: number
  cacheRead: number
}

// Local YYYY-MM-DD ('en-CA' formats as ISO date in local tz)
function localDay(ts: string): string {
  return new Date(ts).toLocaleDateString('en-CA')
}

interface RawUsage {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

// ---- Accumulators ----
interface DayAcc extends UsageTotals {
  messages: number
  toolCalls: number
  sessions: Set<string>
}
function emptyDay(): DayAcc {
  return {
    input: 0,
    output: 0,
    cacheCreation: 0,
    cacheRead: 0,
    messages: 0,
    toolCalls: 0,
    sessions: new Set()
  }
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
      const parent = (e as unknown as { parentPath?: string; path?: string }).parentPath ??
        (e as unknown as { path?: string }).path ?? root
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
  onLine: (line: string) => void,
  concurrency: number
): Promise<void> {
  let idx = 0
  const worker = async (): Promise<void> => {
    while (idx < files.length) {
      const f = files[idx++]
      await streamOne(f, onLine)
    }
  }
  const n = Math.max(1, Math.min(concurrency, files.length))
  await Promise.all(Array.from({ length: n }, () => worker()))
}

// In-memory cache + in-flight dedupe. Scanning ~1 GB of transcripts is non-trivial,
// so cache for a few minutes AND ensure only one scan runs at a time no matter how
// many callers (dashboard mount, 60s interval, the badge's 30s poll) ask at once —
// otherwise concurrent scans pile up and thrash, and the dashboard hangs forever.
let cache: { summary: StatsSummary; at: number } | null = null
let inflight: Promise<StatsSummary> | null = null
const CACHE_MS = 300_000

export async function computeStatsSummary(maxDays = 30, force = false): Promise<StatsSummary> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.summary
  if (inflight) return inflight
  inflight = computeFresh(maxDays).finally(() => {
    inflight = null
  })
  return inflight
}

async function computeFresh(maxDays: number): Promise<StatsSummary> {
  const nowMs = Date.now()

  const projectsRoot = join(homedir(), '.claude', 'projects')
  const files = await listTranscripts(projectsRoot)
  if (files.length === 0) {
    const empty = { ...EMPTY_SUMMARY, generatedAt: new Date(nowMs).toISOString() }
    cache = { summary: empty, at: nowMs }
    return empty
  }

  const byDay = new Map<string, DayAcc>()
  const byModel = new Map<string, { totals: UsageTotals; family: keyof typeof PRICING }>()
  const byProject = new Map<string, { totals: UsageTotals; sessions: Set<string> }>()
  const byHour = new Array<number>(24).fill(0)
  const allSessions = new Set<string>()
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

  const handleLine = (line: string): void => {
      if (line.length < 2 || line[0] !== '{') return
      let obj: {
        type?: string
        timestamp?: string
        sessionId?: string
        cwd?: string
        message?: { model?: string; usage?: RawUsage; content?: unknown }
      }
      try {
        obj = JSON.parse(line)
      } catch {
        return
      }
      const ts = obj.timestamp
      const sid = obj.sessionId

      if (obj.type === 'assistant' && obj.message?.usage && ts) {
        const usage = obj.message.usage
        const model = obj.message.model ?? 'unknown'
        const family = modelFamily(model)
        const day = localDay(ts)
        if (!firstDate || day < firstDate) firstDate = day

        const acc = byDay.get(day) ?? emptyDay()
        const total = addUsage(acc, usage)
        acc.messages += 1
        if (sid) acc.sessions.add(sid)
        byDay.set(day, acc)

        const hr = new Date(ts).getHours()
        byHour[hr] += total

        const mEntry = byModel.get(model) ?? { totals: zero(), family }
        addUsage(mEntry.totals, usage)
        byModel.set(model, mEntry)

        const cwd = obj.cwd
        if (cwd) {
          const pEntry = byProject.get(cwd) ?? { totals: zero(), sessions: new Set<string>() }
          addUsage(pEntry.totals, usage)
          if (sid) pEntry.sessions.add(sid)
          byProject.set(cwd, pEntry)
        }

        if (sid) allSessions.add(sid)

        // Count tool calls in this assistant message's content
        const content = obj.message.content
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block && typeof block === 'object' && (block as { type?: string }).type === 'tool_use') {
              acc.toolCalls += 1
            }
          }
        }
      } else if (obj.type === 'user' && ts) {
        // Count genuine user prompts (string content), not tool_result echoes
        const content = obj.message?.content
        if (typeof content === 'string') {
          const day = localDay(ts)
          const acc = byDay.get(day) ?? emptyDay()
          acc.messages += 1
          if (sid) acc.sessions.add(sid)
          byDay.set(day, acc)
        }
      }
  }

  // Stream each file line-by-line with bounded concurrency so memory stays flat
  // regardless of total transcript size (yours can exceed 1 GB).
  await streamFiles(files, handleLine, 4)

  // ---- Build summary ----
  const todayKey = new Date(nowMs).toLocaleDateString('en-CA')
  const today = dayTotals(todayKey, byDay.get(todayKey) ?? emptyDay())

  const sortedDays = [...byDay.keys()].sort()
  const windowDays = sortedDays.slice(-maxDays)
  const daily = windowDays.map((d) => {
    const a = byDay.get(d)!
    const fam = 'default' as const // per-day cost uses blended estimate below
    void fam
    return {
      date: d,
      tokens: a.input + a.output + a.cacheCreation + a.cacheRead,
      inputTokens: a.input,
      outputTokens: a.output,
      messages: a.messages,
      sessions: a.sessions.size,
      cost: 0 // filled after model-weighted blend below
    }
  })

  // Model stats + total cost
  const models: ModelStat[] = []
  let allCost = 0
  let allInput = 0
  let allOutput = 0
  let allTokens = 0
  // Aggregate by friendly family label so multiple Opus/Sonnet model ids collapse
  // into a single breakdown entry.
  const byLabel = new Map<string, { tokens: number; cost: number }>()
  for (const [model, { totals, family }] of byModel) {
    const c = costFor(family, totals)
    const tokens = totals.input + totals.output + totals.cacheCreation + totals.cacheRead
    allCost += c
    allInput += totals.input
    allOutput += totals.output
    allTokens += tokens
    if (tokens <= 0) continue // skip synthetic / zero-token models
    const label = modelLabel(model)
    const agg = byLabel.get(label) ?? { tokens: 0, cost: 0 }
    agg.tokens += tokens
    agg.cost += c
    byLabel.set(label, agg)
  }
  for (const [label, agg] of byLabel) {
    models.push({ model: label, label, tokens: agg.tokens, cost: agg.cost, color: modelColor(label) })
  }
  const visibleModels = models
  visibleModels.sort((a, b) => b.tokens - a.tokens)

  // Blended cost-per-token to estimate per-day + today cost
  const costPerToken = allTokens > 0 ? allCost / allTokens : 0
  for (const d of daily) d.cost = d.tokens * costPerToken
  const todayCost = today.tokens * costPerToken

  const projects: ProjectStat[] = [...byProject.entries()]
    .map(([project, v]) => ({
      project,
      label: basename(project),
      tokens: v.totals.input + v.totals.output + v.totals.cacheCreation + v.totals.cacheRead,
      sessions: v.sessions.size
    }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 8)

  const hourly = byHour.map((tokens, hour) => ({ hour, tokens }))

  let allMessages = 0
  let allToolCalls = 0
  for (const a of byDay.values()) {
    allMessages += a.messages
    allToolCalls += a.toolCalls
  }

  const summary: StatsSummary = {
    today: { ...today, cost: todayCost },
    allTime: {
      tokens: allTokens,
      inputTokens: allInput,
      outputTokens: allOutput,
      messages: allMessages,
      sessions: allSessions.size,
      toolCalls: allToolCalls,
      cost: allCost,
      firstDate
    },
    daily,
    models: visibleModels,
    hourly,
    projects,
    computedFromFiles: files.length,
    generatedAt: new Date(nowMs).toISOString()
  }

  cache = { summary, at: nowMs }
  return summary
}

function zero(): UsageTotals {
  return { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 }
}

function dayTotals(date: string, a: DayAcc): DayTotals {
  return {
    date,
    tokens: a.input + a.output + a.cacheCreation + a.cacheRead,
    inputTokens: a.input,
    outputTokens: a.output,
    cacheCreationTokens: a.cacheCreation,
    cacheReadTokens: a.cacheRead,
    messages: a.messages,
    sessions: a.sessions.size,
    toolCalls: a.toolCalls,
    cost: 0
  }
}

function basename(p: string): string {
  const parts = p.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || p
}
