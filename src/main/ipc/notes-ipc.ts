import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import {
  listNotes,
  readNote,
  saveNote,
  createNote,
  deleteNote,
  renameNote,
  moveNote,
  createFolder,
  renameFolder,
  deleteFolder,
  moveFolder,
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
  ipcMain.handle(IPC.NOTES_MOVE, async (_event, notePath: string, targetFolder: string) =>
    moveNote(notePath, targetFolder)
  )
  ipcMain.handle(IPC.NOTES_MOVE_FOLDER, async (_event, folderPath: string, targetFolder: string) =>
    moveFolder(folderPath, targetFolder)
  )
  ipcMain.handle(IPC.NOTES_CREATE_FOLDER, async (_event, path: string) => createFolder(path))
  ipcMain.handle(IPC.NOTES_RENAME_FOLDER, async (_event, oldPath: string, newName: string) =>
    renameFolder(oldPath, newName)
  )
  ipcMain.handle(IPC.NOTES_DELETE_FOLDER, async (_event, path: string) => deleteFolder(path))
}
