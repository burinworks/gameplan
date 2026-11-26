import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite';
import { isDate, type Clock } from '../clock.js';
import { newId, slugify } from '../ids.js';
import { assertAgentAllowed, getSettings, validateSettingsPatch, type Settings, type SettingsPatch } from './settings.js';
import {
  ATTACHMENT_KIND,
  ATTACHMENT_ROLE,
  EXECUTOR,
  GameplanError,
  isAgent,
  MILESTONE_STATUS,
  PRIORITY,
  PROJECT_STATUS,
  TASK_STATUS,
  toArea,
  toAttachment,
  toDependency,
  toEvent,
  toMilestone,
  toProject,
  toTask,
  toTodo,
  type ArchivableEntity,
  type Attachment,
  type AttachmentKind,
  type AttachmentRole,
  type Ctx,
  type Dependency,
  type EntityType,
  type EventKind,
  type EventRow,
  type Executor,
  type LinkInput,
  type Milestone,
  type MilestoneStatus,
  type Priority,
  type Project,
  type ProjectStatus,
  type ReorderEntity,
  type Task,
  type TaskInput,
  type TaskStatus,
  type Todo,
  type TodoInput,
} from './types.js';

/** Ctx inside a write: the batch is always known. */
export type WCtx = Ctx & { batchId: string };

export interface CreateProjectInput {
  name: string;
  slug?: string;
  color?: string | null;
  vaultNote?: string | null;
  repo?: string | null;
  github?: string | null;
  areas?: { name: string; color?: string | null }[];
  firstMilestone?: { name: string; due?: string | null };
}

export interface ConfigureProjectInput {
  name?: string;
  color?: string | null;
  status?: ProjectStatus;
  vaultNote?: string | null;
  repo?: string | null;
  github?: string | null;
  defaultPriority?: Priority;
  defaultExecutor?: Executor;
  areas?: { id?: string; name: string; color?: string | null }[];
  labels?: string[];
}

export interface MilestoneInput {
  name: string;
  due?: string | null;
  status?: MilestoneStatus;
  description?: string | null;
}

export type CreateTaskInput = TaskInput & { todos?: TodoInput[]; after?: string[]; links?: LinkInput[] };
export type UpdateTaskInput = Partial<TaskInput> & { status?: TaskStatus; milestoneId?: string };
export type DependencyTarget = { taskId: string } | { milestoneId: string };

export interface AttachInput {
  role: AttachmentRole;
  url: string;
  title?: string | null;
  kind?: AttachmentKind;
  state?: string | null;
}

/** Domain-level task fields that can be patched (event before/after use these keys). */
export type TaskFields = Partial<{
  title: string;
  description: string | null;
  areaId: string | null;
  start: string | null;
  end: string | null;
  status: TaskStatus;
  priority: Priority;
  executor: Executor;
  important: boolean;
  labels: string[];
  milestoneId: string;
}>;

export type MilestoneFields = Partial<{ name: string; due: string | null; status: MilestoneStatus; description: string | null }>;

export type ProjectFields = Partial<{
  name: string;
  color: string | null;
  status: ProjectStatus;
  vaultNote: string | null;
  repo: string | null;
  github: string | null;
  defaultPriority: Priority;
  defaultExecutor: Executor;
  labels: string[];
}>;

const PALETTE = ['#2F6BF0', '#E5484D', '#30A46C', '#F76B15', '#8E4EC6', '#12A594', '#D6409F', '#FFB224'];

const TASK_COLS: Record<keyof TaskFields, string> = {
  title: 'title',
  description: 'description',
  areaId: 'area_id',
  start: '"start"',
  end: '"end"',
  status: 'status',
  priority: 'priority',
  executor: 'executor',
  important: 'important',
  labels: 'labels_json',
  milestoneId: 'milestone_id',
};
const MILESTONE_COLS: Record<keyof MilestoneFields, string> = { name: 'name', due: 'due', status: 'status', description: 'description' };
const PROJECT_COLS: Record<keyof ProjectFields, string> = {
  name: 'name',
  color: 'color',
  status: 'status',
  vaultNote: 'vault_note',
  repo: 'repo',
  github: 'github',
  defaultPriority: 'default_priority',
  defaultExecutor: 'default_executor',
  labels: 'labels_json',
};

const toSql = (v: unknown): SQLInputValue => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (Array.isArray(v) || typeof v === 'object') return JSON.stringify(v);
  return v as SQLInputValue;
};

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function oneOf<T extends string>(name: string, v: unknown, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) throw new GameplanError('invalid', `${name} must be one of ${allowed.join(', ')}`);
  return v as T;
}

function text(name: string, v: unknown): string {
  if (typeof v !== 'string' || !v.trim()) throw new GameplanError('invalid', `${name} is required`);
  return v.trim();
}

function optDate(name: string, v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (!isDate(v)) throw new GameplanError('invalid', `${name} must be a valid YYYY-MM-DD date (got ${JSON.stringify(v)})`);
  return v;
}

function labelsOf(v: unknown): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new GameplanError('invalid', 'labels must be an array of strings');
  return [...new Set((v as string[]).map((x) => x.trim()).filter(Boolean))];
}

export function checkSpan(start: string | null, end: string | null): void {
  if ((start === null) !== (end === null)) throw new GameplanError('invalid', 'start and end must be given together (or both null)');
  if (start !== null && end !== null && start > end) throw new GameplanError('invalid', `start (${start}) must be on or before end (${end})`);
}

