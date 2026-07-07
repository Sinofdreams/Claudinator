import { useState, useEffect, useCallback, useRef } from 'react'

interface GitFile {
  path: string
  status: string
}

interface GitStatus {
  branch: string
  files: GitFile[]
}

interface GitPanelProps {
  projectDir: string | null
  sessionId?: string
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  M: { color: 'text-yellow-400', bg: 'bg-yellow-400/10', label: 'Modified' },
  A: { color: 'text-green-400', bg: 'bg-green-400/10', label: 'Added' },
  D: { color: 'text-red-400', bg: 'bg-red-400/10', label: 'Deleted' },
  R: { color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'Renamed' },
  '??': { color: 'text-slate-400', bg: 'bg-slate-400/10', label: 'Untracked' },
  U: { color: 'text-orange-400', bg: 'bg-orange-400/10', label: 'Unmerged' }
}

function getFileName(filePath: string): string {
  return filePath.split('/').pop() ?? filePath
}

function getFileDir(filePath: string): string {
  const parts = filePath.split('/')
  if (parts.length <= 1) return ''
  return parts.slice(0, -1).join('/')
}

function groupByDir(files: GitFile[]): Map<string, GitFile[]> {
  const groups = new Map<string, GitFile[]>()
  for (const file of files) {
    const dir = getFileDir(file.path) || '.'
    if (!groups.has(dir)) groups.set(dir, [])
    groups.get(dir)!.push(file)
  }
  return groups
}

function isDiffMeta(line: string): boolean {
  return (
    line.startsWith('diff --git') ||
    line.startsWith('index ') ||
    line.startsWith('---') ||
    line.startsWith('+++') ||
    line.startsWith('new file') ||
    line.startsWith('deleted file') ||
    line.startsWith('similarity')
  )
}

function DiffLine({ line }: { line: string }): JSX.Element | null {
  if (isDiffMeta(line)) return null

  const base: React.CSSProperties = {
    padding: '1px 10px',
    whiteSpace: 'pre',
    borderLeft: '3px solid transparent',
  }

  if (line.startsWith('@@')) {
    return (
      <div style={{ ...base, color: 'var(--text-diff-hunk)', backgroundColor: 'var(--bg-diff-hunk)', padding: '4px 10px', marginTop: 2 }}>
        {line}
      </div>
    )
  }

  if (line.startsWith('+')) {
    return (
      <div style={{ ...base, color: 'var(--text-diff-add)', backgroundColor: 'var(--bg-diff-add)', borderLeftColor: 'var(--border-diff-add)' }}>
        {line}
      </div>
    )
  }

  if (line.startsWith('-')) {
    return (
      <div style={{ ...base, color: 'var(--text-diff-del)', backgroundColor: 'var(--bg-diff-del)', borderLeftColor: 'var(--border-diff-del)' }}>
        {line}
      </div>
    )
  }

  return (
    <div style={{ ...base, color: 'var(--text-diff-context)' }}>
      {line || ' '}
    </div>
  )
}

