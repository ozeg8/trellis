import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { once } from 'node:events';
import { startServer } from './server.mjs';
import { createInitialState, validateState } from './public/model.js';

const root = dirname(fileURLToPath(import.meta.url));

async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'trello-local-test-'));
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  return directory;
}

async function launch(t, directory) {
  const app = await startServer({ port: 0, dataDirectory: directory });
  t.after(() => new Promise((accept, reject) => {
    app.server.close((error) => error ? reject(error) : accept());
    app.server.closeAllConnections();
  }));
  return app;
}

async function save(app, value) {
  return fetch(`${app.url}/api/state`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
}

async function childServer(directory) {
  const child = spawn(process.execPath, [join(root, 'server.mjs')], {
    cwd: root, env: { ...process.env, PORT: '0', DATA_DIRECTORY: directory }, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let startupTimer;
  const url = await new Promise((accept, reject) => {
    startupTimer = setTimeout(() => { child.kill(); reject(new Error(`Server startup timed out: ${stderr}`)); }, 10000);
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const match = stdout.match(/Trello Local ready: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) accept(match[1]);
    });
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`Server exited ${code}: ${stderr}`)));
  }).finally(() => clearTimeout(startupTimer));
  return { url, stop: async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  } };
}

test('workspace, board, list and rich card changes survive a real server process restart', async (t) => {
  const directory = await temporary(t);
  let app = await childServer(directory);
  t.after(() => app.stop());
  const initial = await (await fetch(`${app.url}/api/state`)).json();
  const next = structuredClone(initial);
  next.state.workspaces.push({ id: 'ws-new', name: 'New workspace' });
  next.state.boards.push({ id: 'board-new', workspaceId: 'ws-new', name: 'Release', background: 'forest', starred: false,
    lists: [{ id: 'list-new', name: 'Review' }], cards: [{ id: 'card-new', listId: 'list-new', title: 'Launch', description: 'Ship the release',
      labels: ['green', 'blue'], dueDate: '2028-02-29', completed: false, archived: false,
      comments: [{ id: 'comment-new', text: 'Ready for review', createdAt: '2026-11-14T12:00:00.000Z' }],
      checklists: [{ id: 'checklist-new', title: 'Release checks', items: [{ id: 'item-new', text: 'Verify build', done: true }] }],
    }] });
  const response = await save(app, next);
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.revision, 1);
  assert.deepEqual(saved.state, next.state);
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'state.json.bak'), 'utf8')), initial);
  await app.stop();
  app = await childServer(directory);
  assert.deepEqual(await (await fetch(`${app.url}/api/state`)).json(), saved);
});

test('concurrent writes from the same revision cannot overwrite each other', async (t) => {
  const app = await launch(t, await temporary(t));
  const initial = await (await fetch(`${app.url}/api/state`)).json();
  const left = structuredClone(initial);
  const right = structuredClone(initial);
  left.state.workspaces[0].name = 'Left';
  right.state.workspaces[0].name = 'Right';
  const replies = await Promise.all([save(app, left), save(app, right)]);
  assert.deepEqual(replies.map((reply) => reply.status).sort(), [200, 409]);
  const winner = await replies.find((reply) => reply.status === 200).json();
  assert.deepEqual(await (await fetch(`${app.url}/api/state`)).json(), winner);
});

