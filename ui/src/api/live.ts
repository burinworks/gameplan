import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { setErrorLine, useHome } from './hooks';
import { errorLine } from '../lib/format';
import { api, ApiError } from './client';
import type { EventRow } from './types';

interface ESLike {
  readyState?: number;
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

const highlights = store<ReadonlySet<string>>(new Set());
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** The engine is down only while `/api/home` fails with a network error (not on a bare SSE blip). */
export function useEngineUp(): boolean {
  const q = useHome();
  return !(q.isError && q.error instanceof ApiError && q.error.code === 'network');
}
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
/** Every event seen on the stream (any actor), newest last, so a caller can find its own. */
const recent: EventRow[] = [];
const waiters = new Set<() => void>();
let lastBatch: string | null = null;
/** Kinds the engine's revert accepts for one of your own changes (see src/domain/revert.ts); events that only the Inbox undo or nothing can reverse stay off the stack. */
const STACKABLE = new Set([
  'dates_changed',
  'status_changed',
  'updated',
  'review_accepted',
  'review_sent_back',
  'resume_noted',
  'todo_done',
  'todo_undone',
  'dependency_added',
  'dependency_removed',
  'attached',
  'detached',
  'archived',
  'restored',
  'created',
  'planned',
  'reordered',
]);
function stackable(e: EventRow): boolean {
  if (!STACKABLE.has(e.kind)) return false;
  if ((e.kind === 'updated' || e.kind === 'status_changed') && e.after && 'areas' in e.after) return false;
  if (e.kind === 'created' && !['project', 'milestone', 'task', 'todo'].includes(e.entity)) return false;
  return true;
}
export const undoStack = {
  push(e: EventRow): void {
    recent.push(e);
    if (recent.length > 200) recent.shift();
    waiters.forEach((f) => f());
    if (e.actor !== 'you' || !stackable(e)) return;
    if (e.batchId && e.batchId === lastBatch) return;
    lastBatch = e.batchId || null;
    stack.push(e.id);
    if (stack.length > 50) stack.shift();
  },
  pop: (): string | undefined => stack.pop(),
  size: (): number => stack.length,
  /** Finds the newest seen event matching `match`, drops it from the undo stack and returns its id. */
  take(match: (e: EventRow) => boolean): string | undefined {
    for (let i = recent.length - 1; i >= 0; i--) {
      const e = recent[i]!;
      if (!match(e)) continue;
      const at = stack.lastIndexOf(e.id);
      if (at >= 0) stack.splice(at, 1);
      recent.splice(i, 1);
      return e.id;
    }
    return undefined;
  },
  /** Like `take`, but waits up to `ms` for a matching event to arrive. */
  waitFor(match: (e: EventRow) => boolean, ms = 2000): Promise<string | undefined> {
    const now = undoStack.take(match);
    if (now || ms <= 0) return Promise.resolve(now);
    return new Promise((resolve) => {
      const done = (id: string | undefined) => {
        clearTimeout(timer);
        waiters.delete(check);
        resolve(id);
      };
      const check = () => {
        const id = undoStack.take(match);
        if (id) done(id);
      };
      const timer = setTimeout(() => done(undefined), ms);
      waiters.add(check);
    });
  },
};

export async function undoLast(): Promise<void> {
  const id = undoStack.pop();
  if (!id) return;
  lastBatch = null;
  try {
    await api('POST', `/api/events/${encodeURIComponent(id)}/revert`);
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.code === 'network') stack.push(id);
      setErrorLine(e.code === 'invalid' && !e.message.includes('cycle') ? "Can't undo that" : errorLine(e));
    }
  }
}

const BACKOFF = [1000, 2000, 5000];

export function startLive(qc: QueryClient, opts: LiveOptions = {}): () => void {
  const { url = '/events', debounceMs = 150 } = opts;
  const ES = opts.EventSource ?? (globalThis.EventSource as unknown as ESCtor);
  let es: ESLike;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let hadError = false;
  let attempt = 0;
  let stopped = false;

  function connect() {
    const cur = (es = new ES(url));
    cur.addEventListener('change', (m) => {
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
    cur.addEventListener('ready', () => {
      attempt = 0;
      if (hadError) {
        hadError = false;
        void qc.invalidateQueries();
      }
    });
    cur.addEventListener('error', () => {
      hadError = true;
      // Probe the engine; the down bar follows /api/home, not the stream.
      void qc.invalidateQueries({ queryKey: ['home'] });
      if (cur.readyState === 2 && !stopped) {
        // The browser gave up on this stream (e.g. a proxy 502): reopen it ourselves.
        cur.close();
        clearTimeout(retryTimer);
        retryTimer = setTimeout(connect, BACKOFF[Math.min(attempt++, BACKOFF.length - 1)]);
      }
    });
  }
  connect();

  return () => {
    stopped = true;
    clearTimeout(timer);
    clearTimeout(retryTimer);
    es.close();
  };
}
