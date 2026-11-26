import type { AddressInfo } from 'node:net';
import { serve } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it } from 'vitest';
import { registerTools } from '../src/mcp/tools.js';
import { mountMcp } from '../src/mcp/http.js';
import { createApp } from '../src/server/app.js';
import { setup, YOU } from './helpers.js';

type Res = { isError?: boolean; content: { type: string; text: string }[] };

async function connect(name = 'codex') {
  const s = setup();
  s.store.createProject(YOU, { name: 'Learn Studio', areas: [{ name: 'AI' }], firstMilestone: { name: 'Proto', due: '2026-12-20' } });
  const msId = (s.db.prepare('SELECT id FROM milestones').get() as { id: string }).id;
  const server = new McpServer({ name: 'gameplan', version: '0.1.0' });
  registerTools(server, { store: s.store, db: s.db, clock: s.clock, actor: () => `ai:${server.server.getClientVersion()?.name ?? 'unknown'}` });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name, version: '1.0.0' });
  await client.connect(b);
  const call = async (tool: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name: tool, arguments: args })) as Res;
    const text = r.content[0]?.text ?? '';
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* plain text */
    }
    return { isError: r.isError === true, text, data };
  };
  return { ...s, client, call, msId };
}

const PLAN = {
  tasks: [
    { key: 'd', title: 'Design', area: 'AI', start: '2026-11-26', end: '2026-11-28', todos: [{ title: 'sketch' }, { title: 'review' }] },
    { key: 'i', title: 'Implement', start: '2026-11-29', end: '2026-12-05', depends_on: ['d'], todos: [{ title: 'code' }] },
  ],
};

