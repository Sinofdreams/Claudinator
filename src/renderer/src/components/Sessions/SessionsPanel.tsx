import React, { useState, useEffect, useRef } from 'react'
import { useSessionStore } from '@/stores/session-store'
import { useBoardStore } from '@/stores/board-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useUIStore } from '@/stores/ui-store'
import { getTagColor } from '@/utils/tag-colors'
import CardDialog from '@/components/Board/CardDialog'
import type { SessionStatus, Card } from '@shared/models'

const STATUS_CONFIG: Record<SessionStatus, { label: string; color: string; bg: string }> = {
  starting: { label: 'Starting', color: '#a78bfa', bg: 'rgba(167, 139, 250, 0.1)' },
  running: { label: 'Running', color: '#60a5fa', bg: 'rgba(96, 165, 250, 0.1)' },
  waiting: { label: 'Waiting', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.1)' },
  decision: { label: 'Decision', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' },
  stopped: { label: 'Stopped', color: 'var(--text-muted)', bg: 'var(--bg-surface)' },
  error: { label: 'Error', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)' }
}

const COLUMN_LABELS: Record<string, string> = {
  'todo': 'Backlog',
  'in-progress': 'In Progress',
  'to-review': 'Review',
  'testing': 'Validating',
  'done': 'Complete'
}

interface ContextMenu {
  x: number
  y: number
  card: Card
}

export default function SessionsPanel(): JSX.Element {
  const sessions = useSessionStore((s) => s.sessions)
  const startSession = useSessionStore((s) => s.startSession)
  const openTab = useSessionStore((s) => s.openTab)
  const cards = useBoardStore((s) => s.cards)
  const updateCard = useBoardStore((s) => s.updateCard)
  const deleteCard = useBoardStore((s) => s.deleteCard)

  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [editingCard, setEditingCard] = useState<Card | null>(null)
  const [pendingDeleteCard, setPendingDeleteCard] = useState<Card | null>(null)

  const cardList = Object.values(cards).sort((a, b) => b.updatedAt - a.updatedAt)

  // Map cardId -> session for quick lookup
  const sessionByCard = new Map<string, (typeof sessions)[string]>()
  for (const session of Object.values(sessions)) {
    sessionByCard.set(session.cardId, session)
  }

  const handleCardClick = async (card: Card): Promise<void> => {
    const existingSession = sessionByCard.get(card.id)
    if (card.sessionId && existingSession) {
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

  const handleContextMenu = (e: React.MouseEvent, card: Card): void => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, card })
  }

  // Close context menu on any click
  useEffect(() => {
    if (!contextMenu) return
    const close = (): void => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header — drag region for frameless window */}
      <div
        className="flex items-center gap-3 shrink-0"
        style={{ height: 52, padding: '0 24px', borderBottom: '1px solid var(--border-subtle)', WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" style={{ color: 'var(--text-muted)' }}>
          <rect x="2" y="3" width="12" height="9" rx="1.5" />
          <path d="M5.5 14h5M8 12v2" />
        </svg>
        <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Sessions
        </h2>
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-surface)' }}
        >
          {cardList.length}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '20px 24px' }}>
        {cardList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: 'var(--text-muted)' }}>
            <svg width="40" height="40" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.4">
              <rect x="2" y="3" width="12" height="9" rx="1.5" />
              <path d="M5.5 14h5M8 12v2" />
            </svg>
            <p className="text-sm">No cards yet</p>
            <p className="text-xs opacity-60">Create a card from the kanban board to get started</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {cardList.map((card) => {
              const session = sessionByCard.get(card.id)
              return (
                <CardRow
                  key={card.id}
                  card={card}
                  session={session ?? null}
                  onClick={() => handleCardClick(card)}
                  onContextMenu={(e) => handleContextMenu(e, card)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenuPopup
          x={contextMenu.x}
          y={contextMenu.y}
          onEdit={() => {
            setEditingCard(contextMenu.card)
            setContextMenu(null)
          }}
          onDelete={() => {
            setPendingDeleteCard(contextMenu.card)
            setContextMenu(null)
          }}
        />
      )}

      {/* Edit card dialog */}
      {editingCard && (
        <CardDialog
          card={editingCard}
          onSave={(data) => {
            updateCard(editingCard.id, data)
            setEditingCard(null)
          }}
          onClose={() => setEditingCard(null)}
        />
      )}

      {/* Delete confirmation */}
      {pendingDeleteCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}>
          <div className="rounded-2xl shadow-2xl" style={{ width: 380, padding: '28px 32px 28px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-primary)' }}>
            <h2 className="text-base font-semibold" style={{ marginBottom: 10, color: 'var(--text-primary)' }}>Delete card</h2>
            <p className="text-sm leading-relaxed" style={{ marginBottom: 32, color: 'var(--text-secondary)' }}>
              Are you sure you want to delete <strong style={{ color: 'var(--text-primary)' }}>{pendingDeleteCard.title}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setPendingDeleteCard(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors"
                style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-primary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-active)' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-surface)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteCard(pendingDeleteCard.id)
                  setPendingDeleteCard(null)
                }}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white cursor-pointer transition-colors"
                style={{ backgroundColor: '#dc2626', border: '1px solid transparent' }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#b91c1c' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#dc2626' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ContextMenuPopup({
  x,
  y,
  onEdit,
  onDelete
}: {
  x: number
  y: number
  onEdit: () => void
  onDelete: () => void
}): JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  // Adjust position if menu overflows viewport
  useEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const nx = rect.right > window.innerWidth ? x - rect.width : x
    const ny = rect.bottom > window.innerHeight ? y - rect.height : y
    setPos({ x: nx, y: ny })
  }, [x, y])

  return (
    <div
      ref={menuRef}
      className="fixed z-50 rounded-xl shadow-xl"
      style={{
        left: pos.x,
        top: pos.y,
        minWidth: 160,
        padding: '6px',
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-primary)',
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onEdit() }}
        className="flex items-center gap-3 w-full px-3.5 py-2.5 text-left text-sm rounded-lg transition-colors cursor-pointer"
        style={{ color: 'var(--text-primary)' }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-active)' }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M11.5 2.5l2 2-8 8H3.5v-2z" />
          <path d="M10 4l2 2" />
        </svg>
        Edit
      </button>
      <div style={{ height: 1, margin: '4px 8px', backgroundColor: 'var(--border-subtle)' }} />
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="flex items-center gap-3 w-full px-3.5 py-2.5 text-left text-sm rounded-lg transition-colors cursor-pointer"
        style={{ color: '#ef4444' }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--bg-active)' }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M3 4h10M6 4V3h4v1M5 4v8.5a1 1 0 001 1h4a1 1 0 001-1V4" />
          <path d="M7 7v4M9 7v4" />
        </svg>
        Delete
      </button>
    </div>
  )
}

