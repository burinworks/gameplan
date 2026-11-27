import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useEngineUp } from '../src/api/live';
import { mockFetch } from './setup';

const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe('useEngineUp', () => {
  it('stays true when home succeeds (SSE blips do not matter)', async () => {
    mockFetch({ '/api/home': { ok: 1 } });
    const qc = client();
    const { result } = renderHook(() => useEngineUp(), { wrapper: wrap(qc) });
    await waitFor(() => expect(qc.getQueryState(['home'])?.status).toBe('success'));
    expect(result.current).toBe(true);
  });

  it('is false once home fails with a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')));
    const qc = client();
    const { result } = renderHook(() => useEngineUp(), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current).toBe(false));
    await act(async () => {});
  });

  it('stays true when home fails with a non-network error', async () => {
    mockFetch({});
    const qc = client();
    const { result } = renderHook(() => useEngineUp(), { wrapper: wrap(qc) });
    await waitFor(() => expect(qc.getQueryState(['home'])?.status).toBe('error'));
    expect(result.current).toBe(true);
  });
});
