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

function parentOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}
function leafOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? path : path.slice(i + 1)
}

type SaveState = 'idle' | 'saving' | 'saved'

interface FolderNode {
  path: string
  name: string
  folders: FolderNode[]
  notes: NoteMeta[]
}

function buildTree(
  folders: string[],
  notes: NoteMeta[]
): { rootFolders: FolderNode[]; rootNotes: NoteMeta[]; nodeCount: Map<string, number> } {
  const nodeByPath = new Map<string, FolderNode>()
  const ensure = (path: string): FolderNode => {
    let n = nodeByPath.get(path)
    if (!n) {
      n = { path, name: leafOf(path), folders: [], notes: [] }
      nodeByPath.set(path, n)
    }
    return n
  }
  const rootFolders: FolderNode[] = []
  for (const f of folders) {
    const node = ensure(f)
    const parent = parentOf(f)
    if (parent === '') rootFolders.push(node)
    else ensure(parent).folders.push(node)
  }
  const rootNotes: NoteMeta[] = []
  for (const note of notes) {
    const parent = parentOf(note.path)
    if (parent === '') rootNotes.push(note)
    else {
      const node = nodeByPath.get(parent)
      if (node) node.notes.push(note)
      else rootNotes.push(note)
    }
  }
  // Total descendant note counts per folder
  const nodeCount = new Map<string, number>()
  const count = (n: FolderNode): number => {
    let c = n.notes.length
    for (const sub of n.folders) c += count(sub)
    nodeCount.set(n.path, c)
    return c
  }
  rootFolders.forEach(count)
  return { rootFolders, rootNotes, nodeCount }
}

interface DragItem {
  kind: 'note' | 'folder'
  path: string
}
interface ContextMenu {
  x: number
  y: number
  kind: 'note' | 'folder' | 'root'
  path: string
}

