import { describe, expect, it } from 'vitest';
import { events, expectCode, setup, YOU } from './helpers.js';

function base() {
  const s = setup();
  const p = s.store.createProject(YOU, { name: 'Learn Studio', areas: [{ name: 'AI' }, { name: 'Design' }], firstMilestone: { name: 'Prototype', due: '2027-01-15' } });
  const ms = s.store.db.prepare('SELECT id FROM milestones WHERE project_id = ?').get(p.id) as { id: string };
  return { ...s, p, msId: ms.id };
}

describe('projects', () => {
  it('creates with areas and first milestone in one batch', () => {
    const { store, p } = base();
    expect(p.slug).toBe('learn-studio');
    expect(p.areas.map((a) => [a.name, a.ord])).toEqual([['AI', 0], ['Design', 1]]);
    const ms = store.db.prepare('SELECT name, due FROM milestones WHERE project_id = ?').all(p.id);
    expect(ms).toEqual([{ name: 'Prototype', due: '2027-01-15' }]);
    const ev = events(store);
    expect(ev.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ev.map((e) => e.batch_id)).size).toBe(1);
    expect(ev.every((e) => e.actor === 'you')).toBe(true);
    expect(ev[0]!.label).toBe('Learn Studio');
  });

  it('suffixes slugs on collision', () => {
    const { store } = base();
    expect(store.createProject(YOU, { name: 'Learn Studio' }).slug).toBe('learn-studio-2');
    expect(store.createProject(YOU, { name: 'Learn Studio' }).slug).toBe('learn-studio-3');
  });

  it('configures areas as a full ordered list', () => {
    const { store, p } = base();
    const ai = p.areas[0]!;
    const out = store.configureProject(YOU, 'learn-studio', { areas: [{ id: ai.id, name: 'ML' }, { name: 'QA' }] });
    expect(out.areas.map((a) => [a.id === ai.id, a.name, a.ord])).toEqual([[true, 'ML', 0], [false, 'QA', 1]]);
  });

  it('refuses to delete an area a task uses, naming the task', () => {
    const { store, p, msId } = base();
    store.createTask(YOU, msId, { title: 'Sketch screens', area: 'Design' });
    expectCode(() => store.configureProject(YOU, 'learn-studio', { areas: [{ id: p.areas[0]!.id, name: 'AI' }] }), 'invalid', 'Sketch screens');
    expect(store.db.prepare('SELECT count(*) n FROM areas').get()).toEqual({ n: 2 });
  });

  it('status change sets status_changed_at', () => {
    const { store } = base();
    const out = store.configureProject(YOU, 'learn-studio', { status: 'paused' });
    expect(out.status).toBe('paused');
    expect(out.statusChangedAt).toBe('2026-11-26T09:00:00.000Z');
    expect(events(store).at(-1)!.kind).toBe('status_changed');
  });

  it('unknown slug → not_found', () => {
    const { store } = base();
    expectCode(() => store.configureProject(YOU, 'nope', { name: 'x' }), 'not_found');
  });
});

