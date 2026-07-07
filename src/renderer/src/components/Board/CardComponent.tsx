import { useEffect, useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card, SessionStatus } from '@shared/models'
import { useSessionStore } from '@/stores/session-store'
import { useBoardStore } from '@/stores/board-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useUIStore } from '@/stores/ui-store'
import { getTagColor } from '@/utils/tag-colors'

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function StatusIcon({
  status
}: {
  status: 'idle' | 'running' | 'waiting' | 'decision' | 'done'
}): JSX.Element {
  if (status === 'running') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="animate-spin">
        <circle cx="10" cy="10" r="8" stroke="var(--border-primary)" strokeWidth="2.5" />
        <path
          d="M10 2a8 8 0 0 1 8 8"
          stroke="#60a5fa"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  // Finished — waiting for your next prompt (green).
  if (status === 'waiting') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="9" fill="#14532d" />
        <circle cx="10" cy="10" r="3.2" fill="#22c55e" />
      </svg>
    )
  }

  // Waiting for a decision (orange, gently pulsing for attention).
  if (status === 'decision') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="animate-pulse">
        <circle cx="10" cy="10" r="9" fill="#3f2912" />
        <circle cx="10" cy="10" r="3.2" fill="#f59e0b" />
      </svg>
    )
  }

  if (status === 'done') {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="9" fill="#166534" />
        <path
          d="M6.5 10.5l2.5 2.5 5-5"
          stroke="#4ade80"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  // Idle
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" fill="var(--bg-button)" stroke="var(--border-primary)" strokeWidth="1" />
      <path d="M8.5 6.5l5 3.5-5 3.5z" fill="var(--text-secondary)" />
    </svg>
  )
}

function getCardStatus(
  sessionStatus: SessionStatus | null
): 'idle' | 'running' | 'waiting' | 'decision' | 'done' {
  if (!sessionStatus) return 'idle'
  if (sessionStatus === 'running' || sessionStatus === 'starting') return 'running'
  if (sessionStatus === 'waiting') return 'waiting'
  if (sessionStatus === 'decision') return 'decision'
  if (sessionStatus === 'stopped') return 'done'
  return 'idle' // error
}

function formatCost(cost: number): string {
  if (cost < 0.01) return '<$0.01'
  return '$' + (cost >= 100 ? cost.toFixed(0) : cost.toFixed(2))
}

/** Pure presentational card — no dnd hooks */
export function CardContent({
  card,
  sessionStatus,
  cost,
  onEdit,
  onStop,
  onClick,
  dragRef,
  dragStyle,
  dragAttributes,
  dragListeners,
}: {
  card: Card
  sessionStatus: SessionStatus | null
  cost?: number | null
  onEdit?: (e: React.MouseEvent) => void
  onStop?: (e: React.MouseEvent) => void
  onClick?: () => void
  dragRef?: (node: HTMLElement | null) => void
  dragStyle?: React.CSSProperties
  dragAttributes?: Record<string, unknown>
  dragListeners?: Record<string, unknown>
}): JSX.Element {
  const tags = card.tags ?? []
  const status = getCardStatus(sessionStatus)
  const isRunning = status === 'running'
  const theme = useSettingsStore((s) => s.theme)

  return (
    <div
      ref={dragRef}
      style={{
        ...dragStyle,
        borderRadius: 10,
        border: '1px solid var(--card-border)',
        backgroundColor: 'var(--card-bg)',
        padding: '14px 16px',
        cursor: dragRef ? 'grab' : 'default',
        position: 'relative',
      }}
      {...(dragAttributes ?? {})}
      {...(dragListeners ?? {})}
      onClick={onClick}
      className="group transition-colors active:cursor-grabbing"
    >
      {/* Hover action buttons */}
      {onEdit && (
        <div
          className="opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            zIndex: 10,
          }}
        >
          {isRunning && onStop && (
            <button
              onClick={onStop}
              title="Stop session"
              style={{
                borderRadius: 4,
                padding: 4,
                color: 'var(--text-secondary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect x="3" y="3" width="8" height="8" rx="1.5" />
              </svg>
            </button>
          )}
          <button
            onClick={onEdit}
            title="Edit card"
            style={{
              borderRadius: 4,
              padding: 4,
              color: 'var(--text-secondary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M10 2l2 2L5 11H3V9L10 2z" />
            </svg>
          </button>
        </div>
      )}

      {/* Status icon + Title row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, paddingRight: 32 }}>
        <div style={{ flexShrink: 0, marginTop: 0 }}>
          <StatusIcon status={status} />
        </div>
        <h3
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.4,
            margin: 0,
          }}
        >
          {card.title}
        </h3>
      </div>

      {/* Tags — aligned with icon */}
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {tags.map((tag) => {
            const c = getTagColor(tag, theme)
            return (
              <span
                key={tag}
                style={{
                  borderRadius: 5,
                  border: `1px solid ${c.border}40`,
                  backgroundColor: c.bg,
                  padding: '2px 7px',
                  fontSize: 10,
                  color: c.text,
                }}
              >
                {tag}
              </span>
            )
          })}
        </div>
      )}

      {/* Footer — worktree badge + timestamp */}
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontSize: 11,
          color: 'var(--text-muted)',
        }}
      >
        {card.worktreePath && (
          <div
            className="flex items-center min-w-0"
            style={{ gap: 4, color: 'var(--text-faint)' }}
            title={`Runs in worktree: ${card.worktreePath}`}
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
              <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
            </svg>
            <span className="truncate" style={{ fontSize: 10 }}>{card.worktreeBranch ?? 'worktree'}</span>
          </div>
        )}
        <div className="flex items-center" style={{ gap: 5, marginLeft: 'auto' }}>
          {cost != null && cost > 0 && (
            <span
              style={{ fontSize: 10, color: 'var(--text-faint)', marginRight: 6 }}
              title="Estimated cost of this card's conversation"
            >
              {formatCost(cost)}
            </span>
          )}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
            <rect x="1.5" y="2" width="9" height="7" rx="1.5" />
            <path d="M1.5 4.5h9" />
          </svg>
          <span>{relativeTime(card.updatedAt)}</span>
        </div>
      </div>
    </div>
  )
}

