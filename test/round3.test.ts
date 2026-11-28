import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/open.js';
import { home, listProjects, projectTree, timeline } from '../src/domain/queries.js';
import { revert } from '../src/domain/revert.js';
import { createApp } from '../src/server/app.js';
import { expectCode, setup, YOU } from './helpers.js';

const PALETTE = ['#6E7CF5', '#D9892B', '#3FA796', '#B66AD0', '#7A8B99', '#E07A5F', '#4E9BD6', '#9AA24A'];

describe('milestone colours', () => {
  it('createMilestone takes the next unused palette colour in the project', () => {
    const { store } = setup();
    store.createProject(YOU, { name: 'P' });
    store.createProject(YOU, { name: 'Q' });
    const a = store.createMilestone(YOU, 'p', { name: 'A' });
    const b = store.createMilestone(YOU, 'p', { name: 'B' });
    const q = store.createMilestone(YOU, 'q', { name: 'A' });
    expect([a.color, b.color, q.color]).toEqual([PALETTE[0], PALETTE[1], PALETTE[0]]);
  });

  it('skips colours in use, reuses a freed one, and wraps after eight', () => {
    const { store } = setup();
    store.createProject(YOU, { name: 'P' });
    const a = store.createMilestone(YOU, 'p', { name: 'A' });
    store.createMilestone(YOU, 'p', { name: 'B' });
    store.updateMilestone(YOU, a.id, { color: PALETTE[5]! });
    expect(store.createMilestone(YOU, 'p', { name: 'C' }).color).toBe(PALETTE[0]);
    for (let i = 0; i < 6; i++) store.createMilestone(YOU, 'p', { name: `X${i}` });
    expect(store.createMilestone(YOU, 'p', { name: 'wrap' }).color).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('an explicit colour is accepted when valid hex', () => {
    const { store } = setup();
    store.createProject(YOU, { name: 'P' });
    expect(store.createMilestone(YOU, 'p', { name: 'A', color: '#112233' }).color).toBe('#112233');
    expectCode(() => store.createMilestone(YOU, 'p', { name: 'B', color: 'red' }), 'invalid', 'hex');
  });

  it('updateMilestone validates and records the change; revertible', () => {
    const { store, db } = setup();
    store.createProject(YOU, { name: 'P' });
    const m = store.createMilestone(YOU, 'p', { name: 'A' });
    expectCode(() => store.updateMilestone(YOU, m.id, { color: '#12' }), 'invalid', 'hex');
    expectCode(() => store.updateMilestone(YOU, m.id, { color: null as never }), 'invalid');
    const u = store.updateMilestone(YOU, m.id, { color: '#abcdef' });
    expect(u.color).toBe('#abcdef');
    const ev = db.prepare("SELECT id FROM events WHERE kind = 'updated' AND entity = 'milestone'").get() as { id: string };
    revert(store, YOU, ev.id);
    expect(store.milestone(m.id).color).toBe(PALETTE[0]);
  });

  it("a template's milestones get palette colours in order", () => {
    const { store, db } = setup();
    store.createProject(YOU, { name: 'R', template: 'report' });
    const colours = (db.prepare('SELECT color FROM milestones ORDER BY ord').all() as { color: string }[]).map((r) => r.color);
    expect(colours.length).toBeGreaterThan(1);
    expect(colours).toEqual(PALETTE.slice(0, colours.length));
  });

  it('GET /api/projects/:slug milestone rows carry color; PATCH accepts it', async () => {
    const s = setup();
    const app = createApp({ store: s.store, db: s.db, clock: s.clock });
    const j = async (m: string, p: string, b?: unknown) => {
      const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) });
      return { status: r.status, body: (await r.json()) as any };
    };
    await j('POST', '/api/projects', { name: 'P' });
    const ms = (await j('POST', '/api/projects/p/milestones', { name: 'A' })).body;
    expect(ms.color).toBe(PALETTE[0]);
    expect((await j('PATCH', `/api/milestones/${ms.id}`, { color: '#445566' })).body.color).toBe('#445566');
    expect((await j('GET', '/api/projects/p')).body.milestones[0].color).toBe('#445566');
    expect((await j('POST', '/api/projects/p/milestones', { name: 'B', color: '#010203' })).body.color).toBe('#010203');
  });
});

describe('projects with no milestone', () => {
  it('a blank project has none and every read model copes', async () => {
    const { store, db } = setup();
    store.createProject(YOU, { name: 'Blank' });
    expect(db.prepare('SELECT count(*) AS n FROM milestones').get()).toEqual({ n: 0 });
    const tree = projectTree(db, 'blank', '2026-11-26');
    expect(tree.milestones).toEqual([]);
    expect(tree.project.progress).toBeTruthy();
    expect(listProjects(db, '2026-11-26')[0]).toMatchObject({ slug: 'blank', milestones: [], nextMilestone: null });
    const h = home(db, '2026-11-26', store.settings());
    expect(h.todayTasks).toEqual([]);
    expect(timeline(db, '2026-11-26', '2026-11-01', '2026-12-31')[0]!.milestones).toEqual([]);
    const s = setup();
    const app = createApp({ store: s.store, db: s.db, clock: s.clock });
    await app.request('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Blank' }) });
    for (const p of ['/api/projects/blank', '/api/home', '/api/timeline', '/api/projects', '/api/overview']) expect((await app.request(p)).status).toBe(200);
  });
});

