# Changelog

All notable changes to Claude Code Orchestrator will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.1.6] - 2026-06-18

### Added
- Nested folders in Notes & Docs: organize markdown into a collapsible folder tree, move notes/folders by drag-and-drop or a right-click "Move to…" menu, and create folders/subfolders. Folders are real subdirectories on disk.
- "What's New" popup that appears once after an update, showing recent versions with dates and highlights (curated in `src/shared/release-notes.ts`).

### Changed
- Board cards now distinguish two attention states: a green dot when Claude has finished and is waiting for your prompt, and a pulsing orange dot when it's waiting for a decision (permission, plan approval, or a select-menu choice). Detection scans the session's terminal output (ANSI-stripped) for Claude's interactive prompt.
- Usage Dashboard polish: roomier stat cards and section padding, larger icon-only Refresh button, and a cleaner chart tooltip.

## [0.1.5] - 2026-06-18

### Added
- Usage Dashboard: click the token badge at the bottom of the sidebar to open a full dashboard of your Claude Code usage — today's tokens / messages / sessions / tool calls / estimated cost, a 30-day tokens-over-time chart, a by-model breakdown (Opus / Sonnet / Haiku), activity-by-hour, all-time totals, and top projects. Charts powered by recharts.

### Fixed
- Sidebar token badge no longer gets stuck on a stale day. Usage is now computed live from the session transcripts in `~/.claude/projects` (streamed with bounded memory) instead of Claude Code's rarely-refreshed `stats-cache.json`, so it always reflects the current day.

## [0.1.4] - 2026-06-12

### Added
- Application icon: embedded in the Windows exe/installer (no longer the default Electron icon), shown on the dev window/taskbar, and used as the sidebar logo.
- `author` field in package.json (publisher metadata).

## [0.1.3] - 2026-06-12

### Added
- Resizable divider between the markdown editor and live preview in Notes & Docs (drag to set the split, clamped 20–80%).
- Pop-out the Notes & Docs preview into a separate, movable window (toolbar button) that live-syncs the rendered markdown and theme — handy for keeping a note's preview visible while a card session is open or on a second monitor.

### Fixed
- Dim the title-bar caption buttons while a full-screen modal is open, so the OS-drawn button strip no longer stays bright over the dimmed backdrop (session modal, settings, card dialog, delete confirmation).

### Changed
- Make "Check for Updates" testable in development: `electron-updater` now reads `dev-app-update.yml` and forces the dev update config when unpackaged.

## [0.1.0] - 2026-05-27

### Added
- Kanban board with 5 columns (Backlog, In Progress, Review, Validating, Complete)
- Drag-and-drop card reordering with dnd-kit
- Card tags, search, and filtering
- Integrated xterm.js terminals for Claude Code CLI sessions
- Session status tracking (starting, running, waiting, stopped, error)
- Claude conversation ID tracking for session resume
- Git status and diff panel per session
- Dark and light themes with full CSS variable customization
- Custom theme creation, import, and export
- Personal access token (PAT) management with env injection
- Rules management (applied via CLAUDE.md)
- Settings persistence across restarts
- About tab with version display and update checker
- Auto-update via GitHub Releases (electron-updater)
- Windows NSIS installer packaging
