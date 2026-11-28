import { describe, expect, it } from 'vitest';
import { home, projectTree, taskDetail } from '../src/domain/queries.js';
import { revert } from '../src/domain/revert.js';
import { createApp } from '../src/server/app.js';
import { expectCode, events, setup, YOU } from './helpers.js';

const AI = { actor: 'ai:codex' };

function base() {
  const s = setup();
  s.store.createProject(YOU, { name: 'P', firstMilestone: { name: 'M' } });
  const ms = (s.db.prepare('SELECT id FROM milestones').get() as { id: string }).id;
  const t = s.store.createTask(YOU, ms, { title: 'T', start: '2026-11-26', end: '2026-11-28' });
  return { ...s, t, ms };
}

describe('execution log', () => {
  it('addLogEntry stores text, actor and time and records one log_added event', () => {
    const { store, t, db } = base();
    const e = store.addLogEntry(AI, t.id, '  Stopped at the parser  ');
    expect(e).toMatchObject({ taskId: t.id, text: 'Stopped at the parser', actor: 'ai:codex', editedAt: null, deletedAt: null });
    expect(events(store).filter((x) => x.kind === 'log_added')).toHaveLength(1);
    expect(db.prepare("SELECT entity FROM events WHERE kind = 'log_added'").get()).toEqual({ entity: 'log' });
  });

  it('rejects empty text and over-long text', () => {
    const { store, t } = base();
    expectCode(() => store.addLogEntry(YOU, t.id, '   '), 'invalid');
    expectCode(() => store.addLogEntry(YOU, t.id, 'x'.repeat(2001)), 'invalid', '2000');
  });

  it('many entries, newest first on the tree; resume is the newest', () => {
    const { store, t, db } = base();
    store.addLogEntry(YOU, t.id, 'first');
    store.addLogEntry(AI, t.id, 'second');
    const tk = projectTree(db, 'p', '2026-11-26').milestones[0]!.tasks[0]!;
    expect(tk.log.map((l) => l.text)).toEqual(['second', 'first']);
    expect(tk.log[0]).toMatchObject({ by: 'ai:codex', editedAt: null });
    expect(tk.log[0]!.id).toMatch(/^lg_/);
    expect(tk.resume).toMatchObject({ note: 'second', by: 'ai:codex' });
    expect(taskDetail(db, t.id, '2026-11-26').log).toHaveLength(2);
  });

  it('editLogEntry: you may edit anything, an agent only its own; stamps editedAt; one log_edited event', () => {
    const { store, t } = base();
    const mine = store.addLogEntry(AI, t.id, 'agent line');
    const yours = store.addLogEntry(YOU, t.id, 'my line');
    const edited = store.editLogEntry(YOU, mine.id, 'fixed');
    expect(edited).toMatchObject({ text: 'fixed', editedAt: '2026-11-26T09:00:00.000Z' });
    store.editLogEntry(AI, mine.id, 'agent again');
    expectCode(() => store.editLogEntry(AI, yours.id, 'hijack'), 'forbidden');
    expectCode(() => store.editLogEntry({ actor: 'ai:other' }, mine.id, 'x'), 'forbidden');
    expect(events(store).filter((x) => x.kind === 'log_edited')).toHaveLength(2);
  });

  it('deleteLogEntry is a soft delete; hidden from the tree; resume falls back to the previous entry', () => {
    const { store, t, db } = base();
    store.addLogEntry(YOU, t.id, 'old');
    const newest = store.addLogEntry(YOU, t.id, 'new');
    store.deleteLogEntry(YOU, newest.id);
    expect(db.prepare('SELECT deleted_at FROM task_log WHERE id = ?').get(newest.id)).toMatchObject({ deleted_at: expect.any(String) });
    const tk = projectTree(db, 'p', '2026-11-26').milestones[0]!.tasks[0]!;
    expect(tk.log.map((l) => l.text)).toEqual(['old']);
    expect(tk.resume?.note).toBe('old');
    expectCode(() => store.editLogEntry(YOU, newest.id, 'x'), 'not_found');
    expectCode(() => store.deleteLogEntry(AI, store.addLogEntry(YOU, t.id, 'mine').id), 'forbidden');
  });

  it('revert: add → soft-deleted, edit → text back, delete → back; each refuses when changed since', () => {
    const { store, t, db } = base();
    const e = store.addLogEntry(YOU, t.id, 'one');
    store.editLogEntry(YOU, e.id, 'two');
    const last = (kind: string) => (db.prepare('SELECT id FROM events WHERE kind = ? ORDER BY rowid DESC LIMIT 1').get(kind) as { id: string }).id;
    revert(store, YOU, last('log_edited'));
    expect(store.logEntry(e.id).text).toBe('one');
    store.deleteLogEntry(YOU, e.id);
    revert(store, YOU, last('log_deleted'));
    expect(store.logEntry(e.id).deletedAt).toBeNull();
    revert(store, YOU, last('log_added'));
    expect(store.logEntry(e.id, { deleted: true }).deletedAt).not.toBeNull();
    // changed since
    const f = store.addLogEntry(YOU, t.id, 'f');
    const addEv = last('log_added');
    store.editLogEntry(YOU, f.id, 'g');
    expectCode(() => revert(store, YOU, addEv), 'conflict');
  });

  it("setResumeNote appends an entry; '' and null are no-ops", () => {
    const { store, t, db } = base();
    store.setResumeNote(AI, t.id, 'Stopped here');
    store.setResumeNote(YOU, t.id, 'Next: tests');
    store.setResumeNote(YOU, t.id, '');
    store.setResumeNote(YOU, t.id, null);
    expect((db.prepare('SELECT count(*) AS n FROM task_log').get() as { n: number }).n).toBe(2);
    expect(store.task(t.id)).toMatchObject({ resumeNote: 'Next: tests', resumeBy: 'you' });
  });

  it("Home's pick up shows the newest entry", () => {
    const { store, t, db } = base();
    store.updateTask(YOU, t.id, { status: 'doing' });
    store.addLogEntry(YOU, t.id, 'earlier');
    store.addLogEntry(YOU, t.id, 'latest');
    const h = home(db, '2026-11-26', store.settings());
    expect(h.pickUp[0]!.resume.note).toBe('latest');
  });
});