describe('a new open to-do reopens the task', () => {
  const mk = () => {
    const s = setup();
    s.store.createProject(YOU, { name: 'P', firstMilestone: { name: 'M' } });
    const ms = (s.db.prepare('SELECT id FROM milestones').get() as { id: string }).id;
    const t = s.store.createTask(YOU, ms, { title: 'T', todos: [{ title: 'a' }] });
    return { ...s, t };
  };
  it('done → doing', () => {
    const { store, t } = mk();
    store.setTodoDone(YOU, store.todosOf(t.id)[0]!.id, true);
    expect(store.task(t.id).status).toBe('done');
    store.addTodos(YOU, t.id, [{ title: 'b' }]);
    expect(store.task(t.id).status).toBe('doing');
  });
  it('review → doing', () => {
    const { store, t } = mk();
    store.setTodoDone({ actor: 'ai:codex' }, store.todosOf(t.id)[0]!.id, true);
    expect(store.task(t.id).status).toBe('review');
    store.addTodos({ actor: 'ai:codex' }, t.id, [{ title: 'b' }]);
    expect(store.task(t.id).status).toBe('doing');
  });
  it('is one batch and revertible together', () => {
    const { store, t, db } = mk();
    store.setTodoDone(YOU, store.todosOf(t.id)[0]!.id, true);
    store.addTodos(YOU, t.id, [{ title: 'b' }]);
    const ev = db.prepare("SELECT id FROM events WHERE kind = 'created' AND entity = 'todo' ORDER BY rowid DESC LIMIT 1").get() as { id: string };
    revert(store, YOU, ev.id);
    expect(store.task(t.id).status).toBe('done');
  });
  it('leaves todo, doing and cancelled tasks alone; createTask with todos keeps its status', () => {
    const { store, t } = mk();
    store.addTodos(YOU, t.id, [{ title: 'b' }]);
    expect(store.task(t.id).status).toBe('todo');
    store.updateTask(YOU, t.id, { status: 'cancelled' });
    store.addTodos(YOU, t.id, [{ title: 'c' }]);
    expect(store.task(t.id).status).toBe('cancelled');
    const ms = t.milestoneId;
    const r = store.createTask({ actor: 'ai:codex' }, ms, { title: 'R', status: 'done', todos: [{ title: 'x' }] });
    expect(r.status).toBe('review');
  });
});

describe('conflict is for stale state only', () => {
  it('a loop is invalid (400), not conflict', () => {
    const { store } = setup();
    store.createProject(YOU, { name: 'P', firstMilestone: { name: 'M' } });
    const ms = (store.db.prepare('SELECT id FROM milestones').get() as { id: string }).id;
    const a = store.createTask(YOU, ms, { title: 'A' });
    const b = store.createTask(YOU, ms, { title: 'B' });
    store.addDependency(YOU, a.id, { taskId: b.id });
    expectCode(() => store.addDependency(YOU, b.id, { taskId: a.id }), 'invalid', /cycle/);
    expectCode(() => store.addDependency(YOU, a.id, { taskId: a.id }), 'invalid', /cycle/);
    expectCode(() => store.addDependency(YOU, a.id, { milestoneId: ms }), 'invalid', /cycle/);
  });
});

describe('migration 003 on a populated v2 database', () => {
  it('backfills milestone colours per project in order and one log entry per resume note', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'gp-m3-')), 'g.db');
    const d = new DatabaseSync(path);
    d.exec('PRAGMA foreign_keys = ON');
    for (const f of ['001_init.sql', '002_work.sql']) {
      const sql = readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8');
      const off = sql.startsWith('-- gameplan: foreign_keys=off');
      if (off) d.exec('PRAGMA foreign_keys = OFF');
      d.exec(sql);
      if (off) d.exec('PRAGMA foreign_keys = ON');
    }
    d.exec('PRAGMA user_version = 2');
    d.exec(`INSERT INTO projects(id, slug, name, created_at) VALUES ('prj_1','p','P','2026-11-01'), ('prj_2','q','Q','2026-11-01');
      INSERT INTO milestones(id, project_id, name, ord, created_at) VALUES ('ms_a','prj_1','A',0,'2026-11-01'), ('ms_b','prj_1','B',1,'2026-11-01'), ('ms_c','prj_2','C',0,'2026-11-01');
      INSERT INTO tasks(id, milestone_id, title, status, created_at, updated_at, resume_note, resume_at, resume_by) VALUES
        ('tk_1','ms_a','T1','doing','2026-11-01','2026-11-02','Stopped at parser','2026-11-03T10:00:00.000Z','ai:codex'),
        ('tk_2','ms_a','T2','todo','2026-11-01','2026-11-01',NULL,NULL,NULL);`);
    d.close();
    const db = openDb(path);
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(3);
    expect((db.prepare('SELECT id, color FROM milestones ORDER BY id').all() as { id: string; color: string }[]).map((r) => r.color)).toEqual([PALETTE[0], PALETTE[1], PALETTE[0]]);
    const log = db.prepare('SELECT * FROM task_log').all();
    expect(log).toEqual([{ id: 'lg_tk_1', task_id: 'tk_1', text: 'Stopped at parser', actor: 'ai:codex', created_at: '2026-11-03T10:00:00.000Z', edited_at: null, deleted_at: null }]);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    db.close();
  });
});

