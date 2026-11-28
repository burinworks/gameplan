import type { ProjectTree, TaskDetail, TreeTask, TreeTodo } from '../../src/api/types';

export const todo = (over: Partial<TreeTodo> & { id: string }): TreeTodo =>
  ({ taskId: 't1', title: over.id, done: false, doneAt: null, ord: 0, after: [], archivedAt: null, state: 'open', ...over }) as TreeTodo;

export const treeTask = (over: Partial<TreeTask> = {}): TreeTask =>
  ({
    id: 't1',
    milestoneId: 'm1',
    areaId: null,
    title: 'Draft the spec',
    description: null,
    start: '2026-11-20',
    end: '2026-11-25',
    status: 'doing',
    priority: 'p2',
    executor: 'manual',
    important: false,
    labels: [],
    ord: 0,
    archivedAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-26T10:00:00.000Z',
    resumeNote: null,
    resumeAt: null,
    resumeBy: null,
    area: null,
    progress: { pct: 0, done: 0, total: 0 },
    health: 'on_track',
    reasons: [],
    dependsOn: [],
    blocks: [],
    todos: [],
    context: [],
    deliverables: [],
    deliverableCount: 0,
    resume: null,
    log: [],
    milestoneColor: '#6E7CF5',
    ...over,
  }) as TreeTask;

export const taskDetail = (over: Partial<TaskDetail> = {}): TaskDetail =>
  ({
    ...treeTask(),
    project: { slug: 'acme', name: 'Acme', color: '#6E7CF5' },
    milestone: { id: 'm1', name: 'Beta', due: '2026-12-01' },
    events: [],
    ...over,
  }) as TaskDetail;

export const projectTree = (): ProjectTree =>
  ({
    project: {
      id: 'p1',
      slug: 'acme',
      name: 'Acme',
      color: '#6E7CF5',
      status: 'active',
      defaultPriority: 'p2',
      defaultExecutor: 'manual',
      labels: [],
      areas: [{ id: 'a1', name: 'Frontend', color: null, tasks: 1 }],
      progress: { pct: 0, done: 0, total: 0 },
    },
    milestones: [
      {
        id: 'm1',
        name: 'Beta',
        due: '2026-12-01',
        color: '#6E7CF5',
        tasks: [treeTask(), treeTask({ id: 't2', title: 'Write tests' })],
      },
      { id: 'm2', name: 'Launch', due: null, color: '#D9892B', tasks: [] },
    ],
  }) as unknown as ProjectTree;
