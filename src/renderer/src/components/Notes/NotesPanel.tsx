import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { marked } from 'marked'
import type { NoteMeta } from '@shared/models'
import { useSessionStore } from '@/stores/session-store'
import { useSettingsStore } from '@/stores/settings-store'
import TerminalView from '@/components/Terminal/TerminalView'

marked.setOptions({ gfm: true, breaks: true })

function renderMarkdown(md: string): string {
  try {
    return marked.parse(md, { async: false }) as string
  } catch {
    return ''
  }
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

type SaveState = 'idle' | 'saving' | 'saved'

export default function NotesPanel(): JSX.Element {
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [activeName, setActiveName] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [search, setSearch] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [cliVisible, setCliVisible] = useState(true)
  const [cliHeight, setCliHeight] = useState(260)
  const [editorPct, setEditorPct] = useState(50)
  const [sessionByNote, setSessionByNote] = useState<Record<string, string>>({})

  const splitRef = useRef<HTMLDivElement>(null)

  const settingsNotesDir = useSettingsStore((s) => s.notesDir)
  const [notesFolder, setNotesFolder] = useState('')

  const activeSessionId = activeName ? sessionByNote[activeName] ?? null : null

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeNameRef = useRef<string | null>(null)
  activeNameRef.current = activeName
  const contentRef = useRef('')
  contentRef.current = content

  const refreshList = useCallback(async (): Promise<NoteMeta[]> => {
    const list = await window.api.listNotes()
    setNotes(list)
    return list
  }, [])

  // Ensure the active note has a live inline CLI session: adopt an existing one,
  // otherwise start (resuming the note's linked Claude session if it has one).
  const ensureSession = useCallback(async (name: string): Promise<void> => {
    const store = useSessionStore.getState()
    const running = Object.values(store.sessions).find(
      (s) => s.cardId === `notes:${name}` && s.status !== 'stopped'
    )
    if (running) {
      setSessionByNote((m) => ({ ...m, [name]: running.id }))
      return
    }
    const dir = await window.api.getNotesDir()
    const resumeId = await window.api.getNoteSession(name)
    const info = await store.startSessionInline(`notes:${name}`, name, dir, resumeId)
    setSessionByNote((m) => ({ ...m, [name]: info.id }))
  }, [])

  const loadNote = useCallback(async (name: string): Promise<void> => {
    const text = await window.api.readNote(name)
    setActiveName(name)
    setContent(text)
    setSaveState('idle')
    setRenaming(false)
    await ensureSession(name)
  }, [ensureSession])

  // Resolve the actual notes folder path (configured or default) for display
  useEffect(() => {
    window.api.getNotesDir().then(setNotesFolder).catch(() => {})
  }, [settingsNotesDir])

  // Initial load — also re-runs when the configured notes folder changes
  useEffect(() => {
    ;(async () => {
      const list = await refreshList()
      if (list.length > 0) {
        await loadNote(list[0].name)
      } else {
        setActiveName(null)
        setContent('')
      }
    })()
  }, [refreshList, loadNote, settingsNotesDir])

  // Flush any pending save immediately (used when switching notes / unmounting)
  const flushSave = useCallback(async (): Promise<void> => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const name = activeNameRef.current
    if (name) {
      await window.api.saveNote(name, contentRef.current)
    }
  }, [])

  // Save on unmount
  useEffect(() => {
    return () => {
      void flushSave()
    }
  }, [flushSave])

  // Reload the active note when the window regains focus (e.g. after Claude edits it)
  useEffect(() => {
    const onFocus = async (): Promise<void> => {
      const name = activeNameRef.current
      if (!name) return
      const text = await window.api.readNote(name)
      // Only overwrite if no unsaved edits pending and content actually changed
      if (!saveTimer.current && text !== contentRef.current) {
        setContent(text)
      }
      await refreshList()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshList])

  const handleContentChange = (value: string): void => {
    setContent(value)
    setSaveState('saving')
    const name = activeNameRef.current
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      saveTimer.current = null
      if (name) {
        await window.api.saveNote(name, value)
        setSaveState('saved')
        // Bump the list ordering/timestamps
        refreshList()
        setTimeout(() => setSaveState('idle'), 1500)
      }
    }, 600)
  }

  const handleSelect = async (name: string): Promise<void> => {
    if (name === activeName) return
    await flushSave()
    await loadNote(name)
  }

  const handleNew = async (): Promise<void> => {
    await flushSave()
    const created = await window.api.createNote('Untitled')
    await refreshList()
    await loadNote(created)
    setRenaming(true)
    setRenameValue(created)
  }

  const handleDelete = async (): Promise<void> => {
    if (!activeName) return
    const ok = window.confirm(`Delete note "${activeName}"? This cannot be undone.`)
    if (!ok) return
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    await window.api.deleteNote(activeName)
    const list = await refreshList()
    if (list.length > 0) {
      await loadNote(list[0].name)
    } else {
      setActiveName(null)
      setContent('')
    }
  }

  const commitRename = async (): Promise<void> => {
    if (!activeName) return
    const next = renameValue.trim()
    setRenaming(false)
    if (!next || next === activeName) return
    await flushSave()
    const finalName = await window.api.renameNote(activeName, next)
    await refreshList()
    setActiveName(finalName)
  }

  // Vertical resize for the bottom CLI pane (drag up = taller)
  const startResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    const startY = e.clientY
    const startH = cliHeight
    const onMove = (ev: MouseEvent): void => {
      setCliHeight(Math.min(700, Math.max(120, startH - (ev.clientY - startY))))
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
    }
    document.body.style.cursor = 'row-resize'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Horizontal resize for the editor | preview split (drag right = wider editor)
  const startSplitResize = (e: React.MouseEvent): void => {
    e.preventDefault()
    const container = splitRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const onMove = (ev: MouseEvent): void => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100
      setEditorPct(Math.min(80, Math.max(20, pct)))
    }
    const onUp = (): void => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const previewHtml = useMemo(() => renderMarkdown(content), [content])

  const filtered = notes.filter((n) => n.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex h-full w-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Left: note list */}
      <div
        className="flex flex-col shrink-0"
        style={{ width: 260, borderRight: '1px solid var(--border-primary)' }}
      >
        <div style={{ padding: '14px 14px 10px' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Notes &amp; Docs</h2>
            <button
              onClick={handleNew}
              title="New note"
              className="flex items-center justify-center rounded-md cursor-pointer transition-colors"
              style={{ width: 26, height: 26, backgroundColor: 'var(--accent)', color: '#fff', border: 'none' }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M8 4v8M4 8h8" />
              </svg>
            </button>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes..."
            style={{
              width: '100%',
              borderRadius: 7,
              border: '1px solid var(--border-input)',
              backgroundColor: 'var(--bg-input)',
              padding: '7px 10px',
              fontSize: 13,
              color: 'var(--text-primary)',
              outline: 'none'
            }}
          />
        </div>

        <div className="flex-1 overflow-y-auto" style={{ padding: '0 8px 8px' }}>
          {filtered.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic', padding: '8px 6px' }}>
              {notes.length === 0 ? 'No notes yet. Create one to get started.' : 'No matches.'}
            </p>
          )}
          {filtered.map((note) => (
            <button
              key={note.name}
              onClick={() => handleSelect(note.name)}
              className="flex w-full flex-col rounded-md cursor-pointer transition-colors"
              style={{
                textAlign: 'left',
                padding: '8px 10px',
                marginBottom: 2,
                border: 'none',
                gap: 2,
                backgroundColor: note.name === activeName ? 'var(--bg-active)' : 'transparent',
                color: note.name === activeName ? 'var(--text-primary)' : 'var(--text-secondary)'
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {note.name}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Created {formatRelative(note.createdAt)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Right: editor + preview */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {activeName ? (
          <>
            {/* Toolbar — reserve space on the right for the window controls overlay */}
            <div
              className="flex items-center"
              style={{ gap: 10, padding: '10px 145px 10px 16px', borderBottom: '1px solid var(--border-primary)' }}
            >
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                {renaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename()
                      if (e.key === 'Escape') setRenaming(false)
                    }}
                    style={{
                      flex: 1,
                      borderRadius: 6,
                      border: '1px solid var(--border-input)',
                      backgroundColor: 'var(--bg-input)',
                      padding: '5px 10px',
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      outline: 'none'
                    }}
                  />
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setRenameValue(activeName)
                        setRenaming(true)
                      }}
                      title="Click to rename"
                      style={{
                        flexShrink: 0,
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        cursor: 'text',
                        fontSize: 15,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        padding: 0
                      }}
                    >
                      {activeName}
                    </button>
                    {notesFolder && (
                      <button
                        onClick={() => window.api.openFile(notesFolder)}
                        title={`Notes folder (also the CLI working directory):\n${notesFolder}\n\nClick to open in Explorer`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          minWidth: 0,
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          padding: '2px 0'
                        }}
                      >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <path d="M2 4.5V12a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0014 12V6.5A1.5 1.5 0 0012.5 5H8L6.5 3H3.5A1.5 1.5 0 002 4.5z" />
                        </svg>
                        <span style={{ fontSize: 11, fontFamily: "'Cascadia Code', 'Consolas', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {notesFolder}
                        </span>
                      </button>
                    )}
                  </>
                )}
              </div>

              <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 52, textAlign: 'right' }}>
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
              </span>

              <button
                onClick={handleDelete}
                title="Delete note"
                className="flex items-center justify-center cursor-pointer transition-colors"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 7,
                  background: 'none',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-muted)'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 4h10M6.5 4V2.5h3V4M5 4l.5 9h5L11 4" />
                </svg>
              </button>
            </div>

            {/* Body: editor split — left column has the markdown editor with the
                CLI docked at its bottom; right column is the live preview. */}
            <div ref={splitRef} className="flex flex-1 overflow-hidden">
              {/* Left column: markdown editor (top) + CLI (bottom) */}
              <div
                className="flex flex-col shrink-0"
                style={{ width: `${editorPct}%` }}
              >
                <textarea
                  value={content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  spellCheck={false}
                  placeholder="Write markdown here..."
                  className="flex-1"
                  style={{
                    width: '100%',
                    resize: 'none',
                    border: 'none',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    padding: '16px 18px',
                    fontSize: 13,
                    lineHeight: 1.6,
                    fontFamily: "'Cascadia Code', 'Consolas', monospace",
                    outline: 'none'
                  }}
                />

                {/* CLI pane (expanded) docked at the bottom */}
                {activeSessionId && cliVisible && (
                  <>
                    <div
                      onMouseDown={startResize}
                      title="Drag to resize"
                      className="shrink-0 transition-colors hover:bg-[var(--bg-active)]"
                      style={{ height: 5, cursor: 'row-resize', borderTop: '1px solid var(--border-primary)' }}
                    />
                    <div className="flex flex-col shrink-0" style={{ height: cliHeight }}>
                      <div
                        className="flex items-center justify-between shrink-0"
                        style={{ padding: '5px 8px 5px 12px', borderBottom: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-surface)' }}
                      >
                        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                          Claude CLI
                        </span>
                        <button
                          onClick={() => setCliVisible(false)}
                          title="Collapse CLI"
                          className="flex items-center justify-center cursor-pointer"
                          style={{ width: 22, height: 22, borderRadius: 5, border: 'none', background: 'none', color: 'var(--text-muted)' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6l5 5 5-5" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <TerminalView sessionId={activeSessionId} isVisible={cliVisible} />
                      </div>
                    </div>
                  </>
                )}

                {/* CLI collapsed strip docked at the bottom */}
                {activeSessionId && !cliVisible && (
                  <button
                    onClick={() => setCliVisible(true)}
                    title="Expand Claude CLI"
                    className="flex items-center shrink-0 cursor-pointer transition-colors hover:bg-[var(--bg-active)]"
                    style={{ height: 30, gap: 8, padding: '0 12px', borderTop: '1px solid var(--border-primary)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)', border: 'none' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="12" height="10" rx="1.5" />
                      <path d="M5 7l2 1.5L5 10" />
                    </svg>
                    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', flex: 1, textAlign: 'left' }}>
                      Claude CLI
                    </span>
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 10l5-5 5 5" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Drag handle between editor and preview */}
              <div
                onMouseDown={startSplitResize}
                title="Drag to resize"
                className="shrink-0 transition-colors hover:bg-[var(--bg-active)]"
                style={{ width: 5, cursor: 'col-resize', borderLeft: '1px solid var(--border-primary)' }}
              />

              {/* Right column: live preview */}
              <div
                className="md-preview flex-1 overflow-y-auto"
                style={{ height: '100%', padding: '16px 22px' }}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center" style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Create a note to start documenting.
          </div>
        )}
      </div>
    </div>
  )
}
