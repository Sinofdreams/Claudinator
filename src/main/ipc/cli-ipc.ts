import { ipcMain } from 'electron'
import { exec } from 'child_process'
import { promisify } from 'util'
import { IPC } from '@shared/ipc-channels'

const execAsync = promisify(exec)

export interface CliVersion {
  version: string | null
  error?: string
}

export interface CliUpdateResult {
  ok: boolean
  from?: string
  to?: string
  alreadyLatest: boolean
  output: string
  error?: string
}

// When the app is launched via `npm run dev`, npm injects npm_config_* env
// vars (registry, proxy, cache, userconfig…) into the process. Those would be
// inherited by the `claude update` child and make its internal `npm` call use
// dev config — e.g. "registry unreachable". Strip them (plus NODE_OPTIONS) so
// the child reads the user's real npm setup. No-op in the installed app.
function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (key.toLowerCase().startsWith('npm_config_')) continue
    if (key.toLowerCase().startsWith('npm_package_')) continue
    if (key === 'NODE_OPTIONS' || key === 'NODE_ENV') continue
    env[key] = value
  }
  return env
}

// Run the `claude` binary through a shell so PATH resolution finds the
// platform shim (e.g. claude.cmd on Windows). exec() uses a shell by default.
async function runClaude(argsLine: string, timeout: number): Promise<{ stdout: string; stderr: string }> {
  return await execAsync(`claude ${argsLine}`, { timeout, windowsHide: true, env: cleanEnv() })
}

export function registerCliIpc(): void {
  ipcMain.handle(IPC.CLI_VERSION, async (): Promise<CliVersion> => {
    try {
      const { stdout } = await runClaude('--version', 30_000)
      const match = stdout.match(/(\d+\.\d+\.\d+)/)
      return { version: match ? match[1] : stdout.trim() }
    } catch (err) {
      return { version: null, error: (err as Error).message }
    }
  })

  ipcMain.handle(IPC.CLI_UPDATE, async (): Promise<CliUpdateResult> => {
    try {
      // `claude update` can download + install, so allow a generous timeout.
      const { stdout, stderr } = await runClaude('update', 180_000)
      const output = `${stdout}\n${stderr}`.trim()
      const updated = output.match(/updated from (\d+\.\d+\.\d+) to (?:version )?(\d+\.\d+\.\d+)/i)
      const alreadyLatest = !updated && /already .*(latest|up[- ]?to[- ]?date)|no update|up[- ]?to[- ]?date/i.test(output)
      return {
        ok: true,
        from: updated?.[1],
        to: updated?.[2],
        alreadyLatest,
        output
      }
    } catch (err) {
      return { ok: false, alreadyLatest: false, output: '', error: (err as Error).message }
    }
  })
}
