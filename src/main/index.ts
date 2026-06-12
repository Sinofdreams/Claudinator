import { app, BrowserWindow, Menu, shell, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { registerAllIpc } from './ipc/register-all'
import { sessionManager } from './services/session-manager'
import { loadSettings } from './services/settings-persistence'
import { IPC } from '@shared/ipc-channels'

const THEME_TITLEBAR = {
  dark: { color: '#0d1117', symbolColor: '#9198a1' },
  light: { color: '#ffffff', symbolColor: '#59636e' }
} as const

// Dimmed caption-button colors used while a full-screen modal is open. The OS
// draws the title-bar overlay on top of everything, so the React backdrop can't
// cover it — instead we darken the overlay to match the dimmed window. Values are
// --bg-overlay composited over --bg-primary (dark: 0.6 over #0d1117, light: 0.3 over #fff).
const THEME_TITLEBAR_DIM = {
  dark: { color: '#050709', symbolColor: '#9198a1' },
  light: { color: '#b3b3b3', symbolColor: '#59636e' }
} as const

let currentTheme: 'dark' | 'light' = 'dark'
let dimDepth = 0

function refreshTitleBar(win: BrowserWindow): void {
  const palette = dimDepth > 0 ? THEME_TITLEBAR_DIM : THEME_TITLEBAR
  const colors = palette[currentTheme] ?? palette.dark
  win.setTitleBarOverlay({ color: colors.color, symbolColor: colors.symbolColor, height: 36 })
}

async function createWindow(): Promise<void> {
  const settings = await loadSettings()
  currentTheme = settings.theme === 'light' ? 'light' : 'dark'
  const tb = THEME_TITLEBAR[currentTheme] ?? THEME_TITLEBAR.dark

  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: true,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: tb.color,
      symbolColor: tb.symbolColor,
      height: 36
    },
    title: 'Claude Code Orchestrator',
    backgroundColor: tb.color,
    // Packaged builds get the icon embedded in the exe; in dev point the window
    // at the source icon so the taskbar/window show the real branding too.
    ...(is.dev ? { icon: join(__dirname, '../../build/icon.png') } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Update titlebar when theme changes at runtime
  ipcMain.handle(IPC.THEME_CHANGE, (_event, theme: 'dark' | 'light') => {
    currentTheme = theme
    mainWindow.setBackgroundColor((THEME_TITLEBAR[theme] ?? THEME_TITLEBAR.dark).color)
    refreshTitleBar(mainWindow)
  })

  // Dim/restore the caption-button overlay while modals are open (ref-counted so
  // stacked modals don't restore early).
  ipcMain.handle(IPC.TITLEBAR_DIM, (_event, dimmed: boolean) => {
    dimDepth = Math.max(0, dimDepth + (dimmed ? 1 : -1))
    refreshTitleBar(mainWindow)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  registerAllIpc()
  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  sessionManager.killAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  sessionManager.killAll()
})
