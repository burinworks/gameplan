import { describe, expect, it } from 'vitest';
import { taskHealth } from '../src/domain/derive.js';
import { planMilestone } from '../src/domain/plan.js';
import { revert } from '../src/domain/revert.js';
import { expectCode, setup, YOU } from './helpers.js';

const AI = { actor: 'ai:codex' };

function base() {
  const s = setup();
  s.store.createProject(YOU, { name: 'P', firstMilestone: { name: 'M', due: '2026-12-20' } });
  const ms = (s.db.prepare('SELECT id FROM milestones').get() as { id: string }).id;
  const t = s.store.createTask(YOU, ms, { title: 'Write it', todos: [{ title: 'a' }, { title: 'b' }] });
  const [a, b] = s.store.todosOf(t.id);
  return { ...s, ms, t, a: a!, b: b! };
}

const lastEvent = (db: ReturnType<typeof base>['db'], kind: string) =>
  db.prepare('SELECT id, actor, reason FROM events WHERE kind = ? ORDER BY rowid DESC LIMIT 1').get(kind) as { id: string; actor: string; reason: string | null } | undefined;

describe('review flow', () => {
  it('an agent ticking the last to-do sends the task to review', () => {
    const { store, t, a, b } = base();
    store.setTodoDone(AI, a.id, true);
    store.setTodoDone(AI, b.id, true);
    expect(store.task(t.id).status).toBe('review');
  });

  it('you ticking the last to-do finishes the task', () => {
    const { store, t, a, b } = base();
    store.setTodoDone(YOU, a.id, true);
    store.setTodoDone(YOU, b.id, true);
    expect(store.task(t.id).status).toBe('done');
  });

  it('agent update_task status done lands on review; off when agents_need_review=false', () => {
    const { store, t, ms } = base();
    expect(store.updateTask(AI, t.id, { status: 'done' }).status).toBe('review');
    store.setSettings(YOU, { agents_need_review: false });
    const t2 = store.createTask(YOU, ms, { title: 'Other' });
    expect(store.updateTask(AI, t2.id, { status: 'done' }).status).toBe('done');
  });

  it('createTask and planMilestone by an agent with status done → review', () => {
    const { store, ms } = base();
    expect(store.createTask(AI, ms, { title: 'Already done', status: 'done' }).status).toBe('review');
    expect(store.createTask(YOU, ms, { title: 'Mine', status: 'done' }).status).toBe('done');
    const r = planMilestone(store, AI, ms, { tasks: [{ key: 'x', title: 'X', status: 'done' }] });
    expect(store.task(r.tasks.x!).status).toBe('review');
  });

  it('only you can review; task must be in review', () => {
    const { store, t } = base();
    expectCode(() => store.reviewTask(YOU, t.id, { decision: 'accept' }), 'invalid');
    store.updateTask(AI, t.id, { status: 'done' });
    expectCode(() => store.reviewTask(AI, t.id, { decision: 'accept' }), 'forbidden', 'only you can review');
  });

  it('accept → done + review_accepted', () => {
    const { store, t, db } = base();
    store.updateTask(AI, t.id, { status: 'done' });
    expect(store.reviewTask(YOU, t.id, { decision: 'accept' }).status).toBe('done');
    expect(lastEvent(db, 'review_accepted')?.actor).toBe('you');
  });

  it('send back with a note → doing, resume note = note', () => {
    const { store, t, db } = base();
    store.updateTask(AI, t.id, { status: 'done' });
    const back = store.reviewTask(YOU, t.id, { decision: 'send_back', note: 'Tables are wrong' });
    expect(back.status).toBe('doing');
    expect(back.resumeNote).toBe('Tables are wrong');
    expect(back.resumeBy).toBe('you');
    expect(lastEvent(db, 'review_sent_back')?.reason).toBe('Tables are wrong');
  });

  it('unticking a to-do on a review task → doing', () => {
    const { store, t, a, b } = base();
    store.setTodoDone(AI, a.id, true);
    store.setTodoDone(AI, b.id, true);
    store.setTodoDone(YOU, b.id, false);
    expect(store.task(t.id).status).toBe('doing');
  });

  it('a review task is never late', () => {
    expect(taskHealth({ status: 'review', start: '2026-11-01', end: '2026-11-02' }, [], null, '2026-11-26').health).toBe('review');
  });

  it('revert review_accepted → review; revert by an agent never reaches done', () => {
    const { store, t, db } = base();
    store.updateTask(AI, t.id, { status: 'done' });
    store.reviewTask(YOU, t.id, { decision: 'accept' });
    revert(store, YOU, lastEvent(db, 'review_accepted')!.id);
    expect(store.task(t.id).status).toBe('review');
    // An agent reverting a send-back-to-doing from done must not land on done.
    store.reviewTask(YOU, t.id, { decision: 'accept' });
    store.updateTask(YOU, t.id, { status: 'doing' });
    revert(store, AI, lastEvent(db, 'status_changed')!.id);
    expect(store.task(t.id).status).toBe('review');
  });

  it('revert review_sent_back → review and the previous resume note', () => {
    const { store, t, db } = base();
    store.setResumeNote(AI, t.id, 'Drafted section 2');
    store.updateTask(AI, t.id, { status: 'done' });
    store.reviewTask(YOU, t.id, { decision: 'send_back', note: 'Redo section 2' });
    revert(store, YOU, lastEvent(db, 'review_sent_back')!.id);
    const after = store.task(t.id);
    expect(after.status).toBe('review');
    expect(after.resumeNote).toBe('Drafted section 2');
    expect(after.resumeBy).toBe('ai:codex');
  });

  it('revert of a send-back conflicts when the task moved on since', () => {
    const { store, t, db } = base();
    store.updateTask(AI, t.id, { status: 'done' });
    store.reviewTask(YOU, t.id, { decision: 'send_back' });
    store.updateTask(YOU, t.id, { status: 'todo' });
    expectCode(() => revert(store, YOU, lastEvent(db, 'review_sent_back')!.id), 'conflict');
  });
});
