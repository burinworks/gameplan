import type { ProjectTree, TreeMilestone, TreeTask, UpdateRow } from '../../src/api/types';
import { today } from '../../src/app/today';

/** Date `n` days from today as YYYY-MM-DD. */
export function day(n: number): string {
  const [y = 0, m = 1, d = 1] = today().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function task(over: Partial<TreeTask> & { id: string; title: string }): TreeTask {
  return {
    milestoneId: 'm1',
    areaId: null,
    description: null,
    start: day(-2),
    end: day(3),
    status: 'todo',
    priority: 'p2',
    executor: 'manual',
    important: false,
    labels: [],
    ord: 0,
    archivedAt: null,
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    resumeNote: null,
    resumeAt: null,
    resumeBy: null,
    area: null,
    progress: { pct: 0, done: 0, total: 1 },
    health: 'on_track',
    reasons: [],
    dependsOn: [],
    blocks: [],
    todos: [],
    context: [],
    deliverables: [],
    deliverableCount: 0,
    resume: null,
    ...over,
  } as TreeTask;
}

const milestone = (over: Partial<TreeMilestone> & { id: string; name: string; tasks: TreeTask[] }): TreeMilestone =>
  ({
    projectId: 'p1',
    description: null,
    due: null,
    status: 'active',
    ord: 0,
    archivedAt: null,
    progress: { pct: 0, done: 0, total: over.tasks.length },
    span: { start: over.tasks[0]?.start ?? null, end: over.tasks[over.tasks.length - 1]?.end ?? null },
    health: 'on_track',
    missed: false,
    atRisk: false,
    blocks: [],
    ...over,
  }) as TreeMilestone;

export const tasks = {
  spec: task({
    id: 't-spec',
    title: 'Draft the spec',
    status: 'doing',
    area: { id: 'a-be', name: 'Backend', color: '#3FA796' },
    areaId: 'a-be',
    start: day(-6),
    end: day(2),
    todos: [
      { id: 'td1', taskId: 't-spec', title: 'Outline', done: true, ord: 0, after: [], state: 'done' },
      { id: 'td2', taskId: 't-spec', title: 'Write', done: false, ord: 1, after: [], state: 'next' },
    ] as unknown as TreeTask['todos'],
    progress: { pct: 50, done: 1, total: 2 },
  }),
  release: task({
    id: 't-release',
    title: 'Signed npm release',
    status: 'doing',
    health: 'late',
    daysLate: 3,
    start: day(-10),
    end: day(-3),
    priority: 'p1',
    important: true,
    deliverableCount: 2,
  }),
  review: task({
    id: 't-review',
    title: 'Review the API',
    status: 'review',
    health: 'review',
    executor: 'ai',
    start: day(5),
    end: day(9),
    dependsOn: [{ depId: 'dep1', id: 't-spec', title: 'Draft the spec', kind: 'task', bad: true }],
  }),
  docs: task({ id: 't-docs', title: 'Write the docs', milestoneId: 'm2', executor: 'together', start: day(12), end: day(20), status: 'done', progress: { pct: 100, done: 1, total: 1 } }),
};

export const projectTree = {
  project: {
    id: 'p1',
    slug: 'ship',
    name: 'Ship it',
    color: '#6E7CF5',
    status: 'active',
    statusChangedAt: null,
    vaultNote: 'projects/ship',
    repo: null,
    github: 'acme/ship',
    defaultPriority: 'p2',
    defaultExecutor: 'manual',
    labels: [],
    ord: 0,
    archivedAt: null,
    createdAt: '2026-11-01T00:00:00Z',
    areas: [{ id: 'a-be', name: 'Backend', color: '#3FA796', ord: 0, tasks: 1 }],
    progress: { pct: 40, done: 2, total: 5 },
  },
  milestones: [
    milestone({ id: 'm1', name: 'Alpha', due: day(10), tasks: [tasks.spec, tasks.release, tasks.review], progress: { pct: 30, done: 1, total: 5 } }),
    milestone({ id: 'm2', name: 'Launch', due: day(21), status: 'planned', tasks: [tasks.docs], progress: { pct: 100, done: 1, total: 1 } }),
  ],
} as unknown as ProjectTree;

export const settings = { week_start: 'mon', show_weekends: true, appearance: 'system', accent: '#2F6BF0' };

export function update(over: Partial<UpdateRow> & { id: string; kind: UpdateRow['kind'] }): UpdateRow {
  return {
    projectId: 'p1',
    entity: 'task',
    entityId: 't-release',
    label: 'Signed npm release',
    actor: 'ai:Codex',
    before: null,
    after: null,
    reason: null,
    batchId: `b-${over.id}`,
    at: new Date().toISOString(),
    day: today(),
    project: { slug: 'ship', name: 'Ship it', color: '#6E7CF5' },
    ...over,
  } as UpdateRow;
}
