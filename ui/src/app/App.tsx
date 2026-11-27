import { useEffect, useState } from 'react';
import { Redirect, Route, Switch, useLocation, useRoute, useSearch } from 'wouter';
import { setErrorLine, useErrorLine, useSettings } from '../api/hooks';
import { undoLast } from '../api/live';
import { Pane, useCloseTask, usePaneNav } from '../pane/Pane';
import { AppSettings } from '../screens/settings/AppSettings';
import { Home } from '../screens/home/Home';
import { Inbox } from '../screens/inbox/Inbox';
import { PausedArchived } from '../screens/archive/PausedArchived';
import { ProjectScreen } from '../screens/project/ProjectScreen';
import { ProjectSettings } from '../screens/project/ProjectSettings';
import { SearchPalette } from '../search/SearchPalette';
import { NewProject } from '../sheets/NewProject';
import { EngineDown } from '../shell/EngineDown';
import { Sidebar } from '../shell/Sidebar';
import { applyTheme } from '../theme';
import '../ui/primitives.css';
import './app.css';
import { isTab, parsePane, paths, type ProjectTab } from './routes';
import { useShortcut } from './shortcuts';

const ERROR_MS = 6000; // --gp-undo

function ErrorLine() {
  const line = useErrorLine();
  useEffect(() => {
    if (!line) return;
    const t = setTimeout(() => setErrorLine(null), ERROR_MS);
    return () => clearTimeout(t);
  }, [line]);
  return line ? (
    <div className="gp-errorline" role="alert" dir="auto">
      {line}
    </div>
  ) : null;
}

function ProjectRoute({ slug, tab }: { slug: string; tab?: string }) {
  return <ProjectScreen slug={slug} tab={isTab(tab) ? tab : 'timeline'} />;
}

export function App() {
  const settings = useSettings();
  const [searching, setSearching] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [loc, navigate] = useLocation();
  const search = useSearch();
  const [onProject, params] = useRoute('/p/:slug/:rest*');
  const slug = onProject ? params.slug : undefined;
  const paneOpen = !!slug && parsePane(search) !== null;
  const closePane = useCloseTask();
  const { openNewTask } = usePaneNav();

  const s = settings.data;
  useEffect(() => {
    applyTheme({ appearance: (s?.appearance as 'system' | 'light' | 'dark' | undefined) ?? 'system', accent: s?.accent ?? '#2F6BF0' });
  }, [s?.appearance, s?.accent]);

  useShortcut('mod+k', () => setSearching(true));
  useShortcut('mod+shift+n', () => setNewProject(true));
  useShortcut('mod+n', () => slug && openNewTask(slug), { when: () => !!slug });
  const tabKey = (tab: ProjectTab) => () => slug && navigate(paths.project(slug, tab));
  const onTabs = { when: () => !!slug && !loc.endsWith('/settings') };
  useShortcut('mod+1', tabKey('timeline'), onTabs);
  useShortcut('mod+2', tabKey('list'), onTabs);
  useShortcut('mod+3', tabKey('updates'), onTabs);
  useShortcut('mod+z', () => {
    undoLast().catch((e: unknown) => setErrorLine(e instanceof Error ? e.message : 'Could not undo'));
  });
  useShortcut('escape', () => {
    if (searching || newProject) {
      setSearching(false);
      setNewProject(false);
    } else if (paneOpen) closePane();
  });

  return (
    <div className="gp-window">
      <EngineDown />
      <div className="gp-app">
        <Sidebar onSearch={() => setSearching(true)} onNewProject={() => setNewProject(true)} />
        <div className="gp-card">
          <main className="gp-main">
            <ErrorLine />
            <Switch>
              <Route path={paths.home}>
                <Home />
              </Route>
              <Route path={paths.inbox}>
                <Inbox />
              </Route>
              <Route path={paths.archive}>
                <PausedArchived />
              </Route>
              <Route path={paths.settings}>
                <AppSettings />
              </Route>
              <Route path="/p/:slug/settings">{(p) => <ProjectSettings slug={p.slug} />}</Route>
              <Route path="/p/:slug/:tab?">{(p) => <ProjectRoute slug={p.slug} tab={p.tab} />}</Route>
              <Route>
                <Redirect to={paths.home} />
              </Route>
            </Switch>
          </main>
          {slug && <Pane slug={slug} />}
        </div>
      </div>
      {searching && <SearchPalette onClose={() => setSearching(false)} />}
      {newProject && <NewProject onClose={() => setNewProject(false)} />}
    </div>
  );
}
