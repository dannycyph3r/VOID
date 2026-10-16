// Playwright webServer: builds the client the way production does and starts
// the real server (server/index.ts, what `npm start` runs) for each build.
//
//   local-only  VITE_VOID_API_URL empty  → LOCAL_PORT (also hosts the determinism page)
//   online      VITE_VOID_API_URL=/api   → one server per browser, ONLINE_PORTS
//
// Each server runs with its build directory as cwd (the server serves ./dist)
// and a fresh SQLite file under e2e/.out/db. The local server starts last, so
// once Playwright sees it answer, every server is up.
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'vite';
import { LOCAL_PORT, ONLINE_PORTS } from './ports.ts';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'e2e/.out');
const dbDir = join(out, 'db');
const children: ChildProcess[] = [];

async function buildClient(name: string, apiUrl: string) {
  // Set in process.env so it beats any .env file, like a CI variable would.
  process.env.VITE_VOID_API_URL = apiUrl;
  await build({
    configFile: join(root, 'e2e/vite.config.ts'),
    logLevel: 'warn',
    build: { outDir: join(out, name, 'dist'), emptyOutDir: true },
  });
}

async function startServer(name: string, port: number, cwd: string) {
  const child = spawn(process.execPath, [join(root, 'server/index.ts')], {
    cwd,
    env: { ...process.env, PORT: String(port), VOID_DB_PATH: join(dbDir, `${name}.db`) },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  children.push(child);
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error(`[e2e] ${name} server exited with ${code}`);
      shutdown(1);
    }
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/`)).ok) return;
    } catch { /* not listening yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${name} server did not start on ${port}`);
}

function shutdown(code = 0) {
  for (const c of children) c.kill('SIGTERM');
  process.exit(code);
}
process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

rmSync(dbDir, { recursive: true, force: true });
mkdirSync(dbDir, { recursive: true });
await buildClient('local', '');
await buildClient('online', '/api');
for (const [browser, port] of Object.entries(ONLINE_PORTS)) await startServer(`online-${browser}`, port, join(out, 'online'));
await startServer('local', LOCAL_PORT, join(out, 'local'));