describe('tasks', () => {
  it('creates with to-dos, after and links in one batch', () => {
    const { store, msId } = base();
    const other = store.createTask(YOU, msId, { title: 'Other' });
    const before = events(store).length;
    const t = store.createTask(YOU, msId, {
      title: 'Build', todos: [{ title: 'a' }, { title: 'b' }, { title: 'c' }], after: [other.id], links: [{ url: 'projects/x/x.md' }],
    });
    const todos = store.db.prepare('SELECT id, title, after_json, ord FROM todos WHERE task_id = ? ORDER BY ord').all(t.id) as { id: string; after_json: string }[];
    expect(todos.map((x) => JSON.parse(x.after_json))).toEqual([[], [todos[0]!.id], [todos[1]!.id]]);
    expect(store.db.prepare('SELECT from_task_id, to_task_id FROM dependencies').all()).toEqual([{ from_task_id: t.id, to_task_id: other.id }]);
    expect(store.db.prepare('SELECT role, kind, title FROM attachments').all()).toEqual([{ role: 'context', kind: 'note', title: 'x.md' }]);
    const added = events(store).slice(before);
    expect(new Set(added.map((e) => e.batch_id)).size).toBe(1);
    expect(t.priority).toBe('p2');
    expect(t.executor).toBe('manual');
  });

  it('uses project defaults for priority and executor', () => {
    const { store, msId } = base();
    store.configureProject(YOU, 'learn-studio', { defaultPriority: 'p1', defaultExecutor: 'ai' });
    const t = store.createTask(YOU, msId, { title: 'x' });
    expect([t.priority, t.executor]).toEqual(['p1', 'ai']);
  });

  it('rejects a to-do cycle via after; nothing written', () => {
    const { store, msId } = base();
    const n = events(store).length;
    expectCode(() => store.createTask(YOU, msId, { title: 'Cyc', todos: [{ title: 'a', after: [1] }, { title: 'b', after: [0] }] }), 'invalid', /cycle/);
    expect(events(store).length).toBe(n);
    expect(store.db.prepare('SELECT count(*) n FROM tasks').get()).toEqual({ n: 0 });
  });

  it('rejects a dependency cycle', () => {
    const { store, msId } = base();
    const a = store.createTask(YOU, msId, { title: 'A' });
    const b = store.createTask(YOU, msId, { title: 'B', after: [a.id] });
    expectCode(() => store.addDependency(YOU, a.id, { taskId: b.id }), 'invalid', 'A → B → A');
    expectCode(() => store.addDependency(YOU, a.id, { taskId: a.id }), 'invalid');
    expectCode(() => store.addDependency(YOU, a.id, { milestoneId: msId }), 'invalid', /cycle/);
  });

  it('validates area, dates', () => {
    const { store, msId } = base();
    store.createProject(YOU, { name: 'Other', areas: [{ name: 'Backend' }] });
    expectCode(() => store.createTask(YOU, msId, { title: 'x', area: 'Backend' }), 'invalid', 'AI, Design');
    expectCode(() => store.createTask(YOU, msId, { title: 'x', start: '2026-11-30', end: '2026-11-20' }), 'invalid');
    expectCode(() => store.createTask(YOU, msId, { title: 'x', start: '2026-11-30' }), 'invalid');
    expectCode(() => store.createTask(YOU, msId, { title: 'x', start: '2026-02-30', end: '2026-03-01' }), 'invalid');
  });

  it('agents cannot set dates via updateTask', () => {
    const { store, msId } = base();
    const t = store.createTask(YOU, msId, { title: 'x' });
    expectCode(() => store.updateTask({ actor: 'ai:codex' }, t.id, { start: '2026-11-26', end: '2026-11-27' }), 'invalid', 'reschedule_task');
    const u = store.updateTask(YOU, t.id, { start: '2026-11-26', end: '2026-11-27' });
    expect([u.start, u.end]).toEqual(['2026-11-26', '2026-11-27']);
    expect(events(store).at(-1)!.kind).toBe('dates_changed');
  });

  it('moves milestones only within the project', () => {
    const { store, msId } = base();
    const t = store.createTask(YOU, msId, { title: 'x' });
    const m2 = store.createMilestone(YOU, 'learn-studio', { name: 'Beta' });
    expect(store.updateTask(YOU, t.id, { milestoneId: m2.id }).milestoneId).toBe(m2.id);
    const o = store.createProject(YOU, { name: 'Other', firstMilestone: { name: 'X' } });
    const om = store.db.prepare('SELECT id FROM milestones WHERE project_id = ?').get(o.id) as { id: string };
    expectCode(() => store.updateTask(YOU, t.id, { milestoneId: om.id }), 'invalid');
  });
});

