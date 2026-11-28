import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { setup } from './helpers.js';

const BASE = 'http://127.0.0.1:4747';
let app: ReturnType<typeof createApp>;
let bare: ReturnType<typeof createApp>;

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'gp-ui-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<p>ui</p>');
  writeFileSync(join(dir, 'assets', 'a.js'), 'console.log(1)');
  const s = setup();
  app = createApp({ store: s.store, db: s.db, clock: s.clock, uiDir: dir });
  const s2 = setup();
  bare = createApp({ store: s2.store, db: s2.db, clock: s2.clock });
});

describe('ui serving and host guard', () => {
  it('serves index.html at / and SPA routes', async () => {
    expect(await (await app.request(`${BASE}/`)).text()).toContain('<p>ui</p>');
    expect(await (await app.request(`${BASE}/p/mcp-pipe/list`)).text()).toContain('<p>ui</p>');
  });
  it('serves assets with their type', async () => {
    const r = await app.request(`${BASE}/assets/a.js`);
    expect(r.headers.get('content-type')).toMatch(/javascript/);
  });
  it('keeps /api 404s as JSON', async () => {
    const r = await app.request(`${BASE}/api/nope`);
    expect(r.status).toBe(404);
    expect((await r.json()).error.code).toBe('not_found');
  });
  it('rejects a foreign Host on /api and /', async () => {
    const r = await app.request('http://evil.test/api/home', { headers: { host: 'evil.test' } });
    expect(r.status).toBe(403);
    const r2 = await app.request('http://evil.test/', { headers: { host: 'evil.test' } });
    expect(r2.status).toBe(403);
  });
  it('rejects a write with a foreign Origin', async () => {
    const r = await app.request(`${BASE}/api/inbox`, { method: 'POST', headers: { host: '127.0.0.1:4747', origin: 'https://evil.test' }, body: '{"text":"x"}' });
    expect(r.status).toBe(403);
  });
  it('accepts localhost, 127.0.0.1 and tauri origins', async () => {
    for (const origin of ['http://localhost:5173', 'http://127.0.0.1:4747', 'tauri://localhost', 'http://tauri.localhost']) {
      const r = await app.request(`${BASE}/api/inbox`, { method: 'POST', headers: { host: '127.0.0.1:4747', origin, 'content-type': 'application/json' }, body: '{"text":"x"}' });
      expect(r.status, origin).toBe(201);
    }
  });
  it('leaves /mcp to its token check whatever the Host', async () => {
    const r = await app.request('http://abc.trycloudflare.com/mcp', { method: 'POST', headers: { host: 'abc.trycloudflare.com' }, body: '{}' });
    expect(r.status).not.toBe(403);
  });
  it('without uiDir, / is a JSON 404', async () => {
    const r = await bare.request(`${BASE}/`);
    expect(r.status).toBe(404);
    expect((await r.json()).error.code).toBe('not_found');
  });
});
