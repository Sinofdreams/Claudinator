import { ipcMain } from 'electron'
import QRCode from 'qrcode'
import { IPC } from '@shared/ipc-channels'
import { remoteServer, generateRemoteToken } from '../services/remote-server'
import { loadSettings, saveSettings } from '../services/settings-persistence'

export interface RemoteStatus {
  enabled: boolean
  running: boolean
  port: number
  urls: string[]
  /** Pairing URL (first LAN address, token in the fragment) + its QR code. */
  pairUrl: string | null
  qrDataUrl: string | null
  error?: string
}

async function buildStatus(error?: string): Promise<RemoteStatus> {
  const settings = await loadSettings()
  const running = remoteServer.isRunning()
  const urls = remoteServer.getUrls()
  let pairUrl: string | null = null
  let qrDataUrl: string | null = null
  if (running && urls.length > 0 && settings.remote.token) {
    pairUrl = `${urls[0]}/#${settings.remote.token}`
    try {
      qrDataUrl = await QRCode.toDataURL(pairUrl, { width: 260, margin: 1 })
    } catch {
      qrDataUrl = null
    }
  }
  return {
    enabled: settings.remote.enabled,
    running,
    // The bound port can differ from the configured one (fallback when taken).
    port: running ? remoteServer.getPort() : settings.remote.port,
    urls,
    pairUrl,
    qrDataUrl,
    ...(error ? { error } : {})
  }
}

/** Start the server from persisted settings (used on app launch). */
export async function startRemoteIfEnabled(): Promise<void> {
  const settings = await loadSettings()
  if (!settings.remote.enabled || !settings.remote.token) return
  try {
    await remoteServer.start(settings.remote.port, settings.remote.token)
  } catch (err) {
    console.error('Remote server failed to start:', err)
  }
}

export function registerRemoteIpc(): void {
  ipcMain.handle(IPC.REMOTE_STATUS, async (): Promise<RemoteStatus> => {
    return buildStatus()
  })

  ipcMain.handle(
    IPC.REMOTE_SET,
    async (_event, args: { enabled: boolean; regenToken?: boolean }): Promise<RemoteStatus> => {
      const settings = await loadSettings()

      if (args.regenToken || (args.enabled && !settings.remote.token)) {
        settings.remote.token = generateRemoteToken()
      }
      settings.remote.enabled = args.enabled
      await saveSettings(settings)

      let error: string | undefined
      if (args.enabled) {
        try {
          await remoteServer.start(settings.remote.port, settings.remote.token!)
        } catch (err) {
          error = err instanceof Error ? err.message : String(err)
          settings.remote.enabled = false
          await saveSettings(settings)
        }
      } else {
        await remoteServer.stop()
      }

      return buildStatus(error)
    }
  )
}
