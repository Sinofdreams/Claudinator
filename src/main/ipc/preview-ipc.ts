import { ipcMain, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { IPC } from '@shared/ipc-channels'

interface PreviewData {
  html: string
  theme: 'dark' | 'light'
  title: string
}

let previewWindow: BrowserWindow | null = null
// Cache the latest payload so a freshly-opened window can render immediately,
// before the editor sends its next update.
let lastData: PreviewData | null = null

function broadcastClosed(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.PREVIEW_CLOSED)
  }
}

export function registerPreviewIpc(): void {
  ipcMain.handle(IPC.PREVIEW_OPEN, (event) => {
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.focus()
      return
    }

    const bg = lastData?.theme === 'light' ? '#ffffff' : '#0d1117'
    previewWindow = new BrowserWindow({
      width: 620,
      height: 820,
      title: 'Markdown Preview',
      backgroundColor: bg,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    previewWindow.webContents.setWindowOpenHandler((details) => {
      shell.openExternal(details.url)
      return { action: 'deny' }
    })

    previewWindow.on('closed', () => {
      previewWindow = null
      broadcastClosed()
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      previewWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#preview`)
    } else {
      previewWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'preview' })
    }
  })

  // Editor window streams content/theme updates; relay to the preview window.
  ipcMain.on(IPC.PREVIEW_UPDATE, (_event, data: PreviewData) => {
    lastData = data
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.webContents.send(IPC.PREVIEW_DATA, data)
    }
  })

  // The preview renderer asks for the current payload once its listener is
  // attached — avoids a race where the first push is dropped before mount.
  ipcMain.on(IPC.PREVIEW_READY, (event) => {
    if (lastData) event.sender.send(IPC.PREVIEW_DATA, lastData)
  })

  ipcMain.handle(IPC.PREVIEW_CLOSE, () => {
    if (previewWindow && !previewWindow.isDestroyed()) previewWindow.close()
  })
}
