import { useEffect, useRef } from 'react'
import { useBoardStore } from './stores/board-store'
import { useSessionStore } from './stores/session-store'
import { useSettingsStore } from './stores/settings-store'
import Board from './components/Board/Board'
import SessionsPanel from './components/Sessions/SessionsPanel'
import NotesPanel from './components/Notes/NotesPanel'
import DashboardPanel from './components/Dashboard/DashboardPanel'
import Sidebar from './components/Layout/Sidebar'
import SessionModal from './components/Terminal/SessionModal'
import CardDialog from './components/Board/CardDialog'
import WhatsNewModal from './components/WhatsNew/WhatsNewModal'
import Toasts from './components/Layout/Toasts'
import { useUIStore } from './stores/ui-store'

export default function App(): JSX.Element {
  const loaded = useBoardStore((s) => s.loaded)
  const load = useBoardStore((s) => s.load)
  const initListeners = useSessionStore((s) => s.initListeners)
  const viewingSessionId = useSessionStore((s) => s.viewingSessionId)
  const openTabs = useSessionStore((s) => s.openTabs)
  const currentView = useSessionStore((s) => s.currentView)
  const newCardDialogOpen = useBoardStore((s) => s.newCardDialogOpen)
  const closeNewCardDialog = useBoardStore((s) => s.closeNewCardDialog)
  const addCard = useBoardStore((s) => s.addCard)
  const updateCard = useBoardStore((s) => s.updateCard)
  const whatsNewOpen = useUIStore((s) => s.whatsNewOpen)

  // Disposing an xterm throws away its scrollback, and rebuilding it from the
  // main process's raw 1MB PTY ring buffer loses most of the visible history
  // (Claude Code's TUI redraws churn through it fast). So once a session has
  // been viewed, keep the modal mounted but hidden while any tab is still open —
  // the live terminals retain their full scrollback across close/reopen.
  const lastViewedSessionRef = useRef<string | null>(null)
  if (viewingSessionId) lastViewedSessionRef.current = viewingSessionId
  const modalSessionId = viewingSessionId ?? lastViewedSessionRef.current
  const modalMounted = modalSessionId !== null && (viewingSessionId !== null || openTabs.length > 0)

  useEffect(() => {
    load()
    useSettingsStore.getState().load()
  }, [load])

  // Show "What's New" once after the app version changes (i.e. after an update).
  useEffect(() => {
    window.api
      .getAppVersion()
      .then((v) => {
        if (!v) return
        const seen = localStorage.getItem('wn-seen-version')
        if (seen && seen !== v) useUIStore.getState().openWhatsNew()
        localStorage.setItem('wn-seen-version', v)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const cleanup = initListeners()
    return cleanup
  }, [initListeners])

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
        Loading...
      </div>
    )
  }

  return (
    <div className="h-screen flex" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Left sidebar */}
      <Sidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {currentView === 'board' && <Board />}
        {currentView === 'sessions' && <SessionsPanel />}
        {currentView === 'notes' && <NotesPanel />}
        {currentView === 'dashboard' && <DashboardPanel />}
      </div>

      {/* Session modal overlay — kept mounted (hidden) after close so the
          terminals keep their scrollback */}
      {modalMounted && (
        <SessionModal sessionId={modalSessionId} visible={viewingSessionId !== null} />
      )}

      {/* What's New popup (shown after an update, or from About) */}
      {whatsNewOpen && <WhatsNewModal />}

      {/* Transient error/info toasts */}
      <Toasts />

      {/* Global new card dialog — works from any view */}
      {currentView !== 'board' && newCardDialogOpen && (
        <CardDialog
          onSave={(data) => {
            const card = addCard(data.title, data.description, data.projectDir)
            updateCard(card.id, { tags: data.tags })
            closeNewCardDialog()
          }}
          onClose={closeNewCardDialog}
        />
      )}
    </div>
  )
}
