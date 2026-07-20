import { createServer, Server, IncomingMessage, ServerResponse } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { networkInterfaces } from 'os'
import { randomBytes, timingSafeEqual } from 'crypto'
import { URL } from 'url'
import { nativeImage } from 'electron'
import { SessionStatus } from '@shared/models'
import { sessionManager } from './session-manager'
import { loadBoard } from './board-persistence'
import { computeSessionCost } from './stats-aggregator'
import mobileHtml from '../remote/mobile.html?raw'
import xtermJs from '@xterm/xterm/lib/xterm.js?raw'
import xtermCss from '@xterm/xterm/css/xterm.css?raw'
import iconDataUrl from '../../../build/icon.png?inline'

const MANIFEST = JSON.stringify({
  name: 'Claudinator',
  short_name: 'Claudinator',
  display: 'standalone',
  start_url: '/',
  background_color: '#0d1117',
  theme_color: '#0d1117',
  icons: [{ src: '/assets/icon.png', sizes: '180x180', type: 'image/png' }]
})

/**
 * Phone remote: a small LAN HTTP + WebSocket server embedded in the main
 * process. Serves a self-contained mobile page, a read-only board snapshot,
 * and live terminal streaming + writes into existing PTY sessions.
 *
 * Security model: bearer token required on every API/WS request. The token
 * rides in the URL *fragment* of the pairing QR (never sent over the wire in
 * page requests); the page passes it explicitly as `?t=`. LAN/plain-HTTP by
 * design — for remote access users pair it with a VPN like Tailscale.
 */

interface ClientState {
  ws: WebSocket
  // sessionId → unsubscribe from PTY data
  subs: Map<string, () => void>
}

class RemoteServer {
  private http: Server | null = null
  private wss: WebSocketServer | null = null
  private token = ''
  private port = 0
  private clients = new Set<ClientState>()
  private unsubAnyStatus: (() => void) | null = null
  private unsubAnyResize: (() => void) | null = null
  private resizeTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private iconPng: Buffer | null = null

  isRunning(): boolean {
    return this.http !== null
  }

  getPort(): number {
    return this.port
  }

  static generateToken(): string {
    return randomBytes(16).toString('hex')
  }