function CardRow({
  card,
  session,
  onClick,
  onContextMenu
}: {
  card: Card
  session: { status: SessionStatus; claudeSessionId: string | null } | null
  onClick: () => void
  onContextMenu: (e: React.MouseEvent) => void
}): JSX.Element {
  const theme = useSettingsStore((s) => s.theme)
  const statusConfig = session ? STATUS_CONFIG[session.status] : null
  const columnLabel = COLUMN_LABELS[card.columnId] ?? card.columnId

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="flex items-center gap-4 rounded-lg transition-colors cursor-pointer"
      style={{
        padding: '14px 18px',
        backgroundColor: 'var(--card-bg)',
        border: '1px solid var(--card-border)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--card-border)'
      }}
    >
      {/* Card info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {card.title}
          </span>
          {(card.tags ?? []).map((tag) => {
            const c = getTagColor(tag, theme)
            return (
              <span
                key={tag}
                className="shrink-0"
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
        <div className="flex items-center gap-2 mt-1.5">
          <span
            className="text-[11px] px-1.5 py-0.5 rounded"
            style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-surface)' }}
          >
            {columnLabel}
          </span>
          {card.projectDir && (
            <span className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
              {card.projectDir}
            </span>
          )}
        </div>
      </div>

      {/* Session status */}
      {statusConfig && session ? (
        <div
          className="flex items-center shrink-0 rounded-md text-[10px] font-semibold px-2 py-1"
          style={{ color: statusConfig.color, backgroundColor: statusConfig.bg }}
        >
          {session.status === 'running' && (
            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse" style={{ backgroundColor: statusConfig.color }} />
          )}
          {statusConfig.label}
        </div>
      ) : (
        <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
          No session
        </span>
      )}

      {/* Arrow */}
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
        <path d="M6 4l4 4-4 4" />
      </svg>
    </div>
  )
}
