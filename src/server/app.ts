import type { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { addDays, isDate, type Clock } from '../clock.js';
import { exportJson, exportMarkdown } from '../export.js';
import { getDayPlan, home, inbox, listProjects, milestoneDetail, overview, projectTree, taskDetail, timeline, updates } from '../domain/queries.js';
import { rescheduleTask } from '../domain/reschedule.js';
import { revert } from '../domain/revert.js';
import { search } from '../domain/search.js';
import { getSettings, publicSettings } from '../domain/settings.js';
import type { Store, TriageTarget } from '../domain/store.js';
import { listTemplates } from '../domain/templates.js';
import { GameplanError, PROJECT_STATUS, type Ctx, type EventRow, type ProjectStatus } from '../domain/types.js';

export interface Backups {
  last(): { file: string; at: string } | null;
  now(): { file: string; at: string } | null;
}

export interface AppDeps {
  store: Store;
  db: DatabaseSync;
  clock: Clock;
  backups?: Backups;
  /** Mounts extra routes (e.g. /mcp) before the 404 handler. */
  extend?: (app: Hono) => void;
  /** Directory holding the built UI (index.html + assets). Served for non-API GETs when set. */
  uiDir?: string;
}

const YOU: Ctx = { actor: 'you' };
const STATUS = { not_found: 404, invalid: 400, conflict: 409, forbidden: 403 } as const;

async function body<T = Record<string, unknown>>(c: Context): Promise<T> {
  const raw = await c.req.text();
  if (!raw.trim()) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new GameplanError('invalid', 'request body must be valid JSON');
  }
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', 'tauri.localhost']);
const hostName = (host: string): string => host.replace(/:\d+$/, '').toLowerCase();
function originAllowed(origin: string): boolean {
  if (origin === 'tauri://localhost') return true;
  const m = /^https?:\/\/([^/:]+|\[::1\])(:\d+)?$/i.exec(origin);
  return !!m && LOCAL_HOSTS.has(m[1]!.toLowerCase());
}

export function createApp(deps: AppDeps): Hono {
  const { store, db } = deps;
  const app = new Hono();
  const today = () => store.today();

  // DNS-rebinding and cross-site guard. /mcp has its own token check and is reachable through tunnels.
  app.use('*', async (c, next) => {
    if (c.req.path === '/mcp' || c.req.path.startsWith('/mcp/')) return next();
    const host = c.req.header('host') ?? new URL(c.req.url).host;
    const deny = (message: string) => c.json({ error: { code: 'forbidden', message } }, 403);
    if (!LOCAL_HOSTS.has(hostName(host))) return deny('host not allowed');
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      const origin = c.req.header('origin');
      if (origin !== undefined && !originAllowed(origin)) return deny('origin not allowed');
    }
    return next();
  });

  app.onError((err, c) => {
    if (err instanceof GameplanError) return c.json({ error: { code: err.code, message: err.message } }, STATUS[err.code]);
    console.error(err);
    return c.json({ error: { code: 'internal', message: err.message } }, 500);
  });

  // ---------- reads ----------
  app.get('/api/home', (c) => c.json(home(db, today(), getSettings(db))));
  app.get('/api/timeline', (c) => {
    const t = today();
    const from = c.req.query('from') ?? addDays(t, -10);
    const to = c.req.query('to') ?? addDays(t, 45);
    if (!isDate(from) || !isDate(to) || from > to) throw new GameplanError('invalid', 'from/to must be YYYY-MM-DD with from ≤ to');
    return c.json(timeline(db, t, from, to));
  });
  app.get('/api/projects', (c) => {
    const status = c.req.query('status') ?? 'active';
    if (status !== 'all' && !PROJECT_STATUS.includes(status as ProjectStatus)) throw new GameplanError('invalid', `status must be one of all, ${PROJECT_STATUS.join(', ')}`);
    return c.json(listProjects(db, today(), status as ProjectStatus | 'all'));
  });
  app.get('/api/projects/:slug', (c) => c.json(projectTree(db, c.req.param('slug'), today())));
  app.get('/api/milestones/:id', (c) => c.json(milestoneDetail(db, c.req.param('id'), today())));
  app.get('/api/tasks/:id', (c) => c.json(taskDetail(db, c.req.param('id'), today())));
  app.get('/api/overview', (c) => c.json(overview(db, today())));
  app.get('/api/updates', (c) => {
    const actor = c.req.query('actor') ?? 'all';
    if (!['all', 'agents', 'you'].includes(actor)) throw new GameplanError('invalid', 'actor must be all, agents or you');
    const limit = c.req.query('limit');
    return c.json(
      updates(db, {
        project: c.req.query('project') || undefined,
        since: c.req.query('since') || undefined,
        actor: actor as 'all' | 'agents' | 'you',
        limit: limit ? Number(limit) : undefined,
        tz: getSettings(db).time_zone,
      }),
    );
  });
  app.get('/api/search', (c) => c.json(search(db, c.req.query('q') ?? '', Number(c.req.query('limit') ?? 20))));
  app.get('/api/settings', (c) => c.json(publicSettings(getSettings(db))));
  app.get('/api/day-plan/:date', (c) => {
    const date = c.req.param('date');
    if (!isDate(date)) throw new GameplanError('invalid', 'date must be YYYY-MM-DD');
    return c.json(getDayPlan(db, date));
  });
  app.get('/api/inbox', (c) => c.json(inbox(db)));
  app.get('/api/templates', (c) => c.json(listTemplates()));
  app.get('/api/agents', (c) => c.json(db.prepare('SELECT name, first_seen AS firstSeen, last_seen AS lastSeen, calls FROM agent_clients ORDER BY last_seen DESC').all()));
  app.get('/api/export', (c) => {
    const format = c.req.query('format') ?? 'json';
    const project = c.req.query('project') || undefined;
    if (project) store.project(project);
    const name = `gameplan${project ? `-${project}` : ''}-${today()}`;
    if (format === 'md') {
      c.header('content-disposition', `attachment; filename="${name}.md"`);
      return c.body(exportMarkdown(db, project), 200, { 'content-type': 'text/markdown; charset=utf-8' });
    }
    if (format !== 'json') throw new GameplanError('invalid', 'format must be json or md');
    c.header('content-disposition', `attachment; filename="${name}.json"`);
    const data = exportJson(db);
    data.tables.settings = (data.tables.settings as { key: string; value_json: string }[]).map((r) =>
      r.key === 'mcp_token' && r.value_json !== 'null' ? { ...r, value_json: JSON.stringify('(set)') } : r,
    );
    if (project) {
      const p = store.project(project);
      const ms = new Set((data.tables.milestones as { id: string; project_id: string }[]).filter((m) => m.project_id === p.id).map((m) => m.id));
      const ts = new Set((data.tables.tasks as { id: string; milestone_id: string }[]).filter((t) => ms.has(t.milestone_id)).map((t) => t.id));
      const t = data.tables;
      data.tables = {
        projects: t.projects!.filter((x) => (x as { id: string }).id === p.id),
        areas: t.areas!.filter((x) => (x as { project_id: string }).project_id === p.id),
        milestones: t.milestones!.filter((x) => ms.has((x as { id: string }).id)),
        tasks: t.tasks!.filter((x) => ts.has((x as { id: string }).id)),
        todos: t.todos!.filter((x) => ts.has((x as { task_id: string }).task_id)),
        dependencies: t.dependencies!.filter((x) => ts.has((x as { from_task_id: string }).from_task_id)),
        attachments: t.attachments!.filter((x) => ts.has((x as { task_id: string }).task_id)),
        events: t.events!.filter((x) => (x as { project_id: string | null }).project_id === p.id),
      };
    }
    return c.json(data);
  });
  app.get('/api/backup', (c) => c.json({ last: deps.backups?.last() ?? null }));

  // ---------- writes ----------
  app.post('/api/projects', async (c) => c.json(store.createProject(YOU, await body(c)), 201));
  app.patch('/api/projects/:slug', async (c) => c.json(store.configureProject(YOU, c.req.param('slug'), await body(c))));
  app.post('/api/projects/:slug/milestones', async (c) => c.json(store.createMilestone(YOU, c.req.param('slug'), await body(c)), 201));
  app.patch('/api/milestones/:id', async (c) => c.json(store.updateMilestone(YOU, c.req.param('id'), await body(c))));
  app.post('/api/milestones/:id/tasks', async (c) => c.json(store.createTask(YOU, c.req.param('id'), await body(c)), 201));
  app.patch('/api/tasks/:id', async (c) => c.json(store.updateTask(YOU, c.req.param('id'), await body(c))));
  app.post('/api/tasks/:id/reschedule', async (c) => {
    const b = await body<{ start: string; end: string; reason?: string; cascade?: boolean }>(c);
    return c.json(rescheduleTask(store, YOU, c.req.param('id'), b));
  });
  app.post('/api/tasks/:id/review', async (c) => c.json(store.reviewTask(YOU, c.req.param('id'), await body(c))));
  app.put('/api/tasks/:id/resume', async (c) => {
    const b = await body<{ note?: string | null }>(c);
    return c.json(store.setResumeNote(YOU, c.req.param('id'), b.note ?? null));
  });
  app.put('/api/day-plan/:date', async (c) => {
    const b = await body<unknown>(c);
    const items = Array.isArray(b) ? b : (b as { items?: unknown }).items;
    return c.json(store.planDay(YOU, c.req.param('date'), items as never));
  });
  app.post('/api/inbox', async (c) => c.json(store.capture(YOU, (await body<{ text: string }>(c)).text), 201));
  app.post('/api/inbox/:id/triage', async (c) => c.json(store.triageInbox(YOU, c.req.param('id'), await body<TriageTarget>(c))));
  app.post('/api/tasks/:id/todos', async (c) => {
    const b = await body<unknown>(c);
    const items = Array.isArray(b) ? b : (b as { todos?: unknown }).todos;
    return c.json(store.addTodos(YOU, c.req.param('id'), items as never), 201);
  });
  app.patch('/api/todos/:id', async (c) => {
    const id = c.req.param('id');
    const b = await body<{ done?: boolean; title?: string; after?: string[] }>(c);
    if (b.done !== undefined) {
      if (typeof b.done !== 'boolean') throw new GameplanError('invalid', 'done must be a boolean');
      store.setTodoDone(YOU, id, b.done);
    }
    if (b.title !== undefined || b.after !== undefined) store.updateTodo(YOU, id, { title: b.title, after: b.after });
    return c.json(store.todo(id));
  });
  app.post('/api/reorder', async (c) => {
    const b = await body<{ entity: never; ids: string[] }>(c);
    store.reorder(YOU, b.entity, b.ids);
    return c.json({ ok: true });
  });
  app.post('/api/tasks/:id/attachments', async (c) => c.json(store.attach(YOU, c.req.param('id'), await body(c)), 201));
  app.delete('/api/attachments/:id', (c) => {
    store.detach(YOU, c.req.param('id'));
    return c.json({ ok: true });
  });
  app.post('/api/dependencies', async (c) => {
    const b = await body<{ fromTaskId: string; taskId?: string; milestoneId?: string }>(c);
    const target = b.taskId ? { taskId: b.taskId } : b.milestoneId ? { milestoneId: b.milestoneId } : null;
    if (!target) throw new GameplanError('invalid', 'give taskId or milestoneId');
    return c.json(store.addDependency(YOU, b.fromTaskId, target), 201);
  });
  app.delete('/api/dependencies/:id', (c) => {
    store.removeDependency(YOU, c.req.param('id'));
    return c.json({ ok: true });
  });
  app.post('/api/archive', async (c) => {
    const b = await body<{ entity: never; id: string }>(c);
    store.archive(YOU, b.entity, b.id);
    return c.json({ ok: true });
  });
  app.post('/api/restore', async (c) => {
    const b = await body<{ entity: never; id: string }>(c);
    store.restore(YOU, b.entity, b.id);
    return c.json({ ok: true });
  });
  app.post('/api/events/:id/revert', (c) => c.json(revert(store, YOU, c.req.param('id'))));
  app.patch('/api/settings', async (c) => c.json(publicSettings(store.setSettings(YOU, await body(c)))));
  app.post('/api/backup', (c) => {
    if (!deps.backups) throw new GameplanError('invalid', 'backups are not configured');
    return c.json({ last: deps.backups.now() });
  });

  // ---------- live events ----------
  app.get('/events', (c) => {
    // Subscribe before the stream starts so nothing between request and first read is lost.
    const queue: EventRow[] = [];
    let wake: (() => void) | null = null;
    const off = store.onChange((e) => {
      queue.push(e);
      wake?.();
    });
    return streamSSE(c, async (stream) => {
      let open = true;
      stream.onAbort(() => {
        open = false;
        off();
        wake?.();
      });
      c.req.raw.signal.addEventListener('abort', () => {
        open = false;
        off();
        wake?.();
      });
      const heartbeat = setInterval(() => void stream.writeSSE({ event: 'ping', data: '' }).catch(() => {}), 25_000);
      try {
        await stream.writeSSE({ event: 'ready', data: JSON.stringify({ today: today() }) });
        while (open) {
          while (queue.length) {
            const e = queue.shift()!;
            await stream.writeSSE({ event: 'change', id: e.id, data: JSON.stringify(e) });
          }
          if (!open) break;
          await new Promise<void>((r) => (wake = r));
          wake = null;
        }
      } finally {
        clearInterval(heartbeat);
        off();
      }
    });
  });

  deps.extend?.(app);
  if (deps.uiDir) {
    const root = deps.uiDir;
    const skip = (p: string) => p.startsWith('/api') || p.startsWith('/events') || p.startsWith('/mcp');
    const files = serveStatic({ root });
    app.get('*', async (c, next) => (skip(c.req.path) ? next() : files(c, next)));
    app.get('*', async (c, next) => {
      const p = c.req.path;
      if (skip(p) || /\.[^/]+$/.test(p)) return next();
      return c.html(readFileSync(join(root, 'index.html'), 'utf8'));
    });
  }
  app.notFound((c) => c.json({ error: { code: 'not_found', message: `no route ${c.req.method} ${c.req.path}` } }, 404));
  return app;
}
