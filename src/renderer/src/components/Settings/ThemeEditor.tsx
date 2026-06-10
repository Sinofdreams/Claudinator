import { useState } from 'react'
import type { ThemeTemplate } from '@shared/models'
import { XTERM_DARK, XTERM_LIGHT } from '@/components/Terminal/TerminalView'

// ── Built-in CSS defaults (must match globals.css) ──────────────────────

const CSS_DEFAULTS_DARK: Record<string, string> = {
  '--bg-primary': '#0d1117',
  '--bg-surface': '#161b22',
  '--bg-elevated': '#1c2128',
  '--bg-input': '#0d1117',
  '--bg-overlay': 'rgba(0, 0, 0, 0.6)',
  '--bg-header': '#1c2128',
  '--bg-button': '#21262d',
  '--bg-button-hover': '#30363d',
  '--bg-active': '#30363d',
  '--card-bg': '#161b22',
  '--column-bg': '#111a27',
  '--resize-handle': '#30363d',
  '--resize-handle-hover': 'rgba(59, 130, 246, 0.4)',
  '--text-primary': '#e6edf3',
  '--text-secondary': '#9198a1',
  '--text-muted': '#656d76',
  '--text-faint': '#484f58',
  '--border-primary': '#30363d',
  '--border-subtle': '#21262d',
  '--border-input': '#30363d',
  '--card-border': '#2a3441',
  '--card-hover-border': '#3a4855',
  '--column-border': 'rgba(30, 41, 59, 0.6)',
  '--accent': '#2563eb',
  '--accent-hover': '#3b82f6',
  '--scrollbar-thumb': '#30363d',
  '--scrollbar-thumb-hover': '#484f58',
  '--bg-diff-add': '#1a3a2a',
  '--bg-diff-del': '#4c1d30',
  '--bg-diff-hunk': '#1c2128',
  '--bg-diff-context': '#0d1117',
  '--text-diff-add': '#a6e3a1',
  '--text-diff-del': '#f38ba8',
  '--text-diff-hunk': '#7f849c',
  '--text-diff-context': '#656d76',
  '--border-diff-add': '#a6e3a1',
  '--border-diff-del': '#f38ba8',
}

const CSS_DEFAULTS_LIGHT: Record<string, string> = {
  '--bg-primary': '#ffffff',
  '--bg-surface': '#f6f8fa',
  '--bg-elevated': '#ffffff',
  '--bg-input': '#f6f8fa',
  '--bg-overlay': 'rgba(0, 0, 0, 0.3)',
  '--bg-header': '#f6f8fa',
  '--bg-button': '#e1e4e8',
  '--bg-button-hover': '#d0d7de',
  '--bg-active': '#d0d7de',
  '--card-bg': '#ffffff',
  '--column-bg': '#f6f8fa',
  '--resize-handle': '#d0d7de',
  '--resize-handle-hover': 'rgba(59, 130, 246, 0.4)',
  '--text-primary': '#1f2328',
  '--text-secondary': '#59636e',
  '--text-muted': '#8b949e',
  '--text-faint': '#afb8c1',
  '--border-primary': '#d0d7de',
  '--border-subtle': '#e1e4e8',
  '--border-input': '#d0d7de',
  '--card-border': '#d0d7de',
  '--card-hover-border': '#afb8c1',
  '--column-border': '#e1e4e8',
  '--accent': '#2563eb',
  '--accent-hover': '#1d4ed8',
  '--scrollbar-thumb': '#c1c8cf',
  '--scrollbar-thumb-hover': '#afb8c1',
  '--bg-diff-add': '#dafbe1',
  '--bg-diff-del': '#ffebe9',
  '--bg-diff-hunk': '#f6f8fa',
  '--bg-diff-context': '#ffffff',
  '--text-diff-add': '#1a7f37',
  '--text-diff-del': '#cf222e',
  '--text-diff-hunk': '#59636e',
  '--text-diff-context': '#8b949e',
  '--border-diff-add': '#34d058',
  '--border-diff-del': '#d73a49',
}

// ── Terminal ANSI keys ──────────────────────────────────────────────────

const TERMINAL_KEYS = [
  'background', 'foreground', 'cursor', 'selectionBackground',
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
  'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
] as const

// ── Color group definitions ─────────────────────────────────────────────

interface ColorGroup {
  label: string
  vars: { key: string; label: string }[]
}

