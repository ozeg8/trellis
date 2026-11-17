# Trellis — Local Project Boards

A privacy-focused, locally hosted Kanban application for managing workspaces, boards, lists, and cards. Built as an independent learning project using AI-assisted UI investigation and implementation.

**No accounts, cloud database, paid APIs, or npm dependencies required.** Your project data stays on your computer.

> Trellis is an independent project inspired by Kanban task-management workflows. It is not affiliated with, endorsed by, or an official client of Trello or Atlassian.

## Screenshots

### Desktop board
![Trellis desktop Kanban board](https://plain-eeur-prod-public.komododecks.com/202611/17/kvFTzms6qfmLXvEe92wl/image.png)

### Card details
![Trellis desktop card details](https://plain-eeur-prod-public.komododecks.com/202611/17/EO59rL7XpTQelcBDZWIB/image.png)

### Mobile experience

| Mobile board | Mobile card |
| --- | --- |
| ![Mobile board](https://plain-eeur-prod-public.komododecks.com/202611/17/IdxdVDURqnGx6Hp7DMJw/image.png) | ![Mobile card details](https://plain-eeur-prod-public.komododecks.com/202611/17/oEo2eFCpsaSSyLYXVkKN/image.png) |

### Mobile workspace gallery
![Trellis mobile workspace gallery](https://plain-eeur-prod-public.komododecks.com/202611/17/SlpQ4OTBkoikXuo9F98b/image.png)

## Getting started

**Requirements:** Windows for the provided launcher, and an up-to-date supported Node.js LTS version. No `npm install` is necessary.

1. Download or clone the repository.
2. Double-click `start.cmd` on Windows, or run:

   ```powershell
   node server.mjs
   ```
3. Open **http://127.0.0.1:4173** in your browser.
4. Keep the server window open while using the app. Press **Ctrl+C** to stop it.

Do not open `public/index.html` directly; use the local server URL.

To change the port in PowerShell:

```powershell
$env:PORT = '4174'
node server.mjs
```

The server binds to `127.0.0.1` and checks local host/origin information. It is not designed for public hosting. Read [SECURITY.md](SECURITY.md) for security assumptions and limitations.

## Features

- **Workspaces and boards:** Create and rename workspaces and boards, switch between them, and star favorite boards.
- **Lists and cards:** Create, rename, reorder, and delete lists; create and drag cards within or between lists.
- **Card management:** Edit titles, descriptions, completion status, due dates, and list assignments.
- **Collaboration-style organization:** Add local comments, multiple checklists, checklist items, and colored labels (without live multi-user collaboration).
- **Progress tracking:** See checklist completion percentages and overdue dates.
- **Search and filters:** Search titles, descriptions, comments, and checklist text; filter by labels, completion, overdue dates, upcoming dates, or missing dates.
- **Multiple views:** Switch between Board and Table views; choose from six board backgrounds.
- **Archive and restore:** Archive, restore, and permanently delete cards.
- **Backup and import:** Export full or per-board backups and import Trellis JSON without overwriting existing workspaces.
- **Responsive design:** Navigate boards and edit cards on narrower screens.

In the card dialog, **Save changes** persists edits, including typed comments and checklist items. **Cancel** prompts before discarding unsaved work. The list selector also supports moving cards without drag-and-drop.

## Local data and backups

Project data is saved in `.data/state.json` within the project folder, with a previous revision in `.data/state.json.bak`. Browser storage only retains interface preferences, such as the selected board and view.

Your data survives browser and server restarts, but moving or deleting the project folder also affects its stored data. Export a JSON backup from **Backup & settings** before removing the folder.

Imports create separate workspaces and remap identifiers; they do not overwrite existing work. Trellis accepts its own JSON backup format, **not native Trello exports**. Individual local data requests are limited to 16 MiB.

Concurrent edits to the same revision are detected: a stale save is rejected and the user is asked to reload. Corrupted state files are preserved rather than silently overwritten. For recovery, stop the server, save a copy of the damaged file, and restore `.data/state.json.bak` as `.data/state.json`.

## REA investigation and implementation

REA 6.9.0 browser scenarios were used to examine publicly accessible Trello pages and UI flows, including a public board, card dialogs, filters, and menus. Findings informed layout and interaction decisions. See [REA investigation notes](docs/rea-investigation.md).

The app is an independent local demonstration, **not** a complete Trello reproduction or an exported AgentEnv. Authenticated Trello write flows were not observed. The implemented local workflows follow the project's defined feature requirements.

There is no account synchronization, live collaboration, attachment upload, cloud service, or external integration. Search uses local substring matching rather than Trello's full search syntax.

## Testing

Run the dependency-free server tests:

```powershell
npm test
```

Tests cover persistence across process restarts, revision conflicts, malformed inputs, corrupted-file preservation, and HTTP boundaries. Browser QA findings are recorded in [validation notes](docs/validation.md). Browser testing used an existing Playwright installation; it is not a runtime dependency.

## Publishing and limitations

This repository is intended to publish the **source code**, not personal project data. Review `PUBLISH_FILES.txt` before uploading. Exclude `.data`, backups, environment files, credentials, browser sessions, raw REA records, caches, logs, archives, and installed packages.

A delivery ZIP, when provided, excludes `.data` and starts with a fresh sample workspace. The optional `Yerel uygulama.url` shortcut opens the local address only when the server is running.

**GitHub Pages cannot run the Node.js backend.** To use Trellis, run the local server as described above.

## License

No software license has been selected yet. Public source availability does not automatically grant permission to reuse, modify, or redistribute the code. Review third-party code and assets before selecting a license.
