import { existsSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { Clock } from './clock.js';
import { getSettings } from './domain/settings.js';
import { exportJson } from './export.js';

const FILE_RE = /^gameplan-\d{4}-\d{2}-\d{2}\.json$/;
const EVERY_MS = 6 * 60 * 60 * 1000;

/** Writes `gameplan-<local date>.json` (= exportJson). Skips when today's file exists unless `force`. */
export function snapshot(db: DatabaseSync, dir: string, clock: Clock, force = false): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `gameplan-${clock.today(getSettings(db).time_zone)}.json`);
  if (!force && existsSync(file)) return file;
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...exportJson(db), exportedAt: clock.now() }));
  renameSync(tmp, file);
  return file;
}

function backupFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => FILE_RE.test(f))
    .sort();
}

/** Keeps the `keep` newest snapshots; other files are left alone. */
export function rotate(dir: string, keep = 30): void {
  const files = backupFiles(dir);
  for (const f of files.slice(0, Math.max(0, files.length - keep))) unlinkSync(join(dir, f));
}

export function lastBackup(dir: string): { file: string; at: string } | null {
  const f = backupFiles(dir).at(-1);
  if (!f) return null;
  return { file: f, at: statSync(join(dir, f)).mtime.toISOString() };
}

/** Snapshot now and every 6 h; returns a stop function. Errors are logged, never thrown. */
export function startBackups(db: DatabaseSync, dir: string, clock: Clock, keep = 30): () => void {
  const run = () => {
    try {
      snapshot(db, dir, clock);
      rotate(dir, keep);
    } catch (err) {
      console.error(`gameplan backup failed: ${(err as Error).message}`);
    }
  };
  run();
  const t = setInterval(run, EVERY_MS);
  t.unref();
  return () => clearInterval(t);
}
