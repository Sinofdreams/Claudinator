import { v4 as uuid } from 'uuid'
import { SessionInfo, SessionStatus } from '@shared/models'
import { buildClaudeArgs } from './claude-cli'
import { isDecisionPrompt } from './attention'
import { readFile, writeFile, readdir, stat } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { PAT } from './settings-persistence'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Context window per model family (as of 2026-07): Fable/Mythos, Opus 4.6+,
 * and Sonnet 4.6+/5 have 1M; Haiku and older-generation models have 200k.
 */
function contextLimitFor(model: string): number {
  const m = model.toLowerCase()
  if (m.includes('haiku')) return 200_000
  // Older generations before the 1M window
  if (m.includes('opus-4-5') || m.includes('opus-4-1') || m.includes('opus-4-0') || m.includes('3-opus')) return 200_000
  if (m.includes('sonnet-4-5') || m.includes('sonnet-4-0') || m.includes('3-5-sonnet') || m.includes('3-7-sonnet')) return 200_000
  return 1_000_000
}

const BUFFER_SIZE = 1024 * 1024 // 1MB ring buffer

// Dynamic import of node-pty - may fail if native module isn't compiled
let pty: typeof import('node-pty') | null = null
try {
  pty = require('node-pty')
} catch (e) {
  console.error('node-pty not available. Session spawning will fail.', e)
}

interface ManagedSession {
  info: SessionInfo
  ptyProcess: import('node-pty').IPty
  buffer: string
  dataListeners: Set<(data: string) => void>
  exitListeners: Set<(code: number | undefined) => void>
  claudeIdListeners: Set<(conversationId: string) => void>
  statusListeners: Set<(status: SessionStatus) => void>
  // Attention detection: after 3s of PTY silence, decide waiting vs decision.
  idleTimer?: ReturnType<typeof setTimeout>
  // Last PTY size (set by the desktop terminal) — remote viewers render at
  // the same grid so the screen replays correctly.
  cols: number
  rows: number
}

class SessionManager {
  private sessions = new Map<string, ManagedSession>()
  // Global listeners (not per-session) — used by the remote server, which
  // exists before sessions do and must hear about all of them.
  private anyStatusListeners = new Set<(sessionId: string, status: SessionStatus) => void>()

