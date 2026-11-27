import { describe, expect, it } from 'vitest';
import type { Clock } from '../src/clock.js';
import { openDb } from '../src/db/open.js';
import { getDayPlan, home } from '../src/domain/queries.js';
import { revert } from '../src/domain/revert.js';
import { getSettings } from '../src/domain/settings.js';
import { Store } from '../src/domain/store.js';
import { expectCode, YOU } from './helpers.js';

const AI = { actor: 'ai:codex' };
const TODAY = '2026-11-27'; // a Friday

function world() {
  let now = '2026-11-27T08:00:00.000Z';
  const clock: Clock = {
    now: () => now,
    today: (tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now)),
  };
  const db = openDb(':memory:');
  const store = new Store(db, clock);
  store.createProject(YOU, { name: 'Work', firstMilestone: { name: 'M', due: '2026-12-20' } });
  const ms = (db.prepare('SELECT id FROM milestones').get() as { id: string }).id;
  const mk = (title: string, extra: Record<string, unknown> = {}) => store.createTask(YOU, ms, { title, ...extra }).id;
  const h = () => home(db, store.today(), getSettings(db));
  return { db, store, ms, mk, h, setNow: (v: string) => (now = v) };
}

describe('day plan', () => {
  it('plans up to 3 open tasks in order with when and resume', () => {
    const w = world();
    const [a, b, c] = [w.mk('A'), w.mk('B'), w.mk('C')];
    w.store.setResumeNote(YOU, b, 'halfway');
    w.store.planDay(YOU, TODAY, [{ taskId: c, when: 'after standup' }, { taskId: a }, { taskId: b }]);
    const plan = w.h().plan;
    expect(plan.map((p) => [p.n, p.task.title, p.when])).toEqual([[1, 'C', 'after standup'], [2, 'A', null], [3, 'B', null]]);
    expect(plan[2]!.resume?.note).toBe('halfway');
    expect(getDayPlan(w.db, TODAY).map((x) => x.taskId)).toEqual([c, a, b]);
  });

  it('rejects a 4th item, duplicates, non-open tasks and long when', () => {
    const w = world();
    const ids = [w.mk('A'), w.mk('B'), w.mk('C'), w.mk('D')];
    expectCode(() => w.store.planDay(YOU, TODAY, ids.map((taskId) => ({ taskId }))), 'invalid', '3');
    expectCode(() => w.store.planDay(YOU, TODAY, [{ taskId: ids[0]! }, { taskId: ids[0]! }]), 'invalid');
    w.store.updateTask(YOU, ids[3]!, { status: 'done' });
    expectCode(() => w.store.planDay(YOU, TODAY, [{ taskId: ids[3]! }]), 'invalid');
    expectCode(() => w.store.planDay(YOU, TODAY, [{ taskId: ids[0]!, when: 'x'.repeat(41) }]), 'invalid', '40');
    expectCode(() => w.store.planDay(YOU, 'tomorrow', [{ taskId: ids[0]! }]), 'invalid');
  });

  it('a planned task that is later done, archived or in review drops out', () => {
    const w = world();
    const [a, b, c] = [w.mk('A'), w.mk('B'), w.mk('C')];
    w.store.planDay(YOU, TODAY, [{ taskId: a }, { taskId: b }, { taskId: c }]);
    w.store.updateTask(YOU, a, { status: 'done' });
    w.store.archive(YOU, 'task', b);
    w.store.updateTask(AI, c, { status: 'done' });
    expect(w.h().plan).toEqual([]);
  });

  it('uses the configured time zone for today', () => {
    const w = world();
    const a = w.mk('A');
    w.store.planDay(YOU, '2026-11-28', [{ taskId: a }]);
    w.setNow('2026-11-27T22:30:00.000Z'); // already the 28th in Jerusalem
    expect(w.h().plan.map((p) => p.task.title)).toEqual(['A']);
  });

  it('revert restores the previous plan', () => {
    const w = world();
    const [a, b] = [w.mk('A'), w.mk('B')];
    w.store.planDay(YOU, TODAY, [{ taskId: a }]);
    w.store.planDay(YOU, TODAY, [{ taskId: b }]);
    const ev = w.db.prepare("SELECT id FROM events WHERE kind = 'day_planned' ORDER BY rowid DESC LIMIT 1").get() as { id: string };
    revert(w.store, YOU, ev.id);
    expect(getDayPlan(w.db, TODAY).map((x) => x.taskId)).toEqual([a]);
  });
});

