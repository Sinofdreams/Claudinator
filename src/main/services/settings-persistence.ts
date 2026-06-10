import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import type { ThemeOverrides, CustomTheme } from '@shared/models'

export interface PAT {
  id: string
  name: string
  value: string
}

export interface Settings {
  defaultProjectDir: string
  claudeModel: string
  notesDir: string
  rules: string[]
  pats: PAT[]
  theme: 'dark' | 'light'
  themeOverrides: ThemeOverrides
  customThemes: CustomTheme[]
  activeCustomThemeId: string | null
}

function getDataDir(): string {
  return join(app.getPath('appData'), 'claude-orchestrator')
}

function getSettingsPath(): string {
  return join(getDataDir(), 'settings.json')
}

function createDefaultSettings(): Settings {
  return { defaultProjectDir: '', claudeModel: 'claude-opus-4-8', notesDir: '', rules: [], pats: [], theme: 'dark', themeOverrides: { dark: {}, light: {} }, customThemes: [], activeCustomThemeId: null }
}

export async function loadSettings(): Promise<Settings> {
  const filePath = getSettingsPath()
  if (!existsSync(filePath)) {
    return createDefaultSettings()
  }
  try {
    const raw = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return { ...createDefaultSettings(), ...parsed } as Settings
  } catch {
    return createDefaultSettings()
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  const dir = getDataDir()
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true })
  }
  await writeFile(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
}