  async start(
    cardId: string,
    cardTitle: string,
    projectDir: string,
    claudeSessionId?: string | null,
    rules?: string[],
    pats?: PAT[],
    claudeModel?: string
  ): Promise<SessionInfo> {
    if (!pty) {
      throw new Error(
        'node-pty is not available. Install the "Desktop development with C++" workload in Visual Studio, then run: npm run rebuild'
      )
    }

    const id = uuid()
    const info: SessionInfo = {
      id,
      cardId,
      projectDir,
      status: 'starting',
      claudeSessionId: claudeSessionId ?? null,
      pid: null
    }

    // Write CLAUDE.md if rules exist and projectDir is set
    if (rules && rules.length > 0 && projectDir) {
      const BEGIN_MARKER = '<!-- BEGIN Claude Orchestrator Rules -->'
      const END_MARKER = '<!-- END Claude Orchestrator Rules -->'
      const section =
        BEGIN_MARKER +
        '\n' +
        rules.map((r) => `- ${r}`).join('\n') +
        '\n' +
        END_MARKER

      const claudeMdPath = join(projectDir, 'CLAUDE.md')
      let existing = ''
      try {
        existing = await readFile(claudeMdPath, 'utf-8')
      } catch {
        // file doesn't exist yet
      }

      let newContent: string
      const beginIdx = existing.indexOf(BEGIN_MARKER)
      const endIdx = existing.indexOf(END_MARKER)
      if (beginIdx !== -1 && endIdx !== -1) {
        // Replace the existing section (inclusive of markers)
        newContent =
          existing.slice(0, beginIdx) +
          section +
          existing.slice(endIdx + END_MARKER.length)
      } else if (existing.trim().length > 0) {
        // Append to existing content
        newContent = existing.trimEnd() + '\n\n' + section + '\n'
      } else {
        newContent = section + '\n'
      }

      await writeFile(claudeMdPath, newContent, 'utf-8')
    }

    const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash'
    // Strip Claude Code env vars so spawned sessions don't think they're nested
    const cleanEnv = { ...process.env } as Record<string, string>
    delete cleanEnv['CLAUDECODE']
    delete cleanEnv['CLAUDE_CODE']
    // Ensure CLI tools detect color support inside the PTY
    cleanEnv['FORCE_COLOR'] = '3'
    cleanEnv['TERM'] = 'xterm-256color'
    cleanEnv['COLORTERM'] = 'truecolor'

    // Inject PATs as environment variables
    if (pats && pats.length > 0) {
      for (const pat of pats) {
        const envName = 'PAT_' + pat.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')
        cleanEnv[envName] = pat.value
      }
    }

    const ptyProcess = pty.spawn(shell, ['-NoLogo'], {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: projectDir || process.env.USERPROFILE || process.env.HOME || '.',
      env: cleanEnv,
      useConpty: false
    })

    info.pid = ptyProcess.pid
    info.status = 'running'

    const managed: ManagedSession = {
      info,
      ptyProcess,
      buffer: '',
      dataListeners: new Set(),
      exitListeners: new Set(),
      claudeIdListeners: new Set(),
      statusListeners: new Set(),
      cols: 120,
      rows: 30
    }

    ptyProcess.onData((data) => {
      // Append to ring buffer
      managed.buffer += data
      if (managed.buffer.length > BUFFER_SIZE) {
        managed.buffer = managed.buffer.slice(-BUFFER_SIZE)
      }
      // Notify listeners
      for (const listener of managed.dataListeners) {
        listener(data)
      }
      this.detectAttention(managed)
    })

    ptyProcess.onExit(({ exitCode }) => {
      this.clearIdleTimer(managed)
      this.setStatus(managed, 'stopped')
      for (const listener of managed.exitListeners) {
        listener(exitCode)
      }
    })

    this.sessions.set(id, managed)

    // Send the claude command into the shell
    const claudeCmd = buildClaudeArgs(cardTitle, claudeSessionId, claudeModel)
    const startedAt = Date.now()
    ptyProcess.write(claudeCmd + '\r')

    // Detect the Claude conversation ID from the filesystem.
    // The .jsonl file is only created when the first message is sent, so we
    // poll while the session is alive. This also runs for RESUMED sessions:
    // `claude --resume` forks the conversation into a new file with a new id,
    // so the id we were handed goes stale on the first message — tracking the
    // newest file keeps the context badge live and the card's resume id
    // pointing at the latest state (same applies to /clear or /new mid-session).
    this.startClaudeIdDetection(id, projectDir, startedAt)

    return info
  }

  stop(sessionId: string): boolean {
    const managed = this.sessions.get(sessionId)
    if (!managed) return false
    try {
      managed.ptyProcess.kill()
    } catch {
      // already dead
    }
    this.clearIdleTimer(managed)
    this.setStatus(managed, 'stopped')
    return true
  }

  write(sessionId: string, data: string): void {
    const managed = this.sessions.get(sessionId)
    if (!managed) return
    managed.ptyProcess.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const managed = this.sessions.get(sessionId)
    if (!managed) return
    try {
      managed.ptyProcess.resize(cols, rows)
      managed.cols = cols
      managed.rows = rows
    } catch {
      // ignore resize errors
    }
  }

  getDims(sessionId: string): { cols: number; rows: number } {
    const managed = this.sessions.get(sessionId)
    return { cols: managed?.cols ?? 120, rows: managed?.rows ?? 30 }
  }

  getBuffer(sessionId: string): string {
    return this.sessions.get(sessionId)?.buffer ?? ''
  }