describe('item 7: where a 409 really comes from in normal editing', () => {
  it('removing an area that tasks use is a 400 whose message names the tasks (it was a 409, which the UI shows as "Changed since")', async () => {
    const s = setup();
    const app = createApp({ store: s.store, db: s.db, clock: s.clock });
    const j = async (m: string, p: string, b?: unknown) => {
      const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) });
      return { status: r.status, body: (await r.json()) as any };
    };
    await j('POST', '/api/projects', { name: 'P', areas: [{ name: 'AI' }], firstMilestone: { name: 'M' } });
    const ms = (await j('GET', '/api/projects/p')).body.milestones[0].id;
    await j('POST', `/api/milestones/${ms}/tasks`, { title: 'Uses AI', area: 'AI' });
    const r = await j('PATCH', '/api/projects/p', { areas: [] });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toMatch(/area "AI" is used by 1 task/);
  });
});

describe('MCP token and port', () => {
  const mk = (port?: number) => {
    const s = setup();
    const app = createApp({ store: s.store, db: s.db, clock: s.clock, port });
    const j = async (m: string, p: string, b?: unknown) => {
      const r = await app.request(p, { method: m, headers: { 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) });
      return { status: r.status, body: (await r.json()) as any };
    };
    return { ...s, app, j };
  };

  it('ensureMcpToken creates one once (base64url, 43 chars) and keeps it', async () => {
    const { store } = mk();
    const { ensureMcpToken } = await import('../src/mcp/connect.js');
    const t = ensureMcpToken(store);
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ensureMcpToken(store)).toBe(t);
  });

  it('GET /api/mcp/connect: endpoint, token, every snippet has both; settings stay redacted', async () => {
    const { j } = mk(4800);
    const r = (await j('GET', '/api/mcp/connect')).body;
    expect(r.endpoint).toBe('http://127.0.0.1:4800/mcp');
    expect(Object.keys(r.snippets).sort()).toEqual(['chatgpt', 'claudeCode', 'claudeDesktop', 'codex', 'cursor', 'geminiCli', 'other']);
    for (const [k, v] of Object.entries(r.snippets) as [string, string][]) {
      expect(v, k).toContain(r.token);
      if (k !== 'chatgpt') expect(v, k).toContain(r.endpoint);
    }
    expect(r.snippets.claudeCode).toBe(`claude mcp add --transport http gameplan ${r.endpoint} --header "Authorization: Bearer ${r.token}"`);
    expect(r.snippets.claudeDesktop).toContain('mcp-remote');
    const st = (await j('GET', '/api/settings')).body;
    expect(st.mcp_token_set).toBe(true);
    expect(JSON.stringify(st)).not.toContain(r.token);
    expect((await j('GET', '/api/mcp/connect')).body.token).toBe(r.token);
  });

  it('POST /api/mcp/token/rotate issues a new token, event log never holds it', async () => {
    const { j, db } = mk();
    const a = (await j('GET', '/api/mcp/connect')).body.token;
    const b = (await j('POST', '/api/mcp/token/rotate')).body;
    expect(b.token).not.toBe(a);
    expect((await j('GET', '/api/mcp/connect')).body.token).toBe(b.token);
    expect(JSON.stringify(db.prepare('SELECT before_json, after_json FROM events').all())).not.toContain(b.token);
  });

  it('port setting: validated 1024..65535, info reports running and configured', async () => {
    const { j, store } = mk(4999);
    expect((await j('GET', '/api/info')).body).toMatchObject({ port: 4999, configuredPort: 4747 });
    expect((await j('PATCH', '/api/settings', { port: 5050 })).body.port).toBe(5050);
    expect((await j('GET', '/api/info')).body).toMatchObject({ port: 4999, configuredPort: 5050 });
    for (const bad of [80, 70000, 4747.5, '4747']) expect((await j('PATCH', '/api/settings', { port: bad })).status).toBe(400);
    expect(store.settings().port).toBe(5050);
    expect((await mk().j('GET', '/api/info')).body.port).toBe(4747);
  });
});