describe('home lists', () => {
  it('pick-up excludes planned tasks, newest first, max 5', () => {
    const w = world();
    const ids = Array.from({ length: 7 }, (_, i) => w.mk(`T${i}`));
    ids.forEach((id, i) => {
      w.setNow(`2026-11-27T08:0${i}:00.000Z`);
      w.store.setResumeNote(YOU, id, `note ${i}`);
    });
    w.store.planDay(YOU, TODAY, [{ taskId: ids[6]! }]);
    const pick = w.h().pickUp;
    expect(pick.map((p) => p.task.title)).toEqual(['T5', 'T4', 'T3', 'T2', 'T1']);
    expect(pick[0]!.resume.note).toBe('note 5');
  });

  it('alsoToday is today\'s dated open tasks not in plan or pick-up; todayTasks unchanged', () => {
    const w = world();
    const a = w.mk('Planned', { start: '2026-11-26', end: '2026-11-28' });
    const b = w.mk('Picked', { start: '2026-11-26', end: '2026-11-28' });
    w.mk('Plain', { start: '2026-11-27', end: '2026-11-27' });
    w.store.planDay(YOU, TODAY, [{ taskId: a }]);
    w.store.setResumeNote(YOU, b, 'x');
    const h = w.h();
    expect(h.alsoToday.map((t) => t.title)).toEqual(['Plain']);
    expect(h.todayTasks.map((t) => t.title).sort()).toEqual(['Picked', 'Plain', 'Planned']);
  });

  it('needsReview lists agent-finished tasks with who and to-do counts', () => {
    const w = world();
    const t = w.store.createTask(YOU, w.ms, { title: 'Draft', todos: [{ title: 'a' }] });
    w.store.setTodoDone(AI, w.store.todosOf(t.id)[0]!.id, true);
    const nr = w.h().needsReview;
    expect(nr).toHaveLength(1);
    expect(nr[0]).toMatchObject({ task: { id: t.id, title: 'Draft' }, project: 'work', by: 'ai:codex', todos: { done: 1, total: 1 } });
  });

  it('doneThisWeek counts from the week start and drops reverted completions', () => {
    const w = world();
    const [old, mon, fri, rev] = [w.mk('Old'), w.mk('Mon'), w.mk('Fri'), w.mk('Rev')];
    w.setNow('2026-11-22T10:00:00.000Z'); // Sunday
    w.store.updateTask(YOU, old, { status: 'done' });
    w.setNow('2026-11-22T22:30:00.000Z'); // Monday 00:30 in Jerusalem
    w.store.updateTask(YOU, mon, { status: 'done' });
    w.setNow('2026-11-27T07:00:00.000Z');
    w.store.updateTask(AI, fri, { status: 'done' });
    w.store.reviewTask(YOU, fri, { decision: 'accept' });
    w.store.updateTask(YOU, rev, { status: 'done' });
    const ev = w.db.prepare("SELECT id FROM events WHERE kind = 'status_changed' AND entity_id = ? ORDER BY rowid DESC LIMIT 1").get(rev) as { id: string };
    revert(w.store, YOU, ev.id);
    const d = w.h().doneThisWeek;
    expect(d.count).toBe(2);
    expect(d.items.map((x) => x.title)).toEqual(['Fri', 'Mon']);
    w.store.setSettings(YOU, { week_start: 'sun' });
    expect(w.h().doneThisWeek.count).toBe(3);
  });
});
