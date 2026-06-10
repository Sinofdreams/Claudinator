import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { useSettingsStore } from '@/stores/settings-store'
import type { ITheme } from '@xterm/xterm'

// Tokyo Night palette (matches the Mux terminal emulator)
export const XTERM_DARK: ITheme = {
  background: '#1a1b26',
  foreground: '#c0caf5',
  cursor: '#c0caf5',
  selectionBackground: '#33467c',
  black: '#15161e',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
  brightBlack: '#414868',
  brightRed: '#f7768e',
  brightGreen: '#9ece6a',
  brightYellow: '#e0af68',
  brightBlue: '#7aa2f7',
  brightMagenta: '#bb9af7',
  brightCyan: '#7dcfff',
  brightWhite: '#c0caf5'
}

export const XTERM_LIGHT: ITheme = {
  background: '#ffffff',
  foreground: '#1f2328',
  cursor: '#1f2328',
  selectionBackground: '#bde0fe',
  black: '#1f2328',
  red: '#cf222e',
  green: '#1a7f37',
  yellow: '#9a6700',
  blue: '#0969da',
  magenta: '#8250df',
  cyan: '#1b7c83',
  white: '#6e7781',
  brightBlack: '#afb8c1',
  brightRed: '#a40e26',
  brightGreen: '#116329',
  brightYellow: '#7c4d00',
  brightBlue: '#0550ae',
  brightMagenta: '#6639ba',
  brightCyan: '#136169',
  brightWhite: '#1f2328'
}

interface TerminalViewProps {
  sessionId: string
  isVisible: boolean
}

export default function TerminalView({ sessionId, isVisible }: TerminalViewProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const { theme: currentTheme, themeOverrides } = useSettingsStore.getState()
    const baseXterm = currentTheme === 'light' ? XTERM_LIGHT : XTERM_DARK
    const terminalOverrides = themeOverrides[currentTheme] ?? {}
    // Extract terminal-specific overrides (non-CSS-variable keys)
    const xtermOverrides: Record<string, string> = {}
    for (const [k, v] of Object.entries(terminalOverrides)) {
      if (!k.startsWith('--') && v) xtermOverrides[k] = v
    }
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      cursorInactiveStyle: 'outline',
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Consolas', monospace",
      theme: { ...baseXterm, ...xtermOverrides },
      scrollback: 5000,
      convertEol: true
    })

    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)

    // Small delay for DOM to be ready
    requestAnimationFrame(() => {
      try {
        fitAddon.fit()
      } catch {
        // ignore
      }
    })

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    // Dim the terminal when it doesn't have keyboard focus (or the window is
    // blurred), so it's clear which terminal is active and the CLI's drawn input
    // block doesn't read as focused when you're typing elsewhere.
    const applyFocusStyle = (): void => {
      const el = containerRef.current
      if (!el) return
      const focused = document.hasFocus() && document.activeElement === terminal.textarea
      el.style.transition = 'opacity 0.15s ease'
      el.style.opacity = focused ? '1' : '0.55'
    }
    const textarea = terminal.textarea
    textarea?.addEventListener('focus', applyFocusStyle)
    textarea?.addEventListener('blur', applyFocusStyle)
    window.addEventListener('focus', applyFocusStyle)
    window.addEventListener('blur', applyFocusStyle)
    applyFocusStyle()

    // Subscribe to theme and override changes for live switching
    let prevTheme = useSettingsStore.getState().theme
    let prevOverrides = useSettingsStore.getState().themeOverrides
    const unsubTheme = useSettingsStore.subscribe((state) => {
      if (state.theme !== prevTheme || state.themeOverrides !== prevOverrides) {
        prevTheme = state.theme
        prevOverrides = state.themeOverrides
        const base = state.theme === 'light' ? XTERM_LIGHT : XTERM_DARK
        const overrides = state.themeOverrides[state.theme] ?? {}
        const xo: Record<string, string> = {}
        for (const [k, v] of Object.entries(overrides)) {
          if (!k.startsWith('--') && v) xo[k] = v
        }
        terminal.options.theme = { ...base, ...xo }
      }
    })

    // Clipboard: Ctrl+C copies selection, Ctrl+V pastes
    terminal.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true

      // Ctrl+C with selection → copy to clipboard, don't send SIGINT
      if (event.ctrlKey && event.key === 'c' && terminal.hasSelection()) {
        navigator.clipboard.writeText(terminal.getSelection())
        return false
      }

      // Ctrl+V → read clipboard and write to PTY with bracketed paste.
      // Always wrap in bracketed-paste markers so CLI tools (Claude Code, and
      // PSReadLine) detect a multi-line paste and display it compactly. We don't
      // gate on terminal.modes.bracketedPasteMode because the enabling escape can
      // scroll out of the replayed buffer on long-running sessions, leaving the
      // flag stale/false even though the app does support bracketed paste.
      if (event.ctrlKey && event.key === 'v') {
        event.preventDefault()
        navigator.clipboard.readText().then((text) => {
          if (!text) return
          window.api.writeSession(sessionId, '\x1b[200~' + text + '\x1b[201~')
        })
        return false
      }

      return true
    })

    // Forward user input to PTY
    terminal.onData((data) => {
      window.api.writeSession(sessionId, data)
    })

    // Highlight user input lines (lines starting with > or ❯)
    terminal.onLineFeed(() => {
      try {
        const buf = terminal.buffer.active
        const prevLine = buf.baseY + buf.cursorY - 1
        if (prevLine < 0) return
        const line = buf.getLine(prevLine)
        if (!line) return
        const text = line.translateToString(true).trimStart()
        if (text.startsWith('>') || text.startsWith('\u276F')) {
          const marker = terminal.registerMarker(-1)
          if (marker) {
            const deco = terminal.registerDecoration({ marker })
            deco?.onRender((el) => {
              el.style.backgroundColor = 'rgba(200, 210, 230, 0.13)'
              el.style.width = `${terminal.cols}ch`
            })
          }
        }
      } catch {
        // ignore decoration errors
      }
    })

    // Replay buffer then subscribe to live data
    let cleanup: (() => void) | null = null

    window.api.getSessionBuffer(sessionId).then((buffer) => {
      if (buffer) terminal.write(buffer)

      // Subscribe to live data
      cleanup = window.api.onSessionData((sid, data) => {
        if (sid === sessionId) {
          terminal.write(data)
        }
      })
    })

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        window.api.resizeSession(sessionId, terminal.cols, terminal.rows)
      } catch {
        // ignore
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      unsubTheme()
      cleanup?.()
      resizeObserver.disconnect()
      textarea?.removeEventListener('focus', applyFocusStyle)
      textarea?.removeEventListener('blur', applyFocusStyle)
      window.removeEventListener('focus', applyFocusStyle)
      window.removeEventListener('blur', applyFocusStyle)
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [sessionId])

  // Refit when visibility changes
  useEffect(() => {
    if (isVisible && fitAddonRef.current) {
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit()
          if (terminalRef.current) {
            window.api.resizeSession(sessionId, terminalRef.current.cols, terminalRef.current.rows)
            // Focus the CLI so the user can type immediately on open
            terminalRef.current.focus()
          }
        } catch {
          // ignore
        }
      })
    }
  }, [isVisible, sessionId])

  return (
    <div
      className="h-full w-full"
      style={{ display: isVisible ? 'block' : 'none', padding: '8px 12px 0 12px' }}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