export default function NotesPanel(): JSX.Element {
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [folders, setFolders] = useState<string[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [search, setSearch] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [cliVisible, setCliVisible] = useState(true)
  const [cliHeight, setCliHeight] = useState(260)
  const [editorPct, setEditorPct] = useState(50)
  const [sessionByNote, setSessionByNote] = useState<Record<string, string>>({})

  // Folder-tree state. Folders start minimized — `expanded` holds the ones the
  // user opened this session.
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)
  const [folderRenameValue, setFolderRenameValue] = useState('')
  const [menu, setMenu] = useState<ContextMenu | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const dragRef = useRef<DragItem | null>(null)

  const splitRef = useRef<HTMLDivElement>(null)

  const settingsNotesDir = useSettingsStore((s) => s.notesDir)
  const theme = useSettingsStore((s) => s.theme)
  const [notesFolder, setNotesFolder] = useState('')
  const [previewPopped, setPreviewPopped] = useState(false)

  const activeSessionId = activePath ? sessionByNote[activePath] ?? null : null
  const activeLeaf = activePath ? leafOf(activePath) : ''
  const activeFolder = activePath ? parentOf(activePath) : ''

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activePathRef = useRef<string | null>(null)
  activePathRef.current = activePath
  const contentRef = useRef('')
  contentRef.current = content

  const refreshList = useCallback(async (): Promise<NoteMeta[]> => {
    const tree = await window.api.listNotes()
    setNotes(tree.notes)
    setFolders(tree.folders)
    return tree.notes
  }, [])

  // Ensure the active note has a live inline CLI session: adopt an existing one,
  // otherwise start (resuming the note's linked Claude session if it has one).
  const ensureSession = useCallback(async (path: string): Promise<void> => {
    const store = useSessionStore.getState()
    const running = Object.values(store.sessions).find(
      (s) => s.cardId === `notes:${path}` && s.status !== 'stopped'
    )
    if (running) {
      setSessionByNote((m) => ({ ...m, [path]: running.id }))
      return
    }
    const dir = await window.api.getNotesDir()
    const resumeId = await window.api.getNoteSession(path)
    const info = await store.startSessionInline(`notes:${path}`, leafOf(path), dir, resumeId)
    setSessionByNote((m) => ({ ...m, [path]: info.id }))
  }, [])

  const loadNote = useCallback(
    async (path: string): Promise<void> => {
      const text = await window.api.readNote(path)
      setActivePath(path)
      setContent(text)
      setSaveState('idle')
      setRenaming(false)
      await ensureSession(path)
    },
    [ensureSession]
  )

  // Resolve the actual notes folder path (configured or default) for display
  useEffect(() => {
    window.api.getNotesDir().then(setNotesFolder).catch(() => {})
  }, [settingsNotesDir])

  // Initial load — also re-runs when the configured notes folder changes
  useEffect(() => {
    ;(async () => {
      const list = await refreshList()
      if (list.length > 0) {
        await loadNote(list[0].path)
      } else {
        setActivePath(null)
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
    const path = activePathRef.current
    if (path) {
      await window.api.saveNote(path, contentRef.current)
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
      const path = activePathRef.current
      if (!path) return
      const text = await window.api.readNote(path)
      if (!saveTimer.current && text !== contentRef.current) {
        setContent(text)
      }
      await refreshList()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshList])

  // Close the context menu on any outside click
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
    }
  }, [menu])

  const handleContentChange = (value: string): void => {
    setContent(value)
    setSaveState('saving')
    const path = activePathRef.current
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      saveTimer.current = null
      if (path) {
        await window.api.saveNote(path, value)
        setSaveState('saved')
        refreshList()
        setTimeout(() => setSaveState('idle'), 1500)
      }
    }, 600)
  }

  const handleSelect = async (path: string): Promise<void> => {
    if (path === activePath) return
    await flushSave()
    await loadNote(path)
    // Reveal it in the tree (e.g. when opened from search results)
    expandFolder(parentOf(path))
  }

  const handleNewNote = async (folder = activeFolder): Promise<void> => {
    await flushSave()
    const base = folder ? `${folder}/Untitled` : 'Untitled'
    const created = await window.api.createNote(base)
    await refreshList()
    await loadNote(created)
    expandFolder(folder)
    setRenameValue(leafOf(created))
    setRenaming(true)
  }

  const handleNewFolder = async (parent = ''): Promise<void> => {
    const base = parent ? `${parent}/New Folder` : 'New Folder'
    const created = await window.api.createFolder(base)
    await refreshList()
    if (parent) expandFolder(parent)
    // Begin inline rename of the new folder
    setRenamingFolder(created)
    setFolderRenameValue(leafOf(created))
  }

  const handleDelete = async (): Promise<void> => {
    if (!activePath) return
    const ok = window.confirm(`Delete note "${activeLeaf}"? This cannot be undone.`)
    if (!ok) return
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    await window.api.deleteNote(activePath)
    const list = await refreshList()
    if (list.length > 0) await loadNote(list[0].path)
    else {
      setActivePath(null)
      setContent('')
    }
  }

  const deleteNoteByPath = async (path: string): Promise<void> => {
    const ok = window.confirm(`Delete note "${leafOf(path)}"? This cannot be undone.`)
    if (!ok) return
    await window.api.deleteNote(path)
    const list = await refreshList()
    if (path === activePath) {
      if (list.length > 0) await loadNote(list[0].path)
      else {
        setActivePath(null)
        setContent('')
      }
    }
  }

  const deleteFolderByPath = async (path: string): Promise<void> => {
    const ok = window.confirm(
      `Delete folder "${leafOf(path)}" and everything inside it? This cannot be undone.`
    )
    if (!ok) return
    await window.api.deleteFolder(path)
    const list = await refreshList()
    // If the active note lived inside the deleted folder, pick another
    if (activePath && (activePath === path || activePath.startsWith(path + '/'))) {
      if (list.length > 0) await loadNote(list[0].path)
      else {
        setActivePath(null)
        setContent('')
      }
    }
  }

  const commitRename = async (): Promise<void> => {
    if (!activePath) return
    const next = renameValue.trim()
    setRenaming(false)
    if (!next || next === activeLeaf) return
    await flushSave()
    const finalPath = await window.api.renameNote(activePath, next)
    remapSession(activePath, finalPath)
    await refreshList()
    setActivePath(finalPath)
  }

  const commitFolderRename = async (): Promise<void> => {
    const target = renamingFolder
    setRenamingFolder(null)
    if (!target) return
    const next = folderRenameValue.trim()
    if (!next || next === leafOf(target)) return
    const finalPath = await window.api.renameFolder(target, next)
    // Carry the active note path if it was inside the renamed folder
    if (activePath && (activePath === target || activePath.startsWith(target + '/'))) {
      const newActive = finalPath + activePath.slice(target.length)
      remapSession(activePath, newActive)
      setActivePath(newActive)
    }
    await refreshList()
  }

  // Keep the in-memory note→session map keyed correctly after a path change.
  const remapSession = (oldPath: string, newPath: string): void => {
    if (oldPath === newPath) return
    setSessionByNote((m) => {
      const next: Record<string, string> = {}
      for (const [k, v] of Object.entries(m)) {
        if (k === oldPath) next[newPath] = v
        else if (k.startsWith(oldPath + '/')) next[newPath + k.slice(oldPath.length)] = v
        else next[k] = v
      }
      return next
    })
  }

  const performMove = async (item: DragItem, targetFolder: string): Promise<void> => {
    expandFolder(targetFolder)
    if (item.kind === 'note') {
      if (parentOf(item.path) === targetFolder) return
      const newPath = await window.api.moveNote(item.path, targetFolder)
      remapSession(item.path, newPath)
      if (activePath === item.path) setActivePath(newPath)
    } else {
      if (targetFolder === item.path || targetFolder.startsWith(item.path + '/')) return
      if (parentOf(item.path) === targetFolder) return
      const newFolder = await window.api.moveFolder(item.path, targetFolder)
      if (activePath && (activePath === item.path || activePath.startsWith(item.path + '/'))) {
        const newActive = newFolder + activePath.slice(item.path.length)
        remapSession(activePath, newActive)
        setActivePath(newActive)
      }
    }
    await refreshList()
  }

  const onDropInto = async (e: React.DragEvent, targetFolder: string): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)
    const item = dragRef.current
    dragRef.current = null
    if (item) await performMove(item, targetFolder)
  }

  const toggleCollapse = (path: string): void => {
    setExpanded((c) => (c.has(path) ? deleteFrom(c, path) : new Set(c).add(path)))
  }

  // Open a folder (and its ancestors) so freshly created/moved items are visible.
  const expandFolder = (path: string): void => {
    if (!path) return
    setExpanded((c) => {
      const next = new Set(c)
      const parts = path.split('/')
      for (let i = 1; i <= parts.length; i++) next.add(parts.slice(0, i).join('/'))
      return next
    })
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

  // Stream content/theme/title to the detached preview window while it's open.
  useEffect(() => {
    if (previewPopped) {
      window.api.updatePreview({ html: previewHtml, theme, title: activeLeaf })
    }
  }, [previewPopped, previewHtml, theme, activeLeaf])

  useEffect(() => {
    const unsub = window.api.onPreviewClosed(() => setPreviewPopped(false))
    return unsub
  }, [])

  // Popout's refresh button → reload the active note from disk and re-render,
  // which re-streams to the detached preview (picks up external edits).
  useEffect(() => {
    const unsub = window.api.onPreviewRefresh(async () => {
      const path = activePathRef.current
      if (!path) return
      const text = await window.api.readNote(path)
      setContent(text)
      await refreshList()
    })
    return unsub
  }, [refreshList])

  const togglePreviewPopout = async (): Promise<void> => {
    if (previewPopped) {
      await window.api.closePreview()
      setPreviewPopped(false)
    } else {
      await window.api.openPreview()
      setPreviewPopped(true)
      window.api.updatePreview({ html: previewHtml, theme, title: activeLeaf })
    }
  }

  const tree = useMemo(() => buildTree(folders, notes), [folders, notes])
  const searching = search.trim().length > 0
  const searchLower = search.toLowerCase()
  const searchHits = useMemo(
    () =>
      searching
        ? notes.filter(
            (n) =>
              n.name.toLowerCase().includes(searchLower) ||
              n.path.toLowerCase().includes(searchLower)
          )
        : [],
    [searching, searchLower, notes]
  )

  const openMenu = (e: React.MouseEvent, kind: ContextMenu['kind'], path: string): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, kind, path })
  }

  // ── Tree rendering ───────────────────────────────────────────────────────
  const renderNote = (note: NoteMeta, depth: number): JSX.Element => (
    <button
      key={'n:' + note.path}
      draggable
      onDragStart={(e) => {
        dragRef.current = { kind: 'note', path: note.path }
        e.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => handleSelect(note.path)}
      onContextMenu={(e) => openMenu(e, 'note', note.path)}
      className="flex w-full items-center rounded-md cursor-pointer transition-colors"
      style={{
        textAlign: 'left',
        padding: '6px 8px',
        paddingLeft: 10 + depth * 14,
        marginBottom: 1,
        border: 'none',
        gap: 7,
        backgroundColor: note.path === activePath ? 'var(--bg-active)' : 'transparent',
        color: note.path === activePath ? 'var(--text-primary)' : 'var(--text-secondary)'
      }}
    >
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
        <path d="M4 1.5h5L13 5v9.5a1 1 0 01-1 1H4a1 1 0 01-1-1v-12a1 1 0 011-1z" />
        <path d="M9 1.5V5h4" />
      </svg>
      <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {note.name}
      </span>
    </button>
  )

  const renderFolder = (node: FolderNode, depth: number): JSX.Element => {
    const isCollapsed = !expanded.has(node.path)
    const isDrop = dropTarget === node.path
    const isRenaming = renamingFolder === node.path
    return (
      <div key={'f:' + node.path}>
        <div
          draggable={!isRenaming}
          onDragStart={(e) => {
            e.stopPropagation()
            dragRef.current = { kind: 'folder', path: node.path }
            e.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (dropTarget !== node.path) setDropTarget(node.path)
          }}
          onDragLeave={(e) => {
            e.stopPropagation()
            setDropTarget((t) => (t === node.path ? null : t))
          }}
          onDrop={(e) => onDropInto(e, node.path)}
          onClick={() => toggleCollapse(node.path)}
          onContextMenu={(e) => openMenu(e, 'folder', node.path)}
          className="flex w-full items-center rounded-md cursor-pointer transition-colors"
          style={{
            padding: '6px 8px',
            paddingLeft: 8 + depth * 14,
            marginBottom: 1,
            gap: 5,
            backgroundColor: isDrop ? 'var(--bg-active)' : 'transparent',
            outline: isDrop ? '1px solid var(--accent)' : 'none',
            color: 'var(--text-secondary)'
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0, transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.12s' }}
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.8 }}>
            <path d="M2 4.5V12a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0014 12V6.5A1.5 1.5 0 0012.5 5H8L6.5 3H3.5A1.5 1.5 0 002 4.5z" />
          </svg>
          {isRenaming ? (
            <input
              autoFocus
              value={folderRenameValue}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setFolderRenameValue(e.target.value)}
              onBlur={commitFolderRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitFolderRename()
                if (e.key === 'Escape') setRenamingFolder(null)
              }}
              style={{
                flex: 1,
                minWidth: 0,
                borderRadius: 5,
                border: '1px solid var(--border-input)',
                backgroundColor: 'var(--bg-input)',
                padding: '2px 6px',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-primary)',
                outline: 'none'
              }}
            />
          ) : (
            <>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {node.name}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>
                {tree.nodeCount.get(node.path) ?? 0}
              </span>
            </>
          )}
        </div>
        {!isCollapsed && (
          <div>
            {node.folders.map((f) => renderFolder(f, depth + 1))}
            {node.notes.map((n) => renderNote(n, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  // Flat list of all folders for the "Move to…" menu
  const allFolderPaths = useMemo(() => ['', ...folders], [folders])

  return (
    <div className="flex h-full w-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Left: note tree */}
      <div
        className="flex flex-col shrink-0"
        style={{ width: 270, borderRight: '1px solid var(--border-primary)' }}
      >
        <div style={{ padding: '14px 14px 10px' }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Notes &amp; Docs</h2>
            <div className="flex items-center" style={{ gap: 6 }}>
              <button
                onClick={() => handleNewFolder('')}
                title="New folder"
                className="flex items-center justify-center rounded-md cursor-pointer transition-colors"
                style={{ width: 26, height: 26, backgroundColor: 'var(--bg-button)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 4.5V12a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0014 12V6.5A1.5 1.5 0 0012.5 5H8L6.5 3H3.5A1.5 1.5 0 002 4.5z" />
                  <path d="M8 7.5v3M6.5 9h3" />
                </svg>
              </button>
              <button
                onClick={() => handleNewNote()}
                title="New note"
                className="flex items-center justify-center rounded-md cursor-pointer transition-colors"
                style={{ width: 26, height: 26, backgroundColor: 'var(--accent)', color: '#fff', border: 'none' }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M8 4v8M4 8h8" />
                </svg>
              </button>
            </div>
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

        {/* Tree / search results — the whole area is a drop target for "move to root" */}
        <div
          className="flex-1 overflow-y-auto"
          style={{
            padding: '0 8px 8px',
            outline: dropTarget === '' ? '1px dashed var(--accent)' : 'none',
            outlineOffset: -4
          }}
          onDragOver={(e) => {
            e.preventDefault()
            if (dropTarget !== '') setDropTarget('')
          }}
          onDragLeave={() => setDropTarget((t) => (t === '' ? null : t))}
          onDrop={(e) => onDropInto(e, '')}
        >
          {searching ? (
            searchHits.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic', padding: '8px 6px' }}>
                No matches.
              </p>
            ) : (
              searchHits.map((note) => (
                <button
                  key={note.path}
                  onClick={() => handleSelect(note.path)}
                  onContextMenu={(e) => openMenu(e, 'note', note.path)}
                  className="flex w-full flex-col rounded-md cursor-pointer transition-colors"
                  style={{
                    textAlign: 'left',
                    padding: '7px 10px',
                    marginBottom: 1,
                    border: 'none',
                    gap: 2,
                    backgroundColor: note.path === activePath ? 'var(--bg-active)' : 'transparent',
                    color: note.path === activePath ? 'var(--text-primary)' : 'var(--text-secondary)'
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {note.name}
                  </span>
                  {parentOf(note.path) && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{parentOf(note.path)}</span>
                  )}
                </button>
              ))
            )
          ) : notes.length === 0 && folders.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic', padding: '8px 6px' }}>
              No notes yet. Create one to get started.
            </p>
          ) : (
            <>
              {tree.rootFolders.map((f) => renderFolder(f, 0))}
              {tree.rootNotes.map((n) => renderNote(n, 0))}
            </>
          )}
        </div>
      </div>

      {/* Right: editor + preview */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {activePath ? (
          <>
            {/* Toolbar — reserve space on the right for the window controls overlay
                plus the title-bar attention badges */}
            <div
              className="flex items-center"
              style={{ gap: 10, padding: '10px 300px 10px 16px', borderBottom: '1px solid var(--border-primary)' }}
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
                        setRenameValue(activeLeaf)
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
                      {activeLeaf}
                    </button>
                    {activeFolder && (
                      <span style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        in {activeFolder}
                      </span>
                    )}
                  </>
                )}
              </div>

              <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 52, textAlign: 'right' }}>
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : ''}
              </span>

              <button
                onClick={togglePreviewPopout}
                title={previewPopped ? 'Close detached preview window' : 'Open preview in a separate window'}
                className="flex items-center justify-center cursor-pointer transition-colors"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 7,
                  background: 'none',
                  border: `1px solid ${previewPopped ? 'var(--accent)' : 'var(--border-primary)'}`,
                  color: previewPopped ? 'var(--accent)' : 'var(--text-muted)'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6.5 3H3.5A1.5 1.5 0 002 4.5v8A1.5 1.5 0 003.5 14h8a1.5 1.5 0 001.5-1.5v-3" />
                  <path d="M9.5 2.5H13.5V6.5M13 3l-5.5 5.5" />
                </svg>
              </button>

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

            <div ref={splitRef} className="flex flex-1 overflow-hidden">
              <div className="flex flex-col shrink-0" style={{ width: `${editorPct}%` }}>
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

              <div
                onMouseDown={startSplitResize}
                title="Drag to resize"
                className="shrink-0 transition-colors hover:bg-[var(--bg-active)]"
                style={{ width: 5, cursor: 'col-resize', borderLeft: '1px solid var(--border-primary)' }}
              />

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

      {/* Context menu */}
      {menu && (
        <div
          className="fixed z-50 rounded-lg py-1 shadow-xl"
          style={{
            left: Math.min(menu.x, window.innerWidth - 230),
            top: Math.min(menu.y, window.innerHeight - 280),
            minWidth: 200,
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-primary)'
          }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
        >
          {menu.kind === 'folder' && (
            <>
              <MenuItem label="New note here" onClick={() => { setMenu(null); handleNewNote(menu.path) }} />
              <MenuItem label="New subfolder" onClick={() => { setMenu(null); handleNewFolder(menu.path) }} />
              <MenuDivider />
              <MenuItem label="Rename" onClick={() => { setMenu(null); setRenamingFolder(menu.path); setFolderRenameValue(leafOf(menu.path)) }} />
            </>
          )}
          {menu.kind === 'note' && (
            <MenuItem
              label="Rename"
              onClick={() => {
                setMenu(null)
                if (menu.path !== activePath) handleSelect(menu.path)
                setRenameValue(leafOf(menu.path))
                setRenaming(true)
              }}
            />
          )}

          {/* Move to… */}
          {(menu.kind === 'note' || menu.kind === 'folder') && (
            <MoveToSubmenu
              folders={allFolderPaths}
              item={{ kind: menu.kind, path: menu.path }}
              onMove={async (target) => {
                setMenu(null)
                await performMove({ kind: menu.kind as 'note' | 'folder', path: menu.path }, target)
              }}
            />
          )}

          <MenuDivider />
          {menu.kind === 'note' && (
            <MenuItem danger label="Delete note" onClick={() => { setMenu(null); deleteNoteByPath(menu.path) }} />
          )}
          {menu.kind === 'folder' && (
            <MenuItem danger label="Delete folder" onClick={() => { setMenu(null); deleteFolderByPath(menu.path) }} />
          )}
        </div>
      )}
    </div>
  )
}

// Remove a key from a Set without mutating the original
function deleteFrom(set: Set<string>, key: string): Set<string> {
  const next = new Set(set)
  next.delete(key)
  return next
}

function MenuItem({
  label,
  onClick,
  danger
}: {
  label: string
  onClick: () => void
  danger?: boolean
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center cursor-pointer transition-colors hover:bg-[var(--bg-active)]"
      style={{
        textAlign: 'left',
        padding: '7px 14px',
        fontSize: 13,
        border: 'none',
        background: 'none',
        color: danger ? '#ef4444' : 'var(--text-secondary)'
      }}
    >
      {label}
    </button>
  )
}

function MenuDivider(): JSX.Element {
  return <div style={{ height: 1, margin: '4px 0', backgroundColor: 'var(--border-subtle)' }} />
}

function MoveToSubmenu({
  folders,
  item,
  onMove
}: {
  folders: string[]
  item: { kind: 'note' | 'folder'; path: string }
  onMove: (target: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  // Valid destinations: exclude the item's current parent, and for folders also
  // exclude itself and its descendants.
  const currentParent = item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : ''
  const targets = folders.filter((f) => {
    if (f === currentParent) return false
    if (item.kind === 'folder') {
      if (f === item.path || f.startsWith(item.path + '/')) return false
    }
    return true
  })
  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <div
        className="flex w-full items-center justify-between cursor-pointer transition-colors hover:bg-[var(--bg-active)]"
        style={{ padding: '7px 14px', fontSize: 13, color: 'var(--text-secondary)' }}
      >
        <span>Move to…</span>
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 4l4 4-4 4" />
        </svg>
      </div>
      {open && (
        <div
          className="rounded-lg py-1 shadow-xl"
          style={{
            position: 'absolute',
            left: '100%',
            top: -4,
            minWidth: 180,
            maxHeight: 280,
            overflowY: 'auto',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-primary)'
          }}
        >
          {targets.length === 0 ? (
            <div style={{ padding: '7px 14px', fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>
              No destinations
            </div>
          ) : (
            targets.map((f) => (
              <button
                key={f || '__root__'}
                onClick={() => onMove(f)}
                className="flex w-full items-center cursor-pointer transition-colors hover:bg-[var(--bg-active)]"
                style={{ textAlign: 'left', padding: '6px 14px', fontSize: 13, border: 'none', background: 'none', color: 'var(--text-secondary)' }}
              >
                {f === '' ? '⌂ Root' : f}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