describe('to-dos', () => {
  it('ticks drive task status', () => {
    const { store, msId } = base();
    const t = store.createTask(YOU, msId, { title: 'x', todos: [{ title: 'a' }, { title: 'b' }] });
    const [a, b] = store.db.prepare('SELECT id FROM todos WHERE task_id = ? ORDER BY ord').all(t.id) as { id: string }[];
    const status = () => (store.db.prepare('SELECT status FROM tasks WHERE id = ?').get(t.id) as { status: string }).status;
    store.setTodoDone(YOU, a!.id, true);
    expect(status()).toBe('doing');
    store.setTodoDone(YOU, b!.id, true);
    expect(status()).toBe('done');
    store.setTodoDone(YOU, b!.id, false);
    expect(status()).toBe('doing');
    expect(events(store).filter((e) => e.kind === 'todo_done').length).toBe(2);
  });

  it('after must stay inside the task', () => {
    const { store, msId } = base();
    const t1 = store.createTask(YOU, msId, { title: 'x', todos: [{ title: 'a' }] });
    const t2 = store.createTask(YOU, msId, { title: 'y', todos: [{ title: 'b' }] });
    const a = store.db.prepare('SELECT id FROM todos WHERE task_id = ?').get(t1.id) as { id: string };
    const b = store.db.prepare('SELECT id FROM todos WHERE task_id = ?').get(t2.id) as { id: string };
    expectCode(() => store.updateTodo(YOU, b.id, { after: [a.id] }), 'invalid');
  });

  it('addTodos appends linearly after existing ones', () => {
    const { store, msId } = base();
    const t = store.createTask(YOU, msId, { title: 'x', todos: [{ title: 'a' }] });
    store.addTodos(YOU, t.id, [{ title: 'b' }]);
    const rows = store.db.prepare('SELECT id, after_json FROM todos WHERE task_id = ? ORDER BY ord').all(t.id) as { id: string; after_json: string }[];
    expect(JSON.parse(rows[1]!.after_json)).toEqual([rows[0]!.id]);
  });
});

describe('reorder', () => {
  it('sets ord 0..n and rejects mixed parents', () => {
    const { store, msId } = base();
    const t = store.createTask(YOU, msId, { title: 'x', todos: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] });
    const [a, b, c] = (store.db.prepare('SELECT id FROM todos WHERE task_id = ? ORDER BY ord').all(t.id) as { id: string }[]).map((r) => r.id);
    store.reorder(YOU, 'todo', [c!, a!, b!]);
    const order = (store.db.prepare('SELECT id FROM todos WHERE task_id = ? ORDER BY ord').all(t.id) as { id: string }[]).map((r) => r.id);
    expect(order).toEqual([c, a, b]);
    const t2 = store.createTask(YOU, msId, { title: 'y', todos: [{ title: 'z' }] });
    const z = store.db.prepare('SELECT id FROM todos WHERE task_id = ?').get(t2.id) as { id: string };
    expectCode(() => store.reorder(YOU, 'todo', [a!, z.id]), 'invalid');
  });
});

describe('attachments', () => {
  it('infers kind/ref and upserts on url', () => {
    const { store, msId } = base();
    const t = store.createTask(YOU, msId, { title: 'x' });
    const url = 'https://github.com/cann1neof/mcp-pipe/commit/a1c9e42f00ba7d1e9c3b2a1f0e9d8c7b6a5f4e3d';
    const a = store.attach(YOU, t.id, { role: 'deliverable', url });
    expect([a.kind, a.ref, a.title]).toEqual(['commit', 'a1c9e42', 'a1c9e42']);
    const b = store.attach(YOU, t.id, { role: 'deliverable', url, state: 'merged' });
    expect(b.id).toBe(a.id);
    expect(b.state).toBe('merged');
    expect(store.db.prepare('SELECT count(*) n FROM attachments').get()).toEqual({ n: 1 });
    const pr = store.attach(YOU, t.id, { role: 'deliverable', url: 'https://github.com/cann1neof/mcp-pipe/pull/48' });
    expect([pr.kind, pr.ref]).toEqual(['pr', '#48']);
    expect(store.attach(YOU, t.id, { role: 'context', url: '~/notes/plan.md' }).kind).toBe('file');
    expect(store.attach(YOU, t.id, { role: 'context', url: 'https://example.com/docs/' }).kind).toBe('link');
    store.detach(YOU, pr.id);
    expect(store.db.prepare('SELECT archived_at FROM attachments WHERE id = ?').get(pr.id)).not.toEqual({ archived_at: null });
  });
});

