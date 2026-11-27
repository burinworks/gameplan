import { useCallback } from 'react';
import { navigate as browserNavigate } from 'wouter/use-browser-location';
import { useLocation, useSearch } from 'wouter';
import { isTab, parsePane, paths, stripPane, type ProjectTab } from '../app/routes';
import { NewMilestone } from './NewMilestone';
import { NewTask } from './NewTask';
import { TaskPane } from './TaskPane';
import './pane.css';

const tabOf = (pathname: string): ProjectTab => {
  const t = pathname.split('/')[3];
  return isTab(t) ? t : 'timeline';
};

/** Drops the pane query params from the current URL (the pane closes). */
export function useCloseTask(): () => void {
  const [loc, navigate] = useLocation();
  const search = useSearch();
  return useCallback(() => navigate(loc + stripPane(search)), [loc, search, navigate]);
}

/** Router-aware pane navigation; replaces whatever pane is open (the pane never stacks). */
export function usePaneNav() {
  const [loc, navigate] = useLocation();
  return {
    openTask: (slug: string, id: string) => navigate(paths.task(slug, id, tabOf(loc))),
    openNewTask: (slug: string, opts: { milestoneId?: string; title?: string; inboxId?: string } = {}) => navigate(paths.newTask(slug, { ...opts, tab: tabOf(loc) })),
    openNewMilestone: (slug: string) => navigate(paths.newMilestone(slug, tabOf(loc))),
  };
}

/** Hook-free variant using the browser location. Keeps the current tab. */
export function openTask(slug: string, id: string): void {
  browserNavigate(paths.task(slug, id, tabOf(location.pathname)));
}

/** The 344px right-hand pane. Renders only when a pane query param is present. */
export function Pane({ slug }: { slug: string }) {
  const search = useSearch();
  const state = parsePane(search);
  if (!state) return null;
  return (
    <aside className="gp-pane" aria-label="Details">
      {state.kind === 'task' && <TaskPane key={state.taskId} taskId={state.taskId} slug={slug} />}
      {state.kind === 'newTask' && (
        <NewTask key={`${state.milestoneId}|${state.title}|${state.inboxId}`} slug={slug} milestoneId={state.milestoneId} title={state.title} inboxId={state.inboxId} />
      )}
      {state.kind === 'newMilestone' && <NewMilestone slug={slug} />}
    </aside>
  );
}
