import type { DatabaseSync } from 'node:sqlite';
import { addDays, weekday } from '../clock.js';
import { linkIsBad, milestoneHealth, milestoneSpan, rollup, taskHealth, taskProgress, todoStates, type Health, type Progress, type TodoState, type DepInfo } from './derive.js';
import type { Settings } from './settings.js';
import {
  GameplanError,
  toAttachment,
  toEvent,
  toMilestone,
  toProject,
  toTask,
  toTodo,
  toArea,
  toDayPlanItem,
  type Attachment,
  type DayPlanItem,
  type EventRow,
  type Milestone,
  type Project,
  type ProjectStatus,
  type Task,
  type Todo,
} from './types.js';

type Row = Record<string, unknown>;

/** End of a milestone used as a prerequisite: its due, else its latest task end. */
export function milestoneEnd(db: DatabaseSync, milestoneId: string): string | null {
  const m = db.prepare('SELECT due FROM milestones WHERE id = ?').get(milestoneId) as { due: string | null } | undefined;
  if (m?.due) return m.due;
  const r = db.prepare('SELECT MAX("end") AS e FROM tasks WHERE milestone_id = ? AND archived_at IS NULL').get(milestoneId) as { e: string | null };
  return r.e;
}

/** What a task waits for (unarchived prerequisites only). */
export function depsOf(db: DatabaseSync, taskId: string): (DepInfo & { id: string; depId: string; kind: 'task' | 'milestone' })[] {
  const rows = db
    .prepare(
      `SELECT d.id AS dep_id, d.to_task_id, d.to_milestone_id,
              t.title AS t_title, t."end" AS t_end, t.status AS t_status, t.archived_at AS t_arch,
              m.name AS m_name, m.status AS m_status, m.archived_at AS m_arch
       FROM dependencies d
       LEFT JOIN tasks t ON t.id = d.to_task_id
       LEFT JOIN milestones m ON m.id = d.to_milestone_id
       WHERE d.from_task_id = ? ORDER BY d.rowid`,
    )
    .all(taskId) as Row[];
  const out: (DepInfo & { id: string; depId: string; kind: 'task' | 'milestone' })[] = [];
  for (const r of rows) {
    if (r.to_task_id) {
      if (r.t_arch) continue;
      out.push({
        id: String(r.to_task_id),
        depId: String(r.dep_id),
        kind: 'task',
        title: String(r.t_title),
        end: (r.t_end as string | null) ?? null,
        open: r.t_status !== 'done' && r.t_status !== 'cancelled',
      });
    } else {
      if (r.m_arch) continue;
      out.push({
        id: String(r.to_milestone_id),
        depId: String(r.dep_id),
        kind: 'milestone',
        title: String(r.m_name),
        end: milestoneEnd(db, String(r.to_milestone_id)),
        open: r.m_status !== 'done',
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- read models


export interface TreeTodo extends Todo {
  state: TodoState;
}

export interface LinkRef {
  depId: string;
  id: string;
  title: string;
  kind: 'task' | 'milestone';
  project?: string;
  bad: boolean;
}

export interface TreeTask extends Task {
  area: { id: string; name: string; color: string | null } | null;
  progress: Progress;
  health: Health;
  reasons: string[];
  daysLate?: number;
  dependsOn: LinkRef[];
  blocks: LinkRef[];
  todos: TreeTodo[];
  context: Attachment[];
  deliverables: Attachment[];
  deliverableCount: number;
  resume: Resume | null;
}

export interface TreeMilestone extends Milestone {
  progress: Progress;
  span: { start: string | null; end: string | null };
  health: 'done' | 'late' | 'conflict' | 'on_track';
  missed: boolean;
  atRisk: boolean;
  blocks: LinkRef[];
  tasks: TreeTask[];
}

export interface ProjectTree {
  project: Omit<Project, 'areas'> & { areas: (ReturnType<typeof toArea> & { tasks: number })[]; progress: Progress };
  milestones: TreeMilestone[];
}

export interface Resume {
  note: string;
  at: string | null;
  by: string | null;
}

export const resumeOf = (t: { resumeNote: string | null; resumeAt: string | null; resumeBy: string | null }): Resume | null =>
  t.resumeNote ? { note: t.resumeNote, at: t.resumeAt, by: t.resumeBy } : null;

const isOpen = (s: string): boolean => s === 'todo' || s === 'doing';

function projectRow(db: DatabaseSync, slug: string): Row {
  const r = db.prepare('SELECT * FROM projects WHERE slug = ? AND archived_at IS NULL').get(slug) as Row | undefined;
  if (!r) throw new GameplanError('not_found', `project "${slug}" not found`);
  return r;
}

function buildTree(db: DatabaseSync, pr: Row, today: string): ProjectTree {
  const pid = String(pr.id);
  const areas = (db.prepare('SELECT * FROM areas WHERE project_id = ? ORDER BY ord, name').all(pid) as Row[]).map(toArea);
  const areaById = new Map(areas.map((a) => [a.id, a]));
  const milestones = (db.prepare('SELECT * FROM milestones WHERE project_id = ? AND archived_at IS NULL ORDER BY ord, rowid').all(pid) as Row[]).map(toMilestone);
  const tasks = (
    db
      .prepare(
        `SELECT t.* FROM tasks t JOIN milestones m ON m.id = t.milestone_id
         WHERE m.project_id = ? AND t.archived_at IS NULL AND m.archived_at IS NULL ORDER BY t.ord, t.rowid`,
      )
      .all(pid) as Row[]
  ).map(toTask);
  const taskIds = tasks.map((t) => t.id);
  const ph = taskIds.map(() => '?').join(',') || "''";
  const todos = (db.prepare(`SELECT * FROM todos WHERE task_id IN (${ph}) AND archived_at IS NULL ORDER BY ord, rowid`).all(...taskIds) as Row[]).map(toTodo);
  const atts = (db.prepare(`SELECT * FROM attachments WHERE task_id IN (${ph}) AND archived_at IS NULL ORDER BY at, rowid`).all(...taskIds) as Row[]).map(toAttachment);
  const todosBy = groupBy(todos, (t) => t.taskId);
  const attsBy = groupBy(atts, (a) => a.taskId);
  const msById = new Map(milestones.map((m) => [m.id, m]));

  // Health first (blocks need the dependent's start).
  const deps = new Map(tasks.map((t) => [t.id, depsOf(db, t.id)]));
  const treeTasks = new Map<string, TreeTask>();
  for (const t of tasks) {
    const m = msById.get(t.milestoneId)!;
    const d = deps.get(t.id)!;
    const h = taskHealth(t, d, m, today);
    const tds = todosBy.get(t.id) ?? [];
    const states = todoStates(tds);
    const area = t.areaId ? areaById.get(t.areaId) : undefined;
    const ctx = (attsBy.get(t.id) ?? []).filter((a) => a.role === 'context');
    const del = (attsBy.get(t.id) ?? []).filter((a) => a.role === 'deliverable');
    treeTasks.set(t.id, {
      ...t,
      area: area ? { id: area.id, name: area.name, color: area.color } : null,
      progress: taskProgress(t.status, tds),
      health: h.health,
      reasons: h.reasons,
      ...(h.daysLate !== undefined ? { daysLate: h.daysLate } : {}),
      dependsOn: d.map((x) => ({ depId: x.depId, id: x.id, title: x.title, kind: x.kind, bad: isOpen(t.status) && x.open && linkIsBad(x.end, t.start) })),
      blocks: blocksOf(db, t.id, t.status === 'done' || t.status === 'cancelled' ? null : t.end),
      todos: tds.map((x) => ({ ...x, state: states[x.id]! })),
      context: ctx,
      deliverables: del,
      deliverableCount: del.length,
      resume: resumeOf(t),
    });
  }

  const treeMilestones: TreeMilestone[] = milestones.map((m) => {
    const mt = tasks.filter((t) => t.milestoneId === m.id).map((t) => treeTasks.get(t.id)!);
    const mh = milestoneHealth(
      mt.map((t) => t.health),
      m.due,
      m.status,
      today,
    );
    return {
      ...m,
      progress: rollup(mt.map((t) => ({ status: t.status, todos: t.todos }))),
      span: milestoneSpan(mt, m.due),
      ...mh,
      blocks: milestoneBlocks(db, m.id, m.status === 'done' ? null : (m.due ?? milestoneSpan(mt, null).end)),
      tasks: mt,
    };
  });

  const counts = new Map<string, number>();
  for (const t of tasks) if (t.areaId) counts.set(t.areaId, (counts.get(t.areaId) ?? 0) + 1);
  const p = toProject(pr, areas);
  return {
    project: {
      ...p,
      areas: areas.map((a) => ({ ...a, tasks: counts.get(a.id) ?? 0 })),
      progress: rollup([...treeTasks.values()].map((t) => ({ status: t.status, todos: t.todos }))),
    },
    milestones: treeMilestones,
  };
}

function groupBy<T>(xs: T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    let arr = m.get(k);
    if (!arr) m.set(k, (arr = []));
    arr.push(x);
  }
  return m;
}

/** Open dependents waiting for a prerequisite that ends at `end` (null → never bad). */
function dependentsRows(db: DatabaseSync, where: string, id: string, end: string | null): LinkRef[] {
  const rows = db
    .prepare(
      `SELECT d.id AS dep_id, t.id, t.title, t."start" AS start, t.status, p.slug
       FROM dependencies d JOIN tasks t ON t.id = d.from_task_id
       JOIN milestones m ON m.id = t.milestone_id JOIN projects p ON p.id = m.project_id
       WHERE d.${where} = ? AND t.archived_at IS NULL ORDER BY d.rowid`,
    )
    .all(id) as Row[];
  return rows.map((r) => ({
    depId: String(r.dep_id),
    id: String(r.id),
    title: String(r.title),
    kind: 'task' as const,
    project: String(r.slug),
    bad: isOpen(String(r.status)) && linkIsBad(end, (r.start as string | null) ?? null),
  }));
}

const blocksOf = (db: DatabaseSync, taskId: string, end: string | null): LinkRef[] => dependentsRows(db, 'to_task_id', taskId, end);
const milestoneBlocks = (db: DatabaseSync, msId: string, end: string | null): LinkRef[] => dependentsRows(db, 'to_milestone_id', msId, end);

export function projectTree(db: DatabaseSync, slug: string, today: string): ProjectTree {
  return buildTree(db, projectRow(db, slug), today);
}

function nextMilestone(ms: TreeMilestone[]): { id: string; name: string; due: string | null } | null {
  const open = ms.filter((m) => m.status !== 'done');
  open.sort((a, b) => (a.due ?? '9999') .localeCompare(b.due ?? '9999') || a.ord - b.ord);
  const m = open[0];
  return m ? { id: m.id, name: m.name, due: m.due } : null;
}

const atRiskCount = (tree: ProjectTree): number =>
  tree.milestones.reduce((n, m) => n + m.tasks.filter((t) => t.health === 'late' || t.health === 'conflict').length, 0);

export function listProjects(db: DatabaseSync, today: string, status: ProjectStatus | 'all' = 'active') {
  const rows = (
    status === 'all'
      ? db.prepare('SELECT * FROM projects WHERE archived_at IS NULL ORDER BY ord, rowid').all()
      : db.prepare('SELECT * FROM projects WHERE archived_at IS NULL AND status = ? ORDER BY ord, rowid').all(status)
  ) as Row[];
  return rows.map((r) => {
    const tree = buildTree(db, r, today);
    return {
      slug: tree.project.slug,
      name: tree.project.name,
      color: tree.project.color,
      status: tree.project.status,
      progress: tree.project.progress,
      atRisk: atRiskCount(tree),
      milestones: tree.milestones.map((m) => ({ id: m.id, name: m.name, due: m.due, status: m.status, missed: m.missed })),
      nextMilestone: nextMilestone(tree.milestones),
    };
  });
}

export function overview(db: DatabaseSync, today: string) {
  const paused = (db.prepare("SELECT * FROM projects WHERE archived_at IS NULL AND status = 'paused' ORDER BY status_changed_at DESC, rowid").all() as Row[]).map((r) => {
    const tree = buildTree(db, r, today);
    return {
      slug: tree.project.slug,
      name: tree.project.name,
      color: tree.project.color,
      progress: tree.project.progress,
      nextMilestone: nextMilestone(tree.milestones),
      pausedSince: tree.project.statusChangedAt,
    };
  });
  const archived = (
    db
      .prepare(
        `SELECT p.*,
           (SELECT count(*) FROM milestones m WHERE m.project_id = p.id) AS n_ms,
           (SELECT count(*) FROM tasks t JOIN milestones m ON m.id = t.milestone_id WHERE m.project_id = p.id) AS n_tasks
         FROM projects p
         WHERE p.archived_at IS NOT NULL OR p.status IN ('done', 'dropped')
         ORDER BY COALESCE(p.archived_at, p.status_changed_at) DESC, p.rowid`,
      )
      .all() as Row[]
  ).map((r) => ({
    slug: String(r.slug),
    name: String(r.name),
    color: (r.color as string | null) ?? null,
    status: r.status as ProjectStatus,
    archivedAt: ((r.archived_at ?? r.status_changed_at) as string | null) ?? null,
    isArchived: r.archived_at !== null,
    tasks: Number(r.n_tasks),
    milestones: Number(r.n_ms),
  }));
  return { paused, archived, count: paused.length + archived.length };
}

function homeProjects(db: DatabaseSync, settings: Settings): Row[] {
  const statuses = settings.show_paused ? ['active', 'paused'] : ['active'];
  return db.prepare(`SELECT * FROM projects WHERE archived_at IS NULL AND status IN (${statuses.map(() => '?').join(',')}) ORDER BY ord, rowid`).all(...statuses) as Row[];
}

export interface TodayTask {
  id: string;
  title: string;
  project: string;
  projectName: string;
  color: string | null;
  start: string | null;
  end: string | null;
  progress: Progress;
  executor: string;
  status: string;
}

export function getDayPlan(db: DatabaseSync, date: string): DayPlanItem[] {
  return (db.prepare('SELECT * FROM day_plan_items WHERE date = ? ORDER BY ord').all(date) as Row[]).map(toDayPlanItem);
}

/** First day of the week containing `today`. */
function weekStartOf(today: string, start: 'mon' | 'sun' | string): string {
  const wd = weekday(today); // Mon = 0 … Sun = 6
  return addDays(today, start === 'sun' ? -((wd + 1) % 7) : -wd);
}

export function home(db: DatabaseSync, today: string, settings: Settings) {
  const todayTasks: (TodayTask & { start: string; end: string })[] = [];
  const atRisk: { id: string; title: string; project: string; projectName: string; color: string | null; health: Health; reasons: string[] }[] = [];
  const projects = homeProjects(db, settings);
  const trees = new Map<string, ProjectTree>();
  const index = new Map<string, { t: TreeTask; p: ProjectTree['project'] }>();
  const addTree = (r: Row): void => {
    const tree = buildTree(db, r, today);
    trees.set(tree.project.id, tree);
    for (const m of tree.milestones) for (const t of m.tasks) index.set(t.id, { t, p: tree.project });
  };
  for (const r of projects) addTree(r);
  const shown = new Set(trees.keys());
  const asToday = (t: TreeTask, p: ProjectTree['project']): TodayTask => ({
    id: t.id, title: t.title, project: p.slug, projectName: p.name, color: p.color, start: t.start, end: t.end, progress: t.progress, executor: t.executor, status: t.status,
  });
  for (const tree of trees.values()) {
    const p = tree.project;
    for (const m of tree.milestones)
      for (const t of m.tasks) {
        if (isOpen(t.status) && t.start && t.end && t.start <= today && today <= t.end) todayTasks.push({ ...asToday(t, p), start: t.start, end: t.end });
        if (t.health === 'late' || t.health === 'conflict')
          atRisk.push({ id: t.id, title: t.title, project: p.slug, projectName: p.name, color: p.color, health: t.health, reasons: t.reasons });
      }
  }
  todayTasks.sort((a, b) => a.end.localeCompare(b.end) || a.title.localeCompare(b.title));

  // My plan: today's items whose task is still open and unarchived (any unarchived project).
  const plan: { n: number; task: TodayTask; when: string | null; resume: Resume | null }[] = [];
  for (const it of getDayPlan(db, today)) {
    if (!index.has(it.taskId)) {
      const pr = db
        .prepare('SELECT p.* FROM tasks t JOIN milestones m ON m.id = t.milestone_id JOIN projects p ON p.id = m.project_id WHERE t.id = ? AND p.archived_at IS NULL')
        .get(it.taskId) as Row | undefined;
      if (pr && !trees.has(String(pr.id))) addTree(pr);
    }
    const hit = index.get(it.taskId);
    if (!hit || !isOpen(hit.t.status)) continue;
    plan.push({ n: plan.length + 1, task: asToday(hit.t, hit.p), when: it.when, resume: hit.t.resume });
  }
  const planned = new Set(plan.map((x) => x.task.id));

  const pickUp = [...index.values()]
    .filter(({ t, p }) => shown.has(p.id) && isOpen(t.status) && t.resume && !planned.has(t.id))
    .sort((a, b) => (b.t.resume!.at ?? '').localeCompare(a.t.resume!.at ?? ''))
    .slice(0, 5)
    .map(({ t, p }) => ({ task: asToday(t, p), resume: t.resume! }));
  const picked = new Set(pickUp.map((x) => x.task.id));
  const alsoToday = todayTasks.filter((t) => !planned.has(t.id) && !picked.has(t.id));

  const reviewEv = db.prepare(
    `SELECT actor, at FROM events WHERE entity = 'task' AND entity_id = ? AND json_extract(after_json, '$.status') = 'review' ORDER BY rowid DESC LIMIT 1`,
  );
  const needsReview = [...index.values()]
    .filter(({ t, p }) => shown.has(p.id) && t.status === 'review')
    .map(({ t, p }) => {
      const e = reviewEv.get(t.id) as { actor: string; at: string } | undefined;
      return {
        task: { id: t.id, title: t.title },
        project: p.slug,
        color: p.color,
        by: e?.actor ?? null,
        at: e?.at ?? t.updatedAt,
        todos: { done: t.todos.filter((x) => x.done).length, total: t.todos.length },
      };
    })
    .sort((a, b) => a.at.localeCompare(b.at));

  const weekStart = weekStartOf(today, settings.week_start);
  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: settings.time_zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const doneRows = db
    .prepare(
      `SELECT e.*, p.slug FROM events e JOIN projects p ON p.id = e.project_id
       WHERE e.entity = 'task' AND p.archived_at IS NULL AND e.at >= ?
         AND (e.kind = 'review_accepted' OR (e.kind = 'status_changed' AND json_extract(e.after_json, '$.status') = 'done'))
         AND NOT EXISTS (SELECT 1 FROM events r WHERE r.kind = 'reverted' AND json_extract(r.after_json, '$.revertOf') = e.id)
       ORDER BY e.at DESC, e.rowid DESC`,
    )
    .all(`${addDays(weekStart, -2)}T00:00:00.000Z`) as Row[];
  const seenDone = new Set<string>();
  const doneItems: { id: string; title: string; project: string; at: string }[] = [];
  for (const r of doneRows) {
    const e = toEvent(r);
    if (dayFmt.format(new Date(e.at)) < weekStart || seenDone.has(e.entityId)) continue;
    seenDone.add(e.entityId);
    doneItems.push({ id: e.entityId, title: e.label ?? '', project: String(r.slug), at: e.at });
  }
  const doneThisWeek = { count: doneItems.length, items: doneItems.slice(0, 10) };

  const since = addDays(today, -settings.rescheduled_days);
  const ids = projects.map((r) => String(r.id));
  const rescheduled = ids.length
    ? (
        db
          .prepare(
            `SELECT e.*, p.slug, p.name AS p_name, p.color FROM events e JOIN projects p ON p.id = e.project_id
             WHERE e.kind = 'dates_changed' AND e.entity = 'task' AND substr(e.at, 1, 10) >= ?
               AND NOT EXISTS (SELECT 1 FROM events r WHERE r.kind = 'reverted' AND json_extract(r.after_json, '$.revertOf') = e.id) AND e.project_id IN (${ids.map(() => '?').join(',')})
             ORDER BY e.at DESC, e.rowid DESC`,
          )
          .all(since, ...ids) as Row[]
      ).map((r) => {
        const e = toEvent(r);
        return {
          eventId: e.id,
          task: { id: e.entityId, title: e.label },
          project: String(r.slug),
          projectName: String(r.p_name),
          color: (r.color as string | null) ?? null,
          from: { start: (e.before?.start as string | null) ?? null, end: (e.before?.end as string | null) ?? null },
          to: { start: (e.after?.start as string | null) ?? null, end: (e.after?.end as string | null) ?? null },
          conflicts: (e.after?.conflicts as string[] | undefined) ?? [],
          actor: e.actor,
          reason: e.reason,
          at: e.at,
        };
      })
    : [];
  return { today, todayTasks, atRisk, rescheduled, plan, pickUp, alsoToday, needsReview, doneThisWeek };
}

/** Untriaged, undismissed items, newest first. */
export function inbox(db: DatabaseSync): { count: number; items: { id: string; text: string; by: string; at: string }[] } {
  const rows = db.prepare('SELECT * FROM inbox_items WHERE triaged_at IS NULL AND archived_at IS NULL ORDER BY created_at DESC, rowid DESC').all() as Row[];
  return { count: rows.length, items: rows.map((r) => ({ id: String(r.id), text: String(r.text), by: String(r.actor), at: String(r.created_at) })) };
}

export function timeline(db: DatabaseSync, today: string, from: string, to: string) {
  const rows = db.prepare("SELECT * FROM projects WHERE archived_at IS NULL AND status = 'active' ORDER BY ord, rowid").all() as Row[];
  return rows.map((r) => {
    const tree = buildTree(db, r, today);
    const milestones = tree.milestones
      .filter((m) => m.span.start !== null && m.span.end !== null && m.span.end >= from && m.span.start <= to)
      .map((m) => ({
        id: m.id,
        name: m.name,
        start: m.span.start! < from ? from : m.span.start!,
        end: m.span.end! > to ? to : m.span.end!,
        due: m.due,
        status: m.status,
        progress: m.progress,
        atRisk: m.atRisk,
        missed: m.missed,
      }));
    return { project: { slug: tree.project.slug, name: tree.project.name }, color: tree.project.color, milestones };
  });
}

export interface UpdateRow extends EventRow {
  day: string;
  project: { slug: string; name: string; color: string | null } | null;
}

export function updates(
  db: DatabaseSync,
  opts: { project?: string; since?: string; actor?: 'all' | 'agents' | 'you'; limit?: number; tz?: string } = {},
): UpdateRow[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts.project) {
    const p = db.prepare('SELECT id FROM projects WHERE slug = ?').get(opts.project) as { id: string } | undefined;
    if (!p) throw new GameplanError('not_found', `project "${opts.project}" not found`);
    where.push('e.project_id = ?');
    params.push(p.id);
  }
  if (opts.since) {
    where.push('e.at >= ?');
    params.push(opts.since);
  }
  if (opts.actor === 'agents') where.push("e.actor LIKE 'ai:%'");
  else if (opts.actor === 'you') where.push("e.actor = 'you'");
  const limit = Math.max(1, Math.min(opts.limit ?? 100, 1000));
  const planned = `e.kind <> 'planned' AND e.batch_id IN (SELECT batch_id FROM events WHERE kind = 'planned')`;
  where.push(`NOT (${planned})`);
  const rows = db
    .prepare(
      `SELECT e.*, p.slug, p.name AS p_name, p.color FROM events e LEFT JOIN projects p ON p.id = e.project_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY e.at DESC, e.rowid DESC LIMIT ?`,
    )
    .all(...params, limit) as Row[];
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: opts.tz ?? 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
  return rows.map((r) => {
    const e = toEvent(r);
    return {
      ...e,
      day: fmt.format(new Date(e.at)),
      project: r.slug ? { slug: String(r.slug), name: String(r.p_name), color: (r.color as string | null) ?? null } : null,
    };
  });
}

function slugOfTask(db: DatabaseSync, taskId: string): string {
  const r = db
    .prepare('SELECT p.slug FROM tasks t JOIN milestones m ON m.id = t.milestone_id JOIN projects p ON p.id = m.project_id WHERE t.id = ? AND t.archived_at IS NULL AND m.archived_at IS NULL AND p.archived_at IS NULL')
    .get(taskId) as { slug: string } | undefined;
  if (!r) throw new GameplanError('not_found', `task ${taskId} not found`);
  return r.slug;
}

/** One task with everything the task pane shows, plus its last 10 events. */
export function taskDetail(db: DatabaseSync, taskId: string, today: string) {
  const tree = projectTree(db, slugOfTask(db, taskId), today);
  for (const m of tree.milestones) {
    const t = m.tasks.find((x) => x.id === taskId);
    if (t) {
      const recent = (db.prepare("SELECT * FROM events WHERE entity_id = ? OR (entity = 'todo' AND entity_id IN (SELECT id FROM todos WHERE task_id = ?)) ORDER BY rowid DESC LIMIT 10").all(taskId, taskId) as Row[]).map(toEvent);
      return { ...t, project: { slug: tree.project.slug, name: tree.project.name, color: tree.project.color }, milestone: { id: m.id, name: m.name, due: m.due }, events: recent };
    }
  }
  throw new GameplanError('not_found', `task ${taskId} not found`);
}

export function milestoneDetail(db: DatabaseSync, milestoneId: string, today: string) {
  const r = db
    .prepare('SELECT p.slug FROM milestones m JOIN projects p ON p.id = m.project_id WHERE m.id = ? AND m.archived_at IS NULL AND p.archived_at IS NULL')
    .get(milestoneId) as { slug: string } | undefined;
  if (!r) throw new GameplanError('not_found', `milestone ${milestoneId} not found`);
  const tree = projectTree(db, r.slug, today);
  const m = tree.milestones.find((x) => x.id === milestoneId)!;
  return { ...m, project: { slug: tree.project.slug, name: tree.project.name, color: tree.project.color } };
}
