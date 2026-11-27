import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/open.js';

const TABLES = ['agent_clients', 'areas', 'attachments', 'day_plan_items', 'dependencies', 'events', 'inbox_items', 'milestones', 'projects', 'settings', 'tasks', 'todos'];

describe('openDb', () => {
  it('creates all tables at user_version 2', () => {
    const db = openDb(':memory:');
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
    expect(rows.map((r) => r.name)).toEqual(TABLES);
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(2);
  });

  it('does not re-run applied migrations on reopen', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gp-'));
    const path = join(dir, 'nested', 'g.db');
    const a = openDb(path);
    a.prepare("INSERT INTO settings(key, value_json) VALUES ('x', '1')").run();
    a.close();
    const b = openDb(path);
    expect(b.prepare("SELECT value_json FROM settings WHERE key='x'").get()).toEqual({ value_json: '1' });
    b.close();
  });

  it('enforces foreign keys and the dependency target check', () => {
    const db = openDb(':memory:');
    expect(() => db.prepare("INSERT INTO milestones(id, project_id, name, created_at) VALUES ('ms_1', 'nope', 'M', 'x')").run()).toThrow();
    db.exec(`INSERT INTO projects(id, slug, name, created_at) VALUES ('prj_1','p','P','x');
      INSERT INTO milestones(id, project_id, name, created_at) VALUES ('ms_1','prj_1','M','x');
      INSERT INTO tasks(id, milestone_id, title, created_at, updated_at) VALUES ('tk_1','ms_1','A','x','x'), ('tk_2','ms_1','B','x','x');`);
    expect(() => db.prepare("INSERT INTO dependencies(id, from_task_id, created_at) VALUES ('dep_1','tk_1','x')").run()).toThrow();
    expect(() => db.prepare("INSERT INTO dependencies(id, from_task_id, to_task_id, to_milestone_id, created_at) VALUES ('dep_1','tk_1','tk_2','ms_1','x')").run()).toThrow();
    db.prepare("INSERT INTO dependencies(id, from_task_id, to_task_id, created_at) VALUES ('dep_1','tk_1','tk_2','x')").run();
  });

  it('accepts review status, together executor and ticket attachments', () => {
    const db = openDb(':memory:');
    db.exec(`INSERT INTO projects(id, slug, name, created_at) VALUES ('prj_1','p','P','x');
      UPDATE projects SET default_executor = 'together';
      INSERT INTO milestones(id, project_id, name, created_at) VALUES ('ms_1','prj_1','M','x');
      INSERT INTO tasks(id, milestone_id, title, status, executor, created_at, updated_at) VALUES ('tk_1','ms_1','A','review','together','x','x');
      INSERT INTO attachments(id, task_id, role, kind, url, at) VALUES ('att_1','tk_1','context','ticket','https://x.atlassian.net/browse/AB-1','x');`);
    expect(() => db.prepare("INSERT INTO tasks(id, milestone_id, title, status, created_at, updated_at) VALUES ('tk_2','ms_1','B','nope','x','x')").run()).toThrow();
    const t = db.prepare("SELECT resume_note, resume_at, resume_by FROM tasks WHERE id='tk_1'").get();
    expect(t).toEqual({ resume_note: null, resume_at: null, resume_by: null });
  });
});
