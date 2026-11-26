import { homedir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { systemClock } from '../clock.js';
import { openDb } from '../db/open.js';
import { Store } from '../domain/store.js';
import { createApp } from './app.js';

const port = Number(process.env.GAMEPLAN_PORT ?? 4747);
const dbPath = process.env.GAMEPLAN_DB ?? join(homedir(), 'Library', 'Application Support', 'Gameplan', 'gameplan.db');

const db = openDb(dbPath);
const clock = systemClock;
const store = new Store(db, clock);
const app = createApp({ store, db, clock });

const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, (info) => {
  console.log(`gameplan listening on http://127.0.0.1:${info.port} (mcp: /mcp) · db ${dbPath}`);
});

const shutdown = () => {
  server.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
