import { useState, useEffect, useCallback } from 'react'
import { useSessionStore } from '@/stores/session-store'
import { useBoardStore } from '@/stores/board-store'
import SettingsDialog from '@/components/Settings/SettingsDialog'
import logoUrl from '@/assets/icon.png'

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

export default function Sidebar(): JSX.Element {
  const sessions = useSessionStore((s) => s.sessions)
  const runningSessions = Object.values(sessions).filter((s) => s.status === 'running').length
  const currentView = useSessionStore((s) => s.currentView)
  const setCurrentView = useSessionStore((s) => s.setCurrentView)
  const openNewCardDialog = useBoardStore((s) => s.openNewCardDialog)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [stats, setStats] = useState<{
    date: string
    tokens: number
    messages: number
    sessions: number
    toolCalls: number
  } | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      const result = await window.api.getTodayStats()
      setStats(result)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [fetchStats])

  return (
    <div className="flex h-full w-14 shrink-0 flex-col items-center pb-4 gap-2.5" style={{ paddingTop: 12, borderRight: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-primary)' }}>
      {/* Logo */}
      <div
        className="mb-4 flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg"
        style={{ border: '1px solid var(--border-subtle)' }}
      >
        <img src={logoUrl} alt="Claude Code Orchestrator" className="h-full w-full object-cover" />
      </div>

      {/* Add */}
      <button
        onClick={openNewCardDialog}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-white hover:bg-blue-500 transition-colors cursor-pointer"
        style={{ backgroundColor: 'var(--accent)' }}
        title="New Card"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M8 4v8M4 8h8" />
        </svg>
      </button>

      {/* Kanban */}
      <button
        onClick={() => setCurrentView('board')}
        className="flex h-9 w-9 items-center justify-center rounded-lg cursor-pointer transition-colors"
        style={currentView === 'board'
          ? { backgroundColor: 'var(--bg-active)', color: 'var(--text-primary)' }
          : { color: 'var(--text-muted)' }
        }
        title="Kanban Board"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" className="opacity-80">
          <rect x="1" y="2" width="3.5" height="12" rx="1" />
          <rect x="6.25" y="2" width="3.5" height="8" rx="1" />
          <rect x="11.5" y="2" width="3.5" height="10" rx="1" />
        </svg>
      </button>

      {/* Sessions */}
      <button
        onClick={() => setCurrentView('sessions')}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors cursor-pointer"
        style={currentView === 'sessions'
          ? { backgroundColor: 'var(--bg-active)', color: 'var(--text-primary)' }
          : { color: 'var(--text-muted)' }
        }
        title="Sessions"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
          <rect x="2" y="3" width="12" height="9" rx="1.5" />
          <path d="M5.5 14h5M8 12v2" />
        </svg>
        {runningSessions > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-green-600 text-[8px] font-bold text-white">
            {runningSessions}
          </span>
        )}
      </button>

      {/* Notes */}
      <button
        onClick={() => setCurrentView('notes')}
        className="flex h-9 w-9 items-center justify-center rounded-lg cursor-pointer transition-colors"
        style={currentView === 'notes'
          ? { backgroundColor: 'var(--bg-active)', color: 'var(--text-primary)' }
          : { color: 'var(--text-muted)' }
        }
        title="Notes &amp; Docs"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 1.5h5L13 5v9.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-12a1 1 0 011-1z" />
          <path d="M9 1.5V5h4M5.5 8.5h5M5.5 11h3.5" />
        </svg>
      </button>

      <div className="flex-1" />

      {/* Token usage */}
      {stats && stats.tokens > 0 && (
        <button
          className="flex h-9 w-9 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors cursor-pointer"
          style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-button)' }}
          title={`${stats.date}: ${stats.tokens.toLocaleString()} tokens, ${stats.messages} messages, ${stats.sessions} sessions, ${stats.toolCalls} tool calls`}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M2 12l3-4 2.5 2L11 5l3 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[8px] font-medium leading-none">
            {formatTokens(stats.tokens)}
          </span>
        </button>
      )}

      {/* Settings */}
      <button
        onClick={() => setSettingsOpen(true)}
        className="mb-5 flex h-9 w-9 items-center justify-center rounded-lg transition-colors cursor-pointer"
        style={{ color: 'var(--text-muted)' }}
        title="Settings"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M6.8 2h2.4l.3 1.8.9.4 1.5-1 1.7 1.7-1 1.5.4.9 1.8.3v2.4l-1.8.3-.4.9 1 1.5-1.7 1.7-1.5-1-.9.4-.3 1.8H6.8l-.3-1.8-.9-.4-1.5 1-1.7-1.7 1-1.5-.4-.9L1.2 9.4V7l1.8-.3.4-.9-1-1.5L4.1 2.6l1.5 1 .9-.4z" />
          <circle cx="8" cy="8" r="2" />
        </svg>
      </button>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
