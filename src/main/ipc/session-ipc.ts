import { ipcMain, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { sessionManager } from '../services/session-manager'
import { loadSettings } from '../services/settings-persistence'

export function registerSessionIpc(): void {
  ipcMain.handle(
    IPC.SESSION_START,
    async (
      event,
      args: {
        cardId: string
        cardTitle: string
        projectDir: string
        claudeSessionId?: string | null
      }
    ) => {
      const settings = await loadSettings()
      const info = await sessionManager.start(
        args.cardId,
        args.cardTitle,
        args.projectDir,
        args.claudeSessionId,
        settings.rules,
        settings.pats,
        settings.claudeModel
      )

      const win = BrowserWindow.fromWebContents(event.sender)

      // Forward PTY data to renderer
      sessionManager.onData(info.id, (data) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC.SESSION_DATA, info.id, data)
        }
      })

      // Forward PTY exit to renderer
      sessionManager.onExit(info.id, (code) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC.SESSION_EXIT, info.id, code)
        }
      })

      // Forward detected Claude conversation ID to renderer
      sessionManager.onClaudeId(info.id, (conversationId) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC.SESSION_CLAUDE_ID, info.id, conversationId)
        }
      })

      return info
    }
  )

  ipcMain.handle(IPC.SESSION_STOP, async (_event, sessionId: string) => {
    return sessionManager.stop(sessionId)
  })

  ipcMain.handle(IPC.SESSION_WRITE, async (_event, sessionId: string, data: string) => {
    sessionManager.write(sessionId, data)
  })

  ipcMain.handle(IPC.SESSION_RESIZE, async (_event, sessionId: string, cols: number, rows: number) => {
    sessionManager.resize(sessionId, cols, rows)
  })

  ipcMain.handle(IPC.SESSION_BUFFER, async (_event, sessionId: string) => {
    return sessionManager.getBuffer(sessionId)
  })

  ipcMain.handle(IPC.SESSION_LIST, async () => {
    return sessionManager.listSessions()
  })

  ipcMain.handle(IPC.SESSION_CWD, async (_event, sessionId: string) => {
    return sessionManager.getCwd(sessionId)
  })

  ipcMain.handle(IPC.SESSION_CONTEXT, async (_event, sessionId: string) => {
    return sessionManager.getContextInfo(sessionId)
  })
}
