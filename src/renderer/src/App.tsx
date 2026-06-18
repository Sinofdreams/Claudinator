import { useEffect } from 'react'
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

export default function App(): JSX.Element {
  const loaded = useBoardStore((s) => s.loaded)
  const load = useBoardStore((s) => s.load)
  const initListeners = useSessionStore((s) => s.initListeners)
  const viewingSessionId = useSessionStore((s) => s.viewingSessionId)
  const currentView = useSessionStore((s) => s.currentView)
  const newCardDialogOpen = useBoardStore((s) => s.newCardDialogOpen)
  const closeNewCardDialog = useBoardStore((s) => s.closeNewCardDialog)
  const addCard = useBoardStore((s) => s.addCard)
  const updateCard = useBoardStore((s) => s.updateCard)
  useEffect(() => {
    load()
    useSettingsStore.getState().load()
  }, [load])

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

      {/* Session modal overlay */}
      {viewingSessionId && <SessionModal sessionId={viewingSessionId} />}

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
