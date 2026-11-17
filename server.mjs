import http from 'node:http';
import { mkdir, readFile, writeFile, rename, realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createInitialState, validateState } from './public/model.js';

const root = dirname(fileURLToPath(import.meta.url));
const BODY_LIMIT = 16 * 1024 * 1024;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json' };

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  return new Promise((accept, reject) => {
    let size = 0;
    let rejected = false;
    const chunks = [];
    request.on('data', (chunk) => {
      if (rejected) return;
      size += chunk.length;
      if (size > BODY_LIMIT) {
        rejected = true;
        chunks.length = 0;
        const error = new Error('The request exceeds the 16 MiB local storage request limit.');
        error.status = 413;
        reject(error);
      } else chunks.push(chunk);
    });
    request.on('error', reject);
    request.on('end', () => {
      if (rejected) return;
      try { accept(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch {
        const error = new Error('The request body must be valid JSON.');
        error.status = 400;
        reject(error);
      }
    });
  });
}

export async function startServer({ port = Number(process.env.PORT ?? 4173), dataDirectory = process.env.DATA_DIRECTORY ?? resolve(root, '.data') } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer between 0 and 65535.');
  const dataRoot = resolve(dataDirectory);
  const statePath = resolve(dataRoot, 'state.json');
  await mkdir(dataRoot, { recursive: true });
  let saved;
  let serialized;
  try {
    serialized = await readFile(statePath, 'utf8');
    saved = JSON.parse(serialized);
    if (!Number.isSafeInteger(saved.revision) || saved.revision < 0) throw new Error('The stored revision is invalid.');
    validateState(saved.state);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Cannot open ${statePath}: ${error.message} Existing data was preserved. Restore state.json.bak after keeping a copy of the damaged file.`);
    }
    saved = { revision: 0, state: createInitialState() };
    serialized = JSON.stringify(saved, null, 2);
    // Exclusive creation prevents a concurrent startup from overwriting an existing database.
    await writeFile(statePath, serialized, { encoding: 'utf8', flag: 'wx' });
  }

  const publicRoot = await realpath(resolve(root, 'public'));
  let writeQueue = Promise.resolve();
  const enqueue = (operation) => {
    const result = writeQueue.then(operation);
    writeQueue = result.catch(() => {});
    return result;
  };

  const server = http.createServer(async (request, response) => {
    try {
      response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'");
      response.setHeader('X-Frame-Options', 'DENY');
      response.setHeader('Referrer-Policy', 'no-referrer');
      response.setHeader('X-Content-Type-Options', 'nosniff');

      // Own HTTP authority validation here, before either state or static files.
      const listeningPort = server.address().port;
      const authorities = new Set([`127.0.0.1:${listeningPort}`, `localhost:${listeningPort}`]);
      if (listeningPort === 80) { authorities.add('127.0.0.1'); authorities.add('localhost'); }
      if (typeof request.headers.host !== 'string' || !authorities.has(request.headers.host.toLowerCase())) {
        return json(response, 403, { error: 'Use this application through its local address and port.' });
      }
      const origins = new Set([...authorities].map(authority => new URL(`http://${authority}`).origin));
      if (request.headers.origin !== undefined && !origins.has(request.headers.origin)) {
        return json(response, 403, { error: 'Requests must come from the local application origin.' });
      }
      const url = new URL(request.url, 'http://127.0.0.1');
      if (url.pathname === '/api/state') {
        if (request.method === 'GET') {
          await writeQueue;
          return json(response, 200, saved);
        }
        if (request.method !== 'PUT') {
          response.setHeader('Allow', 'GET, PUT');
          return json(response, 405, { error: 'Use GET or PUT for local state.' });
        }
        if (!request.headers['content-type']?.startsWith('application/json')) return json(response, 415, { error: 'Send Content-Type: application/json.' });
        const payload = await readBody(request);
        if (payload === null || typeof payload !== 'object' || !Number.isSafeInteger(payload.revision) || payload.revision < 0) return json(response, 400, { error: 'A nonnegative integer revision is required.' });
        try { validateState(payload.state); }
        catch (error) { return json(response, 400, { error: error.message }); }
        return await enqueue(async () => {
          if (payload.revision !== saved.revision) return json(response, 409, { error: 'Another tab changed this workspace. Reload to get its latest data before saving again.', revision: saved.revision });
          const next = { revision: saved.revision + 1, state: payload.state };
          const nextText = JSON.stringify(next, null, 2);
          const temporary = resolve(dataRoot, `state-${randomUUID()}.tmp`);
          await writeFile(temporary, nextText, { encoding: 'utf8', flag: 'wx' });
          await writeFile(`${statePath}.bak`, serialized, 'utf8');
          await rename(temporary, statePath);
          saved = next;
          serialized = nextText;
          json(response, 200, saved);
        });
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return json(response, 405, { error: 'This resource is read-only.' });
      let requested;
      try { requested = decodeURIComponent(url.pathname); }
      catch { return json(response, 400, { error: 'Invalid URL encoding.' }); }
      const segments = requested.split(/[\\/]/);
      if (segments.some((part) => part.startsWith('.') || part.includes('\0'))) return json(response, 404, { error: 'File not found.' });
      const candidate = resolve(publicRoot, requested === '/' ? 'index.html' : `.${requested}`);
      if (!candidate.startsWith(`${publicRoot}${sep}`)) return json(response, 404, { error: 'File not found.' });
      let path;
      try {
        path = await realpath(candidate);
        if (!path.startsWith(`${publicRoot}${sep}`) || !(await stat(path)).isFile()) return json(response, 404, { error: 'File not found.' });
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return json(response, 404, { error: 'File not found.' });
        throw error;
      }
      const type = mime[extname(path).toLowerCase()];
      if (!type) return json(response, 404, { error: 'File not found.' });
      const bytes = await readFile(path);
      response.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      if (!response.headersSent) json(response, error.status ?? 500, { error: error.status ? error.message : 'The local server could not complete the request. Your previous saved data remains available.' });
      else response.end();
      if (!error.status) console.error(error);
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', accept);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}`, dataDirectory: dataRoot };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const app = await startServer();
    console.log(`Trello Local ready: ${app.url}`);
    console.log(`Data: ${app.dataDirectory}`);
    console.log('Press Ctrl+C to stop.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
