import { create } from 'zustand'
import { SessionInfo, SessionStatus } from '@shared/models'
import { useBoardStore } from './board-store'

type ViewName = 'board' | 'sessions' | 'notes' | 'dashboard'

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
    // Rolling tail of recent terminal output per session, used to tell apart
    // "finished, waiting for a prompt" from "waiting for a decision".
    const buffers = new Map<string, string>()

    // Native OS notification when a session flips to an attention state.
    // Prefs live in localStorage (default on, same pattern as the dashboard);
    // a per-session cooldown keeps prompt-redraw flapping from spamming toasts.
    const lastNotified = new Map<string, number>()
    const NOTIFY_COOLDOWN_MS = 20000

    const sessionTitle = (session: SessionInfo): string => {
      if (session.cardId.startsWith('notes:')) return session.cardId.slice('notes:'.length)
      return useBoardStore.getState().cards[session.cardId]?.title ?? 'Session'
    }

    const maybeNotify = (sessionId: string, from: SessionStatus, to: SessionStatus): void => {
      if (to !== 'decision' && to !== 'waiting') return
      // Only ping on the transition out of active work — re-renders of an
      // already-flagged prompt shouldn't fire again.
      if (from !== 'running' && from !== 'starting') return
      if (localStorage.getItem(to === 'decision' ? 'notify-decision' : 'notify-waiting') === 'off') return
      // Don't ping when the user is already looking at this session.
      if (document.hasFocus() && get().viewingSessionId === sessionId) return
      const now = Date.now()
      if (now - (lastNotified.get(sessionId) ?? 0) < NOTIFY_COOLDOWN_MS) return
      lastNotified.set(sessionId, now)
      const session = get().sessions[sessionId]
      if (!session) return
      window.api.notify({
        title: sessionTitle(session),
        body:
          to === 'decision'
            ? 'Claude is waiting for a decision'
            : 'Claude has finished — waiting for your prompt',
        sessionId
      })
    }

    // Claude Code draws interactive prompts with Ink, which wraps text in lots
    // of ANSI escape codes — so we strip those before matching, otherwise the
    // footer words get split up and literal substrings never match.
    const stripAnsi = (s: string): string =>
      s
        // CSI sequences: ESC [ … final byte (SGR colours, cursor moves, etc.)
        .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
        // OSC sequences: ESC ] … (BEL | ST)
        .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
        // any other lone ESC-prefixed escape
        .replace(/\x1b[@-Z\\-_]/g, '')

    // The most reliable, glyph-independent signal is the navigation footer every
    // arrow-select prompt prints, e.g. "Enter to select · ↑/↓ to navigate · Esc
    // to cancel". Match "Esc to cancel" (a prompt) but NOT "esc to interrupt"
    // (shown while Claude is actively generating).
    const DECISION_RE = /to navigate|Enter to select|Esc to cancel|[❯›▶]\s*\d+\.|Do you want to (?:proceed|continue)/gi
    // Signals that Claude is actively working: the interrupt hint, or the
    // spinner timer "(40s · thinking)" it redraws while generating.
    const RUNNING_RE = /esc to interrupt|\(\d+s\s*·/gi

    const lastMatchIndex = (t: string, re: RegExp): number => {
      re.lastIndex = 0
      let pos = -1
      let m: RegExpExecArray | null
      while ((m = re.exec(t))) {
        pos = m.index
        if (m.index === re.lastIndex) re.lastIndex++
      }
      return pos
    }

    // A prompt is only "live" if its markers appear LATER in the stream than
    // the most recent working signal. A dismissed or timed-out prompt (e.g.
    // AskUserQuestion's "No response after 60s — continued") leaves its footer
    // text in the tail while Claude keeps generating — newest signal wins.
    const isDecisionPrompt = (raw: string): boolean => {
      const t = stripAnsi(raw)
      const decisionPos = lastMatchIndex(t, DECISION_RE)
      if (decisionPos < 0) return false
      return decisionPos > lastMatchIndex(t, RUNNING_RE)
    }

    const unsubData = window.api.onSessionData((sessionId, data) => {
      const session = get().sessions[sessionId]
      if (!session || session.status === 'stopped') return

      // Keep a bounded rolling buffer of recent output.
      let buf = (buffers.get(sessionId) ?? '') + data
      if (buf.length > 8000) buf = buf.slice(-8000)
      buffers.set(sessionId, buf)

      // A decision prompt currently on screen → flag immediately (bounded tail so
      // a resolved prompt clears as soon as enough new output scrolls in).
      if (isDecisionPrompt(buf.slice(-1200))) {
        const existing = idleTimers.get(sessionId)
        if (existing) {
          clearTimeout(existing)
          idleTimers.delete(sessionId)
        }
        if (session.status !== 'decision') {
          maybeNotify(sessionId, session.status, 'decision')
          get().updateSessionStatus(sessionId, 'decision')
        }
        return
      }

      // Otherwise output is flowing → running.
      if (session.status !== 'running') {
        get().updateSessionStatus(sessionId, 'running')
      }

      // Reset idle timer — after 3s of quiet, decide between decision and waiting.
      const existing = idleTimers.get(sessionId)
      if (existing) clearTimeout(existing)
      idleTimers.set(sessionId, setTimeout(() => {
        const s = get().sessions[sessionId]
        if (!s || s.status === 'stopped') return
        const tail = (buffers.get(sessionId) ?? '').slice(-3000)
        const next = isDecisionPrompt(tail) ? 'decision' : 'waiting'
        if (s.status !== next) {
          maybeNotify(sessionId, s.status, next)
          get().updateSessionStatus(sessionId, next)
        }
      }, 3000))
    })

    const unsubExit = window.api.onSessionExit((sessionId, _code) => {
      const timer = idleTimers.get(sessionId)
      if (timer) clearTimeout(timer)
      idleTimers.delete(sessionId)
      buffers.delete(sessionId)
      lastNotified.delete(sessionId)
      get().updateSessionStatus(sessionId, 'stopped')
    })

    // Clicking a notification focuses the app (handled in main) and opens the
    // session it came from.
    const unsubNotifyClick = window.api.onNotificationClick((sessionId) => {
      if (get().sessions[sessionId]) get().openTab(sessionId)
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
      unsubNotifyClick()
      for (const timer of idleTimers.values()) clearTimeout(timer)
      idleTimers.clear()
    }
  }
}))