  /** LAN URLs a phone can reach us on (IPv4, non-internal). */
  getUrls(): string[] {
    if (!this.isRunning()) return []
    const urls: string[] = []
    const nets = networkInterfaces()
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] ?? []) {
        if (net.family === 'IPv4' && !net.internal) {
          urls.push(`http://${net.address}:${this.port}`)
        }
      }
    }
    return urls
  }

  async start(port: number, token: string): Promise<void> {
    if (this.http) await this.stop()
    this.token = token
    this.port = port

    const server = createServer((req, res) => {
      this.handleHttp(req, res).catch(() => {
        res.writeHead(500)
        res.end()
      })
    })

    const wss = new WebSocketServer({ noServer: true })
    server.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (url.pathname !== '/ws' || !this.checkToken(url.searchParams.get('t'))) {
        socket.destroy()
        return
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
      })
    })

    wss.on('connection', (ws) => this.handleClient(ws))

    // Push status changes to every connected phone.
    this.unsubAnyStatus = sessionManager.onAnyStatus((sessionId, status) => {
      this.broadcast({ type: 'status', sessionId, status })
    })

    // When the desktop refits a PTY, re-send the buffer at the new grid to
    // every phone watching that session (debounced — fit fires in bursts),
    // otherwise their terminal keeps rendering the stale dimensions.
    this.unsubAnyResize = sessionManager.onAnyResize((sessionId) => {
      const existing = this.resizeTimers.get(sessionId)
      if (existing) clearTimeout(existing)
      this.resizeTimers.set(
        sessionId,
        setTimeout(() => {
          this.resizeTimers.delete(sessionId)
          const dims = sessionManager.getDims(sessionId)
          for (const client of this.clients) {
            if (client.subs.has(sessionId)) {
              this.send(client.ws, {
                type: 'buffer',
                sessionId,
                data: sessionManager.getBuffer(sessionId),
                cols: dims.cols,
                rows: dims.rows
              })
            }
          }
        }, 400)
      )
    })

    // Bind the requested port, falling back to the next few if it's taken —
    // running dev alongside the installed app would otherwise always collide.
    let boundPort = -1
    for (let p = port; p < port + 10; p++) {
      try {
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject)
          server.listen(p, () => {
            server.removeListener('error', reject)
            resolve()
          })
        })
        boundPort = p
        break
      } catch (err) {
        if ((err as NodeJS.ErrnoException)?.code !== 'EADDRINUSE') throw err
      }
    }
    if (boundPort < 0) {
      throw new Error(`Ports ${port}-${port + 9} are all in use`)
    }
    this.port = boundPort

    this.http = server
    this.wss = wss
  }

  async stop(): Promise<void> {
    this.unsubAnyStatus?.()
    this.unsubAnyStatus = null
    this.unsubAnyResize?.()
    this.unsubAnyResize = null
    for (const timer of this.resizeTimers.values()) clearTimeout(timer)
    this.resizeTimers.clear()
    for (const client of this.clients) {
      for (const unsub of client.subs.values()) unsub()
      client.subs.clear()
      try {
        client.ws.close()
      } catch {
        // ignore
      }
    }
    this.clients.clear()
    this.wss?.close()
    this.wss = null
    const server = this.http
    this.http = null
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    this.port = 0
  }

  /** App icon downscaled to home-screen size (cached; full-res is ~600 kB). */
  private getIconPng(): Buffer {
    if (!this.iconPng) {
      const img = nativeImage.createFromDataURL(iconDataUrl)
      this.iconPng = img.resize({ width: 180, height: 180 }).toPNG()
    }
    return this.iconPng
  }

  /** Called after every board save so phones refetch immediately. */
  notifyBoardChanged(): void {
    for (const client of this.clients) {
      this.send(client.ws, { type: 'board' })
    }
  }

  private checkToken(candidate: string | null): boolean {
    if (!candidate || !this.token) return false
    const a = Buffer.from(candidate)
    const b = Buffer.from(this.token)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost')

    // Static assets are served without the token — the page itself is inert;
    // everything stateful (API + WS) requires it.
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(mobileHtml)
      return
    }
    if (url.pathname === '/assets/xterm.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'max-age=86400' })
      res.end(xtermJs)
      return
    }
    if (url.pathname === '/assets/xterm.css') {
      res.writeHead(200, { 'Content-Type': 'text/css', 'Cache-Control': 'max-age=86400' })
      res.end(xtermCss)
      return
    }
    if (url.pathname === '/assets/icon.png') {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' })
      res.end(this.getIconPng())
      return
    }
    if (url.pathname === '/manifest.webmanifest') {
      res.writeHead(200, { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'max-age=86400' })
      res.end(MANIFEST)
      return
    }

    if (url.pathname === '/api/state') {
      if (!this.checkToken(url.searchParams.get('t'))) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end('{"error":"unauthorized"}')
        return
      }
      const state = await this.buildState()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(state))
      return
    }

    res.writeHead(404)
    res.end()
  }

  /** Board snapshot + live session statuses + per-card conversation cost. */
  private async buildState(): Promise<unknown> {
    const board = await loadBoard()
    const sessions = sessionManager.listSessions()
    const byCard = new Map(sessions.map((s) => [s.cardId, s]))

    const columns = await Promise.all(
      board.columns.map(async (col) => ({
        id: col.id,
        title: col.title,
        cards: await Promise.all(
          col.cardIds
            .map((id) => board.cards[id])
            .filter(Boolean)
            .map(async (card) => {
              const session = byCard.get(card.id)
              const sessionDir = card.worktreePath || card.projectDir
              let cost: number | null = null
              if (card.claudeSessionId && sessionDir) {
                const c = await computeSessionCost(sessionDir, card.claudeSessionId)
                cost = c?.cost ?? null
              }
              return {
                id: card.id,
                title: card.title,
                tags: card.tags,
                worktreeBranch: card.worktreeBranch ?? null,
                sessionId: session?.id ?? null,
                status: session?.status ?? null,
                cost
              }
            })
        )
      }))
    )

    return { columns }
  }

  private handleClient(ws: WebSocket): void {
    const client: ClientState = { ws, subs: new Map() }
    this.clients.add(client)

    ws.on('message', (raw) => {
      let msg: { type?: string; sessionId?: string; data?: string }
      try {
        msg = JSON.parse(String(raw))
      } catch {
        return
      }
      const sessionId = typeof msg.sessionId === 'string' ? msg.sessionId : null

      if (msg.type === 'sub' && sessionId) {
        if (client.subs.has(sessionId)) return
        if (!sessionManager.getInfo(sessionId)) return
        const dims = sessionManager.getDims(sessionId)
        this.send(ws, {
          type: 'buffer',
          sessionId,
          data: sessionManager.getBuffer(sessionId),
          cols: dims.cols,
          rows: dims.rows
        })
        const unsub = sessionManager.onData(sessionId, (data) => {
          this.send(ws, { type: 'data', sessionId, data })
        })
        client.subs.set(sessionId, unsub)
        return
      }

      if (msg.type === 'unsub' && sessionId) {
        client.subs.get(sessionId)?.()
        client.subs.delete(sessionId)
        return
      }

      if (msg.type === 'write' && sessionId && typeof msg.data === 'string') {
        // Bound single writes; the phone sends keystrokes and short prompts.
        if (msg.data.length <= 10000) {
          sessionManager.write(sessionId, msg.data)
        }
        return
      }
    })

    ws.on('close', () => {
      for (const unsub of client.subs.values()) unsub()
      client.subs.clear()
      this.clients.delete(client)
    })
  }

  private send(ws: WebSocket, msg: Record<string, unknown>): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }

  private broadcast(msg: { type: string; sessionId: string; status: SessionStatus }): void {
    for (const client of this.clients) {
      this.send(client.ws, msg)
    }
  }
}

export const remoteServer = new RemoteServer()
export const generateRemoteToken = RemoteServer.generateToken
