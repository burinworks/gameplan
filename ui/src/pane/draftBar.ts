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

export interface DraftMilestone {
  name: string;
  due: string;
}

let milestone: DraftMilestone | null = null;
const msSubs = new Set<() => void>();

/** NewMilestone sets the milestone being drawn (name + due); TimelineTab may render it as a selected group row. null clears. */
export function setDraftMilestone(v: DraftMilestone | null): void {
  milestone = v;
  msSubs.forEach((f) => f());
}

export const useDraftMilestone = (): DraftMilestone | null =>
  useSyncExternalStore(
    (f) => {
      msSubs.add(f);
      return () => void msSubs.delete(f);
    },
    () => milestone,
  );
