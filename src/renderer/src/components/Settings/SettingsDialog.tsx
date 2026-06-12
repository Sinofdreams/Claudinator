import { useState, useEffect } from 'react'
import { useSettingsStore } from '@/stores/settings-store'
import { useTitleBarDim } from '@/hooks/useTitleBarDim'
import ThemeEditor from './ThemeEditor'
import type { ThemeTemplate, ThemeOverrides, CustomTheme } from '@shared/models'

interface SettingsDialogProps {
  onClose: () => void
}

interface LocalPAT {
  id: string
  name: string
  value: string
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  borderRadius: 8,
  border: '1px solid var(--border-input)',
  backgroundColor: 'var(--bg-input)',
  padding: '10px 14px',
  fontSize: 14,
  color: 'var(--text-primary)',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: 6,
}

const smallBtnStyle: React.CSSProperties = {
  borderRadius: 6,
  backgroundColor: 'var(--bg-button)',
  padding: '6px 12px',
  fontSize: 13,
  color: 'var(--text-primary)',
  border: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
}

const removeBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  padding: 4,
  borderRadius: 4,
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
}

type Section = 'general' | 'rules' | 'pats' | 'theme' | 'about'

const sections: { id: Section; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'rules', label: 'Rules' },
  { id: 'pats', label: 'PATs' },
  { id: 'theme', label: 'Theme' },
  { id: 'about', label: 'About' },
]

type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'up-to-date' }
  | { state: 'error'; message: string }

function derivePATEnvName(name: string): string {
  return 'PAT_' + name.toUpperCase().replace(/[^A-Z0-9]/g, '_')
}

function formatModelName(model: string): string {
  if (!model) return 'Latest (auto)'
  // Strip trailing date snapshot like -20250428
  const cleaned = model.replace(/-\d{8}$/, '')
  const parts = cleaned.split('-')
  if (parts[0] === 'claude' && parts.length >= 4) {
    const family = parts[1].charAt(0).toUpperCase() + parts[1].slice(1)
    const version = parts.slice(2).join('.')
    return `Claude ${family} ${version}`
  }
  return model
}

