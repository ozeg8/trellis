# Validation

The checks use the real application server and isolated temporary data. They do
not read or modify the working application's `.data` directory.

Run the dependency-free server checks from this project directory:

```powershell
npm test
```

The security-fix validation run passed **9 server tests**, covering real server
process restart persistence, revision conflicts, malformed input, identity and
reference validation, invalid dates, request size, corrupt-file preservation,
private file boundaries, Host/Origin checks, and security response headers.
HTML-bearing identities are rejected for all seven entity types before state
or its backup is changed.

The browser suite uses an already-installed Playwright test module and browser.
These development tools are not application runtime dependencies. If discovery
does not find an existing module, set `PLAYWRIGHT_MODULE` to its module path.

```powershell
node tests/browser.test.mjs
```

The security-fix browser run passed **20 workflow groups with zero JavaScript or
console errors**. It exercised workspace/board/list/card creation, descriptions,
comments, checklist progress, labels, dates, native card dragging and reordering,
search and filtering, backgrounds, Table view, archive/restore/deletion, JSON
export and additive import, reload persistence, and desktop/mobile navigation.
The narrow viewport is 390 by 844 pixels. Horizontal scrolling inside the board
is intentional; document-level overflow is checked separately.

Security regressions additionally exercised HTML-like visible text, supported
opaque identifiers, and browser rejection of malformed state from all seven
identity owners. The browser suite blocks page requests outside its isolated
loopback server. Generated screenshots stay in ignored `test-results/browser/`
unless `QA_ARTIFACTS` points to another private local directory. The test browser,
server, and temporary data were cleaned up.

Source preparation was rechecked on 2026-11-18. All 9 server tests and all 20
browser workflow groups passed on Windows with Node.js 25.9.0 and the installed
Chromium/Playwright tooling. The publication allowlist was scanned for common
credential formats and personal filesystem paths; no matches were found.
The archive contains source files, upload instructions and a loopback URL
shortcut, excluding the live database, backups, logs and browser artifacts.

The official Node.js release status and November security notice were consulted;
Node.js 25 is end-of-life. The published package recommends supported LTS lines
22, 24 or 26 with current security patches. The installed runtime was not
upgraded. Browser binaries were not audited against all current advisories.
See [security](../SECURITY.md) for the official references. Passing these checks
does not establish an absence of every vulnerability or parity with unobserved
authenticated Trello behavior.
