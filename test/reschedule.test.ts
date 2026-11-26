import { describe, expect, it } from 'vitest';
import { rescheduleTask } from '../src/domain/reschedule.js';
import { events, expectCode, setup, YOU } from './helpers.js';

function chain() {
  const s = setup();
  s.store.createProject(YOU, { name: 'P', firstMilestone: { name: 'M' } });
  const ms = s.store.db.prepare('SELECT id FROM milestones').get() as { id: string };
  const A = s.store.createTask(YOU, ms.id, { title: 'A', start: '2026-11-12', end: '2026-11-24' });
  const B = s.store.createTask(YOU, ms.id, { title: 'B', start: '2026-11-25', end: '2026-11-30', after: [A.id] });
  const C = s.store.createTask(YOU, ms.id, { title: 'C', start: '2026-12-01', end: '2026-12-05', after: [B.id] });
  const dates = (id: string) => {
    const t = s.store.task(id);
    return [t.start, t.end];
  };
  return { ...s, msId: ms.id, A, B, C, dates };
}

describe('rescheduleTask', () => {
  it('cascades dependents by the same delta in one batch', () => {
    const { store, A, B, C, dates } = chain();
    const n = events(store).length;
    const r = rescheduleTask(store, { actor: 'you', reason: 'API slipped' }, A.id, { start: '2026-11-12', end: '2026-11-27', cascade: true });
    expect(dates(A.id)).toEqual(['2026-11-12', '2026-11-27']);
    expect(dates(B.id)).toEqual(['2026-11-28', '2026-12-03']);
    expect(dates(C.id)).toEqual(['2026-12-04', '2026-12-08']);
    expect(r.moved.map((m) => m.title)).toEqual(['A', 'B', 'C']);
    const added = events(store).slice(n);
    expect(added.map((e) => e.kind)).toEqual(['dates_changed', 'dates_changed', 'dates_changed']);
    expect(new Set(added.map((e) => e.batch_id)).size).toBe(1);
    expect(added[0]!.reason).toBe('API slipped');
    expect(added[1]!.reason).toBe('cascade from "A"');
  });

  it('moves only the task without cascade', () => {
    const { store, A, B, dates } = chain();
    rescheduleTask(store, YOU, A.id, { start: '2026-11-12', end: '2026-11-27' });
    expect(dates(B.id)).toEqual(['2026-11-25', '2026-11-30']);
  });

  it('skips done dependents but keeps traversing', () => {
    const { store, A, B, C, dates } = chain();
    store.updateTask(YOU, B.id, { status: 'done' });
    rescheduleTask(store, YOU, A.id, { start: '2026-11-12', end: '2026-11-27', cascade: true });
    expect(dates(B.id)).toEqual(['2026-11-25', '2026-11-30']);
    expect(dates(C.id)).toEqual(['2026-12-04', '2026-12-08']);
  });

  it('skips undated dependents but keeps traversing (Review Focus 2)', () => {
    const { store, A, B, C, dates } = chain();
    store.updateTask(YOU, B.id, { start: null, end: null });
    rescheduleTask(store, YOU, A.id, { start: '2026-11-12', end: '2026-11-27', cascade: true });
    expect(dates(B.id)).toEqual([null, null]);
    expect(dates(C.id)).toEqual(['2026-12-04', '2026-12-08']);
  });

  it('skips archived dependents but keeps traversing (Review Focus 3)', () => {
    const { store, A, B, C, dates } = chain();
    store.archive(YOU, 'task', B.id);
    rescheduleTask(store, YOU, A.id, { start: '2026-11-12', end: '2026-11-27', cascade: true });
    expect(store.task(B.id, { archived: true }).end).toBe('2026-11-30');
    expect(dates(C.id)).toEqual(['2026-12-04', '2026-12-08']);
  });

  it('never moves dependents earlier', () => {
    const { store, A, B, dates } = chain();
    const r = rescheduleTask(store, YOU, A.id, { start: '2026-11-10', end: '2026-11-20', cascade: true });
    expect(r.moved.length).toBe(1);
    expect(dates(B.id)).toEqual(['2026-11-25', '2026-11-30']);
  });

  it('captures new conflicts on the root event', () => {
    const { store, B } = chain();
    const r = rescheduleTask(store, YOU, B.id, { start: '2026-11-20', end: '2026-11-30' });
    expect(r.conflicts.some((c) => /starts before a ends/i.test(c))).toBe(true);
    const ev = store.db.prepare("SELECT after_json FROM events WHERE kind = 'dates_changed' ORDER BY rowid DESC LIMIT 1").get() as { after_json: string };
    expect(JSON.parse(ev.after_json).conflicts).toEqual(r.conflicts);
  });

  it('captures conflicts on dependents when moved without cascade', () => {
    const { store, A } = chain();
    const r = rescheduleTask(store, YOU, A.id, { start: '2026-11-12', end: '2026-11-27' });
    expect(r.conflicts).toEqual(['B: Starts before A ends']);
  });

  it('requires a reason from agents', () => {
    const { store, A } = chain();
    expectCode(() => rescheduleTask(store, { actor: 'ai:x' }, A.id, { start: '2026-11-12', end: '2026-11-27' }), 'forbidden', 'agents_require_reason');
    rescheduleTask(store, { actor: 'ai:x' }, A.id, { start: '2026-11-12', end: '2026-11-27', reason: 'slipped' });
  });

  it('validates dates', () => {
    const { store, A } = chain();
    expectCode(() => rescheduleTask(store, YOU, A.id, { start: '2026-11-30', end: '2026-11-27' }), 'invalid');
    expectCode(() => rescheduleTask(store, YOU, A.id, { start: 'x', end: '2026-11-27' }), 'invalid');
  });
});
