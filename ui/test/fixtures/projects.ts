export const templates = [
  { id: 'report', name: 'Report', milestones: 3, tasks: 9 },
  { id: 'launch', name: 'Launch', milestones: 4, tasks: 14 },
  { id: 'research', name: 'Research', milestones: 3, tasks: 8 },
];

const base = { milestones: [], nextMilestone: null, progress: { pct: 0, done: 0, total: 0 }, atRisk: 0, status: 'active' };
/** Existing projects use the first two palette colours. */
export const projectList = [
  { ...base, slug: 'alpha', name: 'Alpha', color: '#6E7CF5' },
  { ...base, slug: 'beta', name: 'Beta', color: '#D9892B' },
];

export const tree = {
  project: {
    id: 'p1',
    slug: 'alpha',
    name: 'Alpha',
    color: '#6E7CF5',
    status: 'active',
    statusChangedAt: null,
    vaultNote: null,
    repo: null,
    github: null,
    defaultPriority: 'p2',
    defaultExecutor: 'manual',
    labels: ['ops'],
    ord: 0,
    archivedAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    areas: [
      { id: 'a1', projectId: 'p1', name: 'Frontend', color: null, ord: 0, tasks: 2 },
      { id: 'a2', projectId: 'p1', name: 'Backend', color: null, ord: 1, tasks: 0 },
    ],
    progress: { pct: 0, done: 0, total: 0 },
  },
  milestones: [],
};

export const overview = {
  paused: [
    {
      id: 'p2',
      slug: 'side',
      name: 'Side',
      color: '#3FA796',
      progress: { pct: 40, done: 2, total: 5 },
      nextMilestone: { id: 'm1', name: 'Beta', due: '2026-12-01' },
      pausedSince: '2026-11-20T09:00:00.000Z',
    },
  ],
  archived: [{ id: 'p3', slug: 'old', name: 'Old', color: null, status: 'done', archivedAt: '2026-11-10T09:00:00.000Z', isArchived: true, tasks: 7, milestones: 2 }],
  count: 2,
};
