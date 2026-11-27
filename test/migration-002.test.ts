import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/open.js';

const SNAP = ['projects', 'areas', 'milestones', 'tasks', 'todos', 'dependencies', 'attachments', 'events'];

function v1Db(path: string): Record<string, unknown[]> {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(new URL('../migrations/001_init.sql', import.meta.url), 'utf8'));
  db.exec('PRAGMA user_version = 1');
  db.exec(`INSERT INTO projects(id, slug, name, created_at) VALUES ('prj_1','p','P','2026-11-01');
    INSERT INTO areas(id, project_id, name) VALUES ('ar_1','prj_1','Backend');
    INSERT INTO milestones(id, project_id, name, due, created_at) VALUES ('ms_1','prj_1','M','2026-12-01','2026-11-01');
    INSERT INTO tasks(id, milestone_id, area_id, title, "start", "end", status, executor, created_at, updated_at)
      VALUES ('tk_1','ms_1','ar_1','A','2026-11-02','2026-11-04','doing','ai','2026-11-01','2026-11-02'),
             ('tk_2','ms_1',NULL,'B',NULL,NULL,'todo','manual','2026-11-01','2026-11-01');
    INSERT INTO todos(id, task_id, title, done, ord) VALUES ('td_1','tk_1','x',1,0), ('td_2','tk_1','y',0,1);
    INSERT INTO dependencies(id, from_task_id, to_task_id, created_at) VALUES ('dep_1','tk_1','tk_2','2026-11-01');
    INSERT INTO attachments(id, task_id, role, kind, url, ref, at) VALUES ('att_1','tk_1','deliverable','pr','https://github.com/o/r/pull/3','#3','2026-11-02');
    INSERT INTO events(id, project_id, entity, entity_id, actor, kind, batch_id, at) VALUES ('ev_1','prj_1','task','tk_1','you','created','b_1','2026-11-01');`);
  const snap: Record<string, unknown[]> = {};
  for (const t of SNAP) snap[t] = db.prepare(`SELECT * FROM ${t} ORDER BY id`).all();
  db.close();
  return snap;
}

describe('migration 002 on a populated v1 database', () => {
  it('keeps every row and id, adds null resume columns, leaves no FK violations', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'gp-m2-')), 'g.db');
    const before = v1Db(path);
    const db = openDb(path);
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(2);
    for (const t of SNAP) {
      const rows = db.prepare(`SELECT * FROM ${t} ORDER BY id`).all() as Record<string, unknown>[];
      if (t === 'tasks') {
        for (const r of rows) {
          expect(r).toMatchObject({ resume_note: null, resume_at: null, resume_by: null });
          delete r.resume_note;
          delete r.resume_at;
          delete r.resume_by;
        }
      }
      expect(rows).toEqual(before[t]);
    }
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    expect((db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys).toBe(1);
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='tasks_milestone'").get()).toBeTruthy();
    db.close();
  });
});
