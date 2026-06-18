export type ColumnId = 'todo' | 'in-progress' | 'to-review' | 'testing' | 'done'

export interface Card {
  id: string
  title: string
  description: string
  projectDir: string
  columnId: ColumnId
  order: number
  sessionId: string | null
  claudeSessionId: string | null
  tags: string[]
  createdAt: number
  updatedAt: number
}

export interface Column {
  id: ColumnId
  title: string
  cardIds: string[]
}

export interface BoardState {
  version: number
  columns: Column[]
  cards: Record<string, Card>
  lastSaved: number
}

export interface NoteMeta {
  path: string // relative id, '/'-separated, without .md (e.g. "AFE/Spec")
  name: string // leaf display name (last path segment)
  createdAt: number
  updatedAt: number
  size: number
}

export interface NotesTree {
  notes: NoteMeta[]
  folders: string[] // relative folder paths, '/'-separated (includes empty folders)
}

export type SessionStatus =
  | 'starting'
  | 'running'
  | 'waiting' // finished — waiting for your prompt
  | 'decision' // waiting for you to answer a yes/no / permission / plan prompt
  | 'stopped'
  | 'error'

export interface SessionInfo {
  id: string
  cardId: string
  projectDir: string
  status: SessionStatus
  claudeSessionId: string | null
  pid: number | null
}

export const DEFAULT_COLUMNS: Column[] = [
  { id: 'todo', title: 'BACKLOG', cardIds: [] },
  { id: 'in-progress', title: 'IN PROGRESS', cardIds: [] },
  { id: 'to-review', title: 'REVIEW', cardIds: [] },
  { id: 'testing', title: 'VALIDATING', cardIds: [] },
  { id: 'done', title: 'COMPLETE', cardIds: [] }
]

export type ThemeTemplate = Record<string, string>

export interface ThemeOverrides {
  dark: ThemeTemplate
  light: ThemeTemplate
}

export interface CustomTheme {
  id: string
  name: string
  base: 'dark' | 'light'
  overrides: ThemeTemplate
}

export function createDefaultBoard(): BoardState {
  return {
    version: 1,
    columns: DEFAULT_COLUMNS.map((c) => ({ ...c, cardIds: [] })),
    cards: {},
    lastSaved: Date.now()
  }
}
