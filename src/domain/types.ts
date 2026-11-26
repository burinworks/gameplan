export const PROJECT_STATUS = ['active', 'paused', 'done', 'dropped'] as const;
export const MILESTONE_STATUS = ['planned', 'active', 'done'] as const;
export const TASK_STATUS = ['todo', 'doing', 'done', 'cancelled'] as const;
export const PRIORITY = ['p1', 'p2', 'p3'] as const;
export const EXECUTOR = ['manual', 'ai'] as const;
export const ATTACHMENT_ROLE = ['context', 'deliverable'] as const;
export const ATTACHMENT_KIND = ['commit', 'pr', 'file', 'link', 'note'] as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[number];
export type MilestoneStatus = (typeof MILESTONE_STATUS)[number];
export type TaskStatus = (typeof TASK_STATUS)[number];
export type Priority = (typeof PRIORITY)[number];
export type Executor = (typeof EXECUTOR)[number];
export type AttachmentRole = (typeof ATTACHMENT_ROLE)[number];
export type AttachmentKind = (typeof ATTACHMENT_KIND)[number];

export type EntityType = 'project' | 'area' | 'milestone' | 'task' | 'todo' | 'dependency' | 'attachment' | 'settings';
export type ArchivableEntity = 'project' | 'milestone' | 'task' | 'todo';
export type ReorderEntity = 'milestone' | 'task' | 'todo' | 'area' | 'project';

export type EventKind =
  | 'created'
  | 'updated'
  | 'dates_changed'
  | 'status_changed'
  | 'todo_done'
  | 'todo_undone'
  | 'reordered'
  | 'dependency_added'
  | 'dependency_removed'
  | 'attached'
  | 'detached'
  | 'archived'
  | 'restored'
  | 'planned'
  | 'settings_changed'
  | 'reverted';

/** Who is writing and why. `actor` is `you` (HTTP/UI) or `ai:<client>` (MCP). */
export type Ctx = { actor: string; reason?: string; batchId?: string };

export type ErrorCode = 'not_found' | 'invalid' | 'conflict' | 'forbidden';

export class GameplanError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GameplanError';
  }
}

export const isAgent = (actor: string): boolean => actor !== 'you';

export interface Area {
  id: string;
  projectId: string;
  name: string;
  color: string | null;
  ord: number;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  color: string | null;
  status: ProjectStatus;
  statusChangedAt: string | null;
  vaultNote: string | null;
  repo: string | null;
  github: string | null;
  defaultPriority: Priority;
  defaultExecutor: Executor;
  labels: string[];
  ord: number;
  archivedAt: string | null;
  createdAt: string;
  areas: Area[];
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  due: string | null;
  status: MilestoneStatus;
  description: string | null;
  ord: number;
  archivedAt: string | null;
  createdAt: string;
}

export interface Task {
  id: string;
  milestoneId: string;
  areaId: string | null;
  title: string;
  description: string | null;
  start: string | null;
  end: string | null;
  status: TaskStatus;
  priority: Priority;
  executor: Executor;
  important: boolean;
  labels: string[];
  ord: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Todo {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  doneAt: string | null;
  ord: number;
  after: string[];
  archivedAt: string | null;
}

export interface Dependency {
  id: string;
  fromTaskId: string;
  toTaskId: string | null;
  toMilestoneId: string | null;
  createdAt: string;
}

export interface Attachment {
  id: string;
  taskId: string;
  role: AttachmentRole;
  kind: AttachmentKind;
  title: string | null;
  url: string;
  ref: string | null;
  state: string | null;
  actor: string | null;
  at: string;
  archivedAt: string | null;
}

export interface EventRow {
  id: string;
  projectId: string | null;
  entity: EntityType;
  entityId: string;
  label: string | null;
  actor: string;
  kind: EventKind;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  batchId: string;
  at: string;
}

export interface TaskInput {
  title: string;
  description?: string | null;
  /** Area name within the task's project. */
  area?: string | null;
  start?: string | null;
  end?: string | null;
  priority?: Priority;
  executor?: Executor;
  important?: boolean;
  labels?: string[];
}

export interface TodoInput {
  title: string;
  /** Indices into the same call's list. Omitted → after the previous item (linear). */
  after?: number[];
}

export interface LinkInput {
  url: string;
  title?: string;
  kind?: AttachmentKind;
}

// ---- row mappers ----

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const json = <T>(v: unknown, fallback: T): T => {
  if (typeof v !== 'string') return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
};

export const toArea = (r: Row): Area => ({ id: String(r.id), projectId: String(r.project_id), name: String(r.name), color: s(r.color), ord: Number(r.ord) });

export const toProject = (r: Row, areas: Area[]): Project => ({
  id: String(r.id),
  slug: String(r.slug),
  name: String(r.name),
  color: s(r.color),
  status: r.status as ProjectStatus,
  statusChangedAt: s(r.status_changed_at),
  vaultNote: s(r.vault_note),
  repo: s(r.repo),
  github: s(r.github),
  defaultPriority: r.default_priority as Priority,
  defaultExecutor: r.default_executor as Executor,
  labels: json(r.labels_json, [] as string[]),
  ord: Number(r.ord),
  archivedAt: s(r.archived_at),
  createdAt: String(r.created_at),
  areas,
});

export const toMilestone = (r: Row): Milestone => ({
  id: String(r.id),
  projectId: String(r.project_id),
  name: String(r.name),
  due: s(r.due),
  status: r.status as MilestoneStatus,
  description: s(r.description),
  ord: Number(r.ord),
  archivedAt: s(r.archived_at),
  createdAt: String(r.created_at),
});

export const toTask = (r: Row): Task => ({
  id: String(r.id),
  milestoneId: String(r.milestone_id),
  areaId: s(r.area_id),
  title: String(r.title),
  description: s(r.description),
  start: s(r.start),
  end: s(r.end),
  status: r.status as TaskStatus,
  priority: r.priority as Priority,
  executor: r.executor as Executor,
  important: Number(r.important) === 1,
  labels: json(r.labels_json, [] as string[]),
  ord: Number(r.ord),
  archivedAt: s(r.archived_at),
  createdAt: String(r.created_at),
  updatedAt: String(r.updated_at),
});

export const toTodo = (r: Row): Todo => ({
  id: String(r.id),
  taskId: String(r.task_id),
  title: String(r.title),
  done: Number(r.done) === 1,
  doneAt: s(r.done_at),
  ord: Number(r.ord),
  after: json(r.after_json, [] as string[]),
  archivedAt: s(r.archived_at),
});

export const toDependency = (r: Row): Dependency => ({
  id: String(r.id),
  fromTaskId: String(r.from_task_id),
  toTaskId: s(r.to_task_id),
  toMilestoneId: s(r.to_milestone_id),
  createdAt: String(r.created_at),
});

export const toAttachment = (r: Row): Attachment => ({
  id: String(r.id),
  taskId: String(r.task_id),
  role: r.role as AttachmentRole,
  kind: r.kind as AttachmentKind,
  title: s(r.title),
  url: String(r.url),
  ref: s(r.ref),
  state: s(r.state),
  actor: s(r.actor),
  at: String(r.at),
  archivedAt: s(r.archived_at),
});

export const toEvent = (r: Row): EventRow => ({
  id: String(r.id),
  projectId: s(r.project_id),
  entity: r.entity as EntityType,
  entityId: String(r.entity_id),
  label: s(r.label),
  actor: String(r.actor),
  kind: r.kind as EventKind,
  before: json(r.before_json, null),
  after: json(r.after_json, null),
  reason: s(r.reason),
  batchId: String(r.batch_id),
  at: String(r.at),
});
