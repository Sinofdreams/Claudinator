import { useEffect, useState, useCallback, useRef } from 'react'
import { useSessionStore } from '@/stores/session-store'
import { useBoardStore } from '@/stores/board-store'
import TerminalView from './TerminalView'
import GitPanel from './GitPanel'
import { getTagColor } from '@/utils/tag-colors'
import { useSettingsStore } from '@/stores/settings-store'

interface SessionModalProps {
  sessionId: string
}

export default function SessionModal({ sessionId }: SessionModalProps): JSX.Element {
  const session = useSessionStore((s) => s.sessions[sessionId])
  const sessions = useSessionStore((s) => s.sessions)
  const openTabs = useSessionStore((s) => s.openTabs)
  const setViewingSession = useSessionStore((s) => s.setViewingSession)
  const cards = useBoardStore((s) => s.cards)
  const updateCard = useBoardStore((s) => s.updateCard)
  const theme = useSettingsStore((s) => s.theme)

  const card = session ? cards[session.cardId] : null
  const title = card?.title ?? 'Session'
  const tags = card?.tags ?? []
  const [gitPanelOpen, setGitPanelOpen] = useState(true)
  const [gitPanelWidth, setGitPanelWidth] = useState(340)
  const [branchName, setBranchName] = useState<string | null>(null)
  const [contextInfo, setContextInfo] = useState<string | null>(null)
  const isResizing = useRef(false)

  const hasProjectDir = Boolean(card?.projectDir)

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startWidth = gitPanelWidth

    const onMouseMove = (ev: MouseEvent): void => {
      const delta = startX - ev.clientX
      const newWidth = Math.min(Math.max(startWidth + delta, 200), 700)
      setGitPanelWidth(newWidth)
    }

    const onMouseUp = (): void => {
      isResizing.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [gitPanelWidth])

  const handleChangeProjectDir = useCallback(async () => {
    if (!card) return
    const folder = await window.api.pickFolder()
    if (folder) {
      updateCard(card.id, { projectDir: folder })
    }
  }, [card, updateCard])

  const fetchBranch = useCallback(async () => {
    if (!card?.projectDir) return
    try {
      const result = await window.api.getGitStatus(card.projectDir, sessionId)
      setBranchName(result.branch)
    } catch {
      setBranchName(null)
    }
  }, [card?.projectDir])

  useEffect(() => {
    fetchBranch()
    const interval = setInterval(fetchBranch, 10000)
    return () => clearInterval(interval)
  }, [fetchBranch])

  const fetchContextInfo = useCallback(async () => {
    try {
      const info = await window.api.getContextInfo(sessionId)
      setContextInfo(info)
    } catch {
      setContextInfo(null)
    }
  }, [sessionId])

  useEffect(() => {
    fetchContextInfo()
    const interval = setInterval(fetchContextInfo, 5000)
    return () => clearInterval(interval)
  }, [fetchContextInfo])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setViewingSession(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [setViewingSession])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: 'var(--bg-overlay)' }}
        onClick={() => setViewingSession(null)}
      />

      {/* Modal */}
      <div className="relative z-10 flex flex-col w-[94vw] h-[90vh] rounded-xl shadow-2xl overflow-hidden" style={{ border: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-surface)' }}>
        {/* Header */}
        <div className="shrink-0" style={{ borderBottom: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-surface)', padding: '6px 10px 6px 24px' }}>
          <div className="flex items-center" style={{ gap: '20px' }}>
            {/* Title */}
            <h2 className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{title}</h2>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex items-center" style={{ gap: '8px' }}>
                {tags.map((tag) => {
                  const c = getTagColor(tag, theme)
                  return (
                    <span
                      key={tag}
                      className="rounded text-[10px]"
                      style={{ padding: '2px 8px', backgroundColor: c.bg, border: `1px solid ${c.border}40`, color: c.text }}
                    >
                      {tag}
                    </span>
                  )
                })}
              </div>
            )}

            <div className="flex-1" />

            {/* Claude session ID */}
            {card?.claudeSessionId && (
              <span
                style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)', fontWeight: 'bold', fontStyle: 'italic' }}
                title={card.claudeSessionId}
              >
                {card.claudeSessionId}
              </span>
            )}

            {/* Close button */}
            <button
              onClick={() => setViewingSession(null)}
              className="flex items-center justify-center rounded-lg transition-colors cursor-pointer"
              style={{ width: '24px', height: '24px', color: 'var(--text-muted)' }}
              title="Close"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>



        {/* Body: Terminal + Git panel + Right toolbar */}
        <div className="flex-1 overflow-hidden flex">
          {/* Terminal column */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Info bar — branch + project dir */}
              <div
                className="shrink-0 flex items-center"
                style={{ gap: '16px', padding: '10px 24px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-primary)' }}
              >
                {branchName ? (
                  <div className="flex items-center" style={{ gap: '8px' }}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" className="shrink-0" style={{ color: 'var(--text-secondary)' }}>
                      <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
                    </svg>
                    <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{branchName}</span>
                  </div>
                ) : (
                  <div className="flex items-center" style={{ gap: '8px' }}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" className="shrink-0" style={{ color: 'var(--text-faint)' }}>
                      <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
                    </svg>
                    <span className="text-xs" style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>No branch</span>
                  </div>
                )}

                <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-primary)' }} />

                {card?.projectDir ? (
                  <div className="flex items-center min-w-0" style={{ gap: '8px' }} title={card.projectDir}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" className="shrink-0" style={{ color: 'var(--text-muted)' }} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 4.5V12a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0014 12V6.5A1.5 1.5 0 0012.5 5H8L6.5 3H3.5A1.5 1.5 0 002 4.5z" />
                    </svg>
                    <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{card.projectDir}</span>
                    <button
                      onClick={handleChangeProjectDir}
                      className="flex items-center justify-center rounded transition-colors cursor-pointer shrink-0"
                      style={{ width: '20px', height: '20px', color: 'var(--text-faint)' }}
                      title="Change project directory"
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center" style={{ gap: '8px' }}>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" className="shrink-0" style={{ color: 'var(--text-faint)' }} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 4.5V12a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0014 12V6.5A1.5 1.5 0 0012.5 5H8L6.5 3H3.5A1.5 1.5 0 002 4.5z" />
                    </svg>
                    <span className="text-xs" style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>No folder</span>
                    <button
                      onClick={handleChangeProjectDir}
                      className="flex items-center justify-center rounded transition-colors cursor-pointer shrink-0"
                      style={{ width: '20px', height: '20px', color: 'var(--text-faint)' }}
                      title="Set project directory"
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" />
                      </svg>
                    </button>
                  </div>
                )}

                <div className="flex-1" />

                {contextInfo && (
                  <div
                    className="flex items-center shrink-0"
                    style={{
                      gap: '6px',
                      padding: '3px 10px',
                      borderRadius: 6,
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-primary)',
                    }}
                    title="Context window usage"
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" className="shrink-0" style={{ color: 'var(--text-secondary)' }} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="12" height="10" rx="1.5" />
                      <path d="M5 7h6M5 9.5h4" />
                    </svg>
                    <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{contextInfo}</span>
                  </div>
                )}

              </div>

            {/* Terminal views */}
            <div className="flex-1 overflow-hidden relative">
              {openTabs.map((tabId) => (
                <div
                  key={tabId}
                  className="absolute inset-0"
                  style={{ display: tabId === sessionId ? 'block' : 'none' }}
                >
                  <TerminalView
                    sessionId={tabId}
                    isVisible={tabId === sessionId}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Resize handle + Git panel */}
          {gitPanelOpen && (
            <>
              <div
                onMouseDown={handleResizeStart}
                className="shrink-0 transition-colors"
                style={{
                  width: 4,
                  cursor: 'col-resize',
                  backgroundColor: 'var(--resize-handle)',
                }}
              />
              <div className="shrink-0 overflow-hidden" style={{ width: gitPanelWidth }}>
                <GitPanel projectDir={card?.projectDir || null} sessionId={sessionId} />
              </div>
            </>
          )}

          {/* Right toolbar — sits under the close button */}
          <div className="shrink-0 flex flex-col items-center" style={{ width: '48px', padding: '10px 0', borderLeft: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-primary)' }}>
            {/* Source control / git panel toggle */}
            <button
              onClick={() => setGitPanelOpen((prev) => !prev)}
              className="flex items-center justify-center rounded-lg transition-colors cursor-pointer"
              style={{
                width: '32px',
                height: '32px',
                backgroundColor: gitPanelOpen ? 'var(--bg-active)' : 'transparent',
                color: gitPanelOpen ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
              title={gitPanelOpen ? 'Hide side panel' : 'Show side panel'}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
              </svg>
            </button>

            <div className="flex-1" />
          </div>
        </div>
      </div>
    </div>
  )
}
