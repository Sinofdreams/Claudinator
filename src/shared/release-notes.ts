// Curated "What's New" entries shown after an update. Newest first.
// Keep in step with CHANGELOG.md when cutting a release.

export interface ReleaseNote {
  version: string
  date: string // YYYY-MM-DD
  summary?: string
  highlights: string[]
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: '0.1.12',
    date: '2026-07-07',
    summary: 'Get pinged when Claude needs you, and see what each card costs.',
    highlights: [
      'Windows notifications when a session needs a decision or finishes while you’re elsewhere — click the toast to jump straight to that session. Toggles in Settings → General.',
      'Cards now show the estimated cost of their conversation (API list-price equivalent), with a live cost badge in the session view.',
      'Usage stats are now accurate: token and cost totals were over-counted ~2.5x and model pricing was stale — both fixed, so expect dashboard numbers to drop.',
      'Errors show as in-app toasts instead of blocking popups.'
    ]
  },
  {
    version: '0.1.11',
    date: '2026-07-07',
    summary: 'Run each card in its own git worktree.',
    highlights: [
      'The branch chip in the session view is now a dropdown — create a worktree on a new branch, open an existing branch as one, switch between worktrees, or hop back to the main checkout. Cards on the same repo can finally run sessions side by side without stepping on each other.',
      'Worktree-bound cards show a branch badge on the board, and the git panel follows whichever checkout the session runs in.',
      'The card’s conversation id now follows /clear and /new, so resume and the context badge never point at a dead conversation.'
    ]
  },
  {
    version: '0.1.10',
    date: '2026-07-07',
    summary: 'Terminal history survives closing a session.',
    highlights: [
      'Fixed reopening a session card showing only a fraction of the terminal history. The terminal is now kept alive (hidden) instead of being rebuilt from a lossy buffer, so your full scrollback is exactly as you left it.'
    ]
  },
  {
    version: '0.1.9',
    date: '2026-07-02',
    summary: 'Pick your model, and keep the CLI up to date.',
    highlights: [
      'New model picker in Settings → General — choose which Claude model every new session launches with (Fable 5, Opus 4.8, Sonnet, Haiku, or a custom id). Handy for switching off Fable 5 before it sunsets.',
      'Check for CLI updates from Settings → About — see the installed Claude Code CLI version and update it in place, without dropping to a terminal.'
    ]
  },
  {
    version: '0.1.8',
    date: '2026-06-23',
    summary: 'Terminal wrapping fix + popout preview refresh.',
    highlights: [
      'Fixed the terminal occasionally wrapping its output to ~2 characters wide — a hidden or not-yet-laid-out session tab could report a tiny width to the CLI. Terminals now only resize when properly visible.',
      'Added a refresh button to the detached Notes & Docs preview window (top-right) that reloads the note from disk — handy for picking up external edits, like a Claude session writing to the file.',
      'Press Ctrl+F in the detached preview to find text — every match is highlighted (the current one in orange) with a match count and Enter / Shift+Enter to step through.'
    ]
  },
  {
    version: '0.1.7',
    date: '2026-06-22',
    summary: 'Filter your usage by time range.',
    highlights: [
      'Usage Dashboard now has a time-range filter — Last 24 hours, 7 days, 30 days, 90 days, or All time (defaults to 7 days). Every chart and card reflects the window you pick.',
      'New auto-refresh control (Off / 30s / 1m / 5m / 15m, default 5 min). Both choices are remembered across restarts.',
      'Switching the range is instant — stats are scanned once and any window is derived from a cache, so it never re-reads your transcripts.'
    ]
  },
  {
    version: '0.1.6',
    date: '2026-06-18',
    summary: 'Organize your notes and read the board at a glance.',
    highlights: [
      'Notes & Docs now supports nested folders — organize your markdown in a drag-and-drop folder tree, with a right-click “Move to…” menu.',
      'Board cards show smarter status: green when Claude is waiting for your prompt, and a pulsing orange when it needs a decision (permission, plan, or menu choice).',
      'A “What’s New” popup (this one!) now appears after each update.',
      'Usage Dashboard polish: roomier cards, cleaner chart tooltips.'
    ]
  },
  {
    version: '0.1.5',
    date: '2026-06-18',
    summary: 'See your Claude Code usage at a glance.',
    highlights: [
      'New Usage Dashboard — click the token badge in the sidebar for charts of your usage: tokens over time, by model, by hour, and your most active projects.',
      'The sidebar token badge is now computed live from your sessions, so it always reflects the current day.'
    ]
  },
  {
    version: '0.1.4',
    date: '2026-06-12',
    summary: 'A proper app identity.',
    highlights: [
      'Custom application icon, embedded in the installer, taskbar, and sidebar.',
      'Publisher metadata added to the build.'
    ]
  },
  {
    version: '0.1.3',
    date: '2026-06-12',
    summary: 'Nicer note editing.',
    highlights: [
      'Pop the Notes & Docs preview out into its own movable window.',
      'Resizable divider between the markdown editor and the live preview.'
    ]
  },
  {
    version: '0.1.0',
    date: '2026-05-27',
    summary: 'The first release.',
    highlights: [
      'Kanban board for managing Claude Code CLI sessions, with drag-and-drop, tags, search, and per-card terminals.'
    ]
  }
]