export default function SettingsDialog({ onClose }: SettingsDialogProps): JSX.Element {
  const store = useSettingsStore()

  useTitleBarDim()

  const [activeSection, setActiveSection] = useState<Section>('general')
  const [projectDir, setProjectDir] = useState(store.defaultProjectDir)
  const [notesDir, setNotesDir] = useState(store.notesDir ?? '')
  const [claudeModel] = useState(store.claudeModel ?? '')
  const [localRules, setLocalRules] = useState<string[]>(store.rules ?? [])
  const [localPats, setLocalPats] = useState<LocalPAT[]>(store.pats ?? [])
  const [newRule, setNewRule] = useState('')
  const [newPatName, setNewPatName] = useState('')
  const [newPatValue, setNewPatValue] = useState('')
  const [revealedPats, setRevealedPats] = useState<Set<string>>(new Set())
  const [patError, setPatError] = useState('')
  const [importMsg, setImportMsg] = useState<{ text: string; type: 'success' | 'warn' | 'error' } | null>(null)
  const [initialTheme] = useState(store.theme)
  const [initialActiveCustomId] = useState(store.activeCustomThemeId)
  const [initialOverrides] = useState<ThemeOverrides>(() => JSON.parse(JSON.stringify(store.themeOverrides)))
  const [initialCustomThemes] = useState<CustomTheme[]>(() => JSON.parse(JSON.stringify(store.customThemes)))
  const [localOverrides, setLocalOverrides] = useState<ThemeOverrides>(() => JSON.parse(JSON.stringify(store.themeOverrides)))
  const [localCustomThemes, setLocalCustomThemes] = useState<CustomTheme[]>(() => JSON.parse(JSON.stringify(store.customThemes)))
  const [localActiveCustomId, setLocalActiveCustomId] = useState<string | null>(store.activeCustomThemeId)
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null) // null = list view, 'dark'/'light'/customId = edit view
  const [newThemeName, setNewThemeName] = useState('')

  // About tab state
  const [appVersion, setAppVersion] = useState('')
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })

  useEffect(() => {
    if (activeSection !== 'about') return

    let unsub: (() => void) | undefined

    try {
      window.api.getAppVersion().then(setAppVersion).catch(() => {})

      unsub = window.api.onUpdateStatus((data) => {
        switch (data.status) {
          case 'checking':
            setUpdateStatus({ state: 'checking' })
            break
          case 'available':
            setUpdateStatus({ state: 'available', version: data.version ?? '' })
            break
          case 'up-to-date':
            setUpdateStatus({ state: 'up-to-date' })
            break
          case 'downloading':
            setUpdateStatus({ state: 'downloading', percent: data.percent ?? 0 })
            break
          case 'ready':
            setUpdateStatus({ state: 'ready', version: data.version ?? '' })
            break
          case 'error':
            setUpdateStatus({ state: 'error', message: data.message ?? 'Unknown error' })
            break
        }
      })
    } catch {
      // API not available (e.g. preload not reloaded)
    }

    return () => unsub?.()
  }, [activeSection])

  // What are we editing?
  const editingIsBase = editingThemeId === 'dark' || editingThemeId === 'light'
  const editingCustom = editingThemeId && !editingIsBase ? localCustomThemes.find((t) => t.id === editingThemeId) : null
  const editingOverrides = editingCustom
    ? editingCustom.overrides
    : editingIsBase
      ? localOverrides[editingThemeId as 'dark' | 'light']
      : {}
  const editingLabel = editingCustom
    ? editingCustom.name
    : editingThemeId === 'dark'
      ? 'Dark'
      : editingThemeId === 'light'
        ? 'Light'
        : ''
  const editingBase: 'dark' | 'light' = editingCustom ? editingCustom.base : (editingThemeId as 'dark' | 'light') ?? store.theme

  const handleOverrideChange = (overrides: ThemeTemplate): void => {
    if (editingCustom) {
      const updated = localCustomThemes.map((t) =>
        t.id === editingCustom.id ? { ...t, overrides } : t
      )
      setLocalCustomThemes(updated)
      // Apply live if this custom theme is selected
      if (localActiveCustomId === editingCustom.id) {
        applyCssOverridesLive(overrides)
      }
    } else if (editingIsBase) {
      const base = editingThemeId as 'dark' | 'light'
      const next = { ...localOverrides, [base]: overrides }
      setLocalOverrides(next)
      // Apply live if this base theme is active and no custom theme selected
      if (store.theme === base && !localActiveCustomId) {
        store.setThemeOverrides(base, overrides)
      }
    }
  }

  const handleImport = async (): Promise<void> => {
    const data = await window.api.importTheme()
    if (!data) return
    const imported = data as { css?: Record<string, string>; terminal?: Record<string, string>; base?: string }
    const merged: ThemeTemplate = { ...editingOverrides }
    if (imported.css && typeof imported.css === 'object') {
      for (const [k, v] of Object.entries(imported.css)) {
        if (typeof v === 'string') merged[k] = v
      }
    }
    if (imported.terminal && typeof imported.terminal === 'object') {
      for (const [k, v] of Object.entries(imported.terminal)) {
        if (typeof v === 'string') merged[k] = v
      }
    }
    handleOverrideChange(merged)
  }

  const handleExport = async (): Promise<void> => {
    const css: Record<string, string> = {}
    const terminal: Record<string, string> = {}
    for (const [k, v] of Object.entries(editingOverrides)) {
      if (k.startsWith('--')) css[k] = v
      else terminal[k] = v
    }
    const exportObj = {
      name: editingCustom?.name ?? `Custom ${store.theme.charAt(0).toUpperCase() + store.theme.slice(1)}`,
      base: store.theme,
      css,
      terminal,
    }
    await window.api.exportTheme(JSON.stringify(exportObj, null, 2))
  }

  const handleCreateCustomTheme = (): void => {
    const name = newThemeName.trim()
    if (!name) return
    const id = crypto.randomUUID()
    // Clone current effective overrides as starting point
    const cloned: ThemeTemplate = { ...editingOverrides }
    const custom: CustomTheme = { id, name, base: store.theme, overrides: cloned }
    setLocalCustomThemes((prev) => [...prev, custom])
    setLocalActiveCustomId(id)
    setNewThemeName('')
    // Apply it live
    applyCssOverridesLive(cloned)
  }

  const handleDeleteCustomTheme = (id: string): void => {
    setLocalCustomThemes((prev) => prev.filter((t) => t.id !== id))
    if (localActiveCustomId === id) {
      setLocalActiveCustomId(null)
      // Revert to base theme overrides
      store.setThemeOverrides(store.theme, localOverrides[store.theme])
    }
  }

  const handleSelectCustomTheme = (id: string): void => {
    const custom = localCustomThemes.find((t) => t.id === id)
    if (!custom) return
    setLocalActiveCustomId(id)
    document.documentElement.setAttribute('data-theme', custom.base)
    applyCssOverridesLive(custom.overrides)
    window.api.changeTheme(custom.base)
  }

  const handleSelectBaseTheme = (theme: 'dark' | 'light'): void => {
    setLocalActiveCustomId(null)
    store.setTheme(theme)
    store.setThemeOverrides(theme, localOverrides[theme])
  }

  /** Apply CSS overrides directly (for custom theme live preview) */
  function applyCssOverridesLive(overrides: ThemeTemplate): void {
    const el = document.documentElement
    const toRemove: string[] = []
    for (let i = 0; i < el.style.length; i++) {
      const prop = el.style[i]
      if (prop.startsWith('--')) toRemove.push(prop)
    }
    toRemove.forEach((p) => el.style.removeProperty(p))
    for (const [key, value] of Object.entries(overrides)) {
      if (key.startsWith('--') && value) el.style.setProperty(key, value)
    }
  }

  const revertAll = (): void => {
    // Revert theme
    if (initialActiveCustomId) {
      const orig = initialCustomThemes.find((t) => t.id === initialActiveCustomId)
      if (orig) {
        document.documentElement.setAttribute('data-theme', orig.base)
        applyCssOverridesLive(orig.overrides)
        window.api.changeTheme(orig.base)
      }
    } else {
      store.setTheme(initialTheme)
      store.setThemeOverrides('dark', initialOverrides.dark)
      store.setThemeOverrides('light', initialOverrides.light)
    }
  }

  const handleCancel = (): void => {
    revertAll()
    onClose()
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        revertAll()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handlePickFolder = async (): Promise<void> => {
    const folder = await window.api.pickFolder()
    if (folder) setProjectDir(folder)
  }

  const handlePickNotesFolder = async (): Promise<void> => {
    const folder = await window.api.pickFolder()
    if (folder) setNotesDir(folder)
  }

  const handleAddRule = (): void => {
    const trimmed = newRule.trim()
    if (!trimmed) return
    setLocalRules((prev) => [...prev, trimmed])
    setNewRule('')
  }

  const handleRemoveRule = (index: number): void => {
    setLocalRules((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAddPat = (): void => {
    const name = newPatName.trim()
    const value = newPatValue.trim()
    if (!name || !value) return
    if (localPats.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      setPatError('A PAT with this name already exists.')
      return
    }
    setPatError('')
    setLocalPats((prev) => [...prev, { id: crypto.randomUUID(), name, value }])
    setNewPatName('')
    setNewPatValue('')
  }

  const handleRemovePat = (id: string): void => {
    setLocalPats((prev) => prev.filter((p) => p.id !== id))
  }

  const toggleReveal = (id: string): void => {
    setRevealedPats((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = async (): Promise<void> => {
    await window.api.saveSettings({
      defaultProjectDir: projectDir.trim(),
      claudeModel: claudeModel.trim(),
      notesDir: notesDir.trim(),
      rules: localRules,
      pats: localPats,
      theme: store.theme,
      themeOverrides: localOverrides,
      customThemes: localCustomThemes,
      activeCustomThemeId: localActiveCustomId,
    })
    await store.load()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'var(--bg-overlay)', backdropFilter: 'blur(4px)' }}
      onMouseDown={handleCancel}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 780,
          height: 560,
          borderRadius: 14,
          border: '1px solid var(--border-primary)',
          backgroundColor: 'var(--bg-elevated)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 0', marginBottom: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>Settings</h2>
        </div>

        {/* Body: sidebar + content */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', marginTop: 16 }}>
          {/* Left nav */}
          <nav style={{ width: 160, borderRight: '1px solid var(--border-primary)', padding: '0 12px', flexShrink: 0 }}>
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                  marginBottom: 2,
                  backgroundColor: activeSection === s.id ? 'var(--bg-active)' : 'transparent',
                  color: activeSection === s.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                }}
              >
                {s.label}
              </button>
            ))}
          </nav>

          {/* Right content */}
          <div style={{ flex: 1, padding: '0 24px', overflowY: 'auto' }}>
            {activeSection === 'general' && (
              <div>
                <div style={{ marginBottom: 24 }}>
                  <label style={labelStyle}>Default Project Directory</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={projectDir}
                      onChange={(e) => setProjectDir(e.target.value)}
                      placeholder="C:\Users\me\projects"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={handlePickFolder}
                      style={{
                        borderRadius: 8,
                        backgroundColor: 'var(--bg-button)',
                        padding: '10px 16px',
                        fontSize: 14,
                        color: 'var(--text-primary)',
                        border: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 4.5V12a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0014 12V6.5A1.5 1.5 0 0012.5 5H8L6.5 3H3.5A1.5 1.5 0 002 4.5z" />
                      </svg>
                      Browse
                    </button>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    Pre-fills the project directory when creating new cards.
                  </p>
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label style={labelStyle}>Notes Folder</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={notesDir}
                      onChange={(e) => setNotesDir(e.target.value)}
                      placeholder="Default: app data folder"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={handlePickNotesFolder}
                      style={{
                        borderRadius: 8,
                        backgroundColor: 'var(--bg-button)',
                        padding: '10px 16px',
                        fontSize: 14,
                        color: 'var(--text-primary)',
                        border: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 4.5V12a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0014 12V6.5A1.5 1.5 0 0012.5 5H8L6.5 3H3.5A1.5 1.5 0 002 4.5z" />
                      </svg>
                      Browse
                    </button>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    Where Notes &amp; Docs markdown files are stored. Point it at a real folder (e.g. a repo) to edit and version them outside the app. Leave blank to use the default app-data location.
                  </p>
                </div>
              </div>
            )}

            {activeSection === 'rules' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                    Instructions applied to every Claude Code session via CLAUDE.md.
                  </p>
                  {projectDir.trim() && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={async () => {
                          setImportMsg(null)
                          const result = await window.api.readClaudeMdRules(projectDir.trim())
                          if (result.error) {
                            setImportMsg({ text: result.error, type: 'error' })
                            return
                          }
                          if (result.rules.length === 0) {
                            setImportMsg({ text: 'No rules found in CLAUDE.md (add markdown list items like "- rule text")', type: 'warn' })
                            return
                          }
                          const newRules = result.rules.filter((r) => !localRules.includes(r))
                          if (newRules.length === 0) {
                            setImportMsg({ text: `Found ${result.rules.length} rule${result.rules.length > 1 ? 's' : ''}, but all already exist`, type: 'warn' })
                            return
                          }
                          setLocalRules((prev) => [...prev, ...newRules])
                          setImportMsg({ text: `Imported ${newRules.length} rule${newRules.length > 1 ? 's' : ''}`, type: 'success' })
                        }}
                        style={smallBtnStyle}
                        title="Import rules from CLAUDE.md"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 3v7M5 7l3 3 3-3" />
                          <path d="M3 12h10" />
                        </svg>
                        Import Rules
                      </button>
                      <button
                        type="button"
                        onClick={() => window.api.openFile(projectDir.trim() + '\\CLAUDE.md')}
                        style={{ ...smallBtnStyle, backgroundColor: '#dc2626', color: '#fff' }}
                        title="Open CLAUDE.md in default editor"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z" />
                          <path d="M9 2v4h4" />
                        </svg>
                        Open CLAUDE.md
                      </button>
                    </div>
                  )}
                </div>

                {importMsg && (
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    marginBottom: 10,
                    fontSize: 12,
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: importMsg.type === 'error' ? 'rgba(239,68,68,0.15)'
                      : importMsg.type === 'warn' ? 'rgba(234,179,8,0.15)'
                      : 'rgba(34,197,94,0.15)',
                    color: importMsg.type === 'error' ? '#f87171'
                      : importMsg.type === 'warn' ? '#eab308'
                      : '#22c55e',
                    border: `1px solid ${importMsg.type === 'error' ? 'rgba(239,68,68,0.3)'
                      : importMsg.type === 'warn' ? 'rgba(234,179,8,0.3)'
                      : 'rgba(34,197,94,0.3)'}`,
                  }}>
                    <span>{importMsg.text}</span>
                    <button
                      type="button"
                      onClick={() => setImportMsg(null)}
                      style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, marginLeft: 'auto', display: 'flex' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M12 4L4 12M4 4l8 8" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Existing rules list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                  {localRules.map((rule, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        backgroundColor: 'var(--bg-input)',
                        borderRadius: 6,
                        padding: '8px 12px',
                        border: '1px solid var(--border-primary)',
                      }}
                    >
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{rule}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveRule(i)}
                        style={removeBtnStyle}
                        title="Remove rule"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M12 4L4 12M4 4l8 8" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {localRules.length === 0 && (
                    <p style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>No rules yet.</p>
                  )}
                </div>

                {/* Add new rule */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={newRule}
                    onChange={(e) => setNewRule(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleAddRule() }}
                    placeholder="e.g., Always create a new branch"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button type="button" onClick={handleAddRule} style={smallBtnStyle} title="Add rule">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M8 3v10M3 8h10" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {activeSection === 'pats' && (
              <div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                  Injected as environment variables in every session.
                </p>

                {/* Existing PATs list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                  {localPats.map((pat) => (
                    <div
                      key={pat.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        backgroundColor: 'var(--bg-input)',
                        borderRadius: 6,
                        padding: '8px 12px',
                        border: '1px solid var(--border-primary)',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{pat.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          ENV: {derivePATEnvName(pat.name)}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'monospace' }}>
                          {revealedPats.has(pat.id) ? pat.value : '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleReveal(pat.id)}
                        style={removeBtnStyle}
                        title={revealedPats.has(pat.id) ? 'Hide value' : 'Reveal value'}
                      >
                        {revealedPats.has(pat.id) ? (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 2l12 12" />
                            <path d="M6.5 6.5a2 2 0 002.8 2.8" />
                            <path d="M4.2 4.2C3 5.1 2.1 6.4 1.5 8c1.2 3.2 4 5 6.5 5 1 0 2-.3 2.9-.8" />
                            <path d="M14.5 8c-1.2-3.2-4-5-6.5-5-.6 0-1.1.1-1.6.2" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1.5 8c1.2-3.2 4-5 6.5-5s5.3 1.8 6.5 5c-1.2 3.2-4 5-6.5 5S2.7 11.2 1.5 8z" />
                            <circle cx="8" cy="8" r="2" />
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemovePat(pat.id)}
                        style={removeBtnStyle}
                        title="Remove PAT"
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <path d="M12 4L4 12M4 4l8 8" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {localPats.length === 0 && (
                    <p style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic' }}>No PATs configured.</p>
                  )}
                </div>

                {/* Add new PAT */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={newPatName}
                      onChange={(e) => { setNewPatName(e.target.value); setPatError('') }}
                      placeholder="Name (e.g., Azure DevOps)"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <input
                      type="password"
                      value={newPatValue}
                      onChange={(e) => setNewPatValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddPat() }}
                      placeholder="Token value"
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button type="button" onClick={handleAddPat} style={smallBtnStyle} title="Add PAT">
                      Add
                    </button>
                  </div>
                  {patError && (
                    <p style={{ fontSize: 11, color: '#f87171', margin: 0 }}>{patError}</p>
                  )}
                </div>
              </div>
            )}

            {activeSection === 'theme' && !editingThemeId && (
              <div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                  Choose your preferred appearance.
                </p>

                {/* Default theme cards */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  {/* Dark */}
                  <div
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      border: store.theme === 'dark' && !localActiveCustomId ? '2px solid var(--accent)' : '2px solid var(--border-primary)',
                      backgroundColor: 'var(--bg-surface)',
                      padding: '12px',
                      textAlign: 'center',
                      position: 'relative',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectBaseTheme('dark')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'center' }}
                    >
                      <div style={{
                        width: '100%', height: 36, borderRadius: 6,
                        backgroundColor: '#0d1117', border: '1px solid #30363d', marginBottom: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      }}>
                        <div style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: '#e6edf3' }} />
                        <div style={{ width: 16, height: 4, borderRadius: 2, backgroundColor: '#9198a1' }} />
                        <div style={{ width: 20, height: 4, borderRadius: 2, backgroundColor: '#656d76' }} />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Dark</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingThemeId('dark')}
                      title="Edit dark theme"
                      style={{
                        position: 'absolute', top: 6, right: 6,
                        backgroundColor: 'var(--bg-button)', border: '1px solid var(--border-primary)', cursor: 'pointer',
                        color: 'var(--text-secondary)', padding: '3px 5px', borderRadius: 5,
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11.5 1.5l3 3L5 14H2v-3z" />
                      </svg>
                    </button>
                  </div>
                  {/* Light */}
                  <div
                    style={{
                      flex: 1,
                      borderRadius: 10,
                      border: store.theme === 'light' && !localActiveCustomId ? '2px solid var(--accent)' : '2px solid var(--border-primary)',
                      backgroundColor: 'var(--bg-surface)',
                      padding: '12px',
                      textAlign: 'center',
                      position: 'relative',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectBaseTheme('light')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'center' }}
                    >
                      <div style={{
                        width: '100%', height: 36, borderRadius: 6,
                        backgroundColor: '#ffffff', border: '1px solid #d0d7de', marginBottom: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                      }}>
                        <div style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: '#1f2328' }} />
                        <div style={{ width: 16, height: 4, borderRadius: 2, backgroundColor: '#59636e' }} />
                        <div style={{ width: 20, height: 4, borderRadius: 2, backgroundColor: '#8b949e' }} />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Light</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingThemeId('light')}
                      title="Edit light theme"
                      style={{
                        position: 'absolute', top: 6, right: 6,
                        backgroundColor: 'var(--bg-button)', border: '1px solid var(--border-primary)', cursor: 'pointer',
                        color: 'var(--text-secondary)', padding: '3px 5px', borderRadius: 5,
                        display: 'flex', alignItems: 'center',
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11.5 1.5l3 3L5 14H2v-3z" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Custom themes */}
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Custom Themes</div>

                {localCustomThemes.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                    {localCustomThemes.map((ct) => (
                      <div
                        key={ct.id}
                        onClick={() => handleSelectCustomTheme(ct.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: localActiveCustomId === ct.id ? '2px solid var(--accent)' : '2px solid var(--border-primary)',
                          backgroundColor: 'var(--bg-surface)',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                          {['--bg-primary', '--text-primary', '--accent'].map((key) => {
                            const cssDefaults = ct.base === 'dark'
                              ? { '--bg-primary': '#0d1117', '--text-primary': '#e6edf3', '--accent': '#2563eb' }
                              : { '--bg-primary': '#ffffff', '--text-primary': '#1f2328', '--accent': '#2563eb' }
                            const color = ct.overrides[key] || cssDefaults[key as keyof typeof cssDefaults] || '#888'
                            return <div key={key} style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: color, border: '1px solid var(--border-primary)' }} />
                          })}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{ct.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Based on {ct.base}</div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setEditingThemeId(ct.id) }}
                          title="Edit theme"
                          style={{
                            backgroundColor: 'var(--bg-button)', border: '1px solid var(--border-primary)', cursor: 'pointer',
                            color: 'var(--text-secondary)', padding: '3px 5px', borderRadius: 5,
                            display: 'flex', alignItems: 'center',
                          }}
                        >
                          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11.5 1.5l3 3L5 14H2v-3z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteCustomTheme(ct.id) }}
                          style={removeBtnStyle}
                          title="Delete theme"
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <path d="M12 4L4 12M4 4l8 8" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {localCustomThemes.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-faint)', fontStyle: 'italic', marginBottom: 12 }}>No custom themes yet.</p>
                )}

                {/* Create new theme */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={newThemeName}
                    onChange={(e) => setNewThemeName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCustomTheme() }}
                    placeholder="New theme name..."
                    style={{ ...inputStyle, flex: 1, padding: '7px 12px', fontSize: 13 }}
                  />
                  <button
                    type="button"
                    onClick={handleCreateCustomTheme}
                    style={{ ...smallBtnStyle, fontSize: 12 }}
                    title="Create custom theme from currently selected"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M8 3v10M3 8h10" />
                    </svg>
                    Create
                  </button>
                </div>
              </div>
            )}

            {activeSection === 'about' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 16 }}>
                {/* Logo + Name */}
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ marginBottom: 12 }}>
                  <rect width="48" height="48" rx="12" fill="var(--accent)" />
                  <path d="M14 16h20v2H14zm0 7h20v2H14zm0 7h14v2H14z" fill="#fff" />
                </svg>
                <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  Claude Code Orchestrator
                </h3>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                  v{appVersion || '...'}
                </p>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 12,
                    padding: '5px 12px',
                    borderRadius: 8,
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-primary)',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" style={{ color: 'var(--text-secondary)' }} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="12" height="10" rx="1.5" />
                    <path d="M5 7h6M5 9.5h4" />
                  </svg>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>
                    {formatModelName(claudeModel)}
                  </span>
                </div>
                <p style={{
                  fontSize: 13,
                  color: 'var(--text-secondary)',
                  textAlign: 'center',
                  maxWidth: 360,
                  lineHeight: 1.5,
                  margin: '16px 0 24px',
                }}>
                  A desktop Kanban board for managing parallel Claude Code CLI sessions.
                </p>

                {/* Update button / status */}
                <div style={{ width: '100%', maxWidth: 320, textAlign: 'center' }}>
                  {updateStatus.state === 'idle' && (
                    <button
                      type="button"
                      onClick={() => window.api.checkForUpdate?.()}
                      style={{
                        ...smallBtnStyle,
                        width: '100%',
                        justifyContent: 'center',
                        padding: '10px 16px',
                        fontSize: 14,
                      }}
                    >
                      Check for Updates
                    </button>
                  )}

                  {updateStatus.state === 'checking' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0' }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
                        <circle cx="8" cy="8" r="6" stroke="var(--text-muted)" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
                      </svg>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Checking...</span>
                    </div>
                  )}

                  {updateStatus.state === 'available' && (
                    <button
                      type="button"
                      onClick={() => window.api.downloadUpdate?.()}
                      style={{
                        ...smallBtnStyle,
                        width: '100%',
                        justifyContent: 'center',
                        padding: '10px 16px',
                        fontSize: 14,
                        backgroundColor: 'var(--accent)',
                        color: '#fff',
                      }}
                    >
                      Update available (v{updateStatus.version}) — Download
                    </button>
                  )}

                  {updateStatus.state === 'downloading' && (
                    <div style={{ padding: '8px 0' }}>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        Downloading... {Math.round(updateStatus.percent)}%
                      </div>
                      <div style={{
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: 'var(--bg-input)',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${updateStatus.percent}%`,
                          borderRadius: 3,
                          backgroundColor: 'var(--accent)',
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                    </div>
                  )}

                  {updateStatus.state === 'ready' && (
                    <button
                      type="button"
                      onClick={() => window.api.installUpdate?.()}
                      style={{
                        ...smallBtnStyle,
                        width: '100%',
                        justifyContent: 'center',
                        padding: '10px 16px',
                        fontSize: 14,
                        backgroundColor: 'var(--accent)',
                        color: '#fff',
                      }}
                    >
                      Restart to Update (v{updateStatus.version})
                    </button>
                  )}

                  {updateStatus.state === 'up-to-date' && (
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '10px 0' }}>
                      You&apos;re up to date.
                    </p>
                  )}

                  {updateStatus.state === 'error' && (
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: 12, color: '#f87171', margin: '0 0 8px' }}>
                        {updateStatus.message}
                      </p>
                      <button
                        type="button"
                        onClick={() => { setUpdateStatus({ state: 'idle' }) }}
                        style={{ ...smallBtnStyle, margin: '0 auto', justifyContent: 'center', fontSize: 13 }}
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>

                {/* GitHub link */}
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); window.api.openFile('https://github.com/Sinofdreams/Claudinator') }}
                  style={{
                    fontSize: 12,
                    color: 'var(--accent)',
                    textDecoration: 'none',
                    marginTop: 24,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  View on GitHub
                </a>

                {/* Spinner keyframes */}
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              </div>
            )}

            {/* ── Edit view ── */}
            {activeSection === 'theme' && editingThemeId && (
              <div>
                {/* Header: back + theme name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <button
                    type="button"
                    onClick={() => setEditingThemeId(null)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-secondary)', padding: 2, display: 'flex', alignItems: 'center',
                    }}
                    title="Back to themes"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 3L5 8l5 5" />
                    </svg>
                  </button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                      Editing: {editingLabel}
                    </div>
                    {editingCustom && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Based on {editingCustom.base}</div>
                    )}
                  </div>
                </div>

                <ThemeEditor
                  theme={editingBase}
                  overrides={editingOverrides}
                  onChange={handleOverrideChange}
                  onImport={handleImport}
                  onExport={handleExport}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid var(--border-primary)' }}>
          <button
            type="button"
            onClick={handleCancel}
            style={{
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 14,
              color: 'var(--text-secondary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M12 4L4 12M4 4l8 8" />
            </svg>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            style={{
              borderRadius: 8,
              backgroundColor: 'var(--accent)',
              padding: '8px 20px',
              fontSize: 14,
              fontWeight: 500,
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 8.5l3 3 6-6" />
            </svg>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