const CSS_GROUPS: ColorGroup[] = [
  {
    label: 'Backgrounds',
    vars: [
      { key: '--bg-primary', label: 'App Background' },
      { key: '--bg-surface', label: 'Surface' },
      { key: '--bg-elevated', label: 'Elevated' },
      { key: '--bg-input', label: 'Input' },
      { key: '--bg-overlay', label: 'Overlay' },
      { key: '--bg-header', label: 'Header' },
      { key: '--bg-button', label: 'Button' },
      { key: '--bg-button-hover', label: 'Button Hover' },
      { key: '--bg-active', label: 'Active' },
      { key: '--card-bg', label: 'Card' },
      { key: '--column-bg', label: 'Column' },
      { key: '--resize-handle', label: 'Resize Handle' },
      { key: '--resize-handle-hover', label: 'Resize Handle Hover' },
    ],
  },
  {
    label: 'Text',
    vars: [
      { key: '--text-primary', label: 'Primary' },
      { key: '--text-secondary', label: 'Secondary' },
      { key: '--text-muted', label: 'Muted' },
      { key: '--text-faint', label: 'Faint' },
    ],
  },
  {
    label: 'Borders',
    vars: [
      { key: '--border-primary', label: 'Primary' },
      { key: '--border-subtle', label: 'Subtle' },
      { key: '--border-input', label: 'Input' },
      { key: '--card-border', label: 'Card' },
      { key: '--card-hover-border', label: 'Card Hover' },
      { key: '--column-border', label: 'Column' },
    ],
  },
  {
    label: 'Accent',
    vars: [
      { key: '--accent', label: 'Accent' },
      { key: '--accent-hover', label: 'Accent Hover' },
    ],
  },
  {
    label: 'Scrollbar',
    vars: [
      { key: '--scrollbar-thumb', label: 'Thumb' },
      { key: '--scrollbar-thumb-hover', label: 'Thumb Hover' },
    ],
  },
  {
    label: 'Diff Colors',
    vars: [
      { key: '--bg-diff-add', label: 'Add Background' },
      { key: '--bg-diff-del', label: 'Delete Background' },
      { key: '--bg-diff-hunk', label: 'Hunk Background' },
      { key: '--bg-diff-context', label: 'Context Background' },
      { key: '--text-diff-add', label: 'Add Text' },
      { key: '--text-diff-del', label: 'Delete Text' },
      { key: '--text-diff-hunk', label: 'Hunk Text' },
      { key: '--text-diff-context', label: 'Context Text' },
      { key: '--border-diff-add', label: 'Add Border' },
      { key: '--border-diff-del', label: 'Delete Border' },
    ],
  },
]

const TERMINAL_LABELS: Record<string, string> = {
  background: 'Background',
  foreground: 'Default Text',
  cursor: 'Cursor',
  selectionBackground: 'Selection',
  black: 'dim text, borders',
  red: 'errors, deletions',
  green: 'success, additions',
  yellow: 'warnings, modified',
  blue: 'directories, links',
  magenta: 'keywords, special',
  cyan: 'constants, paths',
  white: 'secondary text',
  brightBlack: 'comments',
  brightRed: 'bold errors',
  brightGreen: 'bold success',
  brightYellow: 'bold warnings',
  brightBlue: 'bold links',
  brightMagenta: 'bold keywords',
  brightCyan: 'bold constants',
  brightWhite: 'bold text',
}

const TERMINAL_GROUP: ColorGroup = {
  label: 'Terminal ANSI Colors',
  vars: TERMINAL_KEYS.map((k) => ({
    key: k,
    label: TERMINAL_LABELS[k] ?? k,
  })),
}

// ── Helpers ─────────────────────────────────────────────────────────────

/** Convert rgba / named colors to a hex value for the color picker (best effort) */
function toHex(color: string): string {
  if (color.startsWith('#')) {
    // Expand shorthand #abc → #aabbcc
    if (color.length === 4) {
      return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3]
    }
    return color.slice(0, 7) // strip alpha if #rrggbbaa
  }
  // For rgba and other formats, try to parse via a temporary element
  try {
    const el = document.createElement('div')
    el.style.color = color
    document.body.appendChild(el)
    const computed = getComputedStyle(el).color
    document.body.removeChild(el)
    const m = computed.match(/(\d+),\s*(\d+),\s*(\d+)/)
    if (m) {
      const hex = '#' + [m[1], m[2], m[3]].map((n) => parseInt(n).toString(16).padStart(2, '0')).join('')
      return hex
    }
  } catch { /* fall through */ }
  return '#000000'
}

// ── Props ───────────────────────────────────────────────────────────────

interface ThemeEditorProps {
  theme: 'dark' | 'light'
  overrides: ThemeTemplate
  onChange: (overrides: ThemeTemplate) => void
  onImport: () => void
  onExport: () => void
}

// ── Component ───────────────────────────────────────────────────────────