test('invalid data, duplicate identity, impossible dates and malformed requests preserve the database', async (t) => {
  const directory = await temporary(t);
  const app = await launch(t, directory);
  const initialText = await readFile(join(directory, 'state.json'), 'utf8');
  const initial = JSON.parse(initialText);
  const invalids = [null, {}, { ...initial, revision: -1 }];
  const duplicate = structuredClone(initial);
  duplicate.state.boards[0].cards[0].id = duplicate.state.workspaces[0].id;
  invalids.push(duplicate);
  const impossible = structuredClone(initial);
  impossible.state.boards[0].cards[0].dueDate = '2026-02-30';
  invalids.push(impossible);
  const orphan = structuredClone(initial);
  orphan.state.boards[0].cards[0].listId = 'missing';
  invalids.push(orphan);
  for (const value of invalids) {
    const reply = await save(app, value);
    assert.equal(reply.status, 400, await reply.text());
  }
  assert.equal((await fetch(`${app.url}/api/state`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{' })).status, 400);
  assert.equal((await fetch(`${app.url}/api/state`, { method: 'PUT', body: '{}' })).status, 415);
  assert.equal(await readFile(join(directory, 'state.json'), 'utf8'), initialText);
});

test('oversized requests are rejected without replacing saved data', async (t) => {
  const directory = await temporary(t);
  const app = await launch(t, directory);
  const initial = await readFile(join(directory, 'state.json'), 'utf8');
  const response = await fetch(`${app.url}/api/state`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: `{"text":"${'x'.repeat(16 * 1024 * 1024)}"}` });
  assert.equal(response.status, 413);
  assert.equal(await readFile(join(directory, 'state.json'), 'utf8'), initial);
});

test('corrupt stored data fails closed and leaves both original and backup untouched', async (t) => {
  const directory = await temporary(t);
  await writeFile(join(directory, 'state.json'), '{broken');
  await writeFile(join(directory, 'state.json.bak'), 'retained backup');
  await assert.rejects(startServer({ port: 0, dataDirectory: directory }), /Existing data was preserved/);
  assert.equal(await readFile(join(directory, 'state.json'), 'utf8'), '{broken');
  assert.equal(await readFile(join(directory, 'state.json.bak'), 'utf8'), 'retained backup');
});

test('static requests cannot escape public files or read the private database', async (t) => {
  const app = await launch(t, await temporary(t));
  for (const path of ['/server.mjs', '/.data/state.json', '/%2e%2e%2fserver.mjs', '/%2e%2e%5cserver.mjs', '/%00', '/%zz']) {
    const status = await new Promise((accept, reject) => {
      http.get(`${app.url}${path}`, (response) => { response.resume(); accept(response.statusCode); }).on('error', reject);
    });
    assert.ok([400, 404].includes(status), `${path}: ${status}`);
  }
  const model = await fetch(`${app.url}/model.js`);
  assert.equal(model.status, 200);
  assert.match(model.headers.get('content-type'), /text\/javascript/);
  const origin = await fetch(`${app.url}/api/state`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' }, body: '{}' });
  assert.equal(origin.status, 403);
});

test('shared validation preserves source strings and accepts the complete seed', () => {
  const value = createInitialState();
  value.boards[0].cards[0].description = '  Unicode: İstanbul <script>literal text</script>\n';
  assert.equal(validateState(value), value);
  assert.equal(value.boards[0].cards[0].description, '  Unicode: İstanbul <script>literal text</script>\n');
});

test('all identity owners reject HTML identities without changing state or its backup', async (t) => {
  const directory = await temporary(t);
  const app = await launch(t, directory);
  const initial = await (await fetch(`${app.url}/api/state`)).json();
  const original = await readFile(join(directory, 'state.json'), 'utf8');
  const marker = '"><img src="/missing" onerror="window.__identityAudit=1">';
  const changeIdentity = [
    (s) => { const old = s.workspaces[0].id; s.workspaces[0].id = marker; s.boards.forEach((b) => { if (b.workspaceId === old) b.workspaceId = marker; }); },
    (s) => { s.boards[0].id = marker; },
    (s) => { const old = s.boards[0].lists[0].id; s.boards[0].lists[0].id = marker; s.boards[0].cards.forEach((c) => { if (c.listId === old) c.listId = marker; }); },
    (s) => { s.boards[0].cards[0].id = marker; },
    (s) => { s.boards[0].cards[0].comments = [{ id: marker, text: 'Synthetic comment', createdAt: new Date().toISOString() }]; },
    (s) => { s.boards[0].cards[0].checklists = [{ id: marker, title: 'Synthetic checklist', items: [] }]; },
    (s) => { s.boards[0].cards[0].checklists = [{ id: 'check-audit', title: 'Synthetic checklist', items: [{ id: marker, text: 'Synthetic item', done: false }] }]; },
  ];
  for (const change of changeIdentity) {
    const candidate = structuredClone(initial);
    change(candidate.state);
    const reply = await save(app, candidate);
    assert.equal(reply.status, 400);
    assert.match((await reply.json()).error, /\.id must contain only ASCII/);
    assert.equal(await readFile(join(directory, 'state.json'), 'utf8'), original);
  }
  await assert.rejects(readFile(join(directory, 'state.json.bak')), { code: 'ENOENT' });
});

test('HTTP host and origin are checked before state, files, or mutations', async (t) => {
  const app = await launch(t, await temporary(t));
  const port = new URL(app.url).port;
  const get = (path, headers) => new Promise((accept, reject) => {
    http.get(`${app.url}${path}`, { headers }, (reply) => {
      const chunks = [];
      reply.on('data', (chunk) => chunks.push(chunk));
      reply.on('end', () => accept({ status: reply.statusCode, headers: reply.headers, body: Buffer.concat(chunks).toString('utf8') }));
    }).on('error', reject);
  });
  for (const path of ['/', '/api/state', '/app.js']) {
    for (const host of ['untrusted.invalid', `untrusted.invalid:${port}`, `127.0.0.1:${Number(port) + 1}`, `127.0.0.1:${port}@untrusted.invalid`]) {
      const reply = await get(path, { Host: host });
      assert.equal(reply.status, 403);
      assert.equal(JSON.parse(reply.body).state, undefined);
    }
    for (const origin of ['null', 'http://untrusted.invalid', `https://127.0.0.1:${port}`, `${app.url}/not-an-origin`]) {
      assert.equal((await get(path, { Origin: origin })).status, 403);
    }
    for (const host of [`127.0.0.1:${port}`, `localhost:${port}`, `LOCALHOST:${port}`]) {
      const reply = await get(path, { Host: host });
      assert.equal(reply.status, 200);
      assert.equal(reply.headers['x-frame-options'], 'DENY');
      assert.equal(reply.headers['referrer-policy'], 'no-referrer');
      assert.equal(reply.headers['x-content-type-options'], 'nosniff');
      assert.match(reply.headers['content-security-policy'], /script-src 'self'/);
      assert.match(reply.headers['content-security-policy'], /frame-ancestors 'none'/);
    }
  }
  const initial = await (await fetch(`${app.url}/api/state`)).json();
  for (const hostname of ['127.0.0.1', 'localhost']) {
    const reply = await fetch(`${app.url}/api/state`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: `http://${hostname}:${port}` }, body: JSON.stringify(initial) });
    assert.equal(reply.status, hostname === '127.0.0.1' ? 200 : 409);
  }
  const foreign = await fetch(`${app.url}/api/state`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Origin: 'http://untrusted.invalid' }, body: JSON.stringify(initial) });
  assert.equal(foreign.status, 403);
});