/** Infers attachment kind/ref/title from the url. */
export function inferAttachment(url: string): { kind: AttachmentKind; ref: string | null; title: string } {
  const commit = /github\.com\/[^/]+\/[^/]+\/commit\/([0-9a-f]{7,40})/i.exec(url);
  if (commit) {
    const ref = commit[1]!.slice(0, 7).toLowerCase();
    return { kind: 'commit', ref, title: ref };
  }
  const pr = /github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/i.exec(url);
  if (pr) return { kind: 'pr', ref: `#${pr[1]}`, title: `#${pr[1]}` };
  const last = url.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop() || url;
  if (/^projects\//.test(url)) return { kind: 'note', ref: null, title: last };
  if (/^(\/|~\/|file:\/\/)/.test(url)) return { kind: 'file', ref: null, title: last };
  return { kind: 'link', ref: null, title: last };
}

export class Store {
  private listeners = new Set<(e: EventRow) => void>();
  private depth = 0;
  private batch: string | null = null;
  private pending: EventRow[] = [];
  private stmts = new Map<string, StatementSync>();

  constructor(
    readonly db: DatabaseSync,
    readonly clock: Clock,
  ) {}

  // ---------- infrastructure ----------

  onChange(fn: (e: EventRow) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Runs fn in one transaction (nested calls join the outer one). Listeners fire after commit. */
  tx<T>(fn: () => T): T {
    if (this.depth > 0) {
      this.depth++;
      try {
        return fn();
      } finally {
        this.depth--;
      }
    }
    this.db.exec('BEGIN IMMEDIATE');
    this.depth = 1;
    let result: T;
    try {
      result = fn();
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      this.pending = [];
      throw err;
    } finally {
      this.depth = 0;
      this.batch = null;
    }
    const evs = this.pending;
    this.pending = [];
    for (const e of evs)
      for (const l of this.listeners) {
        try {
          l(e);
        } catch {
          /* a listener must never break a write */
        }
      }
    return result;
  }

  /** One public write: one transaction, one batch. */
  write<T>(ctx: Ctx, fn: (c: WCtx) => T): T {
    return this.tx(() => {
      if (!this.batch) this.batch = ctx.batchId ?? newId('bat');
      return fn({ ...ctx, batchId: this.batch });
    });
  }

  settings(): Settings {
    return getSettings(this.db);
  }

  today(): string {
    return this.clock.today(this.settings().time_zone);
  }

  q(sql: string): StatementSync {
    let st = this.stmts.get(sql);
    if (!st) {
      st = this.db.prepare(sql);
      this.stmts.set(sql, st);
    }
    return st;
  }

  record(
    c: WCtx,
    e: { entity: EntityType; entityId: string; projectId: string | null; label: string | null; kind: EventKind; before?: unknown; after?: unknown; reason?: string | null },
  ): EventRow {
    const id = newId('ev');
    const reason = e.reason === undefined ? (c.reason ?? null) : e.reason;
    this.q(
      'INSERT INTO events(id, project_id, entity, entity_id, label, actor, kind, before_json, after_json, reason, batch_id, at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    ).run(
      id,
      e.projectId,
      e.entity,
      e.entityId,
      e.label,
      c.actor,
      e.kind,
      e.before === undefined || e.before === null ? null : JSON.stringify(e.before),
      e.after === undefined || e.after === null ? null : JSON.stringify(e.after),
      reason,
      c.batchId,
      this.clock.now(),
    );
    const row = toEvent(this.q('SELECT * FROM events WHERE id = ?').get(id) as Record<string, unknown>);
    this.pending.push(row);
    return row;
  }

  /** Merges extra fields into an event's `after` (same transaction, before listeners fire). */
  amendEventAfter(ev: EventRow, extra: Record<string, unknown>): void {
    ev.after = { ...(ev.after ?? {}), ...extra };
    this.q('UPDATE events SET after_json = ? WHERE id = ?').run(JSON.stringify(ev.after), ev.id);
  }

  // ---------- getters (throw not_found) ----------

  project(slug: string, opts: { archived?: boolean } = {}): Project {
    const r = this.q('SELECT * FROM projects WHERE slug = ?').get(slug) as Record<string, unknown> | undefined;
    if (!r || (r.archived_at && !opts.archived)) throw new GameplanError('not_found', `project "${slug}" not found`);
    return toProject(r, this.areasOf(String(r.id)));
  }

  projectById(id: string, opts: { archived?: boolean } = {}): Project {
    const r = this.q('SELECT * FROM projects WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!r || (r.archived_at && !opts.archived)) throw new GameplanError('not_found', `project ${id} not found`);
    return toProject(r, this.areasOf(id));
  }

  areasOf(projectId: string): ReturnType<typeof toArea>[] {
    return (this.q('SELECT * FROM areas WHERE project_id = ? ORDER BY ord, name').all(projectId) as Record<string, unknown>[]).map(toArea);
  }

  milestone(id: string, opts: { archived?: boolean } = {}): Milestone {
    const r = this.q('SELECT * FROM milestones WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!r || (r.archived_at && !opts.archived)) throw new GameplanError('not_found', `milestone ${id} not found`);
    return toMilestone(r);
  }

  task(id: string, opts: { archived?: boolean } = {}): Task {
    const r = this.q('SELECT * FROM tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!r || (r.archived_at && !opts.archived)) throw new GameplanError('not_found', `task ${id} not found`);
    return toTask(r);
  }

  todo(id: string, opts: { archived?: boolean } = {}): Todo {
    const r = this.q('SELECT * FROM todos WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!r || (r.archived_at && !opts.archived)) throw new GameplanError('not_found', `to-do ${id} not found`);
    return toTodo(r);
  }

  todosOf(taskId: string): Todo[] {
    return (this.q('SELECT * FROM todos WHERE task_id = ? AND archived_at IS NULL ORDER BY ord').all(taskId) as Record<string, unknown>[]).map(toTodo);
  }

  dependency(id: string): Dependency {
    const r = this.q('SELECT * FROM dependencies WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!r) throw new GameplanError('not_found', `dependency ${id} not found`);
    return toDependency(r);
  }

  attachment(id: string, opts: { archived?: boolean } = {}): Attachment {
    const r = this.q('SELECT * FROM attachments WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!r || (r.archived_at && !opts.archived)) throw new GameplanError('not_found', `attachment ${id} not found`);
    return toAttachment(r);
  }

  projectIdOfMilestone(milestoneId: string): string {
    const r = this.q('SELECT project_id FROM milestones WHERE id = ?').get(milestoneId) as { project_id: string } | undefined;
    if (!r) throw new GameplanError('not_found', `milestone ${milestoneId} not found`);
    return r.project_id;
  }

  projectIdOfTask(taskId: string): string {
    const r = this.q('SELECT m.project_id FROM tasks t JOIN milestones m ON m.id = t.milestone_id WHERE t.id = ?').get(taskId) as { project_id: string } | undefined;
    if (!r) throw new GameplanError('not_found', `task ${taskId} not found`);
    return r.project_id;
  }

  private nextOrd(table: string, parentCol: string | null, parentId: string | null): number {
    const r = (
      parentCol
        ? this.q(`SELECT COALESCE(MAX(ord), -1) + 1 AS n FROM ${table} WHERE ${parentCol} = ?`).get(parentId)
        : this.q(`SELECT COALESCE(MAX(ord), -1) + 1 AS n FROM ${table}`).get()
    ) as { n: number };
    return Number(r.n);
  }

  private resolveArea(projectId: string, name: string | null | undefined): string | null {
    if (name === undefined || name === null || name === '') return null;
    const areas = this.areasOf(projectId);
    const hit = areas.find((a) => a.name === name) ?? areas.find((a) => a.name.toLowerCase() === String(name).toLowerCase());
    if (!hit) {
      const valid = areas.map((a) => a.name).join(', ') || '(none — add areas in project settings)';
      throw new GameplanError('invalid', `unknown area "${name}" — valid areas: ${valid}`);
    }
    return hit.id;
  }

  // ---------- settings ----------

  setSettings(ctx: Ctx, patch: SettingsPatch): Settings {
    if (isAgent(ctx.actor)) throw new GameplanError('forbidden', 'Agents may not change app settings.');
    const p = validateSettingsPatch(patch as Record<string, unknown>);
    return this.write(ctx, (c) => {
      const cur = this.settings();
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(p)) {
        if (same(cur[k as keyof Settings], v)) continue;
        before[k] = cur[k as keyof Settings];
        after[k] = v;
        this.q('INSERT INTO settings(key, value_json) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json').run(k, JSON.stringify(v));
      }
      if (Object.keys(after).length) this.record(c, { entity: 'settings', entityId: 'settings', projectId: null, label: 'Settings', kind: 'settings_changed', before, after });
      return this.settings();
    });
  }

  // ---------- projects ----------

  createProject(ctx: Ctx, input: CreateProjectInput): Project {
    assertAgentAllowed(this.settings(), ctx.actor, 'create_project');
    const name = text('name', input.name);
    return this.write(ctx, (c) => {
      const baseSlug = slugify(input.slug ?? name) || 'project';
      let slug = baseSlug;
      for (let i = 2; this.q('SELECT 1 FROM projects WHERE slug = ?').get(slug); i++) slug = `${baseSlug}-${i}`;
      const id = newId('prj');
      const count = (this.q('SELECT count(*) AS n FROM projects').get() as { n: number }).n;
      const color = input.color ?? PALETTE[Number(count) % PALETTE.length]!;
      const now = this.clock.now();
      this.q('INSERT INTO projects(id, slug, name, color, status, vault_note, repo, github, ord, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
        id,
        slug,
        name,
        color,
        'active',
        input.vaultNote ?? null,
        input.repo ?? null,
        input.github ?? null,
        this.nextOrd('projects', null, null),
        now,
      );
      const seen = new Set<string>();
      (input.areas ?? []).forEach((a, i) => {
        const an = text('area name', a.name);
        if (seen.has(an.toLowerCase())) throw new GameplanError('invalid', `duplicate area "${an}"`);
        seen.add(an.toLowerCase());
        this.q('INSERT INTO areas(id, project_id, name, color, ord) VALUES (?,?,?,?,?)').run(newId('ar'), id, an, a.color ?? null, i);
      });
      const p = this.projectById(id);
      this.record(c, {
        entity: 'project',
        entityId: id,
        projectId: id,
        label: name,
        kind: 'created',
        after: { slug, name, color, areas: p.areas.map((a) => a.name) },
      });
      if (input.firstMilestone) this.createMilestone(c, slug, input.firstMilestone);
      return p;
    });
  }

  configureProject(ctx: Ctx, slug: string, input: ConfigureProjectInput): Project {
    return this.write(ctx, (c) => {
      const p = this.project(slug);
      const fields: ProjectFields = {};
      if (input.name !== undefined) fields.name = text('name', input.name);
      if (input.color !== undefined) fields.color = input.color;
      if (input.status !== undefined) fields.status = oneOf('status', input.status, PROJECT_STATUS);
      if (input.vaultNote !== undefined) fields.vaultNote = input.vaultNote;
      if (input.repo !== undefined) fields.repo = input.repo;
      if (input.github !== undefined) fields.github = input.github;
      if (input.defaultPriority !== undefined) fields.defaultPriority = oneOf('defaultPriority', input.defaultPriority, PRIORITY);
      if (input.defaultExecutor !== undefined) fields.defaultExecutor = oneOf('defaultExecutor', input.defaultExecutor, EXECUTOR);
      if (input.labels !== undefined) fields.labels = labelsOf(input.labels);
      this.patchProject(c, p.id, fields);
      if (input.areas !== undefined) this.setAreas(c, p.id, input.areas);
      return this.projectById(p.id);
    });
  }

  /** Low-level project patch: writes `status_changed` and/or `updated` events. */
  patchProject(c: WCtx, id: string, fields: ProjectFields): void {
    const p = this.projectById(id, { archived: true });
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields) as [keyof ProjectFields, unknown][]) {
      if (v === undefined || same(p[k], v)) continue;
      before[k] = p[k];
      after[k] = v;
      this.q(`UPDATE projects SET ${PROJECT_COLS[k]} = ? WHERE id = ?`).run(toSql(v), id);
    }
    if (!Object.keys(after).length) return;
    const label = (after.name as string | undefined) ?? p.name;
    if ('status' in after) {
      this.q('UPDATE projects SET status_changed_at = ? WHERE id = ?').run(this.clock.now(), id);
      this.record(c, { entity: 'project', entityId: id, projectId: id, label, kind: 'status_changed', before: { status: before.status }, after: { status: after.status } });
      delete before.status;
      delete after.status;
    }
    if (Object.keys(after).length) this.record(c, { entity: 'project', entityId: id, projectId: id, label, kind: 'updated', before, after });
  }

  private setAreas(c: WCtx, projectId: string, list: { id?: string; name: string; color?: string | null }[]): void {
    if (!Array.isArray(list)) throw new GameplanError('invalid', 'areas must be an array');
    const current = this.areasOf(projectId);
    const byId = new Map(current.map((a) => [a.id, a]));
    const names = new Set<string>();
    for (const a of list) {
      const n = text('area name', a.name).toLowerCase();
      if (names.has(n)) throw new GameplanError('invalid', `duplicate area "${a.name}"`);
      names.add(n);
      if (a.id && !byId.has(a.id)) throw new GameplanError('invalid', `area ${a.id} does not belong to this project`);
    }
    const keep = new Set(list.map((a) => a.id).filter(Boolean) as string[]);
    const removed = current.filter((a) => !keep.has(a.id));
    for (const a of removed) {
      const users = this.q('SELECT title FROM tasks WHERE area_id = ? AND archived_at IS NULL ORDER BY ord').all(a.id) as { title: string }[];
      if (users.length)
        throw new GameplanError('conflict', `area "${a.name}" is used by ${users.length} task(s): ${users.map((u) => `"${u.title}"`).join(', ')} — move them first`);
    }
    // Temporarily rename to avoid UNIQUE(project_id, name) clashes while swapping names.
    for (const a of current) this.q('UPDATE areas SET name = ? WHERE id = ?').run(`\u0000${a.id}`, a.id);
    for (const a of removed) {
      this.q('UPDATE tasks SET area_id = NULL WHERE area_id = ?').run(a.id);
      this.q('DELETE FROM areas WHERE id = ?').run(a.id);
    }
    list.forEach((a, i) => {
      const name = a.name.trim();
      if (a.id) {
        const old = byId.get(a.id)!;
        this.q('UPDATE areas SET name = ?, color = ?, ord = ? WHERE id = ?').run(name, a.color === undefined ? old.color : a.color, i, a.id);
      } else {
        this.q('INSERT INTO areas(id, project_id, name, color, ord) VALUES (?,?,?,?,?)').run(newId('ar'), projectId, name, a.color ?? null, i);
      }
    });
    const before = current.map((a) => ({ id: a.id, name: a.name, color: a.color }));
    const after = this.areasOf(projectId).map((a) => ({ id: a.id, name: a.name, color: a.color }));
    if (!same(before, after)) {
      const p = this.projectById(projectId, { archived: true });
      this.record(c, { entity: 'project', entityId: projectId, projectId, label: p.name, kind: 'updated', before: { areas: before }, after: { areas: after } });
    }
  }

  // ---------- milestones ----------

  createMilestone(ctx: Ctx, slug: string, input: MilestoneInput): Milestone {
    return this.write(ctx, (c) => {
      const p = this.project(slug);
      const name = text('name', input.name);
      const due = optDate('due', input.due);
      const status = input.status === undefined ? 'planned' : oneOf('status', input.status, MILESTONE_STATUS);
      const id = newId('ms');
      this.q('INSERT INTO milestones(id, project_id, name, due, status, description, ord, created_at) VALUES (?,?,?,?,?,?,?,?)').run(
        id,
        p.id,
        name,
        due,
        status,
        input.description ?? null,
        this.nextOrd('milestones', 'project_id', p.id),
        this.clock.now(),
      );
      this.record(c, { entity: 'milestone', entityId: id, projectId: p.id, label: name, kind: 'created', after: { name, due, status } });
      return this.milestone(id);
    });
  }

  updateMilestone(ctx: Ctx, id: string, patch: Partial<MilestoneInput>): Milestone {
    return this.write(ctx, (c) => {
      this.milestone(id);
      const f: MilestoneFields = {};
      if (patch.name !== undefined) f.name = text('name', patch.name);
      if (patch.due !== undefined) f.due = optDate('due', patch.due);
      if (patch.status !== undefined) f.status = oneOf('status', patch.status, MILESTONE_STATUS);
      if (patch.description !== undefined) f.description = patch.description;
      this.patchMilestone(c, id, f);
      return this.milestone(id);
    });
  }

  patchMilestone(c: WCtx, id: string, fields: MilestoneFields): void {
    const m = this.milestone(id, { archived: true });
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields) as [keyof MilestoneFields, unknown][]) {
      if (v === undefined || same(m[k], v)) continue;
      before[k] = m[k];
      after[k] = v;
      this.q(`UPDATE milestones SET ${MILESTONE_COLS[k]} = ? WHERE id = ?`).run(toSql(v), id);
    }
    if (!Object.keys(after).length) return;
    const label = (after.name as string | undefined) ?? m.name;
    if ('status' in after) {
      this.record(c, { entity: 'milestone', entityId: id, projectId: m.projectId, label, kind: 'status_changed', before: { status: before.status }, after: { status: after.status } });
      delete before.status;
      delete after.status;
    }
    if (Object.keys(after).length) this.record(c, { entity: 'milestone', entityId: id, projectId: m.projectId, label, kind: 'updated', before, after });
  }

  // ---------- tasks ----------

  createTask(ctx: Ctx, milestoneId: string, input: CreateTaskInput): Task {
    return this.write(ctx, (c) => {
      const m = this.milestone(milestoneId);
      const p = this.projectById(m.projectId);
      const title = text('title', input.title);
      const start = optDate('start', input.start);
      const end = optDate('end', input.end);
      checkSpan(start, end);
      const areaId = this.resolveArea(p.id, input.area);
      const priority = input.priority === undefined ? p.defaultPriority : oneOf('priority', input.priority, PRIORITY);
      const executor = input.executor === undefined ? p.defaultExecutor : oneOf('executor', input.executor, EXECUTOR);
      const labels = input.labels === undefined ? [] : labelsOf(input.labels);
      const id = newId('tk');
      const now = this.clock.now();
      this.q(
        'INSERT INTO tasks(id, milestone_id, area_id, title, description, "start", "end", status, priority, executor, important, labels_json, ord, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      ).run(
        id,
        m.id,
        areaId,
        title,
        input.description ?? null,
        start,
        end,
        'todo',
        priority,
        executor,
        input.important ? 1 : 0,
        JSON.stringify(labels),
        this.nextOrd('tasks', 'milestone_id', m.id),
        now,
        now,
      );
      this.record(c, { entity: 'task', entityId: id, projectId: p.id, label: title, kind: 'created', after: { title, milestoneId: m.id, start, end, status: 'todo' } });
      if (input.todos?.length) this.addTodos(c, id, input.todos);
      for (const dep of input.after ?? []) this.addDependency(c, id, { taskId: dep });
      for (const l of input.links ?? []) this.attach(c, id, { role: 'context', url: l.url, title: l.title, kind: l.kind });
      return this.task(id);
    });
  }

  updateTask(ctx: Ctx, id: string, patch: UpdateTaskInput): Task {
    if (isAgent(ctx.actor) && (patch.start !== undefined || patch.end !== undefined))
      throw new GameplanError('invalid', 'Agents change dates with reschedule_task (it records a reason and can cascade), not update_task.');
    return this.write(ctx, (c) => {
      const t = this.task(id);
      const projectId = this.projectIdOfTask(id);
      const f: TaskFields = {};
      if (patch.title !== undefined) f.title = text('title', patch.title);
      if (patch.description !== undefined) f.description = patch.description;
      if (patch.milestoneId !== undefined && patch.milestoneId !== t.milestoneId) {
        const m = this.milestone(patch.milestoneId);
        if (m.projectId !== projectId) throw new GameplanError('invalid', 'a task can only move to a milestone in the same project');
        f.milestoneId = m.id;
      }
      if (patch.area !== undefined) f.areaId = this.resolveArea(projectId, patch.area);
      if (patch.start !== undefined || patch.end !== undefined) {
        const start = patch.start === undefined ? t.start : optDate('start', patch.start);
        const end = patch.end === undefined ? t.end : optDate('end', patch.end);
        checkSpan(start, end);
        f.start = start;
        f.end = end;
      }
      if (patch.status !== undefined) f.status = oneOf('status', patch.status, TASK_STATUS);
      if (patch.priority !== undefined) f.priority = oneOf('priority', patch.priority, PRIORITY);
      if (patch.executor !== undefined) f.executor = oneOf('executor', patch.executor, EXECUTOR);
      if (patch.important !== undefined) f.important = Boolean(patch.important);
      if (patch.labels !== undefined) f.labels = labelsOf(patch.labels);
      this.patchTask(c, id, f);
      return this.task(id);
    });
  }

  /**
   * Low-level task patch (no policy). Emits `dates_changed`, `status_changed` and `updated` events
   * with only the changed fields in before/after.
   */
  patchTask(c: WCtx, id: string, fields: TaskFields, extra: { datesReason?: string | null; datesAfterExtra?: Record<string, unknown> } = {}): EventRow[] {
    const t = this.task(id, { archived: true });
    const projectId = this.projectIdOfTask(id);
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields) as [keyof TaskFields, unknown][]) {
      if (v === undefined || same(t[k], v)) continue;
      before[k] = t[k];
      after[k] = v;
    }
    if (!Object.keys(after).length) return [];
    const nextStart = 'start' in after ? (after.start as string | null) : t.start;
    const nextEnd = 'end' in after ? (after.end as string | null) : t.end;
    checkSpan(nextStart, nextEnd);
    // One UPDATE so the start/end CHECK sees both columns at once.
    const keys = Object.keys(after) as (keyof TaskFields)[];
    this.db
      .prepare(`UPDATE tasks SET ${keys.map((k) => `${TASK_COLS[k]} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
      .run(...keys.map((k) => toSql(after[k])), this.clock.now(), id);
    const label = (after.title as string | undefined) ?? t.title;
    const out: EventRow[] = [];
    if ('start' in after || 'end' in after) {
      out.push(
        this.record(c, {
          entity: 'task',
          entityId: id,
          projectId,
          label,
          kind: 'dates_changed',
          before: { start: t.start, end: t.end },
          after: { start: nextStart, end: nextEnd, ...(extra.datesAfterExtra ?? {}) },
          reason: extra.datesReason,
        }),
      );
      delete before.start;
      delete before.end;
      delete after.start;
      delete after.end;
    }
    if ('status' in after) {
      out.push(this.record(c, { entity: 'task', entityId: id, projectId, label, kind: 'status_changed', before: { status: before.status }, after: { status: after.status } }));
      delete before.status;
      delete after.status;
    }
    if (Object.keys(after).length) out.push(this.record(c, { entity: 'task', entityId: id, projectId, label, kind: 'updated', before, after }));
    return out;
  }

  // ---------- to-dos ----------

  addTodos(ctx: Ctx, taskId: string, items: TodoInput[]): Todo[] {
    return this.write(ctx, (c) => {
      const t = this.task(taskId);
      const projectId = this.projectIdOfTask(taskId);
      if (!Array.isArray(items) || !items.length) throw new GameplanError('invalid', 'to-dos must be a non-empty array');
      const existing = this.todosOf(taskId);
      const ids = items.map(() => newId('td'));
      const afters = items.map((it, i) => {
        if (it.after === undefined) {
          if (i > 0) return [ids[i - 1]!];
          const last = existing.at(-1);
          return last ? [last.id] : [];
        }
        if (!Array.isArray(it.after)) throw new GameplanError('invalid', 'to-do after must be an array of indices');
        return it.after.map((j) => {
          if (!Number.isInteger(j) || j < 0 || j >= items.length || j === i)
            throw new GameplanError('invalid', `to-do "${it.title}": after index ${j} must point to another to-do in the same list (0..${items.length - 1})`);
          return ids[j]!;
        });
      });
      let ord = this.nextOrd('todos', 'task_id', taskId);
      items.forEach((it, i) => {
        const title = text('to-do title', it.title);
        this.q('INSERT INTO todos(id, task_id, title, ord, after_json) VALUES (?,?,?,?,?)').run(ids[i]!, taskId, title, ord++, JSON.stringify(afters[i]));
        this.record(c, { entity: 'todo', entityId: ids[i]!, projectId, label: title, kind: 'created', after: { taskId, title, task: t.title } });
      });
      this.assertTodosAcyclic(taskId);
      return ids.map((id) => this.todo(id));
    });
  }

  updateTodo(ctx: Ctx, id: string, patch: { title?: string; after?: string[] }): Todo {
    return this.write(ctx, (c) => {
      const td = this.todo(id);
      const projectId = this.projectIdOfTask(td.taskId);
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      if (patch.title !== undefined) {
        const title = text('to-do title', patch.title);
        if (title !== td.title) {
          before.title = td.title;
          after.title = title;
          this.q('UPDATE todos SET title = ? WHERE id = ?').run(title, id);
        }
      }
      if (patch.after !== undefined) {
        if (!Array.isArray(patch.after)) throw new GameplanError('invalid', 'after must be an array of to-do ids');
        const list = [...new Set(patch.after)];
        for (const a of list) {
          const other = this.q('SELECT task_id FROM todos WHERE id = ? AND archived_at IS NULL').get(a) as { task_id: string } | undefined;
          if (!other || other.task_id !== td.taskId) throw new GameplanError('invalid', `to-do ${a} is not in the same task — to-do order only applies inside one task`);
          if (a === id) throw new GameplanError('invalid', 'a to-do cannot come after itself');
        }
        if (!same(td.after, list)) {
          before.after = td.after;
          after.after = list;
          this.q('UPDATE todos SET after_json = ? WHERE id = ?').run(JSON.stringify(list), id);
          this.assertTodosAcyclic(td.taskId);
        }
      }
      if (Object.keys(after).length) this.record(c, { entity: 'todo', entityId: id, projectId, label: (after.title as string) ?? td.title, kind: 'updated', before, after });
      return this.todo(id);
    });
  }

  setTodoDone(ctx: Ctx, id: string, done: boolean): Todo {
    return this.write(ctx, (c) => {
      const td = this.todo(id);
      if (td.done === done) return td;
      this.applyTodoDone(c, id, done);
      const t = this.task(td.taskId);
      const todos = this.todosOf(t.id);
      let next: TaskStatus | null = null;
      if (done && todos.every((x) => x.done) && t.status !== 'done' && t.status !== 'cancelled') next = 'done';
      else if (done && t.status === 'todo') next = 'doing';
      else if (!done && t.status === 'done') next = 'doing';
      if (next) this.patchTask(c, t.id, { status: next });
      return this.todo(id);
    });
  }

  /** Low-level tick/untick (no task status side effects). */
  applyTodoDone(c: WCtx, id: string, done: boolean): void {
    const td = this.todo(id, { archived: true });
    const doneAt = done ? this.clock.now() : null;
    this.q('UPDATE todos SET done = ?, done_at = ? WHERE id = ?').run(done ? 1 : 0, doneAt, id);
    this.record(c, {
      entity: 'todo',
      entityId: id,
      projectId: this.projectIdOfTask(td.taskId),
      label: td.title,
      kind: done ? 'todo_done' : 'todo_undone',
      before: { done: td.done },
      after: { done, taskId: td.taskId },
    });
  }

  private assertTodosAcyclic(taskId: string): void {
    const todos = this.todosOf(taskId);
    const byId = new Map(todos.map((t) => [t.id, t]));
    const state = new Map<string, 1 | 2>();
    const stack: string[] = [];
    const visit = (id: string): void => {
      if (state.get(id) === 2) return;
      if (state.get(id) === 1) {
        const cyc = [...stack.slice(stack.indexOf(id)), id].map((x) => byId.get(x)?.title ?? x);
        throw new GameplanError('conflict', `to-do cycle: ${cyc.join(' → ')}`);
      }
      state.set(id, 1);
      stack.push(id);
      for (const a of byId.get(id)?.after ?? []) if (byId.has(a)) visit(a);
      stack.pop();
      state.set(id, 2);
    };
    for (const t of todos) visit(t.id);
  }

  // ---------- reorder ----------

  reorder(ctx: Ctx, entity: ReorderEntity, ids: string[]): void {
    const spec: Record<ReorderEntity, { table: string; parent: string | null }> = {
      project: { table: 'projects', parent: null },
      milestone: { table: 'milestones', parent: 'project_id' },
      task: { table: 'tasks', parent: 'milestone_id' },
      todo: { table: 'todos', parent: 'task_id' },
      area: { table: 'areas', parent: 'project_id' },
    };
    const sp = spec[entity];
    if (!sp) throw new GameplanError('invalid', `cannot reorder "${entity}"`);
    if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) throw new GameplanError('invalid', 'ids must be a non-empty list without duplicates');
    this.write(ctx, (c) => {
      const archivedCol = entity === 'area' ? '' : ' AND archived_at IS NULL';
      const parents = new Set<string | null>();
      for (const id of ids) {
        const r = this.q(`SELECT ${sp.parent ?? 'NULL'} AS parent FROM ${sp.table} WHERE id = ?${archivedCol}`).get(id) as { parent: string | null } | undefined;
        if (!r) throw new GameplanError('not_found', `${entity} ${id} not found`);
        parents.add(r.parent);
      }
      if (parents.size !== 1) throw new GameplanError('invalid', `all ${entity} ids must share one parent`);
      const parent = [...parents][0] ?? null;
      const siblings = (
        sp.parent
          ? this.q(`SELECT id FROM ${sp.table} WHERE ${sp.parent} = ?${archivedCol} ORDER BY ord, rowid`).all(parent)
          : this.q(`SELECT id FROM ${sp.table} WHERE 1 = 1${archivedCol} ORDER BY ord, rowid`).all()
      ).map((r) => String((r as { id: string }).id));
      const given = new Set(ids);
      const order = [...ids, ...siblings.filter((s) => !given.has(s))];
      if (same(order, siblings)) return;
      order.forEach((id, i) => this.q(`UPDATE ${sp.table} SET ord = ? WHERE id = ?`).run(i, id));
      const { projectId, label } = this.parentInfo(entity, parent);
      this.record(c, { entity, entityId: parent ?? 'root', projectId, label, kind: 'reordered', before: { ids: siblings }, after: { ids: order } });
    });
  }

  /** Low-level: set ord by list (for revert). */
  applyOrder(entity: ReorderEntity, ids: string[]): void {
    const table = { project: 'projects', milestone: 'milestones', task: 'tasks', todo: 'todos', area: 'areas' }[entity];
    ids.forEach((id, i) => this.q(`UPDATE ${table} SET ord = ? WHERE id = ?`).run(i, id));
  }

  private parentInfo(entity: ReorderEntity, parent: string | null): { projectId: string | null; label: string | null } {
    if (!parent) return { projectId: null, label: 'Projects' };
    if (entity === 'milestone' || entity === 'area') {
      const p = this.projectById(parent, { archived: true });
      return { projectId: p.id, label: p.name };
    }
    if (entity === 'task') {
      const m = this.milestone(parent, { archived: true });
      return { projectId: m.projectId, label: m.name };
    }
    const t = this.task(parent, { archived: true });
    return { projectId: this.projectIdOfTask(t.id), label: t.title };
  }

  // ---------- dependencies ----------

  addDependency(ctx: Ctx, fromTaskId: string, target: DependencyTarget): Dependency {
    return this.write(ctx, (c) => {
      const from = this.task(fromTaskId);
      const toTaskId = 'taskId' in target ? target.taskId : null;
      const toMilestoneId = 'milestoneId' in target ? target.milestoneId : null;
      if (!toTaskId && !toMilestoneId) throw new GameplanError('invalid', 'dependency target needs taskId or milestoneId');
      let toLabel: string;
      if (toTaskId) {
        if (toTaskId === fromTaskId) throw new GameplanError('conflict', `dependency cycle: "${from.title}" cannot depend on itself`);
        toLabel = this.task(toTaskId).title;
      } else {
        toLabel = this.milestone(toMilestoneId!).name;
      }
      const dup = this.q(
        'SELECT * FROM dependencies WHERE from_task_id = ? AND to_task_id IS ? AND to_milestone_id IS ?',
      ).get(fromTaskId, toTaskId, toMilestoneId) as Record<string, unknown> | undefined;
      if (dup) return toDependency(dup);
      const cycle = this.findCycle(fromTaskId, toTaskId ? `t:${toTaskId}` : `m:${toMilestoneId}`);
      if (cycle) throw new GameplanError('conflict', `dependency cycle: ${cycle.join(' → ')}`);
      const id = newId('dep');
      this.q('INSERT INTO dependencies(id, from_task_id, to_task_id, to_milestone_id, created_at) VALUES (?,?,?,?,?)').run(id, fromTaskId, toTaskId, toMilestoneId, this.clock.now());
      this.record(c, {
        entity: 'dependency',
        entityId: id,
        projectId: this.projectIdOfTask(fromTaskId),
        label: `${from.title} → ${toLabel}`,
        kind: 'dependency_added',
        after: { fromTaskId, toTaskId, toMilestoneId },
      });
      return this.dependency(id);
    });
  }

  removeDependency(ctx: Ctx, id: string): void {
    this.write(ctx, (c) => {
      const d = this.dependency(id);
      const from = this.task(d.fromTaskId, { archived: true });
      const toLabel = d.toTaskId ? this.task(d.toTaskId, { archived: true }).title : this.milestone(d.toMilestoneId!, { archived: true }).name;
      this.q('DELETE FROM dependencies WHERE id = ?').run(id);
      this.record(c, {
        entity: 'dependency',
        entityId: id,
        projectId: this.projectIdOfTask(d.fromTaskId),
        label: `${from.title} → ${toLabel}`,
        kind: 'dependency_removed',
        before: { fromTaskId: d.fromTaskId, toTaskId: d.toTaskId, toMilestoneId: d.toMilestoneId },
      });
    });
  }

  /**
   * Would adding edge t:fromTaskId → target close a cycle? Nodes are tasks (`t:`) and milestones (`m:`);
   * a milestone waits for each of its tasks. Returns the cycle as labels, or null.
   */
  private findCycle(fromTaskId: string, target: string): string[] | null {
    const goal = `t:${fromTaskId}`;
    const edges = (node: string): string[] => {
      const [kind, id] = [node.slice(0, 1), node.slice(2)];
      if (kind === 'm')
        return (this.q('SELECT id FROM tasks WHERE milestone_id = ? AND archived_at IS NULL').all(id) as { id: string }[]).map((r) => `t:${r.id}`);
      return (
        this.q(
          `SELECT d.to_task_id, d.to_milestone_id FROM dependencies d
           LEFT JOIN tasks t ON t.id = d.to_task_id
           WHERE d.from_task_id = ? AND (d.to_task_id IS NULL OR t.archived_at IS NULL)`,
        ).all(id) as { to_task_id: string | null; to_milestone_id: string | null }[]
      ).map((r) => (r.to_task_id ? `t:${r.to_task_id}` : `m:${r.to_milestone_id}`));
    };
    const prev = new Map<string, string | null>([[target, null]]);
    const queue = [target];
    while (queue.length) {
      const n = queue.shift()!;
      if (n === goal) {
        const path: string[] = [];
        for (let x: string | null = n; x; x = prev.get(x) ?? null) path.unshift(x);
        return [goal, ...path].map((x) => this.nodeLabel(x));
      }
      for (const m of edges(n))
        if (!prev.has(m)) {
          prev.set(m, n);
          queue.push(m);
        }
    }
    return null;
  }

  private nodeLabel(node: string): string {
    const id = node.slice(2);
    if (node.startsWith('m:')) return (this.q('SELECT name FROM milestones WHERE id = ?').get(id) as { name: string } | undefined)?.name ?? id;
    return (this.q('SELECT title FROM tasks WHERE id = ?').get(id) as { title: string } | undefined)?.title ?? id;
  }

  // ---------- attachments ----------

  attach(ctx: Ctx, taskId: string, input: AttachInput): Attachment {
    return this.write(ctx, (c) => {
      const t = this.task(taskId);
      const role = oneOf('role', input.role, ATTACHMENT_ROLE);
      const url = text('url', input.url);
      const inferred = inferAttachment(url);
      const kind = input.kind === undefined ? inferred.kind : oneOf('kind', input.kind, ATTACHMENT_KIND);
      const existing = this.q('SELECT * FROM attachments WHERE task_id = ? AND url = ?').get(taskId, url) as Record<string, unknown> | undefined;
      const now = this.clock.now();
      const projectId = this.projectIdOfTask(taskId);
      if (existing) {
        const a = toAttachment(existing);
        const next = {
          role,
          kind,
          title: input.title ?? a.title ?? inferred.title,
          state: input.state === undefined ? a.state : input.state,
          archivedAt: null as string | null,
        };
        const before = { role: a.role, kind: a.kind, title: a.title, state: a.state, archivedAt: a.archivedAt };
        if (same(before, next)) return a;
        this.q('UPDATE attachments SET role = ?, kind = ?, title = ?, state = ?, archived_at = NULL, actor = ?, at = ? WHERE id = ?').run(
          next.role,
          next.kind,
          next.title,
          next.state ?? null,
          c.actor,
          now,
          a.id,
        );
        this.record(c, { entity: 'attachment', entityId: a.id, projectId, label: next.title ?? url, kind: 'attached', before, after: { ...next, taskId, url, task: t.title } });
        return this.attachment(a.id);
      }
      const id = newId('att');
      const title = input.title ?? inferred.title;
      this.q('INSERT INTO attachments(id, task_id, role, kind, title, url, ref, state, actor, at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
        id,
        taskId,
        role,
        kind,
        title,
        url,
        inferred.ref,
        input.state ?? null,
        c.actor,
        now,
      );
      this.record(c, {
        entity: 'attachment',
        entityId: id,
        projectId,
        label: title,
        kind: 'attached',
        after: { role, kind, title, state: input.state ?? null, archivedAt: null, taskId, url, ref: inferred.ref, task: t.title },
      });
      return this.attachment(id);
    });
  }

  detach(ctx: Ctx, id: string): void {
    this.write(ctx, (c) => {
      const a = this.attachment(id);
      const now = this.clock.now();
      this.q('UPDATE attachments SET archived_at = ? WHERE id = ?').run(now, id);
      this.record(c, {
        entity: 'attachment',
        entityId: id,
        projectId: this.projectIdOfTask(a.taskId),
        label: a.title ?? a.url,
        kind: 'detached',
        before: { archivedAt: null },
        after: { archivedAt: now, taskId: a.taskId, url: a.url },
      });
    });
  }

  // ---------- archive / restore ----------

  archive(ctx: Ctx, entity: ArchivableEntity, id: string): void {
    assertAgentAllowed(this.settings(), ctx.actor, 'archive');
    this.write(ctx, (c) => {
      const now = this.clock.now();
      const one = (e: ArchivableEntity, eid: string): void => {
        const info = this.entityInfo(e, eid);
        if (info.archivedAt) return;
        this.q(`UPDATE ${info.table} SET archived_at = ? WHERE id = ?`).run(now, eid);
        this.record(c, { entity: e, entityId: eid, projectId: info.projectId, label: info.label, kind: 'archived', before: { archivedAt: null }, after: { archivedAt: now } });
      };
      const info = this.entityInfo(entity, id);
      if (info.archivedAt) throw new GameplanError('conflict', `${entity} "${info.label}" is already archived`);
      one(entity, id);
      if (entity === 'project') {
        for (const m of this.q('SELECT id FROM milestones WHERE project_id = ? AND archived_at IS NULL').all(id) as { id: string }[]) {
          one('milestone', m.id);
          for (const t of this.q('SELECT id FROM tasks WHERE milestone_id = ? AND archived_at IS NULL').all(m.id) as { id: string }[]) one('task', t.id);
        }
      } else if (entity === 'milestone') {
        for (const t of this.q('SELECT id FROM tasks WHERE milestone_id = ? AND archived_at IS NULL').all(id) as { id: string }[]) one('task', t.id);
      }
    });
  }

  /** Restores the entity and the children archived in the same batch. */
  restore(ctx: Ctx, entity: ArchivableEntity, id: string): void {
    this.write(ctx, (c) => {
      const info = this.entityInfo(entity, id);
      if (!info.archivedAt) throw new GameplanError('conflict', `${entity} "${info.label}" is not archived`);
      const ev = this.q("SELECT batch_id FROM events WHERE entity = ? AND entity_id = ? AND kind = 'archived' ORDER BY rowid DESC LIMIT 1").get(entity, id) as
        | { batch_id: string }
        | undefined;
      const targets: { entity: ArchivableEntity; id: string }[] = [{ entity, id }];
      if (ev) {
        for (const r of this.q("SELECT entity, entity_id FROM events WHERE batch_id = ? AND kind = 'archived' ORDER BY rowid").all(ev.batch_id) as {
          entity: ArchivableEntity;
          entity_id: string;
        }[])
          if (!(r.entity === entity && r.entity_id === id)) targets.push({ entity: r.entity, id: r.entity_id });
      }
      for (const t of targets) this.applyRestore(c, t.entity, t.id);
    });
  }

  applyRestore(c: WCtx, entity: ArchivableEntity, id: string): void {
    const info = this.entityInfo(entity, id);
    if (!info.archivedAt) return;
    this.q(`UPDATE ${info.table} SET archived_at = NULL WHERE id = ?`).run(id);
    this.record(c, { entity, entityId: id, projectId: info.projectId, label: info.label, kind: 'restored', before: { archivedAt: info.archivedAt }, after: { archivedAt: null } });
  }

  applyArchive(c: WCtx, entity: ArchivableEntity, id: string): void {
    const info = this.entityInfo(entity, id);
    if (info.archivedAt) return;
    const now = this.clock.now();
    this.q(`UPDATE ${info.table} SET archived_at = ? WHERE id = ?`).run(now, id);
    this.record(c, { entity, entityId: id, projectId: info.projectId, label: info.label, kind: 'archived', before: { archivedAt: null }, after: { archivedAt: now } });
  }

  entityInfo(entity: ArchivableEntity, id: string): { table: string; projectId: string; label: string; archivedAt: string | null } {
    switch (entity) {
      case 'project': {
        const p = this.projectById(id, { archived: true });
        return { table: 'projects', projectId: p.id, label: p.name, archivedAt: p.archivedAt };
      }
      case 'milestone': {
        const m = this.milestone(id, { archived: true });
        return { table: 'milestones', projectId: m.projectId, label: m.name, archivedAt: m.archivedAt };
      }
      case 'task': {
        const t = this.task(id, { archived: true });
        return { table: 'tasks', projectId: this.projectIdOfTask(id), label: t.title, archivedAt: t.archivedAt };
      }
      case 'todo': {
        const td = this.todo(id, { archived: true });
        return { table: 'todos', projectId: this.projectIdOfTask(td.taskId), label: td.title, archivedAt: td.archivedAt };
      }
      default:
        throw new GameplanError('invalid', `cannot archive "${String(entity)}" (project, milestone, task or todo)`);
    }
  }
}
