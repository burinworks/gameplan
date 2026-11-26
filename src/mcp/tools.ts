import type { DatabaseSync } from 'node:sqlite';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Clock } from '../clock.js';
import { planMilestone } from '../domain/plan.js';
import { home, listProjects, milestoneDetail, projectTree, taskDetail, updates, type TreeMilestone, type TreeTask } from '../domain/queries.js';
import { rescheduleTask } from '../domain/reschedule.js';
import { search } from '../domain/search.js';
import { getSettings } from '../domain/settings.js';
import type { Store } from '../domain/store.js';
import { ATTACHMENT_KIND, ATTACHMENT_ROLE, EXECUTOR, GameplanError, MILESTONE_STATUS, PRIORITY, PROJECT_STATUS, TASK_STATUS, type Ctx } from '../domain/types.js';

export interface ToolDeps {
  store: Store;
  db: DatabaseSync;
  clock: Clock;
  /** `ai:<client name>` of the caller. */
  actor: () => string;
}

export const INSTRUCTIONS = `Gameplan is the user's plan of record: Projects › Milestones › Tasks › To-dos, with dependencies and deliverables.
Every change you make is logged with your name and shown to the user.
- Before starting a milestone, plan it in one plan_milestone call (tasks, to-dos, dependencies).
- Call complete_todo right after you finish each to-do.
- attach every commit / PR you make for a task as a deliverable.
- When dates slip, reschedule_task with a reason (cascade: true to push dependents).
- Read cheaply: get_today, get_at_risk, get_project depth=tasks; get_task for one task's details.
- Never archive unless the user asks.`;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const todoItem = z.object({ title: z.string().min(1), after: z.array(z.number().int()).optional().describe('indices of to-dos in this list that must be done first; default: the previous one') });
const link = z.object({ url: z.string().min(1), title: z.string().optional() });
const taskFields = {
  title: z.string().min(1),
  description: z.string().optional().describe('context for whoever does the task'),
  area: z.string().optional().describe("one of the project's area names"),
  start: date.optional(),
  end: date.optional().describe('inclusive; give start and end together, or neither'),
  priority: z.enum(PRIORITY).optional(),
  executor: z.enum(EXECUTOR).optional().describe('who does it: manual (the user) or ai'),
  important: z.boolean().optional(),
  labels: z.array(z.string()).optional(),
  todos: z.array(todoItem).optional(),
  links: z.array(link).optional().describe('context: vault notes (projects/…), files, urls'),
};
const entity = z.enum(['project', 'milestone', 'task', 'todo']);

// ---------- compact shapes ----------

const compactTask = (t: TreeTask, full: boolean) => ({
  id: t.id,
  title: t.title,
  area: t.area?.name ?? null,
  start: t.start,
  end: t.end,
  status: t.status,
  priority: t.priority,
  executor: t.executor,
  ...(t.important ? { important: true } : {}),
  progress: `${t.progress.done}/${t.progress.total}`,
  health: t.health,
  ...(t.reasons.length ? { reasons: t.reasons } : {}),
  ...(t.dependsOn.length ? { depends_on: t.dependsOn.map((d) => ({ id: d.id, title: d.title, ...(d.bad ? { bad: true } : {}) })) } : {}),
  ...(full
    ? {
        todos: t.todos.map((d) => ({ id: d.id, title: d.title, state: d.state })),
        deliverables: t.deliverables.map((a) => ({ id: a.id, kind: a.kind, ref: a.ref, title: a.title, state: a.state })),
      }
    : {}),
});

const compactMilestone = (m: TreeMilestone, depth: 'milestones' | 'tasks' | 'full') => ({
  id: m.id,
  name: m.name,
  due: m.due,
  status: m.status,
  progress: `${m.progress.done}/${m.progress.total} (${m.progress.pct}%)`,
  health: m.health,
  ...(m.missed ? { missed: true } : {}),
  ...(depth === 'milestones' ? { tasks_count: m.tasks.length } : { tasks: m.tasks.map((t) => compactTask(t, depth === 'full')) }),
});

// ---------- registration ----------