export default function GitPanel({ projectDir, sessionId }: GitPanelProps): JSX.Element {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedFile, setExpandedFile] = useState<string | null>(null)
  const [diffs, setDiffs] = useState<Record<string, string>>({})
  const [loadingDiff, setLoadingDiff] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    if (!projectDir) {
      setError('No project directory set')
      setStatus(null)
      return
    }
    try {
      const result = await window.api.getGitStatus(projectDir, sessionId)
      setStatus(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not a git repository')
      setStatus(null)
    }
  }, [projectDir])

  useEffect(() => {
    fetchStatus()
    intervalRef.current = setInterval(fetchStatus, 10000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchStatus])

  const handleFileClick = async (filePath: string): Promise<void> => {
    if (!projectDir) return
    if (expandedFile === filePath) {
      setExpandedFile(null)
      return
    }

    setExpandedFile(filePath)

    if (!diffs[filePath]) {
      setLoadingDiff(filePath)
      try {
        const diff = await window.api.getGitDiff(projectDir, filePath)
        setDiffs((prev) => ({ ...prev, [filePath]: diff }))
      } catch {
        setDiffs((prev) => ({ ...prev, [filePath]: 'Failed to load diff' }))
      }
      setLoadingDiff(null)
    }
  }

  if (error) {
    return (
      <div className="flex flex-col h-full" style={{ borderLeft: '1px solid var(--border-primary)', background: 'var(--bg-primary)' }}>
        {/* Header */}
        <div className="shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)', padding: '10px 24px' }}>
          <h3 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>
            Files changed
          </h3>
        </div>
        <div className="flex items-center justify-center flex-1 px-6">
          <div className="flex flex-col items-center text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full" style={{ border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}>
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ color: 'var(--text-faint)' }} strokeLinecap="round">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 5.5v2.5M8 10v.5" />
              </svg>
            </div>
            <p className="text-[11px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Not a git repository</p>
            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
              Initialize a repo to track changes
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ borderLeft: '1px solid var(--border-primary)', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)', padding: '10px 24px' }}>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>
            Files changed
          </h3>
          <div className="flex items-center gap-2">
            {status && status.files.length > 0 && (
              <span className="rounded-full text-[10px] font-medium" style={{ padding: '2px 8px', border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-button)', color: 'var(--text-secondary)' }}>
                {status.files.length}
              </span>
            )}
            <button
              onClick={fetchStatus}
              className="flex items-center justify-center rounded-lg transition-colors"
              style={{ padding: '4px', color: 'var(--text-faint)' }}
              title="Refresh"
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2v4h-4" />
                <path d="M2 14v-4h4" />
                <path d="M13.5 6A6 6 0 0 0 3 4.5L2 6" />
                <path d="M2.5 10A6 6 0 0 0 13 11.5L14 10" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {status && status.files.length === 0 && (
          <div className="flex items-center justify-center h-full px-4">
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full" style={{ border: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-green-600" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 8.5l3 3 6-6" />
                </svg>
              </div>
              <p className="text-[11px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Working tree clean</p>
              <p className="text-[10px]" style={{ color: 'var(--text-faint)' }}>No uncommitted changes</p>
            </div>
          </div>
        )}

        {!status && !error && (
          <div className="flex items-center justify-center h-32">
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-faint)' }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="animate-spin">
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
                <path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Loading...
            </div>
          </div>
        )}

        <div className="py-1">
          {status && (() => {
            const groups = groupByDir(status.files)
            return Array.from(groups.entries()).map(([dir, files]) => (
              <div key={dir}>
                {/* Directory header */}
                <div
                  className="flex items-center text-[10px] font-medium uppercase tracking-wide"
                  style={{ padding: '8px 16px 4px', color: 'var(--text-muted)' }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" className="shrink-0 mr-1.5" style={{ color: 'var(--text-faint)' }} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 4.5V12a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0014 12V6.5A1.5 1.5 0 0012.5 5H8L6.5 3H3.5A1.5 1.5 0 002 4.5z" />
                  </svg>
                  <span className="truncate">{dir}</span>
                </div>

                {/* Files in this directory */}
                {files.map((file) => {
                  const config = STATUS_CONFIG[file.status] ?? { color: 'text-slate-400', bg: 'bg-slate-400/10', label: file.status }
                  const isExpanded = expandedFile === file.path
                  const isLoading = loadingDiff === file.path
                  const fileName = getFileName(file.path)

                  return (
                    <div key={file.path}>
                      <button
                        onClick={() => handleFileClick(file.path)}
                        className={`w-full flex items-center text-left text-xs transition-colors cursor-pointer ${
                          isExpanded
                            ? 'border-l-2 border-l-blue-500'
                            : 'border-l-2 border-l-transparent'
                        }`}
                        style={{ gap: '8px', padding: '5px 16px 5px 32px', backgroundColor: isExpanded ? 'var(--bg-button)' : 'transparent' }}
                      >
                        {/* Status badge */}
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold font-mono ${config.color} ${config.bg}`}>
                          {file.status}
                        </span>

                        {/* File name */}
                        <span className="flex-1 min-w-0 truncate font-medium" style={{ color: 'var(--text-primary)' }}>
                          {fileName}
                        </span>

                        {/* Expand chevron */}
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          className={`shrink-0 transition-transform ${
                            isExpanded ? 'rotate-90' : ''
                          }`}
                          style={{ color: 'var(--text-faint)' }}
                        >
                          <path d="M3.5 2l3.5 3-3.5 3" />
                        </svg>
                      </button>

                      {/* Inline diff */}
                      {isExpanded && (
                        <div className="mx-3 mb-2 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-diff-context)' }}>
                          {isLoading ? (
                            <div className="flex items-center gap-2 px-4 py-3 text-xs" style={{ color: 'var(--text-faint)' }}>
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="animate-spin">
                                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
                                <path d="M6 1.5a4.5 4.5 0 0 1 4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
                              Loading diff...
                            </div>
                          ) : diffs[file.path] ? (
                            <div className="text-[11px] leading-[18px] font-mono overflow-x-auto max-h-72 overflow-y-auto py-1">
                              {diffs[file.path].split('\n').map((line, i) => (
                                <DiffLine key={i} line={line} />
                              ))}
                            </div>
                          ) : (
                            <div className="px-4 py-3 text-xs" style={{ color: 'var(--text-faint)' }}>No diff available</div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          })()}
        </div>
      </div>

      {/* Footer */}
      {status && status.files.length > 0 && !expandedFile && (
        <div className="shrink-0 flex items-center justify-center" style={{ borderTop: '1px solid var(--border-subtle)', padding: '10px 24px' }}>
          <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-faint)' }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              <circle cx="5" cy="5" r="3.5" />
              <path d="M5 3.5v2l1.2 1.2" />
            </svg>
            Select a file to view diff
          </div>
        </div>
      )}
    </div>
  )
}
