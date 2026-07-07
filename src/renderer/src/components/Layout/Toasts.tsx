import { useUIStore } from '@/stores/ui-store'

/**
 * Bottom-right toast stack for transient errors/info — replaces blocking
 * alert() popups. Toasts auto-dismiss after 6s or on click.
 */
export default function Toasts(): JSX.Element | null {
  const toasts = useUIStore((s) => s.toasts)
  const dismissToast = useUIStore((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 420
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismissToast(t.id)}
          className="cursor-pointer"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 14px',
            borderRadius: 10,
            backgroundColor: 'var(--bg-elevated, var(--bg-surface))',
            border: `1px solid ${t.type === 'error' ? '#f7768e66' : 'var(--border-primary)'}`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)'
          }}
          title="Click to dismiss"
        >
          {t.type === 'error' ? (
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#f7768e" strokeWidth="1.5" className="shrink-0" style={{ marginTop: 1 }} strokeLinecap="round">
              <circle cx="8" cy="8" r="6.5" />
              <path d="M8 4.5v4M8 11h.01" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" className="shrink-0" style={{ marginTop: 1 }} strokeLinecap="round">
              <circle cx="8" cy="8" r="6.5" />
              <path d="M8 7.5v4M8 5h.01" />
            </svg>
          )}
          <span className="text-xs" style={{ color: 'var(--text-primary)', lineHeight: 1.5, wordBreak: 'break-word' }}>
            {t.message}
          </span>
        </div>
      ))}
    </div>
  )
}
