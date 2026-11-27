import type { Home, TimelineRows } from '../../src/api/types';

const task = (id: string, title: string, project: string, projectName: string, color: string, over: Record<string, unknown> = {}) => ({
  id,
  title,
  project,
  projectName,
  color,
  start: '2026-11-25',
  end: '2026-11-29',
  progress: { pct: 50, done: 2, total: 4 },
  executor: 'manual',
  status: 'doing',
  ...over,
});

const GP = ['gameplan', 'Gameplan', '#6E7CF5'] as const;
const MCP = ['mcp-pipe', 'MCP pipe', '#D9892B'] as const;

export const homeFixture = {
  today: '2026-11-27',
  todayTasks: [
    task('t1', 'Write the spec', ...GP),
    task('t2', 'Review wire format', ...MCP),
    task('t3', 'Fix the sidebar', ...GP),
    task('t4', 'Ship the tray icon', ...GP),
  ],
  atRisk: [
    { id: 'r1', title: 'Migrate storage', project: 'gameplan', projectName: 'Gameplan', color: '#6E7CF5', health: 'late', reasons: ['3 days late'] },
    { id: 'r2', title: 'Handshake', project: 'mcp-pipe', projectName: 'MCP pipe', color: '#D9892B', health: 'conflict', reasons: ['Starts before Wire protocol ends'] },
  ],
  rescheduled: [
    {
      eventId: 'e1', task: { id: 'x1', title: 'Beta notes' }, project: 'gameplan', projectName: 'Gameplan', color: '#6E7CF5',
      from: { start: '2026-11-28', end: '2026-11-30' }, to: { start: '2026-12-03', end: '2026-12-05' }, conflicts: [], actor: 'ai:Codex', reason: null, at: '2026-11-26T10:00:00.000Z',
    },
    {
      eventId: 'e2', task: { id: 'x2', title: 'Docs pass' }, project: 'mcp-pipe', projectName: 'MCP pipe', color: '#D9892B',
      from: { start: '2026-11-20', end: '2026-11-22' }, to: { start: '2026-11-24', end: '2026-11-26' }, conflicts: [], actor: 'you', reason: null, at: '2026-11-25T10:00:00.000Z',
    },
  ],
  plan: [
    { n: 1, task: task('t1', 'Write the spec', ...GP), when: 'after standup', resume: { note: 'Outline is done, fill section 3', at: '2026-11-26T09:00:00.000Z', by: 'ai:Claude Code' } },
    { n: 2, task: task('t2', 'Review wire format', ...MCP), when: null, resume: null },
    { n: 3, task: task('t3', 'Fix the sidebar', ...GP), when: 'before lunch', resume: null },
  ],
  pickUp: [
    { task: task('p1', 'Tray menu', ...GP), resume: { note: 'Capture field works, wire the menu', at: '2026-11-27T08:00:00.000Z', by: 'ai:Codex' } },
    { task: task('p2', 'Token auth', ...MCP), resume: { note: 'Header check missing', at: '2026-11-25T08:00:00.000Z', by: 'you' } },
  ],
  alsoToday: [task('t4', 'Ship the tray icon', ...GP), task('t5', 'Tidy the backlog', ...MCP)],
  needsReview: [
    { task: { id: 'n1', title: 'Parse resume notes' }, project: 'gameplan', color: '#6E7CF5', by: 'ai:Claude Code', at: '2026-11-27T06:00:00.000Z', todos: { done: 3, total: 4 } },
    { task: { id: 'n2', title: 'Retry logic' }, project: 'mcp-pipe', color: '#D9892B', by: 'ai:Codex', at: '2026-11-26T06:00:00.000Z', todos: { done: 2, total: 2 } },
  ],
  doneThisWeek: {
    count: 4,
    items: [
      { id: 'd1', title: 'Inbox triage', project: 'gameplan', at: '2026-11-27T05:00:00.000Z' },
      { id: 'd2', title: 'Schema', project: 'gameplan', at: '2026-11-26T05:00:00.000Z' },
      { id: 'd3', title: 'Backups', project: 'mcp-pipe', at: '2026-11-25T05:00:00.000Z' },
      { id: 'd4', title: 'Search', project: 'gameplan', at: '2026-11-24T05:00:00.000Z' },
    ],
  },
} as unknown as Home;

export const timelineFixture = [
  {
    project: { slug: 'gameplan', name: 'Gameplan' },
    color: '#6E7CF5',
    milestones: [{ id: 'm1', name: 'Alpha', start: '2026-11-20', end: '2026-12-05', due: '2026-12-05', status: 'active', progress: { pct: 40, done: 2, total: 5 }, atRisk: true, missed: false }],
  },
] as unknown as TimelineRows;
