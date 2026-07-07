import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { BoardState, Card, Column, ColumnId, createDefaultBoard } from '@shared/models'

interface BoardActions {
  load: () => Promise<void>
  save: () => Promise<void>
  addCard: (title: string, description: string, projectDir: string, columnId?: ColumnId) => Card
  updateCard: (id: string, updates: Partial<Pick<Card, 'title' | 'description' | 'projectDir' | 'sessionId' | 'claudeSessionId' | 'tags' | 'worktreePath' | 'worktreeBranch'>>) => void
  deleteCard: (id: string) => void
  moveCard: (cardId: string, toColumnId: ColumnId, toIndex: number) => void
  reorderCards: (columnId: ColumnId, cardIds: string[]) => void
  openNewCardDialog: () => void
  closeNewCardDialog: () => void
}

type BoardStore = BoardState & BoardActions & { loaded: boolean; newCardDialogOpen: boolean }

let saveTimer: ReturnType<typeof setTimeout> | null = null

function debouncedSave(state: BoardState): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    window.api.saveBoard(state)
  }, 500)
}

export const useBoardStore = create<BoardStore>((set, get) => ({
  ...createDefaultBoard(),
  loaded: false,
  newCardDialogOpen: false,

  openNewCardDialog: () => set({ newCardDialogOpen: true }),
  closeNewCardDialog: () => set({ newCardDialogOpen: false }),

  load: async () => {
    const state = await window.api.loadBoard()
    set({ ...state, loaded: true })
  },

  save: async () => {
    const { version, columns, cards, lastSaved } = get()
    await window.api.saveBoard({ version, columns, cards, lastSaved })
  },

  addCard: (title, description, projectDir, columnId = 'todo') => {
    const card: Card = {
      id: uuid(),
      title,
      description,
      projectDir,
      columnId,
      order: get().columns.find((c) => c.id === columnId)?.cardIds.length ?? 0,
      sessionId: null,
      claudeSessionId: null,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    set((state) => {
      const newCards = { ...state.cards, [card.id]: card }
      const newColumns = state.columns.map((col) =>
        col.id === columnId ? { ...col, cardIds: [...col.cardIds, card.id] } : col
      )
      const newState = { ...state, cards: newCards, columns: newColumns }
      debouncedSave({ version: newState.version, columns: newColumns, cards: newCards, lastSaved: newState.lastSaved })
      return newState
    })
    return card
  },

  updateCard: (id, updates) => {
    set((state) => {
      const existing = state.cards[id]
      if (!existing) return state
      const updated = { ...existing, ...updates, updatedAt: Date.now() }
      const newCards = { ...state.cards, [id]: updated }
      const newState = { ...state, cards: newCards }
      debouncedSave({ version: newState.version, columns: newState.columns, cards: newCards, lastSaved: newState.lastSaved })
      return newState
    })
  },

  deleteCard: (id) => {
    set((state) => {
      const card = state.cards[id]
      if (!card) return state
      const { [id]: _, ...remainingCards } = state.cards
      const newColumns = state.columns.map((col) => ({
        ...col,
        cardIds: col.cardIds.filter((cid) => cid !== id)
      }))
      const newState = { ...state, cards: remainingCards, columns: newColumns }
      debouncedSave({ version: newState.version, columns: newColumns, cards: remainingCards, lastSaved: newState.lastSaved })
      return newState
    })
  },

  moveCard: (cardId, toColumnId, toIndex) => {
    set((state) => {
      const card = state.cards[cardId]
      if (!card) return state

      const fromColumnId = card.columnId
      const updatedCard = { ...card, columnId: toColumnId, updatedAt: Date.now() }
      const newCards = { ...state.cards, [cardId]: updatedCard }

      const newColumns = state.columns.map((col) => {
        if (col.id === fromColumnId && col.id === toColumnId) {
          // Same column reorder
          const ids = col.cardIds.filter((id) => id !== cardId)
          ids.splice(toIndex, 0, cardId)
          return { ...col, cardIds: ids }
        }
        if (col.id === fromColumnId) {
          return { ...col, cardIds: col.cardIds.filter((id) => id !== cardId) }
        }
        if (col.id === toColumnId) {
          const ids = [...col.cardIds]
          ids.splice(toIndex, 0, cardId)
          return { ...col, cardIds: ids }
        }
        return col
      })

      const newState = { ...state, cards: newCards, columns: newColumns }
      debouncedSave({ version: newState.version, columns: newColumns, cards: newCards, lastSaved: newState.lastSaved })
      return newState
    })
  },

  reorderCards: (columnId, cardIds) => {
    set((state) => {
      const newColumns = state.columns.map((col) =>
        col.id === columnId ? { ...col, cardIds } : col
      )
      const newState = { ...state, columns: newColumns }
      debouncedSave({ version: newState.version, columns: newColumns, cards: newState.cards, lastSaved: newState.lastSaved })
      return newState
    })
  }
}))
