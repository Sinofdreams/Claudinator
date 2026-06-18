import { useEffect } from 'react'
import { RELEASE_NOTES } from '@shared/release-notes'
import { useUIStore } from '@/stores/ui-store'

function formatDate(iso: string): string {
  // YYYY-MM-DD → "18 Jun 2026"
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${months[m - 1]} ${y}`
}

export default function WhatsNewModal(): JSX.Element {
  const close = useUIStore((s) => s.closeWhatsNew)
  const latest = RELEASE_NOTES[0]

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'var(--bg-overlay)', backdropFilter: 'blur(4px)' }}
      onClick={close}
    >
      <div
        className="flex flex-col rounded-2xl shadow-2xl"
        style={{
          width: 'min(560px, 92vw)',
          maxHeight: '82vh',
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-primary)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between shrink-0"
          style={{ padding: '22px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div>
            <div className="flex items-center" style={{ gap: 10 }}>
              <span style={{ fontSize: 19, fontWeight: 700, color: 'var(--text-primary)' }}>
                What&rsquo;s New
              </span>
              {latest && (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#fff',
                    backgroundColor: 'var(--accent)',
                    borderRadius: 999,
                    padding: '2px 9px'
                  }}
                >
                  v{latest.version}
                </span>
              )}
            </div>
            <p style={{ marginTop: 6, fontSize: 13, color: 'var(--text-muted)' }}>
              Recent updates to Claudinator.
            </p>
          </div>
          <button
            onClick={close}
            title="Close"
            className="flex items-center justify-center cursor-pointer transition-colors"
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'none',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        {/* Releases */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '8px 24px 20px' }}>
          {RELEASE_NOTES.map((rel, idx) => (
            <div key={rel.version} style={{ paddingTop: idx === 0 ? 16 : 22 }}>
              <div className="flex items-baseline" style={{ gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  v{rel.version}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{formatDate(rel.date)}</span>
              </div>
              {rel.summary && (
                <p style={{ marginTop: 4, fontSize: 13, color: 'var(--text-secondary)' }}>{rel.summary}</p>
              )}
              <ul style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rel.highlights.map((h, i) => (
                  <li key={i} className="flex" style={{ gap: 10 }}>
                    <span
                      style={{
                        marginTop: 7,
                        width: 5,
                        height: 5,
                        borderRadius: 999,
                        flexShrink: 0,
                        backgroundColor: 'var(--accent)'
                      }}
                    />
                    <span style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{h}</span>
                  </li>
                ))}
              </ul>
              {idx < RELEASE_NOTES.length - 1 && (
                <div style={{ height: 1, marginTop: 22, backgroundColor: 'var(--border-subtle)' }} />
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="flex justify-end shrink-0"
          style={{ padding: '14px 24px', borderTop: '1px solid var(--border-subtle)' }}
        >
          <button
            onClick={close}
            className="cursor-pointer transition-colors"
            style={{
              padding: '9px 20px',
              borderRadius: 9,
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              backgroundColor: 'var(--accent)',
              border: 'none'
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
