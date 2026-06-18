import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card, SessionStatus } from '@shared/models'
import { useSessionStore } from '@/stores/session-store'
import { useBoardStore } from '@/stores/board-store'
import { useSettingsStore } from '@/stores/settings-store'
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

/** Pure presentational card — no dnd hooks */
export function CardContent({
  card,
  sessionStatus,
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

      {/* Footer — session ID + timestamp */}
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 5,
          fontSize: 11,
          color: 'var(--text-muted)',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="1.5" y="2" width="9" height="7" rx="1.5" />
          <path d="M1.5 4.5h9" />
        </svg>
        <span>{relativeTime(card.updatedAt)}</span>
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
        const info = await startSession(card.id, card.title, card.projectDir, card.claudeSessionId)
        updateCard(card.id, { sessionId: info.id })
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to start session')
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
