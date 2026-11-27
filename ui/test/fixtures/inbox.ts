const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

export const inboxItems = [
  { id: 'i1', text: 'Call the landlord about the lease', by: 'you', at: ago(2) },
  { id: 'i2', text: 'Check retry logic in the sync client', by: 'ai:claude-code', at: ago(5) },
  { id: 'i3', text: 'اشتري الحليب', by: 'you', at: ago(26) },
  { id: 'i4', text: 'Draft release notes', by: 'you', at: ago(50) },
];

export const inboxPayload = (items = inboxItems) => ({ count: items.length, items });

export const projects = [
  {
    slug: 'gameplan',
    name: 'Gameplan',
    color: '#6E7CF5',
    status: 'active',
    progress: { pct: 38, done: 3, total: 8 },
    atRisk: 0,
    milestones: [
      { id: 'g1', name: 'Alpha', due: '2026-12-01', status: 'active', missed: false },
      { id: 'g2', name: 'Beta', due: '2027-01-15', status: 'planned', missed: false },
    ],
    nextMilestone: null,
  },
  {
    slug: 'mcp-pipe',
    name: 'MCP pipe',
    color: '#D9892B',
    status: 'active',
    progress: { pct: 60, done: 6, total: 10 },
    atRisk: 0,
    milestones: [{ id: 'm2', name: 'Ship it', due: '2026-12-10', status: 'active', missed: false }],
    nextMilestone: null,
  },
];

export const taskHits = [
  { type: 'task', id: 't1', title: 'Wire the sync client', project: 'gameplan', path: 'Gameplan › Alpha › Wire the sync client' },
  { type: 'project', id: 'p9', title: 'Wire', project: 'wire', path: 'Wire' },
];
