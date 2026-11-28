import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { dragDates } from '../lib/timeline';

export type Dates = { start: string; end: string };
type Mode = 'move' | 'start' | 'end';

const EDGE_PX = 6;

/** Edge zone width: 6px, shrinking on narrow bars so the move zone is at least half the bar. */
export const edgeZone = (barW: number): number => Math.min(EDGE_PX, Math.floor(barW / 4));
const MOVE_THRESHOLD_PX = 3;

export interface DragBarInfo {
  start: string;
  end: string;
  draggable: boolean;
}

export interface UseBarDragOpts {
  dayW: number;
  /** Current effective dates of a bar (including optimistic overrides). */
  find: (id: string) => DragBarInfo | undefined;
  /** Optimistic preview while dragging; `null` clears it. */
  onPreview: (id: string, dates: Dates | null) => void;
  /** Called once on release (or on a key move) when the dates changed. */
  onCommit: (id: string, dates: Dates) => void;
  onOpen?: (id: string) => void;
  onLink?: (fromId: string, toId: string) => void;
  /** Top-left of the plane the link line is drawn in, in client px. */
  origin: () => { left: number; top: number };
}

export interface LinkDrag {
  fromId: string;
  target: string | null;
  x: number;
  y: number;
}

interface Active {
  id: string;
  mode: Mode;
  startX: number;
  orig: Dates;
  moved: boolean;
  last: Dates | null;
}

const barIdAt = (t: EventTarget | null): string | null => {
  const node = t instanceof Element ? t.closest('[data-bar]') : null;
  return node?.getAttribute('data-bar') ?? null;
};

export function useBarDrag(opts: UseBarDragOpts) {
  const o = useRef(opts);
  o.current = opts;
  const active = useRef<Active | null>(null);
  const suppressClick = useRef(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [link, setLink] = useState<LinkDrag | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanup.current?.(), []);

  const swallowClick = () => {
    suppressClick.current = true;
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  };

  const barPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>, id: string, width: number) => {
    if (e.button !== 0 || active.current) return;
    const info = o.current.find(id);
    if (!info?.draggable) return;
    const local = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const edge = edgeZone(width);
    const mode: Mode = local < edge ? 'start' : local > width - edge ? 'end' : 'move';
    const a: Active = { id, mode, startX: e.clientX, orig: { start: info.start, end: info.end }, moved: false, last: null };
    active.current = a;

    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key);
      cleanup.current = null;
      active.current = null;
      setDragId(null);
    };
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - a.startX;
      if (!a.moved && Math.abs(dx) < MOVE_THRESHOLD_PX) return;
      if (!a.moved) setDragId(id);
      a.moved = true;
      a.last = dragDates(a.mode, a.orig, dx, o.current.dayW);
      o.current.onPreview(id, a.last);
    };
    const up = () => {
      const last = a.last;
      const moved = a.moved;
      stop();
      if (!moved) return;
      swallowClick();
      if (last && (last.start !== a.orig.start || last.end !== a.orig.end)) o.current.onCommit(id, last);
      else o.current.onPreview(id, null);
    };
    const cancel = () => {
      const moved = a.moved;
      stop();
      if (moved) swallowClick();
      o.current.onPreview(id, null);
    };
    const key = (ev: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (ev.key === 'Escape') cancel();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key as EventListener);
    cleanup.current = stop;
  }, []);

  const barKeyDown = useCallback((e: KeyboardEvent<HTMLElement>, id: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      o.current.onOpen?.(id);
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const info = o.current.find(id);
    if (!info?.draggable) return;
    e.preventDefault();
    const { dayW } = o.current;
    const dx = (e.key === 'ArrowRight' ? 1 : -1) * dayW;
    const next = dragDates(e.shiftKey ? 'end' : 'move', { start: info.start, end: info.end }, dx, dayW);
    if (next.start === info.start && next.end === info.end) return;
    o.current.onPreview(id, next);
    o.current.onCommit(id, next);
  }, []);

  /** Click is swallowed when it follows a drag. */
  const barClick = useCallback((id: string) => {
    if (suppressClick.current) return;
    o.current.onOpen?.(id);
  }, []);

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLElement>, fromId: string) => {
    if (e.button !== 0 || active.current) return;
    e.preventDefault();
    e.stopPropagation();
    const at = (ev: PointerEvent): LinkDrag => {
      const org = o.current.origin();
      return { fromId, target: barIdAt(ev.target), x: ev.clientX - org.left, y: ev.clientY - org.top };
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('keydown', key);
      cleanup.current = null;
      setLink(null);
    };
    const move = (ev: PointerEvent) => setLink(at(ev));
    const up = (ev: PointerEvent) => {
      const to = barIdAt(ev.target);
      stop();
      swallowClick();
      if (to && to !== fromId) o.current.onLink?.(fromId, to);
    };
    const key = (ev: globalThis.KeyboardEvent) => {
      if (ev.key === 'Escape') stop();
    };
    setLink(at(e.nativeEvent));
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('keydown', key);
    cleanup.current = stop;
  }, []);

  return { dragId, link, barPointerDown, barKeyDown, barClick, handlePointerDown };
}
