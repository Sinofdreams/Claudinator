export const IPC = {
  // Board
  BOARD_LOAD: 'board:load',
  BOARD_SAVE: 'board:save',

  // Dialog
  DIALOG_PICK_FOLDER: 'dialog:pick-folder',

  // Session
  SESSION_START: 'session:start',
  SESSION_STOP: 'session:stop',
  SESSION_WRITE: 'session:write',
  SESSION_RESIZE: 'session:resize',
  SESSION_DATA: 'session:data',
  SESSION_EXIT: 'session:exit',
  SESSION_BUFFER: 'session:buffer',
  SESSION_LIST: 'session:list',
  SESSION_CWD: 'session:cwd',
  SESSION_CLAUDE_ID: 'session:claude-id',
  SESSION_CONTEXT: 'session:context',

  // Git
  GIT_STATUS: 'git:status',
  GIT_DIFF: 'git:diff',
  GIT_BRANCHES: 'git:branches',
  GIT_WORKTREE_ADD: 'git:worktree-add',
  GIT_WORKTREE_REMOVE: 'git:worktree-remove',

  // Stats
  STATS_TODAY: 'stats:today',
  STATS_SUMMARY: 'stats:summary',

  // Settings
  SETTINGS_LOAD: 'settings:load',
  SETTINGS_SAVE: 'settings:save',
  SETTINGS_ADD_RULE: 'settings:add-rule',

  // CLAUDE.md
  CLAUDE_MD_READ: 'claudemd:read',

  // Notes (markdown library)
  NOTES_LIST: 'notes:list',
  NOTES_READ: 'notes:read',
  NOTES_SAVE: 'notes:save',
  NOTES_CREATE: 'notes:create',
  NOTES_DELETE: 'notes:delete',
  NOTES_RENAME: 'notes:rename',
  NOTES_DIR: 'notes:dir',
  NOTES_GET_SESSION: 'notes:get-session',
  NOTES_SET_SESSION: 'notes:set-session',
  NOTES_CREATE_FOLDER: 'notes:create-folder',
  NOTES_RENAME_FOLDER: 'notes:rename-folder',
  NOTES_DELETE_FOLDER: 'notes:delete-folder',
  NOTES_MOVE: 'notes:move',
  NOTES_MOVE_FOLDER: 'notes:move-folder',

  // Theme
  THEME_CHANGE: 'theme:change',
  THEME_IMPORT: 'theme:import',
  THEME_EXPORT: 'theme:export',
  TITLEBAR_DIM: 'titlebar:dim',

  // File
  OPEN_FILE: 'file:open',

  // App / Update
  APP_VERSION: 'app:version',
  APP_NOTIFY: 'app:notify',
  APP_NOTIFY_CLICK: 'app:notify-click',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  UPDATE_STATUS: 'update:status',

  // Claude CLI (the `claude` binary the sessions run)
  CLI_VERSION: 'cli:version',
  CLI_UPDATE: 'cli:update',

  // Detached markdown preview window
  PREVIEW_OPEN: 'preview:open',
  PREVIEW_CLOSE: 'preview:close',
  PREVIEW_UPDATE: 'preview:update',
  PREVIEW_DATA: 'preview:data',
  PREVIEW_READY: 'preview:ready',
  PREVIEW_CLOSED: 'preview:closed',
  PREVIEW_REFRESH: 'preview:refresh'
} as const
