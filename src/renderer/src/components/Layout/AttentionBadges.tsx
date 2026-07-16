import { useEffect, useState } from 'react'
import { useSessionStore } from '@/stores/session-store'
import { useBoardStore } from '@/stores/board-store'
import type { SessionInfo, SessionStatus } from '@shared/models'

/**
 * Title-bar attention badges: small chips next to the window caption buttons
 * showing how many sessions need a decision (orange), have finished and are
 * waiting for a prompt (green), or are actively working (blue). A chip only
 * renders when its count is > 0. Clicking a chip drops down the list of card
 * names in that state — click one to open its session.
 *
 * Sits at z-40, below the session modal's z-50 overlay, so it dims with the
 * rest of the UI while a card is open. Views that put content in the top-right
 * corner (Dashboard header, Notes toolbar) reserve ~300px for the caption
 * buttons + this cluster.
 */

const BADGES: {
  status: SessionStatus
  title: string
  color: string
  bg: string
  icon: JSX.Element
}[] = [
  {
    status: 'decision',
    title: 'waiting for a decision',
    color: '#e8833a',
    bg: 'rgba(232, 131, 58, 0.14)',
    icon: (
      <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1.5 15 14H1L8 1.5z" fillOpacity="0.9" />
        <path d="M8 6v4M8 11.5v1.5" stroke="var(--bg-primary)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  },
  {
    status: 'waiting',
    title: 'finished — waiting for your prompt',
    color: '#3fb950',
    bg: 'rgba(63, 185, 80, 0.14)',
    icon: (
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 8.5 6 12l7.5-8" />
      </svg>
    )
  },
  {
    status: 'running',
    title: 'working',
    color: '#58a6ff',
    bg: 'rgba(88, 166, 255, 0.14)',
    icon: (
      <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor">
        <circle cx="8" cy="8" r="4" />
      </svg>
    )
  }
]

export default function AttentionBadges(): JSX.Element | null {
  const sessions = useSessionStore((s) => s.sessions)
  const openTab = useSessionStore((s) => s.openTab)
  const cards = useBoardStore((s) => s.cards)
  const [open, setOpen] = useState<SessionStatus | null>(null)

  // Close the dropdown on any outside click.
  useEffect(() => {
    if (!open) return
    const close = (): void => setOpen(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [open])

  const sessionTitle = (s: SessionInfo): string => {
    if (s.cardId.startsWith('notes:')) return s.cardId.slice('notes:'.length)
    return cards[s.cardId]?.title ?? 'Session'
  }

  const byStatus = (status: SessionStatus): SessionInfo[] =>
    Object.values(sessions)
      .filter((s) => s.status === status)
      .sort((a, b) => sessionTitle(a).localeCompare(sessionTitle(b)))

  const visible = BADGES.map((b) => ({ ...b, list: byStatus(b.status) })).filter(
    (b) => b.list.length > 0
  )
  if (visible.length === 0) return null

  return (
    <div
      className="fixed z-40 flex items-center gap-1.5"
      style={{
        top: 0,
        height: 36,
        right: 146,
        WebkitAppRegion: 'no-drag'
      } as React.CSSProperties}
    >
      {visible.map((b) => (
        <div key={b.status} className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation()
              setOpen(open === b.status ? null : b.status)
            }}
            title={`${b.list.length} session${b.list.length === 1 ? '' : 's'} ${b.title}`}
            className="flex items-center gap-1 rounded-full cursor-pointer transition-opacity hover:opacity-75"
            style={{
              padding: '2px 8px 2px 6px',
              color: b.color,
              backgroundColor: b.bg,
              border: `1px solid ${b.bg}`
            }}
          >
            {b.icon}
            <span className="text-[11px] font-semibold leading-none">{b.list.length}</span>
          </button>

          {open === b.status && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute rounded-lg shadow-xl overflow-hidden"
              style={{
                top: 30,
                right: 0,
                minWidth: 190,
                maxWidth: 280,
                padding: 4,
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <div
                className="text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: 'var(--text-muted)', padding: '4px 8px 5px' }}
              >
                {b.title}
              </div>
              {b.list.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setOpen(null)
                    openTab(s.id)
                  }}
                  className="flex w-full items-center gap-2 rounded-md cursor-pointer transition-colors hover:bg-[var(--bg-active)] text-left"
                  style={{ padding: '6px 8px', fontSize: 12.5, color: 'var(--text-primary)' }}
                >
                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: b.color }} />
                  <span className="truncate">{sessionTitle(s)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
