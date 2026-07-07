import { registerBoardIpc } from './board-ipc'
import { registerDialogIpc } from './dialog-ipc'
import { registerGitIpc } from './git-ipc'
import { registerSessionIpc } from './session-ipc'
import { registerStatsIpc } from './stats-ipc'
import { registerSettingsIpc } from './settings-ipc'
import { registerUpdateIpc } from './update-ipc'
import { registerCliIpc } from './cli-ipc'
import { registerNotesIpc } from './notes-ipc'
import { registerPreviewIpc } from './preview-ipc'
import { registerNotifyIpc } from './notify-ipc'

export function registerAllIpc(): void {
  registerBoardIpc()
  registerDialogIpc()
  registerGitIpc()
  registerSessionIpc()
  registerStatsIpc()
  registerSettingsIpc()
  registerUpdateIpc()
  registerCliIpc()
  registerNotesIpc()
  registerPreviewIpc()
  registerNotifyIpc()
}
