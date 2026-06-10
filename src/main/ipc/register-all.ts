import { registerBoardIpc } from './board-ipc'
import { registerDialogIpc } from './dialog-ipc'
import { registerGitIpc } from './git-ipc'
import { registerSessionIpc } from './session-ipc'
import { registerStatsIpc } from './stats-ipc'
import { registerSettingsIpc } from './settings-ipc'
import { registerUpdateIpc } from './update-ipc'
import { registerNotesIpc } from './notes-ipc'

export function registerAllIpc(): void {
  registerBoardIpc()
  registerDialogIpc()
  registerGitIpc()
  registerSessionIpc()
  registerStatsIpc()
  registerSettingsIpc()
  registerUpdateIpc()
  registerNotesIpc()
}
