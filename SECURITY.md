# Security and local data

Trellis is a local single-user demo. It binds only to `127.0.0.1`; do not expose
it through a public reverse proxy, a network port forward, or a shared server.
It has no accounts, per-user authorization, or encryption at rest. Processes
with access to your local server or project files can access your work data.

HTTP Host and Origin values are checked against the running local address and
port before state or static files are served. Foreign hosts and origins are
rejected. Security headers restrict scripts to local files, prevent framing,
and suppress referrer information. Inline styles remain allowed because the
UI uses local dynamic style attributes; inline scripts and event handlers are
not allowed.

Work data is stored in `.data/state.json`, with the previous saved revision in
`.data/state.json.bak`. Neither file belongs in a source repository. Exports
also contain your work data. Keep backups private and protect the project
directory with your operating system's normal file permissions.

The shared model validates identities, references, data types, and dates.
Identities contain ASCII letters, digits, underscores, or hyphens; unsupported
identities are rejected without normalization or data replacement. Generated
UUIDs and the bundled sample identifiers satisfy this contract. A manually
edited older file with unsupported identities stops startup while preserving
that file; it is not silently migrated. UI text and identity attributes are
escaped, and checklist draft values use a Map rather than object properties.

Only Trellis JSON exports are supported for import. Imports are validated and
added with regenerated identities instead of replacing existing work. Requests
are limited to 16 MiB. Revision checking prevents one stale tab from silently
overwriting a newer save. Corrupt existing data is preserved rather than reset.

There are no npm runtime dependencies, cloud databases, paid APIs, telemetry,
or application credentials. A supported Node.js release and a modern browser
are still needed. Source preparation checked the official Node.js release and
security notices on 2026-11-18. Use the latest patched release of a supported
LTS line; Node.js 25 is end-of-life. See the
[release status](https://nodejs.org/en/about/previous-releases) and
[security notice](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases/).
This does not audit the locally installed Node, Chromium or Playwright binaries
or certify these tools as vulnerability free. Updating the machine's Node.js
installation is separate from preparing this source archive.

Do not put personal data, credentials, database copies, REA captures, browser
sessions, or private screenshots into public issues or repository attachments.
Report security concerns privately to the repository owner using a contact
channel they provide. Public source preparation uses `PUBLISH_FILES.txt` as an
explicit allowlist; `.gitignore` alone does not remove Git history or prevent
manual/forced uploads.
