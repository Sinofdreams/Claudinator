# Claude Code Orchestrator

A desktop Kanban board for managing parallel [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI sessions.

Organize tasks on a drag-and-drop board, spin up terminal sessions per card, and monitor multiple Claude conversations side by side.

## Features

- **Kanban board** -- Five columns (Backlog, In Progress, Review, Validating, Complete) with drag-and-drop reordering, tags, search, and filtering.
- **Integrated terminals** -- Start Claude Code CLI sessions directly from cards. View real-time output in tabbed xterm.js terminals with keyboard input support.
- **Session tracking** -- Monitors session status (starting / running / waiting / stopped / error) with idle detection. Tracks Claude conversation IDs for session resume.
- **Git panel** -- View git status and diffs for the project directory of any active session.
- **Themes** -- Dark and light modes with full CSS variable customization. Create, import, and export custom themes.
- **PAT management** -- Store personal access tokens that get injected as environment variables into every session.
- **Rules** -- Define instructions that are applied to every Claude Code session via CLAUDE.md.
- **Phone remote** -- Enable in Settings > Remote and scan a QR code to view the board and act on running sessions from your phone (live status, terminal view, quick keys for answering prompts). LAN-only with token auth; pair with [Tailscale](https://tailscale.com) for access from anywhere.
- **Auto-update** -- Check for and install updates from GitHub Releases (Settings > About).
- **Persistence** -- Board state, sessions, and settings are saved automatically across restarts.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | Electron 35 |
| Frontend | React 19, TypeScript, Tailwind CSS 4 |
| State | Zustand |
| Terminal | xterm.js + node-pty |
| Drag & drop | dnd-kit |
| Build | electron-vite, electron-builder |
| Updates | electron-updater (GitHub Releases) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- Windows (the packaged build currently targets Windows x64)

### Install

```bash
git clone https://github.com/Sinofdreams/Claudinator.git
cd Claudinator
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Package (Windows installer)

```bash
npm run package:win
```

Produces an NSIS installer in the `dist/` directory.

## Project Structure

```
src/
  main/              # Electron main process
    ipc/             # IPC handlers (board, session, git, settings, update)
    services/        # Session manager, persistence, Claude CLI
  renderer/          # React frontend
    components/
      Board/         # Kanban board, cards, columns
      Terminal/      # Terminal tabs, session modal, git panel
      Sessions/      # Session list panel
      Settings/      # Settings dialog, theme editor, about tab
    stores/          # Zustand stores (board, session, settings)
  shared/            # Types and IPC channel definitions
  preload/           # Electron preload (context bridge)
electron-builder.yml # Packaging config
```

## Auto-Update

The app checks for updates from [GitHub Releases](https://github.com/Sinofdreams/Claudinator/releases) via `electron-updater`. Open **Settings > About** and click **Check for Updates**. Downloads are user-initiated -- nothing happens automatically in the background.

### Publishing a release

1. Bump the `version` in `package.json` (e.g., `0.1.0` -> `0.2.0`).
2. Run `npm run package:win`.
3. Go to [GitHub Releases](https://github.com/Sinofdreams/Claudinator/releases) and create a new release.
4. Set the tag to match the version (e.g., `v0.2.0`).
5. Upload **both** files from the `dist/` directory:
   - `claude-orchestrator-<version>-setup.exe` -- the installer
   - `latest.yml` -- **required** for auto-update detection; `electron-updater` reads this file to determine if a newer version is available

> **Important:** If you forget to upload `latest.yml`, existing installations will not detect the new release. Always upload both files.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a full list of changes per version.

## License

This project is not yet published under a specific license. All rights reserved.
