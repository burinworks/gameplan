import { describe, expect, it } from 'vitest';
import { inbox } from '../src/domain/queries.js';
import { revert } from '../src/domain/revert.js';
import { search } from '../src/domain/search.js';
import { expectCode, setup, YOU } from './helpers.js';

const AI = { actor: 'ai:codex' };

function base() {
  const s = setup();
  s.store.createProject(YOU, { name: 'P', firstMilestone: { name: 'M' } });
  const ms = (s.db.prepare('SELECT id FROM milestones').get() as { id: string }).id;
  const t = s.store.createTask(YOU, ms, { title: 'Host' });
  return { ...s, ms, t };
}

describe('inbox', () => {
  it('captures from you and agents, newest first; validates text', () => {
    const { store, db } = base();
    store.capture(YOU, '  Ask Dana about the budget  ');
    store.capture(AI, 'Flaky test in CI');
    const ib = inbox(db);
    expect(ib.count).toBe(2);
    expect(ib.items.map((x) => [x.text, x.by])).toEqual([
      ['Flaky test in CI', 'ai:codex'],
      ['Ask Dana about the budget', 'you'],
    ]);
    expectCode(() => store.capture(YOU, '   '), 'invalid');
    expectCode(() => store.capture(YOU, 'x'.repeat(501)), 'invalid', '500');
  });

  it('triage to a task: title defaults to the text, item leaves the inbox', () => {
    const { store, db, ms } = base();
    const it0 = store.capture(YOU, 'Write the FAQ');
    const r = store.triageInbox(YOU, it0.id, { as: 'task', milestoneId: ms, task: { priority: 'p1' } });
    expect(r.created?.entity).toBe('task');
    expect(store.task(r.created!.id)).toMatchObject({ title: 'Write the FAQ', priority: 'p1' });
    expect(inbox(db).count).toBe(0);
    const batches = db.prepare("SELECT count(DISTINCT batch_id) AS n FROM events WHERE kind IN ('triaged', 'created') AND batch_id = (SELECT batch_id FROM events WHERE kind = 'triaged')").get() as { n: number };
    expect(batches.n).toBe(1);
  });

  it('triage to a to-do and dismiss', () => {
    const { store, db, t } = base();
    const a = store.capture(YOU, 'Check the logo');
    const r = store.triageInbox(YOU, a.id, { as: 'todo', taskId: t.id });
    expect(store.todosOf(t.id).map((x) => x.title)).toEqual(['Check the logo']);
    expect(r.created).toEqual({ entity: 'todo', id: store.todosOf(t.id)[0]!.id });
    const b = store.capture(YOU, 'Never mind');
    expect(store.triageInbox(YOU, b.id, { as: 'dismiss' }).created).toBeUndefined();
    expect(inbox(db).count).toBe(0);
  });

  it('a second triage is a conflict and writes nothing', () => {
    const { store, db, ms } = base();
    const a = store.capture(YOU, 'Once');
    store.triageInbox(YOU, a.id, { as: 'task', milestoneId: ms });
    const n = (db.prepare('SELECT count(*) AS n FROM events').get() as { n: number }).n;
    expectCode(() => store.triageInbox(YOU, a.id, { as: 'task', milestoneId: ms }), 'conflict');
    const b = store.capture(YOU, 'Gone');
    store.triageInbox(YOU, b.id, { as: 'dismiss' });
    expectCode(() => store.triageInbox(YOU, b.id, { as: 'dismiss' }), 'conflict');
    expect((db.prepare("SELECT count(*) AS n FROM tasks WHERE title = 'Once'").get() as { n: number }).n).toBe(1);
    expect((db.prepare('SELECT count(*) AS n FROM events').get() as { n: number }).n).toBe(n + 2);
  });

  it('revert of a triage archives the task and re-opens the item', () => {
    const { store, db, ms } = base();
    const a = store.capture(YOU, 'Undo me');
    const r = store.triageInbox(YOU, a.id, { as: 'task', milestoneId: ms });
    const ev = db.prepare("SELECT id FROM events WHERE kind = 'triaged'").get() as { id: string };
    revert(store, YOU, ev.id);
    expect(store.task(r.created!.id, { archived: true }).archivedAt).not.toBeNull();
    expect(inbox(db).items.map((x) => x.id)).toEqual([a.id]);
    store.triageInbox(YOU, a.id, { as: 'dismiss' });
  });

  it('search finds inbox items', () => {
    const { store, db } = base();
    const a = store.capture(YOU, 'Quarterly numbers for Dana');
    expect(search(db, 'quarterly')).toEqual([expect.objectContaining({ type: 'inbox', id: a.id, title: 'Quarterly numbers for Dana' })]);
  });
});
