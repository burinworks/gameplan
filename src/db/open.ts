import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

function migrationsDir(): string {
  // Works from src/db (tsx) and dist/src/db (compiled): walk up to the package root.
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    try {
      readdirSync(join(dir, 'migrations'));
      return join(dir, 'migrations');
    } catch {
      dir = dirname(dir);
    }
  }
  throw new Error('migrations directory not found');
}

export function openDb(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  const dir = migrationsDir();
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  const files = readdirSync(dir)
    .map((f) => ({ f, n: Number(/^(\d+)_.*\.sql$/.exec(f)?.[1]) }))
    .filter((x) => Number.isInteger(x.n) && x.n > current)
    .sort((a, b) => a.n - b.n);
  for (const { f, n } of files) {
    const sql = readFileSync(join(dir, f), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${n}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`migration ${f} failed: ${(err as Error).message}`);
    }
  }
}
