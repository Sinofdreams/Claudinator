import { ipcMain, app, BrowserWindow } from 'electron'
import { is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import { IPC } from '@shared/ipc-channels'

export function registerUpdateIpc(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // In dev the app isn't packaged, so electron-updater normally skips the check
  // entirely. Forcing the dev config makes it read dev-app-update.yml (GitHub
  // provider) so the full Check-for-Updates flow can be exercised via `npm run dev`.
  if (is.dev) {
    autoUpdater.forceDevUpdateConfig = true
  }

  function sendStatus(data: Record<string, unknown>): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.UPDATE_STATUS, data)
    }
  }

  autoUpdater.on('checking-for-update', () => {
    sendStatus({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    sendStatus({ status: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    sendStatus({ status: 'up-to-date' })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendStatus({ status: 'downloading', percent: progress.percent })
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendStatus({ status: 'ready', version: info.version })
  })

  autoUpdater.on('error', (err) => {
    sendStatus({ status: 'error', message: err.message })
  })

  ipcMain.handle(IPC.APP_VERSION, () => {
    return app.getVersion()
  })

  ipcMain.handle(IPC.UPDATE_CHECK, async () => {
    return await autoUpdater.checkForUpdates()
  })

  ipcMain.handle(IPC.UPDATE_DOWNLOAD, async () => {
    return await autoUpdater.downloadUpdate()
  })

  ipcMain.handle(IPC.UPDATE_INSTALL, () => {
    autoUpdater.quitAndInstall()
  })
}
