import { useCallback, useEffect, useRef, useState } from 'react'
import type { Card, GitBranchesResult } from '@shared/models'
import { useBoardStore } from '@/stores/board-store'
import { useSessionStore } from '@/stores/session-store'

interface WorktreeMenuProps {
  card: Card
  sessionId: string
  branchName: string | null
  /** Called after the card's checkout changed (branch/worktree switch). */
  onSwitched: () => void
}

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'work'
  )
}

/** Shorten an absolute path for display: keep the last two segments. */
function shortPath(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts.length <= 2 ? p : '…\\' + parts.slice(-2).join('\\')
}

const BranchIcon = ({ color }: { color: string }): JSX.Element => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" className="shrink-0" style={{ color }}>
    <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
  </svg>
)

/**
 * The branch chip in the session info bar, expanded into a dropdown for git
 * worktree management: run this card's sessions in an isolated worktree on its
 * own branch, switch between worktrees, or return to the main checkout.
 */
export default function WorktreeMenu({ card, sessionId, branchName, onSwitched }: WorktreeMenuProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<GitBranchesResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  const [baseRef, setBaseRef] = useState('')
  const [removeError, setRemoveError] = useState<{ path: string; message: string } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const updateCard = useBoardStore((s) => s.updateCard)
  const startSession = useSessionStore((s) => s.startSession)
  const stopSession = useSessionStore((s) => s.stopSession)
  const closeTab = useSessionStore((s) => s.closeTab)

  const effectiveDir = card.worktreePath || card.projectDir

  const refresh = useCallback(async () => {
    setError(null)
    try {
      const result = await window.api.getGitBranches(effectiveDir, sessionId)
      setData(result)
      setBaseRef((prev) => prev || result.currentBranch || result.branches[0]?.name || '')
    } catch (e) {
      setData(null)
      setError(e instanceof Error ? e.message : 'Failed to read branches')
    }
  }, [effectiveDir, sessionId])

  useEffect(() => {
    if (!open) return
    refresh()
    setNewBranch((prev) => prev || slugify(card.title))
  }, [open, refresh, card.title])

  // Close on outside click; Escape closes the menu without closing the modal.
  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent): void => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  /**
   * Point the card at a different checkout and restart its session there.
   * The PTY's cwd is fixed at spawn, so switching always means a new session —
   * and a new Claude conversation, since transcripts are keyed per directory.
   */
  const switchTo = useCallback(
    async (worktreePath: string | null, branch: string | null): Promise<void> => {
      setBusy(true)
      setError(null)
      try {
        if (card.sessionId) {
          await stopSession(card.sessionId)
          closeTab(card.sessionId)
        }
        updateCard(card.id, {
          worktreePath,
          worktreeBranch: branch,
          sessionId: null,
          claudeSessionId: null
        })
        const dir = worktreePath || card.projectDir
        const info = await startSession(card.id, card.title, dir, null)
        updateCard(card.id, { sessionId: info.id })
        setOpen(false)
        onSwitched()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to switch')
      } finally {
        setBusy(false)
      }
    },
    [card, stopSession, closeTab, updateCard, startSession, onSwitched]
  )

  const handleCreate = useCallback(async (): Promise<void> => {
    const branch = newBranch.trim()
    if (!branch || !baseRef) return
    setBusy(true)
    setError(null)
    try {
      const { path } = await window.api.addWorktree(card.projectDir, branch, baseRef, true)
      await switchTo(path, branch)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create worktree')
      setBusy(false)
    }
  }, [newBranch, baseRef, card.projectDir, switchTo])

  const handleRemove = useCallback(
    async (path: string, force: boolean): Promise<void> => {
      setBusy(true)
      setRemoveError(null)
      try {
        await window.api.removeWorktree(card.projectDir, path, force)
        await refresh()
      } catch (e) {
        setRemoveError({ path, message: e instanceof Error ? e.message : 'Failed to remove' })
      } finally {
        setBusy(false)
      }
    },
    [card.projectDir, refresh]
  )

  const inWorktree = Boolean(card.worktreePath)
  const linked = data?.worktrees.filter((w) => !w.isMain) ?? []
  // Branches that exist but aren't checked out anywhere — valid bases and
  // candidates for "open as worktree" without -b.
  const availableBranches = data?.branches.filter((b) => !b.worktreePath) ?? []

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    borderRadius: 6
  }

  const actionBtn: React.CSSProperties = {
    fontSize: 10,
    padding: '3px 8px',
    borderRadius: 5,
    border: '1px solid var(--border-primary)',
    backgroundColor: 'var(--bg-button)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {/* Chip — the existing branch display, now clickable */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center transition-colors cursor-pointer"
        style={{
          gap: 8,
          padding: '3px 8px',
          margin: '-3px -8px',
          borderRadius: 6,
          border: '1px solid transparent',
          backgroundColor: open ? 'var(--bg-active)' : 'transparent',
          background: 'none'
        }}
        title={
          inWorktree
            ? `Worktree: ${card.worktreePath}\nClick to manage worktrees`
            : 'Click to manage branches & worktrees'
        }
      >
        <BranchIcon color={branchName ? 'var(--text-secondary)' : 'var(--text-faint)'} />
        {branchName ? (
          <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{branchName}</span>
        ) : (
          <span className="text-xs" style={{ color: 'var(--text-faint)', fontStyle: 'italic' }}>No branch</span>
        )}
        {inWorktree && (
          <span
            className="text-[10px]"
            style={{
              padding: '1px 6px',
              borderRadius: 4,
              backgroundColor: 'var(--bg-active)',
              border: '1px solid var(--border-primary)',
              color: 'var(--text-muted)'
            }}
          >
            worktree
          </span>
        )}
        <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-faint)' }}>
          <path d="M3 6l5 5 5-5" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: -8,
            zIndex: 60,
            width: 400,
            borderRadius: 10,
            border: '1px solid var(--border-primary)',
            backgroundColor: 'var(--bg-surface)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
            padding: 10
          }}
        >
          {/* Current checkout */}
          <div style={{ ...rowStyle, backgroundColor: 'var(--bg-primary)', marginBottom: 8 }}>
            <BranchIcon color="var(--text-secondary)" />
            <div className="min-w-0" style={{ flex: 1 }}>
              <div className="text-xs font-bold truncate" style={{ color: 'var(--text-primary)' }}>
                {branchName || '(no branch)'}
              </div>
              <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }} title={effectiveDir}>
                {inWorktree ? `worktree · ${shortPath(card.worktreePath!)}` : 'main checkout'}
              </div>
            </div>
            {inWorktree && (
              <button
                style={actionBtn}
                disabled={busy}
                onClick={() => switchTo(null, null)}
                title="Restart this card's session in the main checkout"
              >
                Back to main repo
              </button>
            )}
          </div>

          {error && (
            <div className="text-[11px]" style={{ color: '#f7768e', padding: '2px 10px 8px', whiteSpace: 'pre-wrap' }}>
              {error}
            </div>
          )}

          {/* Existing worktrees */}
          {linked.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div className="text-[10px] font-semibold uppercase" style={{ color: 'var(--text-faint)', padding: '0 10px 4px', letterSpacing: '0.05em' }}>
                Worktrees
              </div>
              {linked.map((w) => {
                const isCurrent = card.worktreePath === w.path
                return (
                  <div key={w.path}>
                    <div style={rowStyle} className="group">
                      <BranchIcon color="var(--text-muted)" />
                      <div className="min-w-0" style={{ flex: 1 }}>
                        <div className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                          {w.branch ?? '(detached)'}
                        </div>
                        <div className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }} title={w.path}>
                          {shortPath(w.path)}
                        </div>
                      </div>
                      {isCurrent ? (
                        <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>in use</span>
                      ) : (
                        <>
                          <button style={actionBtn} disabled={busy} onClick={() => switchTo(w.path, w.branch)}>
                            Use
                          </button>
                          <button
                            style={{ ...actionBtn, color: 'var(--text-muted)' }}
                            disabled={busy}
                            onClick={() => handleRemove(w.path, false)}
                            title="Remove this worktree (fails if it has uncommitted changes)"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                    {removeError?.path === w.path && (
                      <div className="text-[10px]" style={{ color: '#f7768e', padding: '0 10px 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{removeError.message}</span>
                        <button style={{ ...actionBtn, borderColor: '#f7768e', color: '#f7768e' }} disabled={busy} onClick={() => handleRemove(w.path, true)}>
                          Force remove
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Create new worktree */}
          <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8 }}>
            <div className="text-[10px] font-semibold uppercase" style={{ color: 'var(--text-faint)', padding: '0 10px 6px', letterSpacing: '0.05em' }}>
              New worktree
            </div>
            <div style={{ display: 'flex', gap: 6, padding: '0 10px', alignItems: 'center' }}>
              <input
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                placeholder="branch name"
                spellCheck={false}
                className="text-xs"
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '5px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border-primary)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  outline: 'none'
                }}
              />
              <span className="text-[10px]" style={{ color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>from</span>
              <select
                value={baseRef}
                onChange={(e) => setBaseRef(e.target.value)}
                className="text-xs"
                style={{
                  maxWidth: 130,
                  padding: '5px 6px',
                  borderRadius: 6,
                  border: '1px solid var(--border-primary)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  outline: 'none'
                }}
              >
                {(data?.branches ?? []).map((b) => (
                  <option key={b.name} value={b.name}>{b.name}</option>
                ))}
              </select>
              <button
                style={{ ...actionBtn, borderColor: 'var(--border-primary)', color: 'var(--text-primary)' }}
                disabled={busy || !newBranch.trim() || !baseRef}
                onClick={handleCreate}
              >
                {busy ? 'Working…' : 'Create & use'}
              </button>
            </div>

            {/* Open an existing branch as a worktree */}
            {availableBranches.length > 0 && (
              <div style={{ padding: '8px 10px 0' }}>
                <div className="text-[10px]" style={{ color: 'var(--text-faint)', paddingBottom: 4 }}>
                  …or open an existing branch:
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 76, overflowY: 'auto' }}>
                  {availableBranches.map((b) => (
                    <button
                      key={b.name}
                      style={actionBtn}
                      disabled={busy}
                      title={`Create a worktree for ${b.name} and use it for this card`}
                      onClick={async () => {
                        setBusy(true)
                        setError(null)
                        try {
                          const { path } = await window.api.addWorktree(card.projectDir, b.name, '', false)
                          await switchTo(path, b.name)
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'Failed to open worktree')
                          setBusy(false)
                        }
                      }}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="text-[10px]" style={{ color: 'var(--text-faint)', padding: '8px 10px 0', lineHeight: 1.5 }}>
              Switching restarts the session in the new folder and starts a fresh Claude conversation.
              New worktrees start clean — dependencies (node_modules) aren't shared.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
