import { createContext, useContext } from 'react';

/** App-level actions any screen can trigger (empty-state CTAs, etc.). Defaults to no-ops outside <App/>. */
export interface AppActions {
  openNewProject: () => void;
  openSearch: () => void;
}

export const AppActionsContext = createContext<AppActions>({ openNewProject: () => {}, openSearch: () => {} });

/** Usage: const { openNewProject } = useAppActions(); */
export function useAppActions(): AppActions {
  return useContext(AppActionsContext);
}