export default function ThemeEditor({
  theme,
  overrides,
  onChange,
  onImport,
  onExport,
}: ThemeEditorProps): JSX.Element {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    Backgrounds: false,
    Text: true,
    Borders: true,
    Accent: true,
    Scrollbar: true,
    'Diff Colors': true,
    'Terminal ANSI Colors': true,
  })

  const cssDefaults = theme === 'dark' ? CSS_DEFAULTS_DARK : CSS_DEFAULTS_LIGHT
  const xtermDefaults = theme === 'dark' ? XTERM_DARK : XTERM_LIGHT

  function getDefault(key: string): string {
    if (key.startsWith('--')) return cssDefaults[key] ?? '#000000'
    return (xtermDefaults as Record<string, string>)[key] ?? '#000000'
  }

  function getEffective(key: string): string {
    return overrides[key] || getDefault(key)
  }

  function setColor(key: string, value: string): void {
    onChange({ ...overrides, [key]: value })
  }

  function resetColor(key: string): void {
    const next = { ...overrides }
    delete next[key]
    onChange(next)
  }

  function resetAll(): void {
    onChange({})
  }

  function toggleCollapse(label: string): void {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  const allGroups = [...CSS_GROUPS, TERMINAL_GROUP]

  return (
    <div>
      {/* Import / Export buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={onImport} style={actionBtnStyle}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2v8M4 6l4 4 4-4" />
            <path d="M2 12h12" />
          </svg>
          Import
        </button>
        <button type="button" onClick={onExport} style={actionBtnStyle}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 10V2M4 6l4-4 4 4" />
            <path d="M2 12h12" />
          </svg>
          Export
        </button>
      </div>

      {/* Color groups */}
      {allGroups.map((group) => (
        <div key={group.label} style={{ marginBottom: 4 }}>
          <button
            type="button"
            onClick={() => toggleCollapse(group.label)}
            style={groupHeaderStyle}
          >
            <span style={{ fontSize: 11, marginRight: 6, display: 'inline-block', transform: collapsed[group.label] ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>
              &#9660;
            </span>
            {group.label}
            <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 6 }}>
              ({group.vars.length})
            </span>
          </button>
          {!collapsed[group.label] && (
            <div style={{ padding: '4px 0 8px' }}>
              {group.vars.map(({ key, label }) => {
                const effective = getEffective(key)
                const isOverridden = key in overrides
                const hexVal = toHex(effective)
                return (
                  <div key={key} style={colorRowStyle}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', width: 140, flexShrink: 0 }}>
                      {label}
                    </span>
                    <div style={combinedInputStyle}>
                      <label style={swatchWrapStyle}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, backgroundColor: hexVal, border: '1px solid var(--border-primary)' }} />
                        <input
                          type="color"
                          value={hexVal}
                          onChange={(e) => setColor(key, e.target.value)}
                          style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                          title={key}
                        />
                      </label>
                      <input
                        type="text"
                        value={overrides[key] ?? ''}
                        placeholder={toHex(getDefault(key))}
                        onChange={(e) => {
                          const v = e.target.value
                          if (v === '') {
                            resetColor(key)
                          } else {
                            setColor(key, v)
                          }
                        }}
                        style={hexTextStyle}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => resetColor(key)}
                      title="Reset to default"
                      style={{
                        ...resetBtnStyle,
                        opacity: isOverridden ? 1 : 0.25,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 2v4h4" />
                        <path d="M4 6C5.3 3.8 7.5 2.5 10 2.5A6 6 0 110 8.5" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}

      {/* Reset All */}
      <button
        type="button"
        onClick={resetAll}
        style={{
          ...actionBtnStyle,
          marginTop: 12,
          color: '#f87171',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 2v4h4" />
          <path d="M4 6C5.3 3.8 7.5 2.5 10 2.5A6 6 0 110 8.5" />
        </svg>
        Reset All to Defaults
      </button>
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────

const actionBtnStyle: React.CSSProperties = {
  borderRadius: 6,
  backgroundColor: 'var(--bg-button)',
  padding: '6px 12px',
  fontSize: 12,
  color: 'var(--text-primary)',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 5,
}

const groupHeaderStyle: React.CSSProperties = {
  width: '100%',
  textAlign: 'left',
  padding: '6px 0',
  border: 'none',
  background: 'none',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text-primary)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
}

const colorRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '3px 0',
}

const combinedInputStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  borderRadius: 4,
  border: '1px solid var(--border-input)',
  backgroundColor: 'var(--bg-input)',
  padding: '3px 6px',
  width: 110,
}

const swatchWrapStyle: React.CSSProperties = {
  position: 'relative',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
}

const hexTextStyle: React.CSSProperties = {
  flex: 1,
  border: 'none',
  background: 'none',
  fontSize: 11,
  fontFamily: 'monospace',
  color: 'var(--text-primary)',
  outline: 'none',
  width: '100%',
  minWidth: 0,
}

const resetBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  padding: 2,
  display: 'flex',
  alignItems: 'center',
}