describe('mcp tools', () => {
  it('exposes 24 tools with descriptions', async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.length).toBe(24);
    expect(tools.every((t) => (t.description ?? '').length > 10)).toBe(true);
    expect(tools.find((t) => t.name === 'plan_milestone')!.description).toMatch(/one call/i);
  });

  it('plan_milestone then get_project shows the tasks', async () => {
    const { call, msId } = await connect();
    const r = await call('plan_milestone', { milestone_id: msId, ...PLAN });
    expect(r.isError).toBe(false);
    expect(r.data).toEqual(expect.objectContaining({ todos: 3, dependencies: 1 }));
    const p = await call('get_project', { slug: 'learn-studio', depth: 'tasks' });
    const titles = p.data.milestones[0].tasks.map((t: { title: string }) => t.title);
    expect(titles).toEqual(['Design', 'Implement']);
    expect(JSON.stringify(p.data)).not.toContain('"description"');
    const m = await call('get_project', { slug: 'learn-studio' });
    expect(m.data.milestones[0].tasks).toBeUndefined();
  });

  it('complete_todo records the agent and counts calls', async () => {
    const { call, msId, db, store } = await connect();
    const plan = await call('plan_milestone', { milestone_id: msId, ...PLAN });
    const task = await call('get_task', { id: plan.data.tasks.d });
    expect(task.data.todos[0].state).toBe('next');
    const done = await call('complete_todo', { id: task.data.todos[0].id });
    expect(done.isError).toBe(false);
    const ev = db.prepare("SELECT actor FROM events WHERE kind = 'todo_done'").get() as { actor: string };
    expect(ev.actor).toBe('ai:codex');
    const client = db.prepare('SELECT calls FROM agent_clients WHERE name = ?').get('codex') as { calls: number };
    expect(client.calls).toBeGreaterThanOrEqual(2);
    expect(store.task(plan.data.tasks.d).status).toBe('doing');
  });

  it('archive is gated by agents_can_archive', async () => {
    const { call, store, msId } = await connect();
    const r = await call('archive', { entity: 'milestone', id: msId });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('agents_can_archive');
    store.setSettings(YOU, { agents_can_archive: true });
    expect((await call('archive', { entity: 'milestone', id: msId })).isError).toBe(false);
  });

  it('reschedule_task needs a reason; update_task refuses dates', async () => {
    const { call, msId } = await connect();
    const t = await call('create_task', { milestone_id: msId, title: 'T', start: '2026-11-26', end: '2026-11-27' });
    const r = await call('reschedule_task', { id: t.data.id, start: '2026-11-27', end: '2026-11-28' });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('reason');
    const ok = await call('reschedule_task', { id: t.data.id, start: '2026-11-27', end: '2026-11-28', reason: 'waiting on review' });
    expect(ok.isError).toBe(false);
    const u = await call('update_task', { id: t.data.id, start: '2026-11-29' });
    expect(u.isError).toBe(true);
    expect(u.text).toContain('reschedule_task');
  });

  it('covers reads and remaining writes', async () => {
    const { call, msId } = await connect();
    expect((await call('list_projects')).data.map((p: { slug: string }) => p.slug)).toEqual(['learn-studio']);
    const t = await call('create_task', { milestone_id: msId, title: 'Today', start: '2026-11-25', end: '2026-11-27', todos: [{ title: 'x' }], links: [{ url: 'projects/learn/spec.md' }] });
    expect((await call('get_today')).data.map((x: { title: string }) => x.title)).toEqual(['Today']);
    const t2 = await call('create_task', { milestone_id: msId, title: 'Late', start: '2026-11-01', end: '2026-11-10' });
    expect((await call('get_at_risk')).data[0].reasons[0]).toContain('days late');
    expect((await call('add_todos', { task_id: t.data.id, todos: [{ title: 'y' }] })).isError).toBe(false);
    const dep = await call('add_dependency', { from_task_id: t.data.id, task_id: t2.data.id });
    expect(dep.isError).toBe(false);
    expect((await call('add_dependency', { from_task_id: t2.data.id, task_id: t.data.id })).text).toContain('cycle');
    expect((await call('remove_dependency', { id: dep.data.id })).isError).toBe(false);
    const att = await call('attach', { task_id: t.data.id, role: 'deliverable', url: 'https://github.com/o/r/commit/abcdef1234567' });
    expect(att.data.ref).toBe('abcdef1');
    expect((await call('detach', { id: att.data.id })).isError).toBe(false);
    expect((await call('update_task', { id: t.data.id, title: 'Today!', status: 'doing' })).data.title).toBe('Today!');
    const m2 = await call('create_milestone', { project: 'learn-studio', name: 'Beta', due: '2027-01-10' });
    expect((await call('update_milestone', { id: m2.data.id, status: 'active' })).data.status).toBe('active');
    expect((await call('get_milestone', { id: m2.data.id })).data.name).toBe('Beta');
    expect((await call('configure_project', { slug: 'learn-studio', default_priority: 'p1' })).data.defaultPriority).toBe('p1');
    const np = await call('create_project', { name: 'Agent Made', areas: ['Core'], first_milestone: { name: 'M1' } });
    expect(np.data.slug).toBe('agent-made');
    expect((await call('search', { q: 'today' })).data[0].title).toBe('Today!');
    const ups = await call('get_updates', { project: 'learn-studio' });
    expect(ups.data.length).toBeGreaterThan(3);
    expect(ups.data[0]).toEqual(expect.objectContaining({ actor: 'ai:codex' }));
    expect((await call('get_project', { slug: 'nope' })).isError).toBe(true);
    expect((await call('restore', { entity: 'task', id: t.data.id })).isError).toBe(true);
  });

  it('create_project is gated by agents_can_create_projects', async () => {
    const { call, store } = await connect();
    store.setSettings(YOU, { agents_can_create_projects: false });
    const r = await call('create_project', { name: 'Nope' });
    expect(r.isError).toBe(true);
    expect(r.text).toContain('agents_can_create_projects');
  });
});

describe('mcp over http', () => {
  it('serves /mcp with sessions', async () => {
    const s = setup();
    const app = createApp({ store: s.store, db: s.db, clock: s.clock, extend: (a) => mountMcp(a, { store: s.store, db: s.db, clock: s.clock }) });
    const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
    await new Promise((r) => server.once('listening', r));
    const port = (server.address() as AddressInfo).port;
    try {
      const client = new Client({ name: 'claude-code', version: '1.0.0' });
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
      const r = (await client.callTool({ name: 'get_today', arguments: {} })) as Res;
      expect(r.isError).not.toBe(true);
      expect(JSON.parse(r.content[0]!.text)).toEqual([]);
      await client.callTool({ name: 'list_projects', arguments: {} });
      const agents = await (await fetch(`http://127.0.0.1:${port}/api/agents`)).json();
      expect(agents).toEqual([expect.objectContaining({ name: 'claude-code', calls: 2 })]);
      await client.close();
    } finally {
      server.close();
    }
  });
});
