import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { setup } from './helpers.js';

function api() {
  const s = setup();
  const app = createApp({ store: s.store, db: s.db, clock: s.clock });
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const ct = res.headers.get('content-type') ?? '';
    return { status: res.status, ct, headers: res.headers, body: ct.includes('json') ? await res.json() : await res.text() } as { status: number; ct: string; headers: Headers; body: any };
  };
  return { ...s, app, call };
}

async function seeded() {
  const a = api();
  const p = await a.call('POST', '/api/projects', { name: 'Learn Studio', areas: [{ name: 'AI' }], firstMilestone: { name: 'Proto', due: '2027-01-15' } });
  expect(p.status).toBe(201);
  const tree = await a.call('GET', '/api/projects/learn-studio');
  const msId = tree.body.milestones[0].id as string;
  const t = await a.call('POST', `/api/milestones/${msId}/tasks`, { title: 'Wire API', area: 'AI', start: '2026-11-25', end: '2026-11-28', todos: [{ title: 'a' }] });
  expect(t.status).toBe(201);
  return { ...a, msId, taskId: t.body.id as string };
}

describe('http api', () => {
  it('GET /api/info returns the database path and is host-guarded', async () => {
    const s = setup();
    const app = createApp({ store: s.store, db: s.db, clock: s.clock, dbPath: '/data/gp/gameplan.db', version: '9.9.9' });
    const ok = await app.request('/api/info', { headers: { host: '127.0.0.1:4747' } });
    expect(await ok.json()).toEqual({ dbPath: '/data/gp/gameplan.db', version: '9.9.9', port: 4747, configuredPort: 4747 });
    expect((await app.request('/api/info', { headers: { host: 'evil.example' } })).status).toBe(403);
  });

  it('create project → task → home lists it today', async () => {
    const { call } = await seeded();
    const h = await call('GET', '/api/home');
    expect(h.status).toBe(200);
    expect(h.body.today).toBe('2026-11-26');
    expect(h.body.todayTasks.map((t: { title: string }) => t.title)).toEqual(['Wire API']);
    const list = await call('GET', '/api/projects');
    expect(list.body.map((p: { slug: string }) => p.slug)).toEqual(['learn-studio']);
    const ov = await call('GET', '/api/overview');
    expect(ov.body.count).toBe(0);
    const tl = await call('GET', '/api/timeline');
    expect(tl.body[0].milestones[0].name).toBe('Proto');
  });

  it('maps errors to status codes', async () => {
    const { call, msId } = await seeded();
    const bad = await call('POST', `/api/milestones/${msId}/tasks`, { title: 'x', start: '2026-11-30', end: '2026-11-01' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('invalid');
    expect((await call('GET', '/api/projects/nope')).status).toBe(404);
    expect((await call('PATCH', '/api/projects/learn-studio', { status: 'weird' })).status).toBe(400);
    const res = await (await seeded()).app.request('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
    expect(res.status).toBe(400);
  });

  it('reschedule then revert restores dates', async () => {
    const { call, taskId } = await seeded();
    const r = await call('POST', `/api/tasks/${taskId}/reschedule`, { start: '2026-11-26', end: '2026-11-30' });
    expect(r.status).toBe(200);
    expect(r.body.moved.length).toBe(1);
    const ups = await call('GET', '/api/updates?actor=you');
    const ev = ups.body.find((e: { kind: string }) => e.kind === 'dates_changed');
    const rv = await call('POST', `/api/events/${ev.id}/revert`);
    expect(rv.status).toBe(200);
    const tree = await call('GET', '/api/projects/learn-studio');
    const t = tree.body.milestones[0].tasks[0];
    expect([t.start, t.end]).toEqual(['2026-11-25', '2026-11-28']);
  });

  it('covers the write surface', async () => {
    const { call, taskId, msId } = await seeded();
    expect((await call('PATCH', `/api/tasks/${taskId}`, { title: 'Wire the API', important: true })).body.title).toBe('Wire the API');
    const todos = await call('POST', `/api/tasks/${taskId}/todos`, { todos: [{ title: 'b' }] });
    expect(todos.status).toBe(201);
    const tid = todos.body[0].id;
    expect((await call('PATCH', `/api/todos/${tid}`, { done: true })).body.done).toBe(true);
    expect((await call('PATCH', `/api/todos/${tid}`, { title: 'bb' })).body.title).toBe('bb');
    const ms2 = await call('POST', '/api/projects/learn-studio/milestones', { name: 'Beta' });
    expect(ms2.status).toBe(201);
    expect((await call('PATCH', `/api/milestones/${ms2.body.id}`, { due: '2027-02-01' })).body.due).toBe('2027-02-01');
    expect((await call('POST', '/api/reorder', { entity: 'milestone', ids: [ms2.body.id, msId] })).status).toBe(200);
    const t2 = await call('POST', `/api/milestones/${ms2.body.id}/tasks`, { title: 'Ship' });
    const dep = await call('POST', '/api/dependencies', { fromTaskId: t2.body.id, taskId });
    expect(dep.status).toBe(201);
    expect((await call('DELETE', `/api/dependencies/${dep.body.id}`)).status).toBe(200);
    const att = await call('POST', `/api/tasks/${taskId}/attachments`, { role: 'deliverable', url: 'https://github.com/o/r/pull/7' });
    expect(att.body.ref).toBe('#7');
    expect((await call('DELETE', `/api/attachments/${att.body.id}`)).status).toBe(200);
    expect((await call('POST', '/api/archive', { entity: 'task', id: t2.body.id })).status).toBe(200);
    expect((await call('POST', '/api/restore', { entity: 'task', id: t2.body.id })).status).toBe(200);
    const s = await call('GET', '/api/search?q=wire');
    expect(s.body[0].title).toBe('Wire the API');
    expect((await call('GET', '/api/agents')).body).toEqual([]);
    expect((await call('GET', `/api/tasks/${taskId}`)).body.title).toBe('Wire the API');
    expect((await call('GET', `/api/milestones/${msId}`)).body.name).toBe('Proto');
  });

  it('settings persist', async () => {
    const { call } = api();
    expect((await call('PATCH', '/api/settings', { agents_can_archive: true })).status).toBe(200);
    expect((await call('GET', '/api/settings')).body.agents_can_archive).toBe(true);
    expect((await call('PATCH', '/api/settings', { time_zone: 'Mars/Base' })).status).toBe(400);
  });

  it('exports markdown and json as downloads', async () => {
    const { call } = await seeded();
    const md = await call('GET', '/api/export?format=md');
    expect(md.ct).toContain('text/markdown');
    expect(md.headers.get('content-disposition')).toContain('gameplan-2026-11-26.md');
    expect(md.body).toContain('# Learn Studio');
    const js = await call('GET', '/api/export?format=json&project=learn-studio');
    expect(js.status).toBe(200);
    expect(js.body.tables.projects.length).toBe(1);
  });

  it('streams change events over SSE', async () => {
    const { app, call } = await seeded();
    const ctrl = new AbortController();
    const res = await app.request('/events', { signal: ctrl.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    await call('PATCH', '/api/projects/learn-studio', { name: 'Learn Studio 2' });
    let buf = '';
    const deadline = Date.now() + 2000;
    while (!buf.includes('event: change') && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value);
    }
    expect(buf).toContain('event: change');
    expect(buf).toContain('Learn Studio 2');
    ctrl.abort();
    await reader.cancel().catch(() => {});
  });
});

describe('http work features', () => {
  it('review accept via POST /review', async () => {
    const { call, store, taskId } = await seeded();
    store.updateTask({ actor: 'ai:codex' }, taskId, { status: 'done' });
    expect((await call('GET', '/api/home')).body.needsReview).toHaveLength(1);
    const r = await call('POST', `/api/tasks/${taskId}/review`, { decision: 'accept' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('done');
    expect((await call('POST', `/api/tasks/${taskId}/review`, { decision: 'accept' })).status).toBe(400);
  });

  it('resume note and day plan show on home', async () => {
    const { call, taskId } = await seeded();
    expect((await call('PUT', `/api/tasks/${taskId}/resume`, { note: 'Next: wire auth' })).body.resumeNote).toBe('Next: wire auth');
    const put = await call('PUT', '/api/day-plan/2026-11-26', { items: [{ taskId, when: 'morning' }] });
    expect(put.status).toBe(200);
    expect((await call('GET', '/api/day-plan/2026-11-26')).body).toEqual([expect.objectContaining({ taskId, when: 'morning' })]);
    const h = (await call('GET', '/api/home')).body;
    expect(h.plan).toEqual([expect.objectContaining({ n: 1, when: 'morning', resume: expect.objectContaining({ note: 'Next: wire auth' }) })]);
  });

  it('inbox capture → triage', async () => {
    const { call, msId } = await seeded();
    const c = await call('POST', '/api/inbox', { text: 'Book the room' });
    expect(c.status).toBe(201);
    expect((await call('GET', '/api/inbox')).body.count).toBe(1);
    const t = await call('POST', `/api/inbox/${c.body.id}/triage`, { as: 'task', milestoneId: msId });
    expect(t.body.created.entity).toBe('task');
    expect((await call('GET', '/api/inbox')).body.count).toBe(0);
    expect((await call('POST', `/api/inbox/${c.body.id}/triage`, { as: 'dismiss' })).status).toBe(409);
  });

  it('templates list and create from a template', async () => {
    const { call } = api();
    expect((await call('GET', '/api/templates')).body).toHaveLength(3);
    const p = await call('POST', '/api/projects', { name: 'Launch it', template: 'launch', startDate: '2026-12-01' });
    expect(p.status).toBe(201);
    expect((await call('GET', `/api/projects/${p.body.slug}`)).body.milestones).toHaveLength(4);
  });

  it('settings never return the mcp token', async () => {
    const { call, db } = api();
    expect((await call('GET', '/api/settings')).body.mcp_token_set).toBe(false);
    const r = await call('PATCH', '/api/settings', { mcp_token: 'secret-token-1234567890' });
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain('secret-token');
    const g = (await call('GET', '/api/settings')).body;
    expect(g.mcp_token_set).toBe(true);
    expect(JSON.stringify(g)).not.toContain('secret-token');
    expect(JSON.stringify((await call('GET', '/api/updates')).body)).not.toContain('secret-token');
    expect(JSON.stringify((await call('GET', '/api/export')).body)).not.toContain('secret-token');
    expect((await call('PATCH', '/api/settings', { mcp_token: 'short' })).status).toBe(400);
    expect((await call('PATCH', '/api/settings', { mcp_token: null })).status).toBe(200);
    expect(JSON.parse((db.prepare("SELECT value_json FROM settings WHERE key = 'mcp_token'").get() as { value_json: string }).value_json)).toBeNull();
  });
});

