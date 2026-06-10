import { create } from 'zustand'
import { SessionInfo, SessionStatus } from '@shared/models'
import { useBoardStore } from './board-store'

type ViewName = 'board' | 'sessions' | 'notes'

interface SessionState {
  sessions: Record<string, SessionInfo>
  activeSessionId: string | null
  openTabs: string[] // session IDs
  viewingSessionId: string | null // full-screen session view
  currentView: ViewName
}

interface SessionActions {
  startSession: (cardId: string, cardTitle: string, projectDir: string, claudeSessionId?: string | null) => Promise<SessionInfo>
  startSessionInline: (cardId: string, cardTitle: string, projectDir: string, claudeSessionId?: string | null) => Promise<SessionInfo>
  stopSession: (sessionId: string) => Promise<void>
  setActiveSession: (sessionId: string | null) => void
  openTab: (sessionId: string) => void
  closeTab: (sessionId: string) => void
  setViewingSession: (sessionId: string | null) => void
  updateSessionStatus: (sessionId: string, status: SessionStatus) => void
  removeSession: (sessionId: string) => void
  setCurrentView: (view: ViewName) => void
  initListeners: () => () => void
}

type SessionStore = SessionState & SessionActions

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: {},
  activeSessionId: null,
  openTabs: [],
  viewingSessionId: null,
  currentView: 'board',

  startSession: async (cardId, cardTitle, projectDir, claudeSessionId) => {
    const info = await window.api.startSession({ cardId, cardTitle, projectDir, claudeSessionId })
    set((state) => ({
      sessions: { ...state.sessions, [info.id]: info },
      openTabs: state.openTabs.includes(info.id) ? state.openTabs : [...state.openTabs, info.id],
      activeSessionId: info.id,
      viewingSessionId: info.id
    }))
    return info
  },

  // Like startSession but does not open the full-screen modal — used for the
  // inline CLI pane embedded in the Notes editor.
  startSessionInline: async (cardId, cardTitle, projectDir, claudeSessionId) => {
    const info = await window.api.startSession({ cardId, cardTitle, projectDir, claudeSessionId })
    set((state) => ({
      sessions: { ...state.sessions, [info.id]: info },
      openTabs: state.openTabs.includes(info.id) ? state.openTabs : [...state.openTabs, info.id]
    }))
    return info
  },

  stopSession: async (sessionId) => {
    await window.api.stopSession(sessionId)
    set((state) => {
      const session = state.sessions[sessionId]
      if (!session) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, status: 'stopped' }
        }
      }
    })
  },

  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId })
  },

  openTab: (sessionId) => {
    set((state) => ({
      openTabs: state.openTabs.includes(sessionId)
        ? state.openTabs
        : [...state.openTabs, sessionId],
      activeSessionId: sessionId,
      viewingSessionId: sessionId
    }))
  },

  closeTab: (sessionId) => {
    set((state) => {
      const newTabs = state.openTabs.filter((id) => id !== sessionId)
      const newActive =
        state.activeSessionId === sessionId
          ? newTabs[newTabs.length - 1] ?? null
          : state.activeSessionId
      return { openTabs: newTabs, activeSessionId: newActive }
    })
  },

  setViewingSession: (sessionId) => {
    set((state) => ({
      viewingSessionId: sessionId,
      activeSessionId: sessionId ?? state.activeSessionId
    }))
  },

  updateSessionStatus: (sessionId, status) => {
    set((state) => {
      const session = state.sessions[sessionId]
      if (!session) return state
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, status }
        }
      }
    })
  },

  setCurrentView: (view) => {
    set({ currentView: view })
  },

  removeSession: (sessionId) => {
    set((state) => {
      const { [sessionId]: _, ...rest } = state.sessions
      return {
        sessions: rest,
        openTabs: state.openTabs.filter((id) => id !== sessionId),
        activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId
      }
    })
  },

  initListeners: () => {
    const idleTimers = new Map<string, ReturnType<typeof setTimeout>>()

    const unsubData = window.api.onSessionData((sessionId, _data) => {
      // Mark as running when data flows in
      const session = get().sessions[sessionId]
      if (session && session.status !== 'running' && session.status !== 'stopped') {
        get().updateSessionStatus(sessionId, 'running')
      }

      // Reset idle timer — if no data for 3s, mark as waiting
      const existing = idleTimers.get(sessionId)
      if (existing) clearTimeout(existing)
      idleTimers.set(sessionId, setTimeout(() => {
        const s = get().sessions[sessionId]
        if (s && s.status === 'running') {
          get().updateSessionStatus(sessionId, 'waiting')
        }
      }, 3000))
    })

    const unsubExit = window.api.onSessionExit((sessionId, _code) => {
      const timer = idleTimers.get(sessionId)
      if (timer) clearTimeout(timer)
      idleTimers.delete(sessionId)
      get().updateSessionStatus(sessionId, 'stopped')
    })

    const unsubClaudeId = window.api.onClaudeSessionId((sessionId, claudeConversationId) => {
      const session = get().sessions[sessionId]
      if (session) {
        // Update the session info in this store so UI components react immediately
        set((state) => ({
          sessions: {
            ...state.sessions,
            [sessionId]: { ...state.sessions[sessionId], claudeSessionId: claudeConversationId }
          }
        }))
        // Persist for resume across restarts. Notes sessions use a synthetic
        // cardId of `notes:<name>` and are linked to the note instead of a card.
        if (session.cardId.startsWith('notes:')) {
          const noteName = session.cardId.slice('notes:'.length)
          window.api.setNoteSession(noteName, claudeConversationId)
        } else {
          useBoardStore.getState().updateCard(session.cardId, { claudeSessionId: claudeConversationId })
        }
      }
    })

    return () => {
      unsubData()
      unsubExit()
      unsubClaudeId()
      for (const timer of idleTimers.values()) clearTimeout(timer)
      idleTimers.clear()
    }
  }
}))
