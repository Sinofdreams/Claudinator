import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { join, dirname, basename, resolve, normalize } from 'path'
import { IPC } from '@shared/ipc-channels'
import type { GitBranchesResult, GitWorktreeInfo } from '@shared/models'
import { sessionManager } from '../services/session-manager'

function runGit(args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        // git diff returns exit code 1 when there are differences — that's fine
        if (err.code === 1 && args[0] === 'diff') {
          resolve(stdout)
          return
        }
        reject(new Error(stderr || err.message))
        return
      }
      resolve(stdout)
    })
  })
}

/**
 * Find the git root for a directory by running `git rev-parse --show-toplevel`.
 * Returns null if the directory is not inside a git repo.
 */
async function findGitRoot(dir: string): Promise<string | null> {
  try {
    const root = (await runGit(['rev-parse', '--show-toplevel'], dir)).trim()
    return root || null
  } catch {
    return null
  }
}

/**
 * Resolve the git root for a given project dir + session context.
 * 1. Try session CWD (parsed from terminal buffer) — most accurate
 * 2. Fall back to the card's projectDir itself
 */
async function resolveGitRoot(projectDir: string, sessionId?: string): Promise<string> {
  // Try session CWD first — reflects where Claude CLI actually cd'd to
  if (sessionId) {
    const sessionCwd = sessionManager.getCwd(sessionId)
    if (sessionCwd) {
      const root = await findGitRoot(sessionCwd)
      if (root) return root
    }
  }

  // Fall back to projectDir
  const root = await findGitRoot(projectDir)
  if (root) return root

  throw new Error('Not a git repository')
}

/**
 * Parse `git worktree list --porcelain` output. The first entry is always the
 * main worktree (the primary checkout the others were created from).
 */
function parseWorktrees(porcelain: string): GitWorktreeInfo[] {
  const worktrees: GitWorktreeInfo[] = []
  for (const block of porcelain.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).filter((l) => l.length > 0)
    if (lines.length === 0) continue
    let path: string | null = null
    let branch: string | null = null
    for (const line of lines) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length)
      else if (line.startsWith('branch ')) branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
    }
    // git emits forward slashes even on Windows — normalize so renderer-side
    // equality checks against paths we built with path.join actually match
    if (path) worktrees.push({ path: normalize(path), branch, isMain: worktrees.length === 0 })
  }
  return worktrees
}

/**
 * Resolve the MAIN worktree root for a repo, even when `dir` is inside a
 * linked worktree — worktree management always operates from the primary
 * checkout so listings and default paths stay consistent.
 */
async function findMainRoot(dir: string): Promise<string> {
  const anyRoot = await findGitRoot(dir)
  if (!anyRoot) throw new Error('Not a git repository')
  const porcelain = await runGit(['worktree', 'list', '--porcelain'], anyRoot)
  const main = parseWorktrees(porcelain).find((w) => w.isMain)
  return main?.path ?? anyRoot
}