export function registerTools(server: McpServer, deps: ToolDeps): void {
  const { store, db } = deps;
  const ctx = (reason?: string): Ctx => ({ actor: deps.actor(), ...(reason ? { reason } : {}) });
  const today = () => store.today();

  const touch = () => {
    const name = deps.actor().replace(/^ai:/, '');
    const now = deps.clock.now();
    db.prepare(
      'INSERT INTO agent_clients(name, first_seen, last_seen, calls) VALUES (?, ?, ?, 1) ON CONFLICT(name) DO UPDATE SET last_seen = excluded.last_seen, calls = calls + 1',
    ).run(name, now, now);
  };

  const tool = <S extends z.ZodRawShape>(name: string, description: string, shape: S, fn: (args: z.infer<z.ZodObject<S>>) => unknown) => {
    server.registerTool(name, { description, inputSchema: shape }, (async (args: z.infer<z.ZodObject<S>>) => {
      try {
        touch();
        const out = fn(args);
        return { content: [{ type: 'text' as const, text: JSON.stringify(out ?? { ok: true }) }] };
      } catch (err) {
        const msg = err instanceof GameplanError ? `${err.code}: ${err.message}` : `error: ${(err as Error).message}`;
        return { isError: true, content: [{ type: 'text' as const, text: msg }] };
      }
    }) as never);
  };

  // ----- reads -----
  tool('list_projects', 'List projects (default: active) with progress, at-risk count and next milestone.', { status: z.enum([...PROJECT_STATUS, 'all']).optional() }, (a) =>
    listProjects(db, today(), a.status ?? 'active').map((p) => ({
      slug: p.slug,
      name: p.name,
      status: p.status,
      progress: `${p.progress.pct}%`,
      at_risk: p.atRisk,
      next_milestone: p.nextMilestone,
    })),
  );

  tool(
    'get_project',
    'One project: milestones (depth=milestones, default), plus compact tasks (depth=tasks), plus to-dos and deliverables (depth=full). Use get_task for descriptions.',
    { slug: z.string(), depth: z.enum(['milestones', 'tasks', 'full']).optional() },
    (a) => {
      const tree = projectTree(db, a.slug, today());
      const p = tree.project;
      return {
        slug: p.slug,
        name: p.name,
        status: p.status,
        repo: p.repo,
        github: p.github,
        vault_note: p.vaultNote,
        areas: p.areas.map((x) => x.name),
        defaultPriority: p.defaultPriority,
        defaultExecutor: p.defaultExecutor,
        progress: `${p.progress.done}/${p.progress.total} (${p.progress.pct}%)`,
        milestones: tree.milestones.map((m) => compactMilestone(m, a.depth ?? 'milestones')),
      };
    },
  );

  tool('get_milestone', 'One milestone with its goal (description) and compact tasks.', { id: z.string() }, (a) => {
    const m = milestoneDetail(db, a.id, today());
    return { ...compactMilestone(m, 'tasks'), description: m.description, project: m.project.slug };
  });

  tool('get_task', 'One task: description, to-dos with state (next/locked/done/open), context, deliverables, dependencies and its last 10 events.', { id: z.string() }, (a) => {
    const t = taskDetail(db, a.id, today());
    return {
      ...compactTask(t, false),
      description: t.description,
      project: t.project.slug,
      milestone: t.milestone,
      labels: t.labels,
      todos: t.todos.map((d) => ({ id: d.id, title: d.title, state: d.state })),
      context: t.context.map((x) => ({ id: x.id, kind: x.kind, title: x.title, url: x.url })),
      deliverables: t.deliverables.map((x) => ({ id: x.id, kind: x.kind, ref: x.ref, title: x.title, url: x.url, state: x.state })),
      blocks: t.blocks.map((b) => ({ id: b.id, title: b.title })),
      events: t.events.map((e) => ({ at: e.at, actor: e.actor, kind: e.kind, label: e.label, reason: e.reason })),
    };
  });

  tool('get_today', "Open tasks scheduled for today (start ≤ today ≤ end) across active projects.", {}, () =>
    home(db, today(), getSettings(db)).todayTasks.map((t) => ({ id: t.id, title: t.title, project: t.project, end: t.end, progress: `${t.progress.done}/${t.progress.total}`, executor: t.executor })),
  );

  tool('get_at_risk', 'Tasks that are late or in conflict (start before a dependency ends, end after milestone due), with reasons.', {}, () =>
    home(db, today(), getSettings(db)).atRisk.map((t) => ({ id: t.id, title: t.title, project: t.project, health: t.health, reasons: t.reasons })),
  );

  tool(
    'get_updates',
    'Recent changes (newest first): who changed what, when and why.',
    { since: z.string().optional().describe('ISO date or datetime'), project: z.string().optional(), limit: z.number().int().min(1).max(200).optional() },
    (a) =>
      updates(db, { since: a.since, project: a.project, limit: a.limit ?? 50, tz: getSettings(db).time_zone }).map((e) => ({
        at: e.at,
        actor: e.actor,
        kind: e.kind,
        entity: e.entity,
        id: e.entityId,
        label: e.label,
        project: e.project?.slug ?? null,
        ...(e.before ? { before: e.before } : {}),
        ...(e.after ? { after: e.after } : {}),
        ...(e.reason ? { reason: e.reason } : {}),
      })),
  );

  tool('search', 'Search projects, milestones, tasks, to-dos and attachments by text.', { q: z.string().min(1) }, (a) => search(db, a.q));

  // ----- projects & milestones -----
  tool(
    'create_project',
    'Create a project with optional areas and a first milestone.',
    {
      name: z.string().min(1),
      color: z.string().optional(),
      areas: z.array(z.union([z.string(), z.object({ name: z.string(), color: z.string().optional() })])).optional(),
      first_milestone: z.object({ name: z.string(), due: date.optional() }).optional(),
      repo: z.string().optional(),
      github: z.string().optional().describe('owner/name'),
      vault_note: z.string().optional(),
    },
    (a) => {
      const p = store.createProject(ctx(), {
        name: a.name,
        color: a.color,
        areas: a.areas?.map((x) => (typeof x === 'string' ? { name: x } : x)),
        firstMilestone: a.first_milestone,
        repo: a.repo,
        github: a.github,
        vaultNote: a.vault_note,
      });
      return { id: p.id, slug: p.slug, name: p.name, areas: p.areas.map((x) => x.name) };
    },
  );

  tool(
    'configure_project',
    'Change project settings. `areas` is the full ordered list ({id?, name}); omitted areas are deleted if unused.',
    {
      slug: z.string(),
      name: z.string().optional(),
      color: z.string().optional(),
      status: z.enum(PROJECT_STATUS).optional(),
      repo: z.string().optional(),
      github: z.string().optional(),
      vault_note: z.string().optional(),
      default_priority: z.enum(PRIORITY).optional(),
      default_executor: z.enum(EXECUTOR).optional(),
      areas: z.array(z.object({ id: z.string().optional(), name: z.string(), color: z.string().optional() })).optional(),
      labels: z.array(z.string()).optional(),
    },
    (a) => {
      const p = store.configureProject(ctx(), a.slug, {
        name: a.name,
        color: a.color,
        status: a.status,
        repo: a.repo,
        github: a.github,
        vaultNote: a.vault_note,
        defaultPriority: a.default_priority,
        defaultExecutor: a.default_executor,
        areas: a.areas,
        labels: a.labels,
      });
      return { slug: p.slug, name: p.name, status: p.status, defaultPriority: p.defaultPriority, defaultExecutor: p.defaultExecutor, areas: p.areas.map((x) => ({ id: x.id, name: x.name })) };
    },
  );

  tool(
    'create_milestone',
    'Add a milestone to a project (no due = Backlog).',
    { project: z.string().describe('project slug'), name: z.string().min(1), due: date.optional(), status: z.enum(MILESTONE_STATUS).optional(), description: z.string().optional().describe('the goal') },
    (a) => {
      const m = store.createMilestone(ctx(), a.project, { name: a.name, due: a.due, status: a.status, description: a.description });
      return { id: m.id, name: m.name, due: m.due, status: m.status };
    },
  );

  tool(
    'update_milestone',
    'Rename a milestone or change its due date, status or goal.',
    { id: z.string(), name: z.string().optional(), due: date.nullable().optional(), status: z.enum(MILESTONE_STATUS).optional(), description: z.string().optional() },
    (a) => {
      const m = store.updateMilestone(ctx(), a.id, { name: a.name, due: a.due, status: a.status, description: a.description });
      return { id: m.id, name: m.name, due: m.due, status: m.status };
    },
  );

  tool(
    'plan_milestone',
    'Plan a whole milestone in one call before work starts: tasks with to-dos, context links and dependencies (depends_on = keys in this plan or existing task ids). All or nothing.',
    {
      milestone_id: z.string(),
      tasks: z.array(z.object({ key: z.string().min(1).describe('your handle for depends_on'), ...taskFields, depends_on: z.array(z.string()).optional() })).min(1),
      milestone_depends_on: z.array(z.string()).optional().describe('milestone or task ids this whole milestone waits for'),
    },
    (a) =>
      planMilestone(store, ctx(), a.milestone_id, {
        tasks: a.tasks.map(({ depends_on, ...t }) => ({ ...t, dependsOn: depends_on })),
        milestoneDependsOn: a.milestone_depends_on,
      }),
  );

  // ----- tasks -----
  tool(
    'create_task',
    'Create one task in a milestone, optionally with to-dos, prerequisites (after = task ids) and context links.',
    { milestone_id: z.string(), ...taskFields, after: z.array(z.string()).optional().describe('ids of tasks that must finish first') },
    (a) => {
      const { milestone_id, ...input } = a;
      const t = store.createTask(ctx(), milestone_id, input);
      return { id: t.id, title: t.title, start: t.start, end: t.end, status: t.status };
    },
  );

  tool(
    'update_task',
    'Change a task: title, description, area, status, priority, executor, importance, labels, milestone. To change dates use reschedule_task.',
    {
      id: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      area: z.string().nullable().optional(),
      status: z.enum(TASK_STATUS).optional(),
      priority: z.enum(PRIORITY).optional(),
      executor: z.enum(EXECUTOR).optional(),
      important: z.boolean().optional(),
      labels: z.array(z.string()).optional(),
      milestone_id: z.string().optional(),
      start: date.optional().describe('not allowed here — use reschedule_task'),
      end: date.optional().describe('not allowed here — use reschedule_task'),
    },
    (a) => {
      const { id, milestone_id, ...rest } = a;
      const t = store.updateTask(ctx(), id, { ...rest, milestoneId: milestone_id });
      return { id: t.id, title: t.title, status: t.status, priority: t.priority, start: t.start, end: t.end };
    },
  );

  tool(
    'reschedule_task',
    'Move a task to new dates with a reason (shown to the user). cascade: true shifts open dependents by the same number of days when the end moves later.',
    { id: z.string(), start: date, end: date, reason: z.string().optional().describe('why the dates changed — required by default'), cascade: z.boolean().optional() },
    (a) => rescheduleTask(store, ctx(a.reason), a.id, { start: a.start, end: a.end, reason: a.reason, cascade: a.cascade }),
  );

  // ----- to-dos -----
  tool('add_todos', 'Append to-dos to a task (linear order by default).', { task_id: z.string(), todos: z.array(todoItem).min(1) }, (a) =>
    store.addTodos(ctx(), a.task_id, a.todos).map((t) => ({ id: t.id, title: t.title })),
  );

  tool('complete_todo', 'Tick a to-do (done: false unticks). Call as soon as you finish a to-do.', { id: z.string(), done: z.boolean().optional() }, (a) => {
    const t = store.setTodoDone(ctx(), a.id, a.done ?? true);
    const task = store.task(t.taskId);
    return { id: t.id, done: t.done, task: { id: task.id, status: task.status } };
  });

  // ----- dependencies -----
  tool(
    'add_dependency',
    'Make a task wait for another task or a whole milestone (finish-to-start). Cycles are rejected.',
    { from_task_id: z.string().describe('the task that waits'), task_id: z.string().optional(), milestone_id: z.string().optional() },
    (a) => {
      const target = a.task_id ? { taskId: a.task_id } : a.milestone_id ? { milestoneId: a.milestone_id } : null;
      if (!target) throw new GameplanError('invalid', 'give task_id or milestone_id');
      const d = store.addDependency(ctx(), a.from_task_id, target);
      return { id: d.id };
    },
  );

  tool('remove_dependency', 'Remove a dependency by id.', { id: z.string() }, (a) => store.removeDependency(ctx(), a.id));

  // ----- attachments -----
  tool(
    'attach',
    'Attach a url/path to a task. Attach every commit/PR you make for a task as a deliverable (GitHub urls are parsed). Same url again updates it (e.g. state: merged).',
    { task_id: z.string(), role: z.enum(ATTACHMENT_ROLE), url: z.string().min(1), title: z.string().optional(), state: z.string().optional(), kind: z.enum(ATTACHMENT_KIND).optional() },
    (a) => {
      const x = store.attach(ctx(), a.task_id, { role: a.role, url: a.url, title: a.title, state: a.state, kind: a.kind });
      return { id: x.id, kind: x.kind, ref: x.ref, title: x.title, state: x.state };
    },
  );

  tool('detach', 'Remove an attachment by id.', { id: z.string() }, (a) => store.detach(ctx(), a.id));

  // ----- archive -----
  tool('archive', 'Archive (soft-delete) a project, milestone, task or to-do. Only when the user asks; may be disabled by the user.', { entity, id: z.string() }, (a) =>
    store.archive(ctx(), a.entity, a.id),
  );

  tool('restore', 'Restore an archived project, milestone, task or to-do (and what was archived with it).', { entity, id: z.string() }, (a) => store.restore(ctx(), a.entity, a.id));
}
