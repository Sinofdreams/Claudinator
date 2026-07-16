import { ipcMain, Notification, BrowserWindow } from 'electron'
import { IPC } from '@shared/ipc-channels'

/**
 * Native OS notifications for session attention states ("needs a decision",
 * "waiting for your prompt"). Clicking one focuses the window and tells the
 * renderer to open that session.
 */
export function registerNotifyIpc(): void {
  ipcMain.handle(
    IPC.APP_NOTIFY,
    (event, args: { title: string; body: string; sessionId: string }) => {
      if (!Notification.isSupported()) return

      const win = BrowserWindow.fromWebContents(event.sender)
      const notification = new Notification({
        title: args.title,
        body: args.body,
        silent: false
      })

      notification.on('click', () => {
        if (!win || win.isDestroyed()) return
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        win.webContents.send(IPC.APP_NOTIFY_CLICK, args.sessionId)
      })

      notification.show()
    }
  )

  // Subtle nudge: flash the taskbar icon (Windows orange flash). Stops on its
  // own when the window gains focus — see the focus handler in main/index.ts.
  ipcMain.handle(IPC.APP_FLASH_FRAME, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed() || win.isFocused()) return
    win.flashFrame(true)
  })
}
