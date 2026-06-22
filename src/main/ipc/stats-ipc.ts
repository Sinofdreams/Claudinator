import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { computeStatsSummary } from '../services/stats-aggregator'
import type { StatsSummary } from '@shared/stats'

interface TodayStats {
  date: string
  tokens: number
  messages: number
  sessions: number
  toolCalls: number
}

export function registerStatsIpc(): void {
  // Badge: today's usage, computed live from session transcripts.
  ipcMain.handle(IPC.STATS_TODAY, async (): Promise<TodayStats> => {
    try {
      const summary = await computeStatsSummary()
      const t = summary.today
      return {
        date: t.date,
        tokens: t.tokens,
        messages: t.messages,
        sessions: t.sessions,
        toolCalls: t.toolCalls
      }
    } catch {
      return { date: '', tokens: 0, messages: 0, sessions: 0, toolCalls: 0 }
    }
  })

  // Full dashboard summary for a given time window (rangeDays: 0 = all time).
  ipcMain.handle(
    IPC.STATS_SUMMARY,
    async (_e, rangeDays?: number, force?: boolean): Promise<StatsSummary | null> => {
      try {
        return await computeStatsSummary(rangeDays ?? 0, !!force)
      } catch {
        return null
      }
    }
  )
}
