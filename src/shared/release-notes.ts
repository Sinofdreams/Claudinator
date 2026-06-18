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
