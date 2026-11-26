import { describe, expect, it } from 'vitest';
import { planMilestone } from '../src/domain/plan.js';
import { home } from '../src/domain/queries.js';
import { rescheduleTask } from '../src/domain/reschedule.js';
import { revert } from '../src/domain/revert.js';
import { getSettings } from '../src/domain/settings.js';
import { events, expectCode, setup, YOU } from './helpers.js';

function chain() {
  const s = setup();
  s.store.createProject(YOU, { name: 'P', firstMilestone: { name: 'M' } });
  const msId = (s.store.db.prepare('SELECT id FROM milestones').get() as { id: string }).id;
  const A = s.store.createTask(YOU, msId, { title: 'A', start: '2026-11-12', end: '2026-11-24' });
  const B = s.store.createTask(YOU, msId, { title: 'B', start: '2026-11-25', end: '2026-11-30', after: [A.id] });
  const C = s.store.createTask(YOU, msId, { title: 'C', start: '2026-12-01', end: '2026-12-05', after: [B.id] });
  const lastEvent = (kind: string) => (s.store.db.prepare('SELECT id FROM events WHERE kind = ? ORDER BY rowid LIMIT 1').get(kind) as { id: string }).id;
  const dates = (id: string) => [s.store.task(id).start, s.store.task(id).end];
  return { ...s, msId, A, B, C, lastEvent, dates };
}

describe('revert', () => {
  it('reverts a whole cascade batch', () => {
    const { store, A, B, C, lastEvent, dates } = chain();
    rescheduleTask(store, YOU, A.id, { start: '2026-11-12', end: '2026-11-27', cascade: true });
    const n = events(store).length;
    const r = revert(store, YOU, lastEvent('dates_changed'));
    expect(r.reverted).toBe(3);
    expect(dates(A.id)).toEqual(['2026-11-12', '2026-11-24']);
    expect(dates(B.id)).toEqual(['2026-11-25', '2026-11-30']);
    expect(dates(C.id)).toEqual(['2026-12-01', '2026-12-05']);
    const added = events(store).slice(n);
    expect(added.map((e) => e.kind)).toEqual(['reverted', 'reverted', 'reverted']);
    expect(new Set(added.map((e) => e.batch_id)).size).toBe(1);
    expect(home(store.db, '2026-11-26', getSettings(store.db)).rescheduled).toEqual([]);
  });

  it('refuses a stale revert; nothing written (Review Focus 4)', () => {
    const { store, A, lastEvent, dates } = chain();
    rescheduleTask(store, YOU, A.id, { start: '2026-11-12', end: '2026-11-27' });
    store.updateTask(YOU, A.id, { start: '2026-11-13', end: '2026-11-28' });
    const n = events(store).length;
    expectCode(() => revert(store, YOU, lastEvent('dates_changed')), 'conflict', 'changed since');
    expect(dates(A.id)).toEqual(['2026-11-13', '2026-11-28']);
    expect(events(store).length).toBe(n);
  });

  it('refuses reverting twice', () => {
    const { store, A, lastEvent } = chain();
    rescheduleTask(store, YOU, A.id, { start: '2026-11-12', end: '2026-11-27' });
    const id = lastEvent('dates_changed');
    revert(store, YOU, id);
    expectCode(() => revert(store, YOU, id), 'conflict');
  });

  it('reverting a planned event archives what it created', () => {
    const { store, msId } = chain();
    const r = planMilestone(store, { actor: 'ai:codex' }, msId, { tasks: [{ key: 'x', title: 'X', todos: [{ title: 't' }] }, { key: 'y', title: 'Y', dependsOn: ['x'] }] });
    const planned = (store.db.prepare("SELECT id FROM events WHERE kind = 'planned'").get() as { id: string }).id;
    revert(store, YOU, planned);
    expect(store.task(r.tasks.x!, { archived: true }).archivedAt).not.toBeNull();
    expect(store.task(r.tasks.y!, { archived: true }).archivedAt).not.toBeNull();
    expect(store.db.prepare('SELECT count(*) n FROM dependencies').get()).toEqual({ n: 2 });
  });

  it('reverting a to-do tick unticks and restores task status', () => {
    const { store, msId } = chain();
    const t = store.createTask(YOU, msId, { title: 'T', todos: [{ title: 'a' }, { title: 'b' }] });
    const a = store.todosOf(t.id)[0]!;
    store.setTodoDone(YOU, a.id, true);
    expect(store.task(t.id).status).toBe('doing');
    const ev = (store.db.prepare("SELECT id FROM events WHERE kind = 'todo_done'").get() as { id: string }).id;
    revert(store, YOU, ev);
    expect(store.todo(a.id).done).toBe(false);
    expect(store.task(t.id).status).toBe('todo');
  });

  it('reverts archive, reorder, attach and updates', () => {
    const { store, msId, A, B, C } = chain();
    store.archive(YOU, 'milestone', msId);
    revert(store, YOU, (store.db.prepare("SELECT id FROM events WHERE kind = 'archived'").get() as { id: string }).id);
    expect(store.task(A.id).archivedAt).toBeNull();

    store.reorder(YOU, 'task', [C.id, B.id, A.id]);
    revert(store, YOU, (store.db.prepare("SELECT id FROM events WHERE kind = 'reordered'").get() as { id: string }).id);
    expect((store.db.prepare('SELECT id FROM tasks ORDER BY ord').all() as { id: string }[]).map((r) => r.id)).toEqual([A.id, B.id, C.id]);

    const att = store.attach(YOU, A.id, { role: 'deliverable', url: 'https://github.com/o/r/pull/1' });
    revert(store, YOU, (store.db.prepare("SELECT id FROM events WHERE kind = 'attached'").get() as { id: string }).id);
    expect(store.attachment(att.id, { archived: true }).archivedAt).not.toBeNull();

    store.updateTask(YOU, A.id, { title: 'A2', priority: 'p1' });
    revert(store, YOU, (store.db.prepare("SELECT id FROM events WHERE kind = 'updated' ORDER BY rowid DESC").get() as { id: string }).id);
    expect([store.task(A.id).title, store.task(A.id).priority]).toEqual(['A', 'p2']);

    const dep = store.db.prepare('SELECT id FROM dependencies WHERE from_task_id = ?').get(C.id) as { id: string };
    store.removeDependency(YOU, dep.id);
    revert(store, YOU, (store.db.prepare("SELECT id FROM events WHERE kind = 'dependency_removed'").get() as { id: string }).id);
    expect(store.db.prepare('SELECT to_task_id FROM dependencies WHERE from_task_id = ?').get(C.id)).toEqual({ to_task_id: B.id });
  });

  it('settings and reverted events are not revertible', () => {
    const { store, A, lastEvent } = chain();
    store.setSettings(YOU, { show_paused: true });
    expectCode(() => revert(store, YOU, lastEvent('settings_changed')), 'invalid');
    rescheduleTask(store, YOU, A.id, { start: '2026-11-12', end: '2026-11-27' });
    revert(store, YOU, lastEvent('dates_changed'));
    expectCode(() => revert(store, YOU, lastEvent('reverted')), 'invalid');
    expectCode(() => revert(store, YOU, 'ev_nope'), 'not_found');
  });
});
