# Trellis — local project boards

A working local application inspired by the real Trello UI, with no Supabase,
cloud database, paid API, account, or runtime dependency installation.

## Başlatma / Launch

Windows'ta `start.cmd` dosyasına çift tıklayın. Ardından tarayıcıda
**http://127.0.0.1:4173** adresini açın. Sunucu penceresini açık tutun.
Kapatmak için o pencerede **Ctrl+C** kullanın.

Or run from this directory:

```powershell
node server.mjs
```

Use the latest security patch of a supported Node.js LTS release (22, 24 or 26
at the time of source preparation). See the
[official release status](https://nodejs.org/en/about/previous-releases).
There are no npm dependencies, so **`npm install` is unnecessary**.
Do not open `public/index.html` directly: use the local server address.

To use a different port:

```powershell
$env:PORT = '4174'
node server.mjs
```

The server accepts connections only from this computer at `127.0.0.1`.
It validates the local host and origin; public hosting is outside its scope.
See [SECURITY.md](SECURITY.md) for the trust boundary and review limits.

## Included workflows

- Create and rename workspaces and boards; switch between them; star boards.
- Create, rename, reorder, and delete lists.
- Create cards; drag them between lists or reorder them within a list.
- Open a card to edit its title, description, list, completion status, and date.
- Add comments, multiple checklists, checklist items, and colored labels.
- Track checklist completion percentages and overdue dates.
- Choose from six board backgrounds.
- Search card titles, descriptions, comments, and checklist text.
- Filter by label, completion, overdue date, upcoming week, or missing date.
- Switch between Board and Table views.
- Archive, restore, and permanently delete cards.
- Export a full backup or a single board, and import Trellis JSON additively.
- Use the responsive layout on a narrow screen; use the sidebar menu to navigate.

In the card dialog, **Save changes** persists edits. Typed comments/checklist
items also save when Save is clicked, even if their individual Add button was
not used. Cancel asks before discarding unsaved work. A card's list selector
provides a keyboard and touch alternative to dragging.

## Where your data lives

Work data is stored in **`.data/state.json`** inside this project folder, not in
Supabase or browser storage. A previous saved revision is kept in
`.data/state.json.bak`. Browser storage holds only interface preferences such
as the selected board and view. Closing the browser or restarting the server
preserves work data. Moving/deleting this project folder also moves/deletes its
local data, so download a JSON backup first.

Use the avatar button or **Backup & settings** to download/import a backup.
Import creates separate workspaces and remaps IDs; it does not overwrite
existing work. The supported import format is this app's JSON, not Trello's
native export. A local data request is limited to 16 MiB.

If two browser tabs edit the same revision, the second save is refused with
instructions to reload. Open edits remain available in the dialog. An invalid
or damaged data file is preserved and prevents server startup rather than
being replaced. To recover, stop the server, copy the damaged file aside, and
restore `.data/state.json.bak` to `.data/state.json`.

## REA investigation and scope

The real Trello homepage, a public board, card dialogs, filters, and menu were
inspected using REA 6.9.0 browser scenarios. Their evidence informs the list/card
geometry, metadata badges, and split card dialog. See
[the investigation and implementation map](docs/rea-investigation.md).

This is an independent local demo, not an official Trello client, a complete
Trello reproduction, or an exported AgentEnv. Authenticated Trello write
workflows were not observed; their local implementation follows the user's ten
explicit requirements. There is no live collaboration, account sync, attachment
upload, external integration, or cloud service. Search is a documented local
substring search, not a claim to reproduce Trello's search grammar.

## Verification

```powershell
npm test
```

The dependency-free server tests include real process restart persistence,
revision conflicts, malformed input, corrupt-file preservation, and HTTP
boundaries. Browser checks and their executed results are documented in
[validation](docs/validation.md). Browser QA uses an existing Playwright
installation and does not add dependencies to the app.

The delivery ZIP excludes `.data`, so a new extracted copy starts with a fresh
sample workspace. Your working copy's data stays in its own project folder.

## Source publication

Türkçe yükleme adımları: [GitHub'a yükleme](GITHUB-YUKLEME.md).
On Windows, start the server with `start.cmd`, then double-click
`Yerel uygulama.url` to open the local app. The shortcut opens the browser;
it requires a running server on port 4173.

GitHub hosts the source. GitHub Pages cannot run this Node.js backend.

`PUBLISH_FILES.txt` lists the source files selected for a clean public copy.
User databases, backups, environment files, browser sessions, REA records,
screenshots, caches, logs, archives and installed packages are excluded.
Raw investigation records are private; the public methodology document contains
no real board identifiers or personal filesystem paths.

This project has not selected a software license yet. Public visibility alone
should not be described as an open-source license grant. Choose a license before
advertising reuse permissions.
