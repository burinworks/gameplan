import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setErrorLine, useCapture, useErrorLine, useReschedule } from '../src/api/hooks';
import { mockFetch } from './setup';

const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: new QueryClient() }, children);

afterEach(() => {
  setErrorLine(null);
  vi.useRealTimers();
});

describe('mutation error line', () => {
  it('maps a 409 to the conflict line', async () => {
    mockFetch({ 'POST /api/inbox': new Response(JSON.stringify({ error: { code: 'conflict', message: 'already triaged' } }), { status: 409 }) });
    const { result } = renderHook(() => ({ m: useCapture(), e: useErrorLine() }), { wrapper });
    await act(async () => void result.current.m.mutate('x'));
    await waitFor(() => expect(result.current.e).toBe('Changed since — reload to see the latest'));
  });

  it('maps a cycle to the loop line', async () => {
    mockFetch({ 'POST /api/inbox': new Response(JSON.stringify({ error: { code: 'invalid', message: 'would create a cycle: a → b → a' } }), { status: 400 }) });
    const { result } = renderHook(() => ({ m: useCapture(), e: useErrorLine() }), { wrapper });
    await act(async () => void result.current.m.mutate('x'));
    await waitFor(() => expect(result.current.e).toBe('Would create a loop'));
  });

  it('clears after 6s', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useErrorLine());
    act(() => setErrorLine('Oops'));
    expect(result.current).toBe('Oops');
    act(() => void vi.advanceTimersByTime(6000));
    expect(result.current).toBeNull();
  });

  it('clears on the next successful mutation', async () => {
    mockFetch({ 'POST /api/inbox': { id: 'i' } });
    const r = renderHook(() => ({ m: useCapture(), e: useErrorLine() }), { wrapper });
    act(() => setErrorLine('Stale'));
    expect(r.result.current.e).toBe('Stale');
    await act(async () => void r.result.current.m.mutate('x'));
    await waitFor(() => expect(r.result.current.e).toBeNull());
  });
});

describe('useReschedule', () => {
  it('always sends cascade:false', async () => {
    const fn = mockFetch({ 'POST /api/tasks/t1/reschedule': {} });
    const { result } = renderHook(() => useReschedule(), { wrapper });
    await act(async () => void result.current.mutate({ id: 't1', start: '2026-11-27', end: '2026-11-28' }));
    await waitFor(() => expect(fn).toHaveBeenCalled());
    expect(JSON.parse((fn.mock.calls[0]![1] as RequestInit).body as string)).toMatchObject({ start: '2026-11-27', end: '2026-11-28', cascade: false });
  });
});
