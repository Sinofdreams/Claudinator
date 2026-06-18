import { useEffect, useState, useCallback } from 'react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts'
import type { StatsSummary } from '@shared/stats'

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
function fmtNum(n: number): string {
  return n.toLocaleString()
}
function fmtUSD(n: number): string {
  if (n >= 100) return `$${n.toFixed(0)}`
  return `$${n.toFixed(2)}`
}
function shortDate(iso: string): string {
  // YYYY-MM-DD -> MM/DD
  const p = iso.split('-')
  return p.length === 3 ? `${p[1]}/${p[2]}` : iso
}

const AXIS = 'var(--text-faint)'
const GRID = 'var(--border-subtle)'

interface TooltipPayloadItem {
  name?: string
  value?: number | string
  color?: string
  payload?: Record<string, unknown>
}

function ChartTooltip({
  active,
  payload,
  label,
  unit
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
  unit?: string
}): JSX.Element | null {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-md px-2.5 py-1.5 text-xs shadow-lg"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-primary)',
        color: 'var(--text-primary)'
      }}
    >
      {label != null && (
        <div className="mb-0.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {p.color && (
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ backgroundColor: p.color }}
            />
          )}
          <span>
            {p.name}: {typeof p.value === 'number' ? fmtNum(p.value) : p.value}
            {unit ? ` ${unit}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

function StatCard({
  label,
  value,
  sub
}: {
  label: string
  value: string
  sub?: string
}): JSX.Element {
  return (
    <div
      className="flex flex-col rounded-xl"
      style={{
        padding: '14px 22px',
        gap: 8,
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)'
      }}
    >
      <span className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-faint)' }}>
        {label}
      </span>
      <span className="text-3xl font-semibold leading-none" style={{ color: 'var(--text-primary)' }}>
        {value}
      </span>
      {sub && (
        <span className="text-[11px]" style={{ color: 'var(--text-muted)', marginTop: 2 }}>
          {sub}
        </span>
      )}
    </div>
  )
}

function Panel({
  title,
  children,
  right
}: {
  title: string
  children: React.ReactNode
  right?: React.ReactNode
}): JSX.Element {
  return (
    <div
      className="flex flex-col rounded-xl"
      style={{ padding: '22px 26px 24px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: 18 }}>
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          {title}
        </h3>
        {right}
      </div>
      {children}
    </div>
  )
}

export default function DashboardPanel(): JSX.Element {
  const [data, setData] = useState<StatsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true)
    try {
      const result = await window.api.getStatsSummary(force)
      if (result) setData(result)
    } catch {
      // ignore
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(() => load(), 60_000)
    return () => clearInterval(interval)
  }, [load])

  if (loading && !data) {
    return (
      <div
        className="flex h-full items-center justify-center"
        style={{ color: 'var(--text-muted)' }}
      >
        Computing stats…
      </div>
    )
  }

  if (!data || data.allTime.tokens === 0) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-2"
        style={{ color: 'var(--text-muted)' }}
      >
        <span className="text-sm">No usage data found yet.</span>
        <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
          Run some Claude Code sessions and check back.
        </span>
      </div>
    )
  }

  const { today, allTime, daily, models, hourly, projects } = data
  const maxProjectTokens = Math.max(1, ...projects.map((p) => p.tokens))
  const generated = data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString() : ''

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header — drag region for frameless window */}
      <div
        className="flex items-center gap-3 shrink-0"
        style={{ height: 52, padding: '0 24px', borderBottom: '1px solid var(--border-subtle)', WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" style={{ color: 'var(--text-muted)' }}>
          <path d="M2 12l3-4 2.5 2L11 5l3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Usage Dashboard
        </h2>
        <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
          Live · {data.computedFromFiles} transcripts · updated {generated}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          title={refreshing ? 'Refreshing…' : 'Refresh'}
          className="flex items-center justify-center rounded-lg transition-colors cursor-pointer hover:opacity-90 disabled:opacity-50"
          style={{ width: 38, height: 38, backgroundColor: 'var(--bg-button)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', WebkitAppRegion: 'no-drag', marginRight: 140 } as React.CSSProperties}
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={refreshing ? 'animate-spin' : ''}
          >
            <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
            <path d="M13.5 2v3h-3" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div style={{ padding: '24px 32px 56px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Today's headline cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            label="Today · Tokens"
            value={fmtTokens(today.tokens)}
            sub={`${fmtNum(today.inputTokens)} in / ${fmtNum(today.outputTokens)} out`}
          />
          <StatCard label="Today · Messages" value={fmtNum(today.messages)} />
          <StatCard label="Today · Sessions" value={fmtNum(today.sessions)} />
          <StatCard label="Today · Tool calls" value={fmtNum(today.toolCalls)} />
          <StatCard label="Today · Est. cost" value={fmtUSD(today.cost)} sub="approx" />
        </div>

        {/* Tokens over time */}
        <div>
          <Panel title="Tokens over time (last 30 days)">
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="tokGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDate}
                    tick={{ fill: AXIS, fontSize: 11 }}
                    stroke={GRID}
                    minTickGap={20}
                  />
                  <YAxis
                    tickFormatter={fmtTokens}
                    tick={{ fill: AXIS, fontSize: 11 }}
                    stroke={GRID}
                    width={48}
                  />
                  <Tooltip
                    content={<ChartTooltip unit="tokens" />}
                    labelFormatter={(l) => `Date ${l}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="tokens"
                    name="Tokens"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    fill="url(#tokGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        {/* Model breakdown + activity by hour */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel title="By model">
            <div className="flex items-center gap-6">
              <div className="h-56 w-56 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={models}
                      dataKey="tokens"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={94}
                      paddingAngle={2}
                      stroke="var(--bg-surface)"
                    >
                      {models.map((m) => (
                        <Cell key={m.model} fill={m.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip unit="tokens" />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {models.map((m) => (
                  <div key={m.model} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2" style={{ color: 'var(--text-secondary)' }}>
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: m.color }}
                      />
                      {m.label}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {fmtTokens(m.tokens)} · {fmtUSD(m.cost)}
                    </span>
                  </div>
                ))}
                {models.length === 0 && (
                  <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                    No model data
                  </span>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Activity by hour">
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis
                    dataKey="hour"
                    tick={{ fill: AXIS, fontSize: 11 }}
                    stroke={GRID}
                    tickFormatter={(h) => (h % 6 === 0 ? `${h}:00` : '')}
                    interval={0}
                  />
                  <YAxis
                    tickFormatter={fmtTokens}
                    tick={{ fill: AXIS, fontSize: 11 }}
                    stroke={GRID}
                    width={48}
                  />
                  <Tooltip
                    content={<ChartTooltip unit="tokens" />}
                    labelFormatter={(h) => `${h}:00`}
                    cursor={{ fill: 'var(--bg-active)', opacity: 0.4 }}
                  />
                  <Bar dataKey="tokens" name="Tokens" fill="var(--accent)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        {/* All-time + top projects */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Panel title="All time">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <StatCard label="Total tokens" value={fmtTokens(allTime.tokens)} />
              <StatCard label="Est. cost" value={fmtUSD(allTime.cost)} sub="approx" />
              <StatCard label="Sessions" value={fmtNum(allTime.sessions)} />
              <StatCard label="Messages" value={fmtNum(allTime.messages)} />
              <StatCard label="Tool calls" value={fmtNum(allTime.toolCalls)} />
              <StatCard
                label="Since"
                value={allTime.firstDate ? shortDate(allTime.firstDate) : '—'}
                sub={allTime.firstDate ? allTime.firstDate.slice(0, 4) : undefined}
              />
            </div>
          </Panel>

          <Panel title="Top projects">
            <div className="flex flex-col gap-3.5">
              {projects.map((p) => (
                <div key={p.project} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate" style={{ color: 'var(--text-secondary)' }} title={p.project}>
                      {p.label}
                    </span>
                    <span className="shrink-0 pl-2" style={{ color: 'var(--text-muted)' }}>
                      {fmtTokens(p.tokens)} · {p.sessions} sess
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--bg-active)' }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(3, (p.tokens / maxProjectTokens) * 100)}%`,
                        backgroundColor: 'var(--accent)'
                      }}
                    />
                  </div>
                </div>
              ))}
              {projects.length === 0 && (
                <span className="text-xs" style={{ color: 'var(--text-faint)' }}>
                  No project data
                </span>
              )}
            </div>
          </Panel>
        </div>

        <p className="text-center text-[11px]" style={{ color: 'var(--text-faint)' }}>
          Costs are estimates based on public list pricing and may differ from billing.
        </p>
        </div>
      </div>
    </div>
  )
}