  getInfo(sessionId: string): SessionInfo | null {
    return this.sessions.get(sessionId)?.info ?? null
  }

  onData(sessionId: string, listener: (data: string) => void): () => void {
    const managed = this.sessions.get(sessionId)
    if (!managed) return () => {}
    managed.dataListeners.add(listener)
    return () => managed.dataListeners.delete(listener)
  }

  onExit(sessionId: string, listener: (code: number | undefined) => void): () => void {
    const managed = this.sessions.get(sessionId)
    if (!managed) return () => {}
    managed.exitListeners.add(listener)
    return () => managed.exitListeners.delete(listener)
  }

  onClaudeId(sessionId: string, listener: (conversationId: string) => void): () => void {
    const managed = this.sessions.get(sessionId)
    if (!managed) return () => {}
    // If already detected, fire immediately — but still subscribe: the id can
    // change again while the session runs (resume forks, /clear, /new).
    if (managed.info.claudeSessionId) {
      listener(managed.info.claudeSessionId)
    }
    managed.claudeIdListeners.add(listener)
    return () => managed.claudeIdListeners.delete(listener)
  }

  onStatus(sessionId: string, listener: (status: SessionStatus) => void): () => void {
    const managed = this.sessions.get(sessionId)
    if (!managed) return () => {}
    managed.statusListeners.add(listener)
    return () => managed.statusListeners.delete(listener)
  }

