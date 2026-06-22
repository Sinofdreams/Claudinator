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
      className="rounded-lg text-xs shadow-lg"
      style={{
        padding: '10px 13px',
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-primary)',
        color: 'var(--text-primary)'
      }}
    >
      {label != null && (
        <div className="font-medium" style={{ color: 'var(--text-secondary)', marginBottom: 6 }}>
          {label}
        </div>
      )}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center" style={{ gap: 7, marginTop: i > 0 ? 4 : 0 }}>
          {p.color && (
            <span
              className="inline-block rounded-sm"
              style={{ width: 9, height: 9, backgroundColor: p.color, flexShrink: 0 }}
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

// Time-window presets (days; 0 = all time) and auto-refresh intervals (ms; 0 = off).
const RANGE_OPTIONS = [
  { label: 'Last 24 hours', value: 1, short: '24h' },
  { label: 'Last 7 days', value: 7, short: '7d' },
  { label: 'Last 30 days', value: 30, short: '30d' },
  { label: 'Last 90 days', value: 90, short: '90d' },
  { label: 'All time', value: 0, short: 'All' }
]
const REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '30s', value: 30_000 },
  { label: '1m', value: 60_000 },
  { label: '5m', value: 300_000 },
  { label: '15m', value: 900_000 }
]

function Dropdown({
  options,
  value,
  onChange,
  leadingIcon,
  ariaLabel
}: {
  options: { label: string; value: number }[]
  value: number
  onChange: (v: number) => void
  leadingIcon?: JSX.Element
  ariaLabel?: string
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value) ?? options[0]
  return (
    <div className="relative" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={ariaLabel}
        className="flex items-center gap-2 rounded-lg transition-colors cursor-pointer hover:opacity-90"
        style={{
          height: 38,
          padding: '0 12px',
          backgroundColor: 'var(--bg-button)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)'
        }}
      >
        {leadingIcon}
        <span className="text-xs font-medium whitespace-nowrap">{current.label}</span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0.7 }}
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0" style={{ zIndex: 40 }} onClick={() => setOpen(false)} />
          <div
            className="absolute overflow-hidden rounded-lg shadow-lg"
            style={
              {
                top: '100%',
                right: 0,
                marginTop: 6,
                minWidth: 150,
                zIndex: 50,
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-primary)',
                WebkitAppRegion: 'no-drag'
              } as React.CSSProperties
            }
          >
            {options.map((o) => {
              const active = o.value === value
              return (
                <button
                  key={o.value}
                  onClick={() => {
                    onChange(o.value)
                    setOpen(false)
                  }}
                  className="flex w-full items-center justify-between text-left text-xs transition-colors cursor-pointer hover:opacity-90"
                  style={{
                    padding: '9px 13px',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    backgroundColor: active ? 'var(--bg-active)' : 'transparent'
                  }}
                >
                  <span>{o.label}</span>
                  {active && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ color: 'var(--accent)' }}
                    >
                      <path d="M3 8.5l3.5 3.5L13 4" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

export default function DashboardPanel(): JSX.Element {
  const [data, setData] = useState<StatsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [rangeDays, setRangeDays] = useState<number>(() => {
    const v = Number(localStorage.getItem('dash-range'))
    return RANGE_OPTIONS.some((o) => o.value === v) ? v : 7
  })
  const [autoRefreshMs, setAutoRefreshMs] = useState<number>(() => {
    const v = Number(localStorage.getItem('dash-refresh'))
    return REFRESH_OPTIONS.some((o) => o.value === v) ? v : 300_000
  })

  const changeRange = useCallback((v: number) => {
    setRangeDays(v)
    localStorage.setItem('dash-range', String(v))
  }, [])
  const changeRefresh = useCallback((v: number) => {
    setAutoRefreshMs(v)
    localStorage.setItem('dash-refresh', String(v))
  }, [])

  const load = useCallback(
    async (force = false) => {
      if (force) setRefreshing(true)
      try {
        // Switching range derives instantly from cached buckets; only the manual
        // refresh / auto-refresh tick forces a re-scan of the transcripts.
        const result = await window.api.getStatsSummary(rangeDays, force)
        if (result) setData(result)
      } catch {
        // ignore
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [rangeDays]
  )

  // Reload whenever the range changes (load identity depends on rangeDays).
  useEffect(() => {
    load()
  }, [load])

  // Auto-refresh: a real re-scan on the chosen cadence, Grafana-style.
  useEffect(() => {
    if (autoRefreshMs <= 0) return
    const id = setInterval(() => load(true), autoRefreshMs)
    return () => clearInterval(id)
  }, [autoRefreshMs, load])

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

  const { range, allTime, daily, models, hourly, projects } = data
  const maxProjectTokens = Math.max(1, ...projects.map((p) => p.tokens))
  const generated = data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString() : ''
  const rangeShort = RANGE_OPTIONS.find((o) => o.value === rangeDays)?.short ?? `${rangeDays}d`

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
        <Dropdown
          options={RANGE_OPTIONS}
          value={rangeDays}
          onChange={changeRange}
          ariaLabel="Time range"
          leadingIcon={
            <svg
              width="13"
              height="13"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.8 }}
            >
              <circle cx="8" cy="8" r="6" />
              <path d="M8 5v3l2 1.5" />
            </svg>
          }
        />
        <Dropdown
          options={REFRESH_OPTIONS}
          value={autoRefreshMs}
          onChange={changeRefresh}
          ariaLabel="Auto-refresh interval"
          leadingIcon={
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.8 }}
            >
              <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
              <path d="M13.5 2v3h-3" />
            </svg>
          }
        />
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

        {/* Selected-range headline cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            label={`${rangeShort} · Tokens`}
            value={fmtTokens(range.tokens)}
            sub={`${fmtNum(range.inputTokens)} in / ${fmtNum(range.outputTokens)} out`}
          />
          <StatCard label={`${rangeShort} · Messages`} value={fmtNum(range.messages)} />
          <StatCard label={`${rangeShort} · Sessions`} value={fmtNum(range.sessions)} />
          <StatCard label={`${rangeShort} · Tool calls`} value={fmtNum(range.toolCalls)} />
          <StatCard label={`${rangeShort} · Est. cost`} value={fmtUSD(range.cost)} sub="approx" />
        </div>

        {/* Tokens over time */}
        <div>
          <Panel title={`Tokens over time · ${range.label}`}>
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

