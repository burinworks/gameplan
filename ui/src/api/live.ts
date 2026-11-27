import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api } from './client';
import type { EventRow } from './types';

interface ESLike {
  addEventListener(type: string, cb: (e: { data?: string }) => void): void;
  close(): void;
}
type ESCtor = new (url: string) => ESLike;

export interface LiveOptions {
  url?: string;
  debounceMs?: number;
  /** Injected for tests. */
  EventSource?: ESCtor;
}

const HIGHLIGHT_MS = 1200; // --gp-highlight

function store<S>(initial: S) {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(next: S) {
      state = next;
      subs.forEach((f) => f());
    },
    subscribe(f: () => void) {
      subs.add(f);
      return () => void subs.delete(f);
    },
  };
}

const engine = store(true);
const highlights = store<ReadonlySet<string>>(new Set());
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export const useEngineUp = (): boolean => useSyncExternalStore(engine.subscribe, engine.get);
export const useHighlight = (entityId: string): boolean =>
  useSyncExternalStore(highlights.subscribe, () => highlights.get().has(entityId));

function flash(id: string) {
  clearTimeout(timers.get(id));
  highlights.set(new Set(highlights.get()).add(id));
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      const next = new Set(highlights.get());
      next.delete(id);
      highlights.set(next);
    }, HIGHLIGHT_MS),
  );
}

const stack: string[] = [];
let lastBatch: string | null = null;
export const undoStack = {
  push(e: EventRow): void {
    if (e.actor !== 'you' || e.kind === 'reverted') return;
    if (e.batchId && e.batchId === lastBatch) return;
    lastBatch = e.batchId || null;
    stack.push(e.id);
    if (stack.length > 50) stack.shift();
  },
  pop: (): string | undefined => stack.pop(),
  size: (): number => stack.length,
};

export async function undoLast(): Promise<void> {
  const id = undoStack.pop();
  if (!id) return;
  lastBatch = null;
  await api('POST', `/api/events/${encodeURIComponent(id)}/revert`);
}

export function startLive(qc: QueryClient, opts: LiveOptions = {}): () => void {
  const { url = '/events', debounceMs = 150 } = opts;
  const ES = opts.EventSource ?? (globalThis.EventSource as unknown as ESCtor);
  const es = new ES(url);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let hadError = false;

  es.addEventListener('change', (m) => {
    try {
      const e = JSON.parse(m.data ?? '') as EventRow;
      if (e.actor !== 'you') flash(e.entityId);
      undoStack.push(e);
    } catch {
      /* malformed event: still refresh below */
    }
    clearTimeout(timer);
    timer = setTimeout(() => void qc.invalidateQueries(), debounceMs);
  });
  es.addEventListener('ready', () => {
    engine.set(true);
    if (hadError) {
      hadError = false;
      void qc.invalidateQueries();
    }
  });
  es.addEventListener('error', () => {
    hadError = true;
    engine.set(false);
  });

  return () => {
    clearTimeout(timer);
    es.close();
  };
}
