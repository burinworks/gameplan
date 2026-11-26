import { describe, expect, it } from 'vitest';
import { planMilestone } from '../src/domain/plan.js';
import { events, expectCode, setup, YOU } from './helpers.js';

const AI = { actor: 'ai:codex' };

function base() {
  const s = setup();
  s.store.createProject(YOU, { name: 'P', areas: [{ name: 'Core' }], firstMilestone: { name: 'M1', due: '2026-12-20' } });
  const msId = (s.store.db.prepare('SELECT id FROM milestones').get() as { id: string }).id;
  const count = (t: string) => (s.store.db.prepare(`SELECT count(*) n FROM ${t}`).get() as { n: number }).n;
  return { ...s, msId, count };
}

const PLAN = {
  tasks: [
    { key: 'design', title: 'Design', area: 'Core', start: '2026-11-27', end: '2026-11-30', todos: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] },
    { key: 'impl', title: 'Implement', start: '2026-12-01', end: '2026-12-10', dependsOn: ['design'], todos: [{ title: 'd' }, { title: 'e' }] },
    { key: 'test', title: 'Test', dependsOn: ['impl'], todos: [{ title: 'f' }, { title: 'g' }], links: [{ url: 'projects/p/spec.md' }] },
  ],
};

describe('planMilestone', () => {
  it('creates tasks, to-dos and dependencies in one batch with a planned event', () => {
    const { store, msId, count } = base();
    const before = events(store).length;
    const r = planMilestone(store, AI, msId, PLAN);
    expect(Object.keys(r.tasks)).toEqual(['design', 'impl', 'test']);
    expect([r.todos, r.dependencies]).toEqual([7, 2]);
    expect(count('tasks')).toBe(3);
    expect(count('todos')).toBe(7);
    expect(count('dependencies')).toBe(2);
    const design = store.todosOf(r.tasks.design!);
    expect(design.map((t) => t.after)).toEqual([[], [design[0]!.id], [design[1]!.id]]);
    const added = events(store).slice(before);
    expect(new Set(added.map((e) => e.batch_id)).size).toBe(1);
    const planned = store.db.prepare("SELECT entity, actor, after_json FROM events WHERE kind = 'planned'").get() as { entity: string; actor: string; after_json: string };
    expect(planned.entity).toBe('milestone');
    expect(planned.actor).toBe('ai:codex');
    expect(JSON.parse(planned.after_json)).toEqual(expect.objectContaining({ tasks: 3, todos: 7, dependencies: 2 }));
  });

  it('rejects mutual dependsOn; nothing written (Review Focus 1)', () => {
    const { store, msId, count } = base();
    const n = events(store).length;
    expectCode(
      () => planMilestone(store, AI, msId, { tasks: [{ key: 'a', title: 'A', dependsOn: ['b'] }, { key: 'b', title: 'B', dependsOn: ['a'] }] }),
      'conflict',
      /cycle: (A → B → A|B → A → B)/,
    );
    expect(count('tasks')).toBe(0);
    expect(events(store).length).toBe(n);
  });

  it('unknown area → invalid; nothing written', () => {
    const { store, msId, count } = base();
    expectCode(() => planMilestone(store, AI, msId, { tasks: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B', area: 'Nope' }] }), 'invalid', 'Core');
    expect(count('tasks')).toBe(0);
  });

  it('unknown dependsOn and duplicate keys → invalid', () => {
    const { store, msId } = base();
    expectCode(() => planMilestone(store, AI, msId, { tasks: [{ key: 'a', title: 'A', dependsOn: ['zzz'] }] }), 'invalid', 'zzz');
    expectCode(() => planMilestone(store, AI, msId, { tasks: [{ key: 'a', title: 'A' }, { key: 'a', title: 'B' }] }), 'invalid', 'duplicate');
    expectCode(() => planMilestone(store, AI, msId, { tasks: [] }), 'invalid');
  });

  it('accepts an existing task id from another project in dependsOn', () => {
    const { store, msId } = base();
    store.createProject(YOU, { name: 'Other', firstMilestone: { name: 'O' } });
    const oms = (store.db.prepare("SELECT m.id FROM milestones m JOIN projects p ON p.id = m.project_id WHERE p.slug = 'other'").get() as { id: string }).id;
    const ext = store.createTask(YOU, oms, { title: 'API' });
    const r = planMilestone(store, AI, msId, { tasks: [{ key: 'a', title: 'A', dependsOn: [ext.id] }] });
    expect(store.db.prepare('SELECT to_task_id FROM dependencies WHERE from_task_id = ?').get(r.tasks.a!)).toEqual({ to_task_id: ext.id });
  });

  it('milestoneDependsOn links the plan roots to another milestone', () => {
    const { store, msId } = base();
    const m0 = store.createMilestone(YOU, 'p', { name: 'M0', due: '2026-11-26' });
    const r = planMilestone(store, AI, msId, { ...PLAN, milestoneDependsOn: [m0.id] });
    const rows = store.db.prepare('SELECT from_task_id FROM dependencies WHERE to_milestone_id = ?').all(m0.id) as { from_task_id: string }[];
    expect(rows.map((x) => x.from_task_id)).toEqual([r.tasks.design]);
    expect(r.dependencies).toBe(3);
  });
});
