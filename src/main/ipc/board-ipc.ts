import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { BoardState } from '@shared/models'
import { loadBoard, saveBoard } from '../services/board-persistence'
import { remoteServer } from '../services/remote-server'

export function registerBoardIpc(): void {
  ipcMain.handle(IPC.BOARD_LOAD, async () => {
    return await loadBoard()
  })

  ipcMain.handle(IPC.BOARD_SAVE, async (_event, state: BoardState) => {
    await saveBoard(state)
    remoteServer.notifyBoardChanged()
  })
}
