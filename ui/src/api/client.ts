export type ApiErrorCode = 'not_found' | 'invalid' | 'conflict' | 'forbidden' | 'internal' | 'network';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const CODES: ApiErrorCode[] = ['not_found', 'invalid', 'conflict', 'forbidden', 'internal'];

export async function api<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (e) {
    throw new ApiError('network', e instanceof Error ? e.message : 'network error', 0);
  }
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | undefined)?.error;
    const code = CODES.includes(err?.code as ApiErrorCode) ? (err!.code as ApiErrorCode) : 'internal';
    throw new ApiError(code, err?.message ?? (res.statusText || 'request failed'), res.status);
  }
  return json as T;
}