export function registerGitIpc(): void {
  // Cache resolved git root per projectDir+sessionId
  const gitRootCache = new Map<string, string>()

  ipcMain.handle(
    IPC.GIT_STATUS,
    async (
      _event,
      projectDir: string,
      sessionId?: string
    ): Promise<{ branch: string; files: { path: string; status: string }[] }> => {
      // Always re-resolve when we have a sessionId (CWD can change as CLI runs)
      // Only cache for bare projectDir lookups (no session context)
      let gitRoot: string
      if (sessionId) {
        gitRoot = await resolveGitRoot(projectDir, sessionId)
        gitRootCache.set(projectDir, gitRoot)
      } else {
        gitRoot = gitRootCache.get(projectDir) ?? await resolveGitRoot(projectDir)
        gitRootCache.set(projectDir, gitRoot)
      }

      try {
        const [branchOut, statusOut] = await Promise.all([
          runGit(['-C', gitRoot, 'branch', '--show-current'], gitRoot),
          runGit(['-C', gitRoot, 'status', '--porcelain=v1'], gitRoot)
        ])

        const branch = branchOut.trim()
        const files = statusOut
          .split('\n')
          .filter((line) => line.length > 0)
          .map((line) => ({
            status: line.substring(0, 2).trim(),
            path: line.substring(3)
          }))

        return { branch, files }
      } catch {
        // Cached root may be stale — clear and retry once
        gitRootCache.delete(projectDir)
        const freshRoot = await resolveGitRoot(projectDir, sessionId)
        gitRootCache.set(projectDir, freshRoot)

        const [branchOut, statusOut] = await Promise.all([
          runGit(['-C', freshRoot, 'branch', '--show-current'], freshRoot),
          runGit(['-C', freshRoot, 'status', '--porcelain=v1'], freshRoot)
        ])

        const branch = branchOut.trim()
        const files = statusOut
          .split('\n')
          .filter((line) => line.length > 0)
          .map((line) => ({
            status: line.substring(0, 2).trim(),
            path: line.substring(3)
          }))

        return { branch, files }
      }
    }
  )

  ipcMain.handle(
    IPC.GIT_DIFF,
    async (_event, projectDir: string, filePath: string): Promise<string> => {
      const gitRoot = gitRootCache.get(projectDir) ?? projectDir

      // Try unstaged diff first, fall back to staged diff
      const unstaged = await runGit(['-C', gitRoot, 'diff', '--', filePath], gitRoot)
      if (unstaged.trim()) return unstaged

      const staged = await runGit(['-C', gitRoot, 'diff', '--cached', '--', filePath], gitRoot)
      if (staged.trim()) return staged

      // For untracked files, show full file content as added
      try {
        const content = await runGit(['-C', gitRoot, 'show', `:${filePath}`], gitRoot)
        return content
      } catch {
        return ''
      }
    }
  )

  ipcMain.handle(
    IPC.GIT_BRANCHES,
    async (_event, projectDir: string, sessionId?: string): Promise<GitBranchesResult> => {
      // Resolve from the session's live CWD when possible, then walk up to the
      // main worktree so the listing is identical no matter where we ask from.
      let startDir = projectDir
      if (sessionId) {
        const cwd = sessionManager.getCwd(sessionId)
        if (cwd) startDir = cwd
      }
      const root = await findMainRoot(startDir)

      const [branchOut, worktreeOut, currentOut] = await Promise.all([
        runGit(['branch', '--list', '--format=%(refname:short)\t%(worktreepath)'], root),
        runGit(['worktree', 'list', '--porcelain'], root),
        runGit(['branch', '--show-current'], root)
      ])

      const branches = branchOut
        .split('\n')
        .map((l) => l.trimEnd())
        .filter((l) => l.length > 0)
        .map((line) => {
          const [name, worktreePath] = line.split('\t')
          return { name, worktreePath: worktreePath ? normalize(worktreePath) : null }
        })

      return {
        root,
        currentBranch: currentOut.trim(),
        branches,
        worktrees: parseWorktrees(worktreeOut)
      }
    }
  )

  ipcMain.handle(
    IPC.GIT_WORKTREE_ADD,
    async (
      _event,
      projectDir: string,
      branch: string,
      baseRef: string,
      createBranch: boolean
    ): Promise<{ path: string; branch: string }> => {
      const root = await findMainRoot(projectDir)

      // Sibling folder next to the repo, so the worktree never sits inside the
      // main checkout: <parent>/<repo>-worktrees/<branch-slug>
      const slug = branch.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'worktree'
      const worktreePath = join(dirname(root), `${basename(root)}-worktrees`, slug)

      const args = createBranch
        ? ['worktree', 'add', worktreePath, '-b', branch, baseRef]
        : ['worktree', 'add', worktreePath, branch]
      await runGit(args, root)

      return { path: resolve(worktreePath), branch }
    }
  )

  ipcMain.handle(
    IPC.GIT_WORKTREE_REMOVE,
    async (_event, projectDir: string, worktreePath: string, force?: boolean): Promise<void> => {
      const root = await findMainRoot(projectDir)
      const args = ['worktree', 'remove']
      if (force) args.push('--force')
      args.push(worktreePath)
      await runGit(args, root)
    }
  )
}
