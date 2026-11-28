import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import { setup } from './helpers.js';

async function world() {
  const s = setup();
  const app = createApp({ store: s.store, db: s.db, clock: s.clock });
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: (await res.json()) as any };
  };
  await call('POST', '/api/projects', { name: 'P', firstMilestone: { name: 'M1', due: '2027-01-15' } });
  const tree = (await call('GET', '/api/projects/p')).body;
  const m1 = tree.milestones[0].id as string;
  const m2 = (await call('POST', '/api/projects/p/milestones', { name: 'M2', due: '2027-02-15' })).body.id as string;
  const mk = async (ms: string, title: string) => (await call('POST', `/api/milestones/${ms}/tasks`, { title, start: '2026-12-01', end: '2026-12-03' })).body.id as string;
  const [a, b, c] = [await mk(m1, 'A'), await mk(m1, 'B'), await mk(m2, 'C')];
  const detail = async (id: string) => (await call('GET', `/api/tasks/${id}`)).body;
  return { call, m1, m2, a, b, c, detail };
}

describe('dependencies over HTTP', () => {
  it('a task depends on several tasks and on a milestone; dependsOn carries kind', async () => {
    const { call, m1, a, b, c, detail } = await world();
    expect((await call('POST', `/api/tasks/${c}/dependencies`, { taskId: a })).status).toBe(201);
    expect((await call('POST', `/api/tasks/${c}/dependencies`, { taskId: b })).status).toBe(201);
    expect((await call('POST', `/api/tasks/${c}/dependencies`, { milestoneId: m1 })).status).toBe(201);
    const d = await detail(c);
    expect(d.dependsOn.map((x: { kind: string; title: string }) => `${x.kind}:${x.title}`)).toEqual(['task:A', 'task:B', 'milestone:M1']);
  });

  it('the legacy POST /api/dependencies still works', async () => {
    const { call, a, b } = await world();
    expect((await call('POST', '/api/dependencies', { fromTaskId: b, taskId: a })).status).toBe(201);
  });

  it('removing works for both kinds, and a flipped direction can be set afterwards', async () => {
    const { call, m1, a, b, detail } = await world();
    const ab = (await call('POST', `/api/tasks/${a}/dependencies`, { taskId: b })).body;
    const am = (await call('POST', `/api/tasks/${a}/dependencies`, { milestoneId: (await detail(b)).milestone.id === m1 ? (await call('POST', '/api/projects/p/milestones', { name: 'M3' })).body.id : m1 })).body;
    expect((await call('DELETE', `/api/dependencies/${ab.id}`)).status).toBe(200);
    expect((await call('DELETE', `/api/dependencies/${am.id}`)).status).toBe(200);
    expect((await detail(a)).dependsOn).toEqual([]);
    // "A after B" → change my mind: "B after A".
    expect((await call('POST', `/api/tasks/${a}/dependencies`, { taskId: b })).status).toBe(201);
    const rm = (await detail(a)).dependsOn[0].depId;
    await call('DELETE', `/api/dependencies/${rm}`);
    expect((await call('POST', `/api/tasks/${b}/dependencies`, { taskId: a })).status).toBe(201);
    expect((await detail(a)).blocks.map((x: { title: string }) => x.title)).toEqual(['B']);
  });

  it('the inverse direction while the first exists is a refusal that says it is a loop (400, not a stale-state 409)', async () => {
    const { call, a, b } = await world();
    await call('POST', `/api/tasks/${a}/dependencies`, { taskId: b });
    const r = await call('POST', `/api/tasks/${b}/dependencies`, { taskId: a });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('invalid');
    expect(r.body.error.message).toMatch(/cycle|loop/);
  });

  it('a task cannot depend on its own milestone (loop)', async () => {
    const { call, m1, a } = await world();
    const r = await call('POST', `/api/tasks/${a}/dependencies`, { milestoneId: m1 });
    expect(r.status).toBe(400);
    expect(r.body.error.message).toMatch(/cycle|loop/);
  });

  it('adding the same dependency twice is idempotent', async () => {
    const { call, a, b, detail } = await world();
    const one = await call('POST', `/api/tasks/${a}/dependencies`, { taskId: b });
    const two = await call('POST', `/api/tasks/${a}/dependencies`, { taskId: b });
    expect(two.body.id).toBe(one.body.id);
    expect((await detail(a)).dependsOn.length).toBe(1);
  });

  it('the legacy route rejects a milestone/task loop the same way', async () => {
    const { call, m1, a } = await world();
    expect((await call('POST', '/api/dependencies', { fromTaskId: a, milestoneId: m1 })).status).toBe(400);
  });
});
