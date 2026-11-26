import { describe, expect, it } from 'vitest';
import { rescheduleTask } from '../src/domain/reschedule.js';
import { home, listProjects, overview, projectTree, timeline, updates } from '../src/domain/queries.js';
import { getSettings } from '../src/domain/settings.js';
import { setup, YOU } from './helpers.js';

const TODAY = '2026-11-26';

function world() {
  const s = setup();
  const { store } = s;
  store.createProject(YOU, { name: 'mcp-pipe', areas: [{ name: 'Core', color: '#111111' }, { name: 'Docs' }], firstMilestone: { name: 'M4 · Launch', due: '2026-12-12' } });
  const m4 = store.project('mcp-pipe');
  const msId = (store.db.prepare('SELECT id FROM milestones WHERE project_id = ?').get(m4.id) as { id: string }).id;
  const readme = store.createTask(YOU, msId, { title: 'README', area: 'Docs', start: '2026-11-20', end: '2026-11-30', todos: [{ title: 'a' }, { title: 'b' }] });
  const today = store.createTask(YOU, msId, { title: 'Today task', area: 'Core', start: '2026-11-20', end: '2026-11-26', executor: 'ai' });
  const tomorrow = store.createTask(YOU, msId, { title: 'Tomorrow', start: '2026-11-27', end: '2026-11-30', after: [readme.id] });
  const late = store.createTask(YOU, msId, { title: 'Late one', start: '2026-11-10', end: '2026-11-19' });
  const undated = store.createTask(YOU, msId, { title: 'Undated' });
  const backlog = store.createMilestone(YOU, 'mcp-pipe', { name: 'Backlog' });
  store.createProject(YOU, { name: 'Side', firstMilestone: { name: 'S1', due: '2026-12-01' } });
  const sideMs = (store.db.prepare("SELECT m.id FROM milestones m JOIN projects p ON p.id = m.project_id WHERE p.slug = 'side'").get() as { id: string }).id;
  const sideTask = store.createTask(YOU, sideMs, { title: 'Side today', start: '2026-11-25', end: '2026-11-27' });
  store.configureProject(YOU, 'side', { status: 'paused' });
  store.createProject(YOU, { name: 'Old', firstMilestone: { name: 'O1' } });
  const oldMs = (store.db.prepare("SELECT m.id FROM milestones m JOIN projects p ON p.id = m.project_id WHERE p.slug = 'old'").get() as { id: string }).id;
  store.createTask(YOU, oldMs, { title: 'o' });
  store.configureProject(YOU, 'old', { status: 'done' });
  store.archive(YOU, 'project', store.project('old').id);
  return { ...s, msId, readme, today, tomorrow, late, undated, backlog, sideTask };
}

describe('projectTree', () => {
  it('returns project, milestones and tasks with derived state', () => {
    const w = world();
    const tree = projectTree(w.db, 'mcp-pipe', TODAY);
    expect(tree.project.areas.map((a) => [a.name, a.tasks])).toEqual([['Core', 1], ['Docs', 1]]);
    const m4 = tree.milestones[0]!;
    expect(m4.name).toBe('M4 · Launch');
    expect(m4.span).toEqual({ start: '2026-11-10', end: '2026-12-12' });
    expect(m4.progress.total).toBe(6);
    expect(m4.health).toBe('late');
    const t = m4.tasks.find((x) => x.title === 'Tomorrow')!;
    expect(t.health).toBe('conflict');
    expect(t.reasons).toEqual(['Starts before README ends']);
    expect(t.dependsOn).toEqual([expect.objectContaining({ id: w.readme.id, title: 'README', bad: true })]);
    const r = m4.tasks.find((x) => x.title === 'README')!;
    expect(r.blocks).toEqual([expect.objectContaining({ id: w.tomorrow.id, bad: true })]);
    expect(r.todos.map((x) => x.state)).toEqual(['next', 'locked']);
    expect(r.area).toEqual(expect.objectContaining({ name: 'Docs' }));
    expect(m4.tasks.find((x) => x.title === 'Late one')!.reasons).toEqual(['7 days late']);
    expect(m4.tasks.find((x) => x.title === 'Undated')!.health).toBe('unscheduled');
    expect(tree.milestones[1]!.name).toBe('Backlog');
  });

  it('excludes archived tasks and splits attachments', () => {
    const w = world();
    w.store.attach(YOU, w.readme.id, { role: 'deliverable', url: 'https://github.com/o/r/pull/48' });
    w.store.attach(YOU, w.readme.id, { role: 'context', url: 'projects/x.md' });
    w.store.archive(YOU, 'task', w.late.id);
    const tree = projectTree(w.db, 'mcp-pipe', TODAY);
    const tasks = tree.milestones[0]!.tasks;
    expect(tasks.some((t) => t.title === 'Late one')).toBe(false);
    const r = tasks.find((t) => t.title === 'README')!;
    expect(r.deliverables.map((a) => a.ref)).toEqual(['#48']);
    expect(r.context.length).toBe(1);
    expect(r.deliverableCount).toBe(1);
  });
});

