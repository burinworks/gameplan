import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

export type RouteHandler = unknown | ((req: { url: string; method: string; body: unknown }) => unknown);

/**
 * Stubs global fetch. `routes` maps "METHOD /path" (path without query; METHOD defaults to GET
 * if omitted, e.g. "/api/home") to a JSON value or a function returning one. Unmatched requests
 * resolve with 404 `{error:{code:'not_found'}}`. Returns the vi.fn so tests can assert calls.
 * A handler may return `new Response(...)` to control status/headers.
 */
export function mockFetch(routes: Record<string, RouteHandler>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, 'http://127.0.0.1:4747');
    const method = (init?.method ?? 'GET').toUpperCase();
    const handler = routes[`${method} ${url.pathname}`] ?? (method === 'GET' ? routes[url.pathname] : undefined);
    if (handler === undefined) return Response.json({ error: { code: 'not_found', message: `no mock for ${method} ${url.pathname}` } }, { status: 404 });
    const body = typeof init?.body === 'string' && init.body ? JSON.parse(init.body) : undefined;
    const out = typeof handler === 'function' ? await (handler as (r: unknown) => unknown)({ url: url.pathname + url.search, method, body }) : handler;
    return out instanceof Response ? out : Response.json(out);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