interface CardComponentProps {
  card: Card
  onEdit: () => void
}

export default function CardComponent({ card, onEdit }: CardComponentProps): JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: card.id })

  const sessions = useSessionStore((s) => s.sessions)
  const startSession = useSessionStore((s) => s.startSession)
  const stopSession = useSessionStore((s) => s.stopSession)
  const openTab = useSessionStore((s) => s.openTab)
  const updateCard = useBoardStore((s) => s.updateCard)

  const session = card.sessionId ? sessions[card.sessionId] : null
  const sessionStatus = session?.status ?? null

  // Estimated conversation cost, refreshed once a minute. The main process
  // caches per transcript mtime, so this stays cheap across many cards.
  const [cost, setCost] = useState<number | null>(null)
  useEffect(() => {
    if (!card.claudeSessionId) {
      setCost(null)
      return
    }
    let alive = true
    const dir = card.worktreePath || card.projectDir
    const claudeId = card.claudeSessionId
    const fetchCost = async (): Promise<void> => {
      try {
        const result = await window.api.getSessionCost(dir, claudeId)
        if (alive) setCost(result?.cost ?? null)
      } catch {
        // ignore
      }
    }
    fetchCost()
    const interval = setInterval(fetchCost, 60000)
    return () => {
      alive = false
      clearInterval(interval)
    }
  }, [card.claudeSessionId, card.worktreePath, card.projectDir])

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const handleCardClick = async (): Promise<void> => {
    if (card.sessionId && session) {
      openTab(card.sessionId)
    } else {
      try {
        const dir = card.worktreePath || card.projectDir
        const info = await startSession(card.id, card.title, dir, card.claudeSessionId)
        updateCard(card.id, { sessionId: info.id })
      } catch (err) {
        useUIStore.getState().showToast(err instanceof Error ? err.message : 'Failed to start session')
      }
    }
  }

  const handleEditClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    onEdit()
  }

  const handleStopClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (card.sessionId) {
      stopSession(card.sessionId)
    }
  }

  return (
    <CardContent
      card={card}
      sessionStatus={sessionStatus}
      cost={cost}
      onEdit={handleEditClick}
      onStop={handleStopClick}
      onClick={handleCardClick}
      dragRef={setNodeRef}
      dragStyle={style}
      dragAttributes={attributes as unknown as Record<string, unknown>}
      dragListeners={listeners as unknown as Record<string, unknown>}
    />
  )
}
