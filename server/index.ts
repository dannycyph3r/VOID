// VOID server: serves the built client (dist/) and the leaderboard API.
//   npm run build && npm start
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { createApi } from './api.ts';
import { openDb } from './db.ts';

const PORT = Number(process.env.PORT ?? 8787);
const DB_PATH = process.env.VOID_DB_PATH ?? 'data/void.db';
const ORIGINS = new Set((process.env.VOID_CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
const DIST = resolve('dist');
const MAX_BODY = 32 * 1024;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

const db = openDb(DB_PATH);
const api = createApi(db);

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        fail(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', fail);
  });
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

async function handleApi(req: IncomingMessage, res: ServerResponse, url: URL) {
  const origin = req.headers.origin;
  const cors: Record<string, string> = origin && ORIGINS.has(origin)
    ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST', vary: 'origin' }
    : {};
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  let body: unknown = null;
  if (req.method === 'POST') {
    try {
      const raw = await readBody(req);
      body = raw ? JSON.parse(raw) : null;
    } catch {
      send(res, 400, { error: 'invalid or oversized JSON body' }, cors);
      return;
    }
  }
  const auth = req.headers.authorization;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  try {
    const out = api({ method: req.method ?? 'GET', path: url.pathname, query: url.searchParams, token, body, ip: req.socket.remoteAddress ?? '?' });
    send(res, out.status, out.body, cors);
  } catch (e) {
    console.error('[api]', e);
    send(res, 500, { error: 'server error' }, cors);
  }
}

function serveStatic(res: ServerResponse, pathname: string) {
  if (!existsSync(DIST)) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Client not built. Run `npm run build`, or use `npm run dev` for the Vite dev server.');
    return;
  }
  let file = normalize(join(DIST, decodeURIComponent(pathname)));
  if (!file.startsWith(DIST)) file = join(DIST, 'index.html');
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
  const immutable = file.includes(`${join(DIST, 'assets')}`);
  res.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname.startsWith('/api/')) void handleApi(req, res, url);
  else if (req.method === 'GET' || req.method === 'HEAD') serveStatic(res, url.pathname);
  else send(res, 405, { error: 'method not allowed' });
});

server.listen(PORT, () => {
  console.log(`VOID server on http://localhost:${PORT} (db: ${DB_PATH})`);
});

const shutdown = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
