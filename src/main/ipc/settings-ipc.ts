import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { IPC } from '@shared/ipc-channels'
import { loadSettings, saveSettings, Settings } from '../services/settings-persistence'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC.SETTINGS_LOAD, async () => {
    return await loadSettings()
  })

  ipcMain.handle(IPC.SETTINGS_SAVE, async (_event, settings: Partial<Settings>) => {
    // Merge over what's on disk: the renderer only round-trips the fields it
    // knows about, and main-managed fields (e.g. `remote`) must survive.
    const existing = await loadSettings()
    await saveSettings({ ...existing, ...settings })
  })

  ipcMain.handle(IPC.SETTINGS_ADD_RULE, async (_event, rule: string) => {
    const settings = await loadSettings()
    if (!settings.rules.includes(rule)) {
      settings.rules.push(rule)
      await saveSettings(settings)
    }
    return settings.rules
  })

  ipcMain.handle(IPC.CLAUDE_MD_READ, async (_event, projectDir: string): Promise<{ rules: string[]; error?: string }> => {
    try {
      const filePath = join(projectDir, 'CLAUDE.md')
      const content = await readFile(filePath, 'utf-8')

      const BEGIN_MARKER = '<!-- BEGIN Claude Orchestrator Rules -->'
      const END_MARKER = '<!-- END Claude Orchestrator Rules -->'

      // Remove managed section(s) so we only parse user-written rules
      let filtered = content
      let startIdx = filtered.indexOf(BEGIN_MARKER)
      while (startIdx !== -1) {
        const endIdx = filtered.indexOf(END_MARKER, startIdx)
        if (endIdx === -1) {
          filtered = filtered.substring(0, startIdx)
          break
        }
        filtered = filtered.substring(0, startIdx) + filtered.substring(endIdx + END_MARKER.length)
        startIdx = filtered.indexOf(BEGIN_MARKER)
      }

      // Parse markdown list items (- item or * item)
      const rules: string[] = []
      for (const line of filtered.split('\n')) {
        const match = line.match(/^\s*[-*]\s+(.+)/)
        if (match) {
          const text = match[1].trim()
          if (text) rules.push(text)
        }
      }
      return { rules }
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code
      if (code === 'ENOENT') {
        return { rules: [], error: 'CLAUDE.md not found in ' + projectDir }
      }
      return { rules: [], error: 'Failed to read CLAUDE.md' }
    }
  })

  ipcMain.handle(IPC.THEME_IMPORT, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: 'Import Theme',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    try {
      const raw = await readFile(result.filePaths[0], 'utf-8')
      const parsed = JSON.parse(raw)
      // Validate basic structure
      if (typeof parsed !== 'object' || parsed === null) return null
      return parsed
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.OPEN_FILE, async (_event, filePath: string) => {
    return await shell.openPath(filePath)
  })

  ipcMain.handle(IPC.THEME_EXPORT, async (event, themeJson: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export Theme',
      defaultPath: 'theme.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return false
    try {
      await writeFile(result.filePath, themeJson, 'utf-8')
      return true
    } catch {
      return false
    }
  })
}
