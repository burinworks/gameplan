import { describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api/client';
import { mockFetch } from './setup';

describe('api client', () => {
  it('maps a 409 body to ApiError conflict', async () => {
    mockFetch({ 'POST /api/x': new Response(JSON.stringify({ error: { code: 'conflict', message: 'already triaged' } }), { status: 409 }) });
    const err = await api<ApiError>('POST', '/api/x', {}).catch((e: ApiError) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('conflict');
    expect(err.status).toBe(409);
    expect(err.message).toBe('already triaged');
  });

  it('maps a fetch rejection to network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')));
    const err = await api<ApiError>('GET', '/api/home').catch((e: ApiError) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('network');
  });

  it('parses a 201 JSON body', async () => {
    mockFetch({ 'POST /api/projects': new Response(JSON.stringify({ slug: 'a' }), { status: 201 }) });
    expect(await api('POST', '/api/projects', { name: 'A' })).toEqual({ slug: 'a' });
  });

  it('sends JSON content-type with a body and none for a bodyless DELETE', async () => {
    const fn = mockFetch({ 'DELETE /api/attachments/1': { ok: true }, 'POST /api/y': { ok: true } });
    await api('DELETE', '/api/attachments/1');
    const del = fn.mock.calls[0]![1] as RequestInit;
    expect(del.headers).toBeUndefined();
    expect(del.body).toBeUndefined();
    await api('POST', '/api/y', { a: 1 });
    expect(((fn.mock.calls[1]![1] as RequestInit).headers as Record<string, string>)['content-type']).toBe('application/json');
  });
});