describe('archive / restore', () => {
  it('cascades a milestone to its tasks and restores exactly those', () => {
    const { store, msId } = base();
    const t1 = store.createTask(YOU, msId, { title: 'a' });
    const t2 = store.createTask(YOU, msId, { title: 'b' });
    store.archive(YOU, 'task', t2.id); // archived separately, must stay archived
    store.archive(YOU, 'milestone', msId);
    const archived = (id: string) => (store.db.prepare('SELECT archived_at FROM tasks WHERE id = ?').get(id) as { archived_at: string | null }).archived_at !== null;
    expect(archived(t1.id)).toBe(true);
    const ev = events(store).filter((e) => e.kind === 'archived');
    expect(ev.length).toBe(3);
    expect(ev[1]!.batch_id).toBe(ev[2]!.batch_id);
    store.restore(YOU, 'milestone', msId);
    expect(archived(t1.id)).toBe(false);
    expect(archived(t2.id)).toBe(true);
  });

  it('agents cannot archive by default', () => {
    const { store, msId } = base();
    expectCode(() => store.archive({ actor: 'ai:codex' }, 'milestone', msId), 'forbidden', 'agents_can_archive');
  });
});

describe('onChange', () => {
  it('notifies every event after commit; unsubscribe works', () => {
    const { store } = setup();
    const seen: string[] = [];
    const off = store.onChange((e) => seen.push(e.kind));
    store.createProject(YOU, { name: 'A', firstMilestone: { name: 'M' } });
    expect(seen).toEqual(['created', 'created']);
    off();
    store.createProject(YOU, { name: 'B' });
    expect(seen.length).toBe(2);
  });

  it('does not notify on rollback', () => {
    const { store } = setup();
    const seen: string[] = [];
    store.onChange((e) => seen.push(e.kind));
    expectCode(() => store.createProject(YOU, { name: 'A', firstMilestone: { name: 'M', due: 'bad' } }), 'invalid');
    expect(seen).toEqual([]);
    expect(store.db.prepare('SELECT count(*) n FROM projects').get()).toEqual({ n: 0 });
  });
});

describe('ticket links', () => {
  it('Jira, Linear and GitHub issue urls become tickets; PRs stay PRs', async () => {
    const { inferAttachment } = await import('../src/domain/store.js');
    expect(inferAttachment('https://acme.atlassian.net/browse/OPS-142')).toMatchObject({ kind: 'ticket', ref: 'OPS-142' });
    expect(inferAttachment('https://jira.acme.io/browse/AB2-7?focusedCommentId=1')).toMatchObject({ kind: 'ticket', ref: 'AB2-7' });
    expect(inferAttachment('https://linear.app/acme/issue/ENG-88/fix-login')).toMatchObject({ kind: 'ticket', ref: 'ENG-88' });
    expect(inferAttachment('https://github.com/o/r/issues/12')).toMatchObject({ kind: 'ticket', ref: '#12' });
    expect(inferAttachment('https://github.com/o/r/pull/12')).toMatchObject({ kind: 'pr', ref: '#12' });
    const { store, msId } = base();
    const t = store.createTask(YOU, msId, { title: 'T' });
    expect(store.attach(YOU, t.id, { role: 'context', url: 'https://linear.app/acme/issue/ENG-88' })).toMatchObject({ kind: 'ticket', ref: 'ENG-88', title: 'ENG-88' });
  });
});
