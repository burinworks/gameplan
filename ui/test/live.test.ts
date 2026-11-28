import { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startLive, undoLast, undoStack, useHighlight } from '../src/api/live';
import { useErrorLine } from '../src/api/hooks';
import type { EventRow } from '../src/api/types';
import { mockFetch } from './setup';

class FakeES {
  static last: FakeES;
  static count = 0;
  readyState = 1;
  listeners: Record<string, ((e: { data?: string }) => void)[]> = {};
  closed = false;
  constructor(public url: string) {
    FakeES.last = this;
    FakeES.count++;
  }
  addEventListener(t: string, cb: (e: { data?: string }) => void) {
    (this.listeners[t] ??= []).push(cb);
  }
  close() {
    this.closed = true;
  }
  emit(t: string, data?: unknown) {
    this.listeners[t]?.forEach((f) => f({ data: data === undefined ? undefined : JSON.stringify(data) }));
  }
}

let n = 0;
const ev = (over: Partial<EventRow> = {}): EventRow => ({
  id: `e${++n}`,
  projectId: null,
  entity: 'task',
  entityId: 't1',
  label: null,
  actor: 'you',
  kind: 'updated',
  before: null,
  after: null,
  reason: null,
  batchId: `b${n}`,
  at: '2026-11-27T10:00:00Z',
  ...over,
});

const get = () => renderHook(() => useErrorLine()).result.current;

let qc: QueryClient;
let spy: ReturnType<typeof vi.spyOn>;
let stop: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  while (undoStack.pop()) {
    /* drain */
  }
  qc = new QueryClient();
  spy = vi.spyOn(qc, 'invalidateQueries');
  stop = startLive(qc, { debounceMs: 100, EventSource: FakeES });
});
afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe('live sync', () => {
  it('invalidates once after the debounce, and coalesces a burst', () => {
    FakeES.last.emit('change', ev());
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 5; i++) {
      FakeES.last.emit('change', ev());
      vi.advanceTimersByTime(20);
    }
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('highlights an agent change for 1200ms', () => {
    const { result } = renderHook(() => useHighlight('t1'));
    expect(result.current).toBe(false);
    act(() => FakeES.last.emit('change', ev({ actor: 'ai:Codex' })));
    expect(result.current).toBe(true);
    act(() => void vi.advanceTimersByTime(1199));
    expect(result.current).toBe(true);
    act(() => void vi.advanceTimersByTime(2));
    expect(result.current).toBe(false);
  });

  it('does not highlight your own change', () => {
    const { result } = renderHook(() => useHighlight('t1'));
    act(() => FakeES.last.emit('change', ev()));
    expect(result.current).toBe(false);
  });

  it('pushes your changes to the undo stack, not reverts, once per batch', () => {
    FakeES.last.emit('change', ev({ kind: 'updated' }));
    expect(undoStack.size()).toBe(1);
    FakeES.last.emit('change', ev({ kind: 'reverted' }));
    expect(undoStack.size()).toBe(1);
    FakeES.last.emit('change', ev({ actor: 'ai:Codex' }));
    expect(undoStack.size()).toBe(1);
    FakeES.last.emit('change', ev({ batchId: 'same' }));
    FakeES.last.emit('change', ev({ batchId: 'same' }));
    expect(undoStack.size()).toBe(2);
  });

  it('undoLast pops and reverts the event', async () => {
    vi.useRealTimers();
    const fn = mockFetch({ 'POST /api/events/zz/revert': { ok: true } });
    undoStack.push(ev({ id: 'zz' }));
    await undoLast();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(undoStack.size()).toBe(0);
  });

  it('recreates a CLOSED EventSource with backoff', () => {
    const first = FakeES.last;
    const before = FakeES.count;
    first.readyState = 2;
    first.emit('error');
    expect(first.closed).toBe(true);
    expect(FakeES.count).toBe(before);
    vi.advanceTimersByTime(1000);
    expect(FakeES.count).toBe(before + 1);
    expect(FakeES.last).not.toBe(first);
    FakeES.last.readyState = 2;
    FakeES.last.emit('error');
    vi.advanceTimersByTime(1999);
    expect(FakeES.count).toBe(before + 1);
    vi.advanceTimersByTime(1);
    expect(FakeES.count).toBe(before + 2);
  });

  it('does not reconnect by hand while the browser is still retrying', () => {
    const before = FakeES.count;
    FakeES.last.readyState = 0;
    FakeES.last.emit('error');
    vi.advanceTimersByTime(10_000);
    expect(FakeES.count).toBe(before);
  });

  it('ready after an error invalidates all', () => {
    FakeES.last.emit('error');
    spy.mockClear();
    FakeES.last.emit('ready', { today: '2026-11-27' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('first ready does not invalidate', () => {
    FakeES.last.emit('ready', { today: '2026-11-27' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('never stacks events the engine will not revert', () => {
    for (const kind of ['settings_changed', 'captured', 'triaged', 'day_planned']) FakeES.last.emit('change', ev({ kind: kind as EventRow['kind'] }));
    FakeES.last.emit('change', ev({ kind: 'updated', entity: 'project', after: { areas: [] } }));
    expect(undoStack.size()).toBe(0);
    FakeES.last.emit('change', ev({ kind: 'updated', entity: 'task', after: { title: 'x' } }));
    expect(undoStack.size()).toBe(1);
  });

  it('an invalid revert is dropped with a plain line and does not revert an older change', async () => {
    vi.useRealTimers();
    const fn = mockFetch({
      'POST /api/events/new/revert': () => Response.json({ error: { code: 'invalid', message: 'weird_kind events cannot be reverted' } }, { status: 400 }),
    });
    undoStack.push(ev({ id: 'old' }));
    undoStack.push(ev({ id: 'new' }));
    await undoLast();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(undoStack.size()).toBe(1);
    expect(get()).toBe("Can't undo that");
  });
});
