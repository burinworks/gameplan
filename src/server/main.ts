import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { lastBackup, snapshot, startBackups } from '../backup.js';
import { systemClock } from '../clock.js';
import { openDb } from '../db/open.js';
import { Store } from '../domain/store.js';
import { mountMcp } from '../mcp/http.js';
import { createApp } from './app.js';
import { resolveUiDir } from './ui-dir.js';

const port = Number(process.env.GAMEPLAN_PORT ?? 4747);
const dbPath = process.env.GAMEPLAN_DB ?? join(homedir(), 'Library', 'Application Support', 'Gameplan', 'gameplan.db');
const backupDir = join(dirname(dbPath), 'backups');
const version = (() => {
  try {
    return (JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }).version;
  } catch {
    try {
      return (JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as { version: string }).version;
    } catch {
      return '0.0.0';
    }
  }
})();

const here = dirname(fileURLToPath(import.meta.url));
const uiDir = resolveUiDir(here, process.env.GAMEPLAN_UI);

const db = openDb(dbPath);
const clock = systemClock;
const store = new Store(db, clock);
const stopBackups = startBackups(db, backupDir, clock);
let closeMcp = (): void => {};
const app = createApp({
  store,
  db,
  clock,
  uiDir,
  dbPath,
  version,
  backups: {
    last: () => lastBackup(backupDir),
    now: () => {
      snapshot(db, backupDir, clock, true);
      return lastBackup(backupDir);
    },
  },
  extend: (a) => (closeMcp = mountMcp(a, { store, db, clock, version })),
});

const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, (info) => {
  console.log(`gameplan listening on http://127.0.0.1:${info.port} (mcp: /mcp) · db ${dbPath}`);
});
server.on('error', (err) => {
  console.error(`gameplan failed to listen on 127.0.0.1:${port}: ${err.message}`);
  process.exit(1);
});

const shutdown = () => {
  stopBackups();
  closeMcp();
  server.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
