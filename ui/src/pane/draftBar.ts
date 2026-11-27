import { useSyncExternalStore } from 'react';

export interface DraftBar {
  start: string;
  end: string;
  milestoneId?: string;
}

let current: DraftBar | null = null;
const subs = new Set<() => void>();

/** NewTask sets the draft dates; TimelineTab renders them as a `kind: 'draft'` bar. null clears. */
export function setDraftBar(v: DraftBar | null): void {
  current = v;
  subs.forEach((f) => f());
}

export const useDraftBar = (): DraftBar | null =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => current,
  );
