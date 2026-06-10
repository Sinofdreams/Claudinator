import { create } from 'zustand'
import type { ThemeTemplate, ThemeOverrides, CustomTheme } from '@shared/models'

interface PAT {
  id: string
  name: string
  value: string
}

type Theme = 'dark' | 'light'

interface SettingsState {
  defaultProjectDir: string
  claudeModel: string
  notesDir: string
  rules: string[]
  pats: PAT[]
  theme: Theme
  themeOverrides: ThemeOverrides
  customThemes: CustomTheme[]
  activeCustomThemeId: string | null
  loaded: boolean
}

interface SettingsActions {
  load: () => Promise<void>
  setDefaultProjectDir: (dir: string) => Promise<void>
  setNotesDir: (dir: string) => Promise<void>
  addRule: (rule: string) => void
  removeRule: (index: number) => void
  addPat: (pat: PAT) => void
  removePat: (id: string) => void
  saveAll: () => Promise<void>
  setTheme: (theme: Theme) => void
  setThemeOverrides: (theme: Theme, overrides: ThemeTemplate) => void
  applyThemeOverrides: () => void
  selectCustomTheme: (id: string) => void
  selectBaseTheme: (theme: Theme) => void
  /** Returns the effective overrides for the currently active theme selection */
  getActiveOverrides: () => ThemeTemplate
}

type SettingsStore = SettingsState & SettingsActions

