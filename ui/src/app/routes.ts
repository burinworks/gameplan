export type ProjectTab = 'timeline' | 'list' | 'updates';
export const PROJECT_TABS: readonly ProjectTab[] = ['timeline', 'list', 'updates'];
export const isTab = (s: string | undefined): s is ProjectTab => PROJECT_TABS.includes(s as ProjectTab);

const enc = encodeURIComponent;

export const paths = {
  home: '/',
  inbox: '/inbox',
  archive: '/archive',
  settings: '/settings',
  /** Project settings page (`/p/:slug/settings`). */
  projectSettings: (slug: string) => `/p/${enc(slug)}/settings`,
  project: (slug: string, tab: ProjectTab = 'timeline') => `/p/${enc(slug)}/${tab}`,
  /** Project route with the task pane open (`?task=<id>`). */
  task: (slug: string, taskId: string, tab: ProjectTab = 'timeline') => `${paths.project(slug, tab)}?task=${enc(taskId)}`,
  /** Project route with the new-task pane open. */
  newTask: (slug: string, opts: { milestoneId?: string; title?: string; inboxId?: string; tab?: ProjectTab } = {}) => {
    const q = new URLSearchParams({ new: 'task' });
    if (opts.milestoneId) q.set('milestone', opts.milestoneId);
    if (opts.title) q.set('title', opts.title);
    if (opts.inboxId) q.set('inbox', opts.inboxId);
    return `${paths.project(slug, opts.tab)}?${q}`;
  },
  /** Project route with the new-milestone pane open. */
  newMilestone: (slug: string, tab: ProjectTab = 'timeline') => `${paths.project(slug, tab)}?new=milestone`,
};

export type PaneState =
  | { kind: 'task'; taskId: string }
  | { kind: 'newTask'; milestoneId?: string; title?: string; inboxId?: string }
  | { kind: 'newMilestone' };

/** Reads the pane state out of a query string (with or without leading `?`). */
export function parsePane(search: string): PaneState | null {
  const q = new URLSearchParams(search);
  const task = q.get('task');
  if (task) return { kind: 'task', taskId: task };
  const n = q.get('new');
  if (n === 'task') return { kind: 'newTask', milestoneId: q.get('milestone') ?? undefined, title: q.get('title') ?? undefined, inboxId: q.get('inbox') ?? undefined };
  if (n === 'milestone') return { kind: 'newMilestone' };
  return null;
}

/** Query string without any pane params (leading `?` included when non-empty). */
export function stripPane(search: string): string {
  const q = new URLSearchParams(search);
  for (const k of ['task', 'new', 'milestone', 'title', 'inbox']) q.delete(k);
  const s = q.toString();
  return s ? `?${s}` : '';
}