describe('execution log over HTTP', () => {
  async function web() {
    const b = base();
    const app = createApp({ store: b.store, db: b.db, clock: b.clock });
    const call = async (method: string, path: string, body?: unknown) => {
      const res = await app.request(path, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: (await res.json()) as any };
    };
    return { ...b, call };
  }

  it('GET/POST /api/tasks/:id/log, PATCH/DELETE /api/log/:id', async () => {
    const { call, t } = await web();
    expect((await call('GET', `/api/tasks/${t.id}/log`)).body).toEqual([]);
    const a = await call('POST', `/api/tasks/${t.id}/log`, { text: 'did a thing' });
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ text: 'did a thing', by: 'you', editedAt: null });
    expect((await call('POST', `/api/tasks/${t.id}/log`, { text: '' })).status).toBe(400);
    const p = await call('PATCH', `/api/log/${a.body.id}`, { text: 'did two things' });
    expect(p.body).toMatchObject({ text: 'did two things' });
    expect(p.body.editedAt).toBeTruthy();
    expect((await call('GET', `/api/tasks/${t.id}/log`)).body.map((x: { text: string }) => x.text)).toEqual(['did two things']);
    expect((await call('DELETE', `/api/log/${a.body.id}`)).body).toEqual({ ok: true });
    expect((await call('GET', `/api/tasks/${t.id}/log`)).body).toEqual([]);
    expect((await call('PATCH', `/api/log/${a.body.id}`, { text: 'x' })).status).toBe(404);
  });

  it('PUT /api/tasks/:id/resume still works and appends', async () => {
    const { call, t } = await web();
    expect((await call('PUT', `/api/tasks/${t.id}/resume`, { note: 'left off' })).status).toBe(200);
    expect((await call('PUT', `/api/tasks/${t.id}/resume`, { note: '' })).status).toBe(200);
    const log = (await call('GET', `/api/tasks/${t.id}/log`)).body;
    expect(log.map((x: { text: string }) => x.text)).toEqual(['left off']);
  });
});
