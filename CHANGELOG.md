# Changelog

All notable changes to Claude Code Orchestrator will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.1.16] - 2026-07-19

### Added
- Phone remote: view the board and act on running sessions from your phone's browser. Enable it in Settings → Remote and scan the QR code to pair — the phone gets a live board (status dots pushed over a WebSocket, decision cards floated to the top, branch/cost metadata) and tapping a card with a live session opens a terminal view with a quick-key row (Esc, ⇧Tab, arrows, 1–3, y/n, Enter) plus a prompt field. Everything writes into the same PTY the desktop sees, so both stay perfectly in sync. Board changes and desktop terminal resizes sync live. "Add to Home Screen" gives a proper app icon and full-screen launch.
- Security: the server is off by default, binds to your LAN, and requires a random access token on every request (carried in the pairing link's URL fragment; regenerate it any time from Settings → Remote). For access away from home, pair it with Tailscale — nothing is ever exposed to the internet.

### Changed
- Attention detection (decision / waiting / running) moved from the renderer into the main process, which now owns session status authoritatively and pushes changes over a new `session:status` event. Board dots and notifications behave exactly as before.

## [0.1.15] - 2026-07-17

### Added
- Title-bar attention badges: a chip cluster next to the window caption buttons shows how many sessions need a decision (orange), have finished and are waiting for your prompt (green), or are actively working (blue). Chips only appear when their count is above zero. Clicking one drops down the list of card names in that state — click a name to open its session. The Dashboard header and Notes toolbar reserve extra top-right space so their controls stay clear.
- Taskbar-flash nudge: when a session needs a decision or finishes while the app is in the background, the taskbar icon flashes (the classic Windows orange flash) and stops as soon as you focus the app. Its own toggle lives in Settings → General (default on) — combined with turning the two toast toggles off, you get a fully silent "nudge only" setup.

### Changed
- Release publishing and the auto-updater now point at the repository's new location (`marcobornman/Claudinator`) after the account rename. Existing installs keep updating via GitHub's redirect.

## [0.1.14] - 2026-07-13

### Added
- Notes & Docs folders start minimized. Folders you expand stay open for the session, and the tree auto-reveals a folder when you create something inside it, drop an item into it, or open one of its notes from search. Folders stay on top; notes keep sorting newest-first.
- Shift+Esc closes the card view even while the terminal has focus. Plain Esc stays with the CLI — it interrupts generation, dequeues queued messages, dismisses menus, and Esc-Esc opens history rewind.
- A floating jump-to-bottom button appears in the terminal whenever you're scrolled up; clicking it scrolls to the bottom, repaints the viewport, and refocuses the input.

### Fixed
- On long sessions, scrolling back down could stop a few rows short of the true bottom until you typed something. Wheeling to within a couple of rows of the bottom now snaps fully down.
- The context-usage badge now uses the model's real context window (Haiku 200k, older generations 200k, current models 1M) instead of assuming 1M for everything.

## [0.1.13] - 2026-07-07

### Added
- Merge back from a worktree in one click: the branch menu's new "Merge into `<branch>`" button merges the worktree's branch into the main checkout, removes the worktree, deletes the merged branch, and returns the card's session to the main repo. Refuses cleanly if either tree has uncommitted changes (checked before your session is touched), and merge conflicts abort completely — the repo is left exactly as it was and the session resumes in the worktree.
- Deleting a card now cleans up its worktree: the session is stopped and the worktree removed, unless it has uncommitted changes (then it's kept and you get a toast). Moving a worktree card to Complete shows a reminder instead — unmerged work is never auto-deleted.
- Optional dependency install when creating a worktree: a checkbox runs npm/yarn/pnpm (detected by lockfile) in the new worktree; skipped when there's no package.json.

### Changed
- Internal: `tsc` now passes with zero errors (ES2022 target, React 19 JSX namespace fix, a null-guard bug in the git diff panel), and a GitHub Actions workflow gates every PR and push with typecheck + build.

## [0.1.12] - 2026-07-07

### Added
- Native Windows notifications when a session needs attention: a toast when Claude hits a decision prompt (permission / plan / menu) or finishes and waits for your prompt, titled with the card name. Clicking the toast focuses the app and opens that session. Suppressed while you're viewing the session; per-session cooldown prevents spam. Two independent toggles in Settings → General (both default on).
- Estimated conversation cost per card: board cards show the cost in their footer and the session view gets a cost badge next to the context badge. Priced per model family at current list rates (including cache reads/writes) from the card's transcript, cached by file mtime so polling stays cheap. Note this is the API list-price equivalent — a measure of heaviness, not your subscription bill.

### Fixed
- Usage stats (dashboard and the new cost display) no longer over-count by ~2.5x. Claude Code writes one transcript line per content block and repeats the same usage object on each line of a response; usage is now counted once per API request.
- Model pricing table refreshed: Opus 4.6+ at current $5/$25 rates (was using pre-4.6 $15/$75), Haiku 4.5 at $1/$5, and Fable/Mythos ($10/$50) is now its own family in the by-model breakdown instead of being priced as Sonnet.

### Changed
- Session-start errors show as in-app toasts (bottom-right, auto-dismiss) instead of blocking alert() popups.
- Removed dead code: the unused TerminalPanel/TerminalTab/SessionHeader components.

## [0.1.11] - 2026-07-07

### Added
- Git worktree support from the session view. The branch indicator is now a dropdown: create a worktree on a new branch (pre-named from the card title), open any existing branch as a worktree, switch between worktrees, or return to the main checkout. Worktrees are created next to the repo (`<repo>-worktrees/<branch>`), the card remembers its worktree across restarts, the git panel and paths follow it, and worktree-bound cards show a branch badge on the board. Two cards on the same repo can now run sessions in parallel without fighting over the working tree. Note: switching restarts the session with a fresh Claude conversation, and new worktrees don't share dependencies (`node_modules`).

### Fixed
- The card's Claude conversation id (used for resume and the context-usage badge) now tracks the session for its whole lifetime. Previously it was detected once and never updated, so a `/clear` or `/new` inside the CLI would leave the card resuming — and the badge reading — a dead conversation.

## [0.1.10] - 2026-07-07

### Fixed
- Reopening a session card no longer loses most of the terminal history. Closing the session view used to destroy the terminal and rebuild it from a 1MB raw PTY buffer on reopen — which Claude Code's constant TUI redraws churn through quickly, leaving only a fraction of the visible history (sometimes garbled by replaying resize-sensitive escape sequences). The session view now stays alive (hidden) while its tabs are open, so terminals keep their full scrollback across close/reopen. Background polling, the Escape handler, and the title-bar dim all pause while hidden.

## [0.1.9] - 2026-07-02

### Added
- Model picker in Settings → General. Choose which model every new session launches with — Fable 5, Opus 4.8, Sonnet, Haiku, Default (no `--model` flag), or a Custom raw model id. The choice is passed as `--model` to each new session (existing terminals keep their model).
- "Check for CLI Updates" in Settings → About. Shows the installed Claude Code CLI version and runs `claude update` in place, reporting whether it updated or you're already on the latest.

### Fixed
- The in-app CLI updater now strips the `npm_config_*` environment variables that a `npm run dev` launch would otherwise leak into the `claude update` child process (which made its internal npm call fail with "registry unreachable").

## [0.1.8] - 2026-06-23

### Fixed
- Terminal no longer wraps its output to ~2 characters wide. A hidden/background session tab (or one measured before layout settled) could make the fit addon report a 2-column width to the PTY, so Claude Code rendered everything wrapped to 2–3 characters. The terminal now refuses to fit or resize while it's hidden or not yet laid out, never reports an absurdly small column count, and re-fits once web fonts finish loading.

### Added
- Refresh button in the detached Notes & Docs preview window (top-right, next to the window controls). Click it to reload the note from disk and re-render — handy for picking up external edits (e.g. a Claude session writing to the `.md`) without switching back to the editor.
- Find in the detached preview window: press Ctrl+F for a find bar that highlights every match (current match in orange), with a match count and Enter / Shift+Enter (or ↑/↓) to step through. Esc closes it.

## [0.1.7] - 2026-06-22

### Added
- Usage Dashboard time-range filter: pick **Last 24 hours / 7 days / 30 days / 90 days / All time** (default 7 days). Every panel — the headline cards, tokens-over-time chart, by-model breakdown, activity-by-hour, and top projects — reflects the selected window. The "All time" panel stays full-history as a fixed reference.
- Usage Dashboard auto-refresh control: choose **Off / 30s / 1m / 5m / 15m** (default 5 min). Both controls remember your choice across restarts.

### Changed
- Stats are now scanned once into per-day buckets (cached ~5 min) and any time window is derived from them instantly, so switching the range never re-reads your transcripts.

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
