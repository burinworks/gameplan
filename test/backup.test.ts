import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixedClock } from '../src/clock.js';
import { lastBackup, rotate, snapshot } from '../src/backup.js';
import { setup, YOU } from './helpers.js';

const dir = () => mkdtempSync(join(tmpdir(), 'gp-bk-'));

describe('backups', () => {
  it('one snapshot per day unless forced', () => {
    const { db, store, clock } = setup();
    const d = dir();
    const a = snapshot(db, d, clock);
    expect(a.endsWith('gameplan-2026-11-26.json')).toBe(true);
    store.createProject(YOU, { name: 'After first' });
    snapshot(db, d, clock);
    expect(readdirSync(d)).toEqual(['gameplan-2026-11-26.json']);
    expect(readFileSync(a, 'utf8')).not.toContain('After first');
    snapshot(db, d, clock, true);
    expect(readFileSync(a, 'utf8')).toContain('After first');
  });

  it('uses the configured time zone for the file date', () => {
    const { db } = setup();
    const d = dir();
    expect(snapshot(db, d, fixedClock('2026-11-25T23:30:00Z')).endsWith('gameplan-2026-11-26.json')).toBe(true);
  });

  it('rotates to the newest 30', () => {
    const d = dir();
    for (let i = 1; i <= 32; i++) writeFileSync(join(d, `gameplan-2026-10-${String(i).padStart(2, '0')}.json`.replace('2026-10-32', '2026-11-01')), '{}');
    writeFileSync(join(d, 'notes.txt'), 'keep me');
    rotate(d, 30);
    const left = readdirSync(d).sort();
    expect(left.length).toBe(31);
    expect(left).toContain('notes.txt');
    expect(left).not.toContain('gameplan-2026-10-01.json');
    expect(left).not.toContain('gameplan-2026-10-02.json');
    expect(lastBackup(d)!.file).toBe('gameplan-2026-11-01.json');
  });

  it('lastBackup is null for an empty dir; snapshot has all 13 tables', () => {
    const { db, clock } = setup();
    const d = dir();
    expect(lastBackup(d)).toBeNull();
    expect(lastBackup(join(d, 'missing'))).toBeNull();
    const f = snapshot(db, d, clock);
    expect(Object.keys(JSON.parse(readFileSync(f, 'utf8')).tables).length).toBe(13);
    expect(lastBackup(d)).toEqual(expect.objectContaining({ file: 'gameplan-2026-11-26.json' }));
  });
});