  onAnyStatus(listener: (sessionId: string, status: SessionStatus) => void): () => void {
    this.anyStatusListeners.add(listener)
    return () => this.anyStatusListeners.delete(listener)
  }

  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.info)
  }

  killAll(): void {
    for (const managed of this.sessions.values()) {
      try {
        managed.ptyProcess.kill()
      } catch {
        // ignore
      }
    }
    this.sessions.clear()
  }

  getCwd(sessionId: string): string | null {
    return this.parseCwdFromBuffer(sessionId)
  }

  async getContextInfo(sessionId: string): Promise<string | null> {
    const managed = this.sessions.get(sessionId)
    if (!managed) return null
    const claudeId = managed.info.claudeSessionId
    const projectDir = managed.info.projectDir
    if (!claudeId || !projectDir) return null

    try {
      const projectKey = projectDir.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+$/, '')
      const jsonlPath = join(homedir(), '.claude', 'projects', projectKey, claudeId + '.jsonl')
      const content = await readFile(jsonlPath, 'utf-8')
      const lines = content.split('\n').filter((l) => l.trim())

      // Scan backward for last assistant message with usage data
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const entry = JSON.parse(lines[i])
          const usage = entry?.message?.usage
          if (usage && entry?.message?.role === 'assistant') {
            const inputTokens = (usage.input_tokens ?? 0)
              + (usage.cache_creation_input_tokens ?? 0)
              + (usage.cache_read_input_tokens ?? 0)
            const contextLimit = contextLimitFor(entry?.message?.model ?? '')
            const pct = Math.round((inputTokens / contextLimit) * 100)
            if (inputTokens >= 1000) {
              const k = (inputTokens / 1000).toFixed(1).replace(/\.0$/, '')
              return `${pct}% (${k}k)`
            }
            return `${pct}% (${inputTokens})`
          }
        } catch {
          continue
        }
      }
    } catch {
      // file doesn't exist yet or can't be read
    }
    return null
  }

  private startClaudeIdDetection(sessionId: string, projectDir: string, startedAfter: number): void {
    // Claude Code stores conversations in ~/.claude/projects/<encoded-path>/
    // The path encoding replaces non-alphanumeric chars (except -) with -
    const projectKey = projectDir.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+$/, '')
    const claudeProjectDir = join(homedir(), '.claude', 'projects', projectKey)
    const pollIntervalMs = 5000

    const poll = async (): Promise<void> => {
      const managed = this.sessions.get(sessionId)
      if (!managed || managed.info.status === 'stopped') return

      try {
        const files = await readdir(claudeProjectDir)
        let newest: { id: string; mtime: number } | null = null

        for (const file of files) {
          if (!file.endsWith('.jsonl')) continue
          const id = file.slice(0, -6)
          if (!UUID_RE.test(id)) continue

          const filePath = join(claudeProjectDir, file)
          try {
            const fileStat = await stat(filePath)
            if (fileStat.mtimeMs >= startedAfter && (!newest || fileStat.mtimeMs > newest.mtime)) {
              newest = { id, mtime: fileStat.mtimeMs }
            }
          } catch {
            continue
          }
        }

        // Adopt the newest conversation file whenever it changes — resumes,
        // /clear and /new all fork to a new id mid-session, so detection never
        // stops while the session is alive.
        if (newest && newest.id !== managed.info.claudeSessionId) {
          managed.info.claudeSessionId = newest.id
          for (const listener of managed.claudeIdListeners) {
            listener(newest.id)
          }
        }
      } catch {
        // directory may not exist yet
      }

      const m = this.sessions.get(sessionId)
      if (m && m.info.status !== 'stopped') {
        setTimeout(poll, pollIntervalMs)
      }
    }

    setTimeout(poll, 3000)
  }

  private parseCwdFromBuffer(sessionId: string): string | null {
    const managed = this.sessions.get(sessionId)
    if (!managed) return null

    const buffer = managed.buffer
    // Look for common shell prompt patterns that include the path, scanning from the end
    const lines = buffer.split('\n')

    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 100); i--) {
      const line = lines[i].replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim() // strip ANSI

      // PowerShell prompt: PS C:\path\to\dir>
      const psMatch = line.match(/^PS\s+([A-Za-z]:\\[^>]*?)>/)
      if (psMatch) return psMatch[1]

      // cmd prompt: C:\path\to\dir>
      const cmdMatch = line.match(/^([A-Za-z]:\\[^>]*?)>/)
      if (cmdMatch) return cmdMatch[1]

      // bash/zsh prompt with path (user@host:/path/to/dir$ or ~/dir$)
      const bashMatch = line.match(/:([/~][^\$#]*?)\s*[\$#]\s*$/)
      if (bashMatch) return bashMatch[1]
    }

    return null
  }

  remove(sessionId: string): void {
    const managed = this.sessions.get(sessionId)
    if (!managed) return
    try {
      managed.ptyProcess.kill()
    } catch {
      // ignore
    }
    this.clearIdleTimer(managed)
    this.sessions.delete(sessionId)
  }

  private setStatus(managed: ManagedSession, status: SessionStatus): void {
    if (managed.info.status === status) return
    managed.info.status = status
    for (const listener of managed.statusListeners) {
      listener(status)
    }
    for (const listener of this.anyStatusListeners) {
      listener(managed.info.id, status)
    }
  }

  private clearIdleTimer(managed: ManagedSession): void {
    if (managed.idleTimer) {
      clearTimeout(managed.idleTimer)
      managed.idleTimer = undefined
    }
  }

  // Classify the session on every chunk of PTY output: a decision prompt on
  // screen flags immediately (bounded tail so a resolved prompt clears as soon
  // as enough new output scrolls in); otherwise output flowing means running,
  // and after 3s of quiet we decide between decision and waiting.
  private detectAttention(managed: ManagedSession): void {
    if (managed.info.status === 'stopped') return

    if (isDecisionPrompt(managed.buffer.slice(-1200))) {
      this.clearIdleTimer(managed)
      this.setStatus(managed, 'decision')
      return
    }

    this.setStatus(managed, 'running')

    this.clearIdleTimer(managed)
    managed.idleTimer = setTimeout(() => {
      managed.idleTimer = undefined
      if (managed.info.status === 'stopped') return
      const next = isDecisionPrompt(managed.buffer.slice(-3000)) ? 'decision' : 'waiting'
      this.setStatus(managed, next)
    }, 3000)
  }
}

export const sessionManager = new SessionManager()