function applyThemeAttribute(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

/** Apply CSS variable overrides to the document element */
function applyCssOverrides(overrides: ThemeTemplate): void {
  // Clear any previously applied runtime overrides
  const el = document.documentElement
  const toRemove: string[] = []
  for (let i = 0; i < el.style.length; i++) {
    const prop = el.style[i]
    if (prop.startsWith('--')) {
      toRemove.push(prop)
    }
  }
  toRemove.forEach((prop) => el.style.removeProperty(prop))

  // Apply new overrides
  for (const [key, value] of Object.entries(overrides)) {
    if (key.startsWith('--') && value) {
      el.style.setProperty(key, value)
    }
  }
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  defaultProjectDir: '',
  claudeModel: '',
  notesDir: '',
  rules: [],
  pats: [],
  theme: 'dark',
  themeOverrides: { dark: {}, light: {} },
  customThemes: [],
  activeCustomThemeId: null,
  loaded: false,

  load: async () => {
    const settings = await window.api.loadSettings()
    const theme = settings.theme ?? 'dark'
    const themeOverrides = settings.themeOverrides ?? { dark: {}, light: {} }
    const customThemes = settings.customThemes ?? []
    const activeCustomThemeId = settings.activeCustomThemeId ?? null

    // Determine effective base and overrides
    const custom = activeCustomThemeId ? customThemes.find((t) => t.id === activeCustomThemeId) : null
    const effectiveBase = custom ? custom.base : theme
    const effectiveOverrides = custom ? custom.overrides : (themeOverrides[theme] ?? {})

    applyThemeAttribute(effectiveBase)
    applyCssOverrides(effectiveOverrides)
    set({
      defaultProjectDir: settings.defaultProjectDir,
      claudeModel: settings.claudeModel ?? '',
      notesDir: settings.notesDir ?? '',
      rules: settings.rules ?? [],
      pats: settings.pats ?? [],
      theme,
      themeOverrides,
      customThemes,
      activeCustomThemeId,
      loaded: true
    })
  },

  setDefaultProjectDir: async (dir: string) => {
    set({ defaultProjectDir: dir })
    const { claudeModel, notesDir, rules, pats, theme, themeOverrides, customThemes, activeCustomThemeId } = get()
    await window.api.saveSettings({ defaultProjectDir: dir, claudeModel, notesDir, rules, pats, theme, themeOverrides, customThemes, activeCustomThemeId })
  },

  setNotesDir: async (dir: string) => {
    set({ notesDir: dir })
    const { defaultProjectDir, claudeModel, rules, pats, theme, themeOverrides, customThemes, activeCustomThemeId } = get()
    await window.api.saveSettings({ defaultProjectDir, claudeModel, notesDir: dir, rules, pats, theme, themeOverrides, customThemes, activeCustomThemeId })
  },

  addRule: (rule: string) => {
    set((s) => ({ rules: [...s.rules, rule] }))
  },

  removeRule: (index: number) => {
    set((s) => ({ rules: s.rules.filter((_, i) => i !== index) }))
  },

  addPat: (pat: PAT) => {
    set((s) => ({ pats: [...s.pats, pat] }))
  },

  removePat: (id: string) => {
    set((s) => ({ pats: s.pats.filter((p) => p.id !== id) }))
  },

  saveAll: async () => {
    const { defaultProjectDir, claudeModel, notesDir, rules, pats, theme, themeOverrides, customThemes, activeCustomThemeId } = get()
    await window.api.saveSettings({ defaultProjectDir, claudeModel, notesDir, rules, pats, theme, themeOverrides, customThemes, activeCustomThemeId })
  },

  setTheme: (theme: Theme) => {
    applyThemeAttribute(theme)
    const { themeOverrides, activeCustomThemeId, customThemes } = get()
    // If a custom theme is active, use its overrides; otherwise use base overrides
    const custom = activeCustomThemeId ? customThemes.find((t) => t.id === activeCustomThemeId) : null
    if (custom) {
      applyCssOverrides(custom.overrides)
    } else {
      applyCssOverrides(themeOverrides[theme] ?? {})
    }
    set({ theme })
    const { defaultProjectDir, claudeModel, notesDir, rules, pats } = get()
    window.api.saveSettings({ defaultProjectDir, claudeModel, notesDir, rules, pats, theme, themeOverrides, customThemes, activeCustomThemeId })
    window.api.changeTheme(theme)
  },

  setThemeOverrides: (theme: Theme, overrides: ThemeTemplate) => {
    set((s) => ({
      themeOverrides: { ...s.themeOverrides, [theme]: overrides }
    }))
    // If overrides are for the current base theme and no custom theme is active, apply live
    const { theme: currentTheme, activeCustomThemeId } = get()
    if (currentTheme === theme && !activeCustomThemeId) {
      applyCssOverrides(overrides)
    }
  },

  applyThemeOverrides: () => {
    const { theme, themeOverrides, activeCustomThemeId, customThemes } = get()
    const custom = activeCustomThemeId ? customThemes.find((t) => t.id === activeCustomThemeId) : null
    applyCssOverrides(custom ? custom.overrides : (themeOverrides[theme] ?? {}))
  },

  selectCustomTheme: (id: string) => {
    const { customThemes } = get()
    const custom = customThemes.find((t) => t.id === id)
    if (!custom) return
    applyThemeAttribute(custom.base)
    applyCssOverrides(custom.overrides)
    set({ theme: custom.base, activeCustomThemeId: id })
    const { defaultProjectDir, claudeModel, notesDir, rules, pats, themeOverrides } = get()
    window.api.saveSettings({ defaultProjectDir, claudeModel, notesDir, rules, pats, theme: custom.base, themeOverrides, customThemes, activeCustomThemeId: id })
    window.api.changeTheme(custom.base)
  },

  selectBaseTheme: (theme: Theme) => {
    applyThemeAttribute(theme)
    const { themeOverrides } = get()
    applyCssOverrides(themeOverrides[theme] ?? {})
    set({ theme, activeCustomThemeId: null })
    const { defaultProjectDir, claudeModel, notesDir, rules, pats, customThemes } = get()
    window.api.saveSettings({ defaultProjectDir, claudeModel, notesDir, rules, pats, theme, themeOverrides, customThemes, activeCustomThemeId: null })
    window.api.changeTheme(theme)
  },

  getActiveOverrides: () => {
    const { theme, themeOverrides, activeCustomThemeId, customThemes } = get()
    const custom = activeCustomThemeId ? customThemes.find((t) => t.id === activeCustomThemeId) : null
    return custom ? custom.overrides : (themeOverrides[theme] ?? {})
  }
}))
