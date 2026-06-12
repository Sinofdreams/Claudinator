import { useState, useCallback, useMemo, useRef } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  useDroppable,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import type { CollisionDetection } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import { useBoardStore } from '@/stores/board-store'
import { useSessionStore } from '@/stores/session-store'
import type { Card, ColumnId } from '@shared/models'
import ColumnComponent from './ColumnComponent'
import { CardContent } from './CardComponent'
import CardDialog from './CardDialog'
import { useTitleBarDim } from '@/hooks/useTitleBarDim'

function TrashDropZone(): JSX.Element {
  const { isOver, setNodeRef } = useDroppable({ id: 'trash' })

  return (
    <div
      ref={setNodeRef}
      className={`fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-200 ${
        isOver
          ? 'border-red-500 bg-red-500/20 scale-110'
          : ''
      }`}
      style={{ width: 64, height: 64, borderColor: isOver ? undefined : 'var(--border-primary)', backgroundColor: isOver ? undefined : 'var(--bg-surface)' }}
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke={isOver ? '#ef4444' : 'var(--text-secondary)'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      </svg>
    </div>
  )
}

export default function Board(): JSX.Element {
  const columns = useBoardStore((s) => s.columns)
  const cards = useBoardStore((s) => s.cards)
  const addCard = useBoardStore((s) => s.addCard)
  const updateCard = useBoardStore((s) => s.updateCard)
  const deleteCard = useBoardStore((s) => s.deleteCard)
  const moveCard = useBoardStore((s) => s.moveCard)
  const reorderCards = useBoardStore((s) => s.reorderCards)
  const sessions = useSessionStore((s) => s.sessions)

  const newCardDialogOpen = useBoardStore((s) => s.newCardDialogOpen)
  const closeNewCardDialog = useBoardStore((s) => s.closeNewCardDialog)

  const [dialogState, setDialogState] = useState<{
    open: boolean
    card?: Card | null
    columnId?: ColumnId
  }>({ open: false })

  const [activeId, setActiveId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const pendingOverColumnRef = useRef<ColumnId | null>(null)

  useTitleBarDim(Boolean(pendingDeleteId))

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // Use pointerWithin first, fall back to rectIntersection for empty columns
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) return pointerCollisions
    return rectIntersection(args)
  }, [])

  const totalCards = Object.keys(cards).length
  const runningSessions = Object.values(sessions).filter((s) => s.status === 'running').length

  const findColumnOfCard = useCallback(
    (cardId: string): ColumnId | null => {
      const card = cards[cardId]
      return card?.columnId ?? null
    },
    [cards]
  )

  // Filter cards based on search query
  const filteredCards = useMemo(() => {
    if (!searchQuery.trim()) return cards
    const q = searchQuery.toLowerCase()
    const isTagSearch = q.startsWith('#')
    const searchTerm = isTagSearch ? q.slice(1) : q

    const filtered: Record<string, Card> = {}
    for (const [id, card] of Object.entries(cards)) {
      if (isTagSearch) {
        if ((card.tags ?? []).some((t) => t.toLowerCase().includes(searchTerm))) {
          filtered[id] = card
        }
      } else {
        if (
          card.title.toLowerCase().includes(searchTerm) ||
          card.description.toLowerCase().includes(searchTerm) ||
          (card.tags ?? []).some((t) => t.toLowerCase().includes(searchTerm))
        ) {
          filtered[id] = card
        }
      }
    }
    return filtered
  }, [cards, searchQuery])

  const handleDragStart = (event: DragStartEvent): void => {
    setActiveId(event.active.id as string)
    pendingOverColumnRef.current = null
  }

  const handleDragOver = (event: DragOverEvent): void => {
    const { over } = event
    if (!over) {
      pendingOverColumnRef.current = null
      return
    }

    const overId = over.id as string

    // Determine which column the pointer is over
    const isColumn = columns.find((c) => c.id === overId)
    const overCol = isColumn ? (overId as ColumnId) : findColumnOfCard(overId)

    pendingOverColumnRef.current = overCol
  }

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    setActiveId(null)

    if (!over) {
      pendingOverColumnRef.current = null
      return
    }

    const activeCardId = active.id as string
    const overId = over.id as string

    // Dropped on trash — prompt for deletion
    if (overId === 'trash') {
      setPendingDeleteId(activeCardId)
      pendingOverColumnRef.current = null
      return
    }

    const activeCol = findColumnOfCard(activeCardId)

    if (!activeCol) return

    // Determine target column
    const isColumn = columns.find((c) => c.id === overId)
    const overCol = isColumn ? (overId as ColumnId) : findColumnOfCard(overId)

    if (!overCol) return

    if (activeCol === overCol) {
      // Same column — reorder
      const column = columns.find((c) => c.id === activeCol)!
      const oldIndex = column.cardIds.indexOf(activeCardId)
      const newIndex = column.cardIds.indexOf(overId)
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const newOrder = arrayMove(column.cardIds, oldIndex, newIndex)
        reorderCards(activeCol, newOrder)
      }
    } else {
      // Cross-column move — always drop at the top of the target column
      moveCard(activeCardId, overCol, 0)
    }

    pendingOverColumnRef.current = null
  }

  const handleSaveCard = (data: { title: string; description: string; projectDir: string; tags: string[] }): void => {
    if (dialogState.card) {
      updateCard(dialogState.card.id, data)
    } else {
      const card = addCard(data.title, data.description, data.projectDir, dialogState.columnId)
      updateCard(card.id, { tags: data.tags })
    }
    setDialogState({ open: false })
  }

  const handleDeleteCard = (): void => {
    if (dialogState.card) {
      deleteCard(dialogState.card.id)
    }
    setDialogState({ open: false })
  }

  const activeCard = activeId ? cards[activeId] : null

  return (
    <div className="flex flex-1 min-h-0 flex-col" style={{ paddingBottom: 14, backgroundColor: 'var(--bg-primary)' }}>
      {/* Top bar — drag region for frameless window */}
      <div className="shrink-0 flex items-center gap-5 px-6 pb-5" style={{ WebkitAppRegion: 'drag', paddingTop: 12 } as React.CSSProperties}>
        <div className="relative w-80 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: 'var(--text-muted)', left: 14 }}
          >
            <circle cx="5.5" cy="5.5" r="4" />
            <path d="M9 9l3.5 3.5" />
          </svg>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search or type # to filter by tag..."
            className="w-full rounded-lg text-sm outline-none transition-colors"
            style={{ border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)', paddingLeft: 40, paddingRight: 16, paddingTop: 10, paddingBottom: 10 }}
          />
        </div>
        <div className="flex-1" />
      </div>

      {/* Columns */}
      <div className="flex flex-1 min-h-0 gap-5 overflow-x-auto pl-6" style={{ marginTop: 8 }}>
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {columns.map((column) => {
            const colCards = column.cardIds
              .map((id) => filteredCards[id])
              .filter(Boolean)
            return (
              <ColumnComponent
                key={column.id}
                column={column}
                cards={colCards}
                onEditCard={(card) => setDialogState({ open: true, card })}
              />
            )
          })}

          <DragOverlay>
            {activeCard && (
              <div style={{ opacity: 0.9 }}>
                <CardContent card={activeCard} sessionStatus={null} />
              </div>
            )}
          </DragOverlay>

          {activeId && <TrashDropZone />}
        </DndContext>
        <div className="shrink-0" style={{ width: 1, marginLeft: -6 }} />
      </div>

      {(dialogState.open || newCardDialogOpen) && (
        <CardDialog
          card={dialogState.card}
          onSave={(data) => {
            handleSaveCard(data)
            closeNewCardDialog()
          }}
          onClose={() => {
            setDialogState({ open: false })
            closeNewCardDialog()
          }}
          onDelete={dialogState.card ? handleDeleteCard : undefined}
        />
      )}

      {pendingDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'var(--bg-overlay)' }}>
          <div className="rounded-2xl shadow-2xl" style={{ width: 340, padding: '22px 26px 20px', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-primary)' }}>
            <h2 className="text-base font-semibold" style={{ marginBottom: 8, color: 'var(--text-primary)' }}>Delete card</h2>
            <p className="text-sm leading-relaxed" style={{ marginBottom: 28, color: 'var(--text-secondary)' }}>
              Are you sure you want to delete this card? This action cannot be undone.
            </p>
            <div className="flex justify-end" style={{ gap: 12 }}>
              <button
                onClick={() => setPendingDeleteId(null)}
                className="rounded-lg text-sm font-medium transition-colors"
                style={{ padding: '8px 20px', color: 'var(--text-primary)', backgroundColor: 'var(--bg-button)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteCard(pendingDeleteId)
                  setPendingDeleteId(null)
                }}
                className="rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-500 transition-colors"
                style={{ padding: '8px 20px' }}
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
