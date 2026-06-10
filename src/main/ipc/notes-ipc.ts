import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import {
  listNotes,
  readNote,
  saveNote,
  createNote,
  deleteNote,
  renameNote,
  notesDir,
  getNoteSession,
  setNoteSession
} from '../services/notes-persistence'

export function registerNotesIpc(): void {
  ipcMain.handle(IPC.NOTES_LIST, async () => listNotes())
  ipcMain.handle(IPC.NOTES_READ, async (_event, name: string) => readNote(name))
  ipcMain.handle(IPC.NOTES_SAVE, async (_event, name: string, content: string) =>
    saveNote(name, content)
  )
  ipcMain.handle(IPC.NOTES_CREATE, async (_event, name: string) => createNote(name))
  ipcMain.handle(IPC.NOTES_DELETE, async (_event, name: string) => deleteNote(name))
  ipcMain.handle(IPC.NOTES_RENAME, async (_event, oldName: string, newName: string) =>
    renameNote(oldName, newName)
  )
  ipcMain.handle(IPC.NOTES_DIR, async () => notesDir())
  ipcMain.handle(IPC.NOTES_GET_SESSION, async (_event, name: string) => getNoteSession(name))
  ipcMain.handle(IPC.NOTES_SET_SESSION, async (_event, name: string, sessionId: string) =>
    setNoteSession(name, sessionId)
  )
}
