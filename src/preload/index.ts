import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
import {
  BoardState,
  SessionInfo,
  ThemeOverrides,
  CustomTheme,
  NotesTree,
  GitBranchesResult
} from '@shared/models'
import type { StatsSummary } from '@shared/stats'

const api = {
  // Board
  loadBoard: (): Promise<BoardState> => ipcRenderer.invoke(IPC.BOARD_LOAD),
  saveBoard: (state: BoardState): Promise<void> => ipcRenderer.invoke(IPC.BOARD_SAVE, state),

  // Dialog
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.DIALOG_PICK_FOLDER),

  // Session
  startSession: (args: {
    cardId: string
    cardTitle: string
    projectDir: string
    claudeSessionId?: string | null
  }): Promise<SessionInfo> => ipcRenderer.invoke(IPC.SESSION_START, args),

  stopSession: (sessionId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.SESSION_STOP, sessionId),

  writeSession: (sessionId: string, data: string): Promise<void> =>
    ipcRenderer.invoke(IPC.SESSION_WRITE, sessionId, data),

  resizeSession: (sessionId: string, cols: number, rows: number): Promise<void> =>
    ipcRenderer.invoke(IPC.SESSION_RESIZE, sessionId, cols, rows),

  getSessionBuffer: (sessionId: string): Promise<string> =>
    ipcRenderer.invoke(IPC.SESSION_BUFFER, sessionId),

  listSessions: (): Promise<SessionInfo[]> => ipcRenderer.invoke(IPC.SESSION_LIST),

  getSessionCwd: (sessionId: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.SESSION_CWD, sessionId),

  getContextInfo: (sessionId: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.SESSION_CONTEXT, sessionId),

  // Git
  getGitStatus: (
    projectDir: string,
    sessionId?: string
  ): Promise<{ branch: string; files: { path: string; status: string }[] }> =>
    ipcRenderer.invoke(IPC.GIT_STATUS, projectDir, sessionId),

  getGitDiff: (projectDir: string, filePath: string): Promise<string> =>
    ipcRenderer.invoke(IPC.GIT_DIFF, projectDir, filePath),

  getGitBranches: (projectDir: string, sessionId?: string): Promise<GitBranchesResult> =>
    ipcRenderer.invoke(IPC.GIT_BRANCHES, projectDir, sessionId),

  addWorktree: (
    projectDir: string,
    branch: string,
    baseRef: string,
    createBranch: boolean,
    installDeps?: boolean
  ): Promise<{ path: string; branch: string; installError?: string }> =>
    ipcRenderer.invoke(IPC.GIT_WORKTREE_ADD, projectDir, branch, baseRef, createBranch, installDeps),

  removeWorktree: (projectDir: string, worktreePath: string, force?: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.GIT_WORKTREE_REMOVE, projectDir, worktreePath, force),

  mergeBackWorktree: (
    projectDir: string,
    worktreePath: string,
    branch: string
  ): Promise<{ mergedInto: string; warning?: string }> =>
    ipcRenderer.invoke(IPC.GIT_WORKTREE_MERGE_BACK, projectDir, worktreePath, branch),

  // Stats
  getTodayStats: (): Promise<{
    date: string
    tokens: number
    messages: number
    sessions: number
    toolCalls: number
  }> => ipcRenderer.invoke(IPC.STATS_TODAY),
  getStatsSummary: (rangeDays?: number, force?: boolean): Promise<StatsSummary | null> =>
    ipcRenderer.invoke(IPC.STATS_SUMMARY, rangeDays, force),
  getSessionCost: (
    sessionDir: string,
    claudeSessionId: string
  ): Promise<{ cost: number; tokens: number } | null> =>
    ipcRenderer.invoke(IPC.STATS_SESSION_COST, sessionDir, claudeSessionId),

  // Settings
  loadSettings: (): Promise<{
    defaultProjectDir: string
    claudeModel: string
    notesDir: string
    rules: string[]
    pats: { id: string; name: string; value: string }[]
    theme: 'dark' | 'light'
    themeOverrides: ThemeOverrides
    customThemes: CustomTheme[]
    activeCustomThemeId: string | null
  }> => ipcRenderer.invoke(IPC.SETTINGS_LOAD),
  saveSettings: (settings: {
    defaultProjectDir: string
    claudeModel: string
    notesDir: string
    rules: string[]
    pats: { id: string; name: string; value: string }[]
    theme: 'dark' | 'light'
    themeOverrides: ThemeOverrides
    customThemes: CustomTheme[]
    activeCustomThemeId: string | null
  }): Promise<void> => ipcRenderer.invoke(IPC.SETTINGS_SAVE, settings),
  changeTheme: (theme: 'dark' | 'light'): Promise<void> =>
    ipcRenderer.invoke(IPC.THEME_CHANGE, theme),
  setTitleBarDim: (dimmed: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.TITLEBAR_DIM, dimmed),
  addRule: (rule: string): Promise<string[]> =>
    ipcRenderer.invoke(IPC.SETTINGS_ADD_RULE, rule),
  importTheme: (): Promise<Record<string, unknown> | null> =>
    ipcRenderer.invoke(IPC.THEME_IMPORT),
  exportTheme: (themeJson: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC.THEME_EXPORT, themeJson),
  openFile: (filePath: string): Promise<string> =>
    ipcRenderer.invoke(IPC.OPEN_FILE, filePath),
  readClaudeMdRules: (projectDir: string): Promise<{ rules: string[]; error?: string }> =>
    ipcRenderer.invoke(IPC.CLAUDE_MD_READ, projectDir),

  // Notes (markdown library)
  listNotes: (): Promise<NotesTree> => ipcRenderer.invoke(IPC.NOTES_LIST),
  readNote: (name: string): Promise<string> => ipcRenderer.invoke(IPC.NOTES_READ, name),
  saveNote: (name: string, content: string): Promise<void> =>
    ipcRenderer.invoke(IPC.NOTES_SAVE, name, content),
  createNote: (name: string): Promise<string> => ipcRenderer.invoke(IPC.NOTES_CREATE, name),
  deleteNote: (name: string): Promise<void> => ipcRenderer.invoke(IPC.NOTES_DELETE, name),
  renameNote: (oldName: string, newName: string): Promise<string> =>
    ipcRenderer.invoke(IPC.NOTES_RENAME, oldName, newName),
  moveNote: (notePath: string, targetFolder: string): Promise<string> =>
    ipcRenderer.invoke(IPC.NOTES_MOVE, notePath, targetFolder),
  createFolder: (path: string): Promise<string> =>
    ipcRenderer.invoke(IPC.NOTES_CREATE_FOLDER, path),
  renameFolder: (oldPath: string, newName: string): Promise<string> =>
    ipcRenderer.invoke(IPC.NOTES_RENAME_FOLDER, oldPath, newName),
  deleteFolder: (path: string): Promise<void> =>
    ipcRenderer.invoke(IPC.NOTES_DELETE_FOLDER, path),
  moveFolder: (folderPath: string, targetFolder: string): Promise<string> =>
    ipcRenderer.invoke(IPC.NOTES_MOVE_FOLDER, folderPath, targetFolder),
  getNotesDir: (): Promise<string> => ipcRenderer.invoke(IPC.NOTES_DIR),
  getNoteSession: (name: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.NOTES_GET_SESSION, name),
  setNoteSession: (name: string, sessionId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.NOTES_SET_SESSION, name, sessionId),

  // App / Update
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC.APP_VERSION),
  notify: (args: { title: string; body: string; sessionId: string }): Promise<void> =>
    ipcRenderer.invoke(IPC.APP_NOTIFY, args),
  flashFrame: (): Promise<void> => ipcRenderer.invoke(IPC.APP_FLASH_FRAME),
  onNotificationClick: (callback: (sessionId: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string): void => {
      callback(sessionId)
    }
    ipcRenderer.on(IPC.APP_NOTIFY_CLICK, handler)
    return () => ipcRenderer.removeListener(IPC.APP_NOTIFY_CLICK, handler)
  },
  checkForUpdate: (): Promise<unknown> => ipcRenderer.invoke(IPC.UPDATE_CHECK),
  downloadUpdate: (): Promise<unknown> => ipcRenderer.invoke(IPC.UPDATE_DOWNLOAD),
  installUpdate: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_INSTALL),
  onUpdateStatus: (
    callback: (data: { status: string; version?: string; percent?: number; message?: string }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { status: string; version?: string; percent?: number; message?: string }
    ): void => {
      callback(data)
    }
    ipcRenderer.on(IPC.UPDATE_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_STATUS, handler)
  },

  // Claude CLI (the `claude` binary sessions run)
  getCliVersion: (): Promise<{ version: string | null; error?: string }> =>
    ipcRenderer.invoke(IPC.CLI_VERSION),
  updateCli: (): Promise<{
    ok: boolean
    from?: string
    to?: string
    alreadyLatest: boolean
    output: string
    error?: string
  }> => ipcRenderer.invoke(IPC.CLI_UPDATE),

  // Detached markdown preview window
  openPreview: (): Promise<void> => ipcRenderer.invoke(IPC.PREVIEW_OPEN),
  closePreview: (): Promise<void> => ipcRenderer.invoke(IPC.PREVIEW_CLOSE),
  updatePreview: (data: { html: string; theme: 'dark' | 'light'; title: string }): void =>
    ipcRenderer.send(IPC.PREVIEW_UPDATE, data),
  previewReady: (): void => ipcRenderer.send(IPC.PREVIEW_READY),
  onPreviewData: (
    callback: (data: { html: string; theme: 'dark' | 'light'; title: string }) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { html: string; theme: 'dark' | 'light'; title: string }
    ): void => {
      callback(data)
    }
    ipcRenderer.on(IPC.PREVIEW_DATA, handler)
    return () => ipcRenderer.removeListener(IPC.PREVIEW_DATA, handler)
  },
  onPreviewClosed: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on(IPC.PREVIEW_CLOSED, handler)
    return () => ipcRenderer.removeListener(IPC.PREVIEW_CLOSED, handler)
  },
  // Popout asks the editor to reload the active note from disk and re-stream it.
  requestPreviewRefresh: (): void => ipcRenderer.send(IPC.PREVIEW_REFRESH),
  onPreviewRefresh: (callback: () => void): (() => void) => {
    const handler = (): void => callback()
    ipcRenderer.on(IPC.PREVIEW_REFRESH, handler)
    return () => ipcRenderer.removeListener(IPC.PREVIEW_REFRESH, handler)
  },

  // Session event listeners
  onSessionData: (callback: (sessionId: string, data: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sessionId: string, data: string): void => {
      callback(sessionId, data)
    }
    ipcRenderer.on(IPC.SESSION_DATA, handler)
    return () => ipcRenderer.removeListener(IPC.SESSION_DATA, handler)
  },

  onSessionExit: (
    callback: (sessionId: string, code: number | undefined) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      sessionId: string,
      code: number | undefined
    ): void => {
      callback(sessionId, code)
    }
    ipcRenderer.on(IPC.SESSION_EXIT, handler)
    return () => ipcRenderer.removeListener(IPC.SESSION_EXIT, handler)
  },

  onClaudeSessionId: (
    callback: (sessionId: string, claudeConversationId: string) => void
  ): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      sessionId: string,
      claudeConversationId: string
    ): void => {
      callback(sessionId, claudeConversationId)
    }
    ipcRenderer.on(IPC.SESSION_CLAUDE_ID, handler)
    return () => ipcRenderer.removeListener(IPC.SESSION_CLAUDE_ID, handler)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