describe('home', () => {
  it('today, at risk, rescheduled', () => {
    const w = world();
    rescheduleTask(w.store, { actor: 'ai:codex', reason: 'slipped' }, w.readme.id, { start: '2026-11-20', end: '2026-12-01' });
    const h = home(w.db, TODAY, getSettings(w.db));
    expect(h.today).toBe(TODAY);
    const titles = h.todayTasks.map((t) => t.title);
    expect(titles).toContain('Today task');
    expect(titles).toContain('README');
    expect(titles).not.toContain('Tomorrow');
    expect(titles).not.toContain('Undated');
    expect(titles).not.toContain('Side today');
    expect(h.todayTasks.find((t) => t.title === 'Today task')).toEqual(expect.objectContaining({ executor: 'ai', project: 'mcp-pipe', end: TODAY }));
    expect(h.atRisk.map((t) => t.title).sort()).toEqual(['Late one', 'Tomorrow']);
    expect(h.rescheduled).toEqual([expect.objectContaining({ actor: 'ai:codex', reason: 'slipped', from: { start: '2026-11-20', end: '2026-11-30' }, to: { start: '2026-11-20', end: '2026-12-01' } })]);
  });

  it('includes paused projects only when show_paused', () => {
    const w = world();
    expect(home(w.db, TODAY, { ...getSettings(w.db), show_paused: true }).todayTasks.map((t) => t.title)).toContain('Side today');
  });
});

describe('overview / listProjects', () => {
  it('lists paused and archived', () => {
    const w = world();
    const o = overview(w.db, TODAY);
    expect(o.paused).toEqual([expect.objectContaining({ slug: 'side', pausedSince: '2026-11-26T09:00:00.000Z' })]);
    expect(o.archived).toEqual([expect.objectContaining({ slug: 'old', status: 'done', tasks: 1, milestones: 1 })]);
    expect(o.count).toBe(2);
  });

  it('listProjects excludes paused and archived', () => {
    const w = world();
    const l = listProjects(w.db, TODAY);
    expect(l.map((p) => p.slug)).toEqual(['mcp-pipe']);
    expect(l[0]!.atRisk).toBe(2);
    expect(l[0]!.nextMilestone).toEqual(expect.objectContaining({ name: 'M4 · Launch' }));
    expect(listProjects(w.db, TODAY, 'paused').map((p) => p.slug)).toEqual(['side']);
  });
});

describe('timeline', () => {
  it('milestone span is earliest task start → due, clipped to the window', () => {
    const w = world();
    const tl = timeline(w.db, TODAY, '2026-11-16', '2027-01-10');
    expect(tl.map((r) => r.project.slug)).toEqual(['mcp-pipe']);
    const m4 = tl[0]!.milestones[0]!;
    expect([m4.start, m4.end, m4.due]).toEqual(['2026-11-16', '2026-12-12', '2026-12-12']);
    expect(m4.atRisk).toBe(true);
    expect(tl[0]!.milestones.some((m) => m.name === 'Backlog')).toBe(false);
  });
});

describe('updates', () => {
  it('filters by actor and project, newest first', () => {
    const w = world();
    w.store.setTodoDone({ actor: 'ai:codex' }, (w.db.prepare('SELECT id FROM todos LIMIT 1').get() as { id: string }).id, true);
    const a = updates(w.db, { actor: 'agents' });
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((e) => e.actor.startsWith('ai:'))).toBe(true);
    expect(updates(w.db, { actor: 'you' }).every((e) => e.actor === 'you')).toBe(true);
    const p = updates(w.db, { project: 'side' });
    expect(p.every((e) => e.project?.slug === 'side')).toBe(true);
    const all = updates(w.db, {});
    expect(all[0]!.kind).toBe('status_changed');
    expect(all[0]!.day).toBe('2026-11-26');
  });

  it('folds a planned batch into one row', () => {
    const w = world();
    w.store.write({ actor: 'ai:codex' }, (c) => {
      const t = w.store.createTask(c, w.backlog.id, { title: 'p1', todos: [{ title: 'x' }] });
      w.store.record(c, { entity: 'milestone', entityId: w.backlog.id, projectId: w.store.project('mcp-pipe').id, label: 'Backlog', kind: 'planned', after: { tasks: 1, todos: 1, dependencies: 0, taskId: t.id } });
    });
    const rows = updates(w.db, { actor: 'agents' });
    expect(rows.map((r) => r.kind)).toEqual(['planned']);
  });
});
