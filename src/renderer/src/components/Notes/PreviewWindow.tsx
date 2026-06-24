import { useEffect, useRef, useState } from 'react'

const MATCH_BG = '#facc15' // yellow — all matches
const ACTIVE_BG = '#fb923c' // orange — current match
const MARK_FG = '#1a1b26' // dark text on the bright highlight

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Render `html` into `container`, wrapping every case-insensitive match of
 * `query` in a <mark>. Returns the mark elements in document order. With no
 * query it just renders the clean HTML (clearing any prior highlights).
 */
function highlight(container: HTMLElement, html: string, query: string): HTMLElement[] {
  container.innerHTML = html
  if (!query) return []

  const re = new RegExp(escapeRegExp(query), 'gi')
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT
      const tag = node.parentElement?.tagName
      if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    }
  })

  const textNodes: Text[] = []
  let n: Node | null
  while ((n = walker.nextNode())) textNodes.push(n as Text)

  const marks: HTMLElement[] = []
  for (const node of textNodes) {
    const text = node.nodeValue ?? ''
    re.lastIndex = 0
    if (!re.test(text)) continue

    re.lastIndex = 0
    const frag = document.createDocumentFragment()
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const start = m.index
      const end = start + m[0].length
      if (start > last) frag.appendChild(document.createTextNode(text.slice(last, start)))
      const mark = document.createElement('mark')
      mark.textContent = m[0]
      mark.style.backgroundColor = MATCH_BG
      mark.style.color = MARK_FG
      mark.style.borderRadius = '2px'
      frag.appendChild(mark)
      marks.push(mark)
      last = end
      if (m[0].length === 0) re.lastIndex++ // guard against zero-width loops
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)))
    node.parentNode?.replaceChild(frag, node)
  }
  return marks
}

/**
 * Standalone renderer for the detached preview BrowserWindow (loaded at the
 * `#preview` route). It owns no note state — it just renders whatever rendered
 * HTML + theme the editor window streams over via the main process.
 */
export default function PreviewWindow(): JSX.Element {
  const [html, setHtml] = useState('')
  const [title, setTitle] = useState('')
  const [refreshing, setRefreshing] = useState(false)

  const contentRef = useRef<HTMLDivElement>(null)

  // Ctrl+F find state.
  const [findOpen, setFindOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState({ active: 0, matches: 0 })
  const findInputRef = useRef<HTMLInputElement>(null)
  const marksRef = useRef<HTMLElement[]>([])
  const activeRef = useRef(-1)

  useEffect(() => {
    const unsub = window.api.onPreviewData((data) => {
      setHtml(data.html)
      setTitle(data.title)
      document.documentElement.setAttribute('data-theme', data.theme)
      // Any incoming payload (incl. the reload we requested) clears the spinner.
      setRefreshing(false)
    })
    // Now that the listener is attached, ask main for the current payload.
    window.api.previewReady()
    return unsub
  }, [])

  useEffect(() => {
    document.title = title ? `${title} — Preview` : 'Markdown Preview'
  }, [title])

  // Render content into the container, re-applying highlights when the query or
  // content changes. (We manage innerHTML by hand so highlighting can wrap text
  // nodes without React fighting us.)
  useEffect(() => {
    const c = contentRef.current
    if (!c) return
    const q = findOpen ? query : ''
    const marks = highlight(c, html, q)
    marksRef.current = marks
    if (marks.length) {
      activeRef.current = 0
      marks[0].style.backgroundColor = ACTIVE_BG
      marks[0].scrollIntoView({ block: 'center', inline: 'nearest' })
      setResult({ active: 1, matches: marks.length })
    } else {
      activeRef.current = -1
      setResult({ active: 0, matches: 0 })
    }
  }, [html, query, findOpen])

  const go = (delta: number): void => {
    const marks = marksRef.current
    if (!marks.length) return
    const prev = activeRef.current
    if (prev >= 0 && marks[prev]) marks[prev].style.backgroundColor = MATCH_BG
    const idx = (prev + delta + marks.length) % marks.length
    marks[idx].style.backgroundColor = ACTIVE_BG
    marks[idx].scrollIntoView({ block: 'center', inline: 'nearest' })
    activeRef.current = idx
    setResult({ active: idx + 1, matches: marks.length })
  }

  const openFind = (): void => {
    setFindOpen(true)
    requestAnimationFrame(() => {
      findInputRef.current?.focus()
      findInputRef.current?.select()
    })
  }
  const closeFind = (): void => setFindOpen(false)

  // Global Ctrl/Cmd+F opens the find bar; Esc closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        openFind()
      } else if (e.key === 'Escape' && findOpen) {
        e.preventDefault()
        closeFind()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [findOpen])

  const onFindKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      go(e.shiftKey ? -1 : 1)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeFind()
    }
  }

  const refresh = (): void => {
    setRefreshing(true)
    window.api.requestPreviewRefresh()
    // Safety: stop spinning even if the file was unchanged (no new payload).
    window.setTimeout(() => setRefreshing(false), 1500)
  }

  const navBtn = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    borderRadius: 5,
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: 'var(--text-secondary)',
    border: 'none'
  } as const

  return (
    <>
      {findOpen && (
        <div
          style={{
            position: 'fixed',
            top: 8,
            right: 54,
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 6px 4px 10px',
            borderRadius: 8,
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-primary)',
            boxShadow: '0 2px 10px rgba(0,0,0,0.35)'
          }}
        >
          <input
            ref={findInputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onFindKeyDown}
            placeholder="Find"
            spellCheck={false}
            style={{
              width: 150,
              fontSize: 13,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)'
            }}
          />
          <span
            style={{
              fontSize: 11,
              minWidth: 38,
              textAlign: 'right',
              color: 'var(--text-faint)',
              fontVariantNumeric: 'tabular-nums'
            }}
          >
            {result.matches > 0 ? `${result.active}/${result.matches}` : query ? '0/0' : ''}
          </span>
          <button
            onClick={() => go(-1)}
            disabled={!result.matches}
            title="Previous match (Shift+Enter)"
            style={navBtn}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 10l4-4 4 4" />
            </svg>
          </button>
          <button
            onClick={() => go(1)}
            disabled={!result.matches}
            title="Next match (Enter)"
            style={navBtn}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
          <button onClick={closeFind} title="Close (Esc)" style={navBtn}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      )}

      <button
        onClick={refresh}
        disabled={refreshing}
        title="Reload from disk"
        aria-label="Reload preview from disk"
        style={{
          position: 'fixed',
          top: 10,
          right: 14,
          zIndex: 50,
          width: 30,
          height: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          cursor: refreshing ? 'default' : 'pointer',
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          opacity: refreshing ? 0.6 : 0.85
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={refreshing ? 'animate-spin' : ''}
        >
          <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
          <path d="M13.5 2v3h-3" />
        </svg>
      </button>
      <div
        ref={contentRef}
        className="md-preview"
        style={{
          height: '100vh',
          overflowY: 'auto',
          padding: '20px 26px',
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)'
        }}
      />
    </>
  )
}
