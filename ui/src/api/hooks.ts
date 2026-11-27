import { QueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { errorLine } from '../lib/format';
import { api, ApiError } from './client';
import type {
  Attachment,
  Executor,
  Home,
  InboxItem,
  Milestone,
  MilestoneDetail,
  Overview,
  Priority,
  Project,
  ProjectListItem,
  ProjectTree,
  PublicSettings,
  SearchHit,
  Task,
  TaskDetail,
  TaskStatus,
  TemplateInfo,
  TimelineRows,
  Todo,
  UpdateRow,
} from './types';

// ---------- shared error line ----------

let errorText: string | null = null;
let errorTimer: ReturnType<typeof setTimeout> | undefined;
const errorSubs = new Set<() => void>();
/** Set (or clear with null) the message shown in the shared error line. */
export function setErrorLine(message: string | null): void {
  errorText = message;
  clearTimeout(errorTimer);
  if (message) errorTimer = setTimeout(() => setErrorLine(null), 6000);
  errorSubs.forEach((f) => f());
}
export const useErrorLine = (): string | null =>
  useSyncExternalStore(
    (f) => {
      errorSubs.add(f);
      return () => void errorSubs.delete(f);
    },
    () => errorText,
  );
const onError = (e: Error) => setErrorLine(errorLine(e instanceof ApiError ? e : { code: 'internal', message: e.message }));
const mut = { onError, onSuccess: () => setErrorLine(null) };
/** For a caller that shows the refusal in place: skips the shared error line. */
export interface InlineErrorOpt {
  inlineError?: boolean;
}
const mutFor = (o?: InlineErrorOpt) => (o?.inlineError ? { onSuccess: mut.onSuccess } : mut);

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 1,
      },
    },
  });
}

// ---------- reads ----------

export const useHome = () =>
  useQuery({
    queryKey: ['home'],
    queryFn: () => api<Home>('GET', '/api/home'),
    // While the engine is unreachable, keep probing so the UI recovers on its own.
    refetchInterval: (q) => (q.state.error instanceof ApiError && q.state.error.code === 'network' ? 3000 : false),
  });

export const useTimeline = (from?: string, to?: string) =>
  useQuery({
    queryKey: ['timeline', from, to],
    queryFn: () => {
      const q = new URLSearchParams();
      if (from) q.set('from', from);
      if (to) q.set('to', to);
      const qs = q.toString();
      return api<TimelineRows>('GET', `/api/timeline${qs ? `?${qs}` : ''}`);
    },
  });

export type ProjectStatusFilter = 'active' | 'paused' | 'done' | 'dropped' | 'all';
export const useProjects = (status: ProjectStatusFilter = 'active') =>
  useQuery({ queryKey: ['projects', status], queryFn: () => api<ProjectListItem[]>('GET', `/api/projects?status=${status}`) });

export const useProject = (slug: string | undefined) =>
  useQuery({ queryKey: ['project', slug], queryFn: () => api<ProjectTree>('GET', `/api/projects/${encodeURIComponent(slug!)}`), enabled: !!slug });

export const useTask = (id: string | undefined) =>
  useQuery({ queryKey: ['task', id], queryFn: () => api<TaskDetail>('GET', `/api/tasks/${encodeURIComponent(id!)}`), enabled: !!id });

export const useMilestone = (id: string | undefined) =>
  useQuery({ queryKey: ['milestone', id], queryFn: () => api<MilestoneDetail>('GET', `/api/milestones/${encodeURIComponent(id!)}`), enabled: !!id });

export const useOverview = () => useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('GET', '/api/overview') });

export interface UpdatesOpts {
  project?: string;
  actor?: 'all' | 'agents' | 'you';
  since?: string;
  limit?: number;
}
export const useUpdates = (opts: UpdatesOpts = {}) =>
  useQuery({
    queryKey: ['updates', { project: opts.project, actor: opts.actor }],
    queryFn: () => {
      const q = new URLSearchParams();
      if (opts.project) q.set('project', opts.project);
      if (opts.actor) q.set('actor', opts.actor);
      if (opts.since) q.set('since', opts.since);
      if (opts.limit) q.set('limit', String(opts.limit));
      const qs = q.toString();
      return api<UpdateRow[]>('GET', `/api/updates${qs ? `?${qs}` : ''}`);
    },
  });

export const useSearch = (q: string) =>
  useQuery({
    queryKey: ['search', q],
    queryFn: () => api<SearchHit[]>('GET', `/api/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
  });

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => api<PublicSettings>('GET', '/api/settings') });

export const useInbox = () =>
  useQuery({ queryKey: ['inbox'], queryFn: () => api<{ count: number; items: { id: string; text: string; by: string; at: string }[] }>('GET', '/api/inbox') });

export const useTemplates = () => useQuery({ queryKey: ['templates'], queryFn: () => api<TemplateInfo[]>('GET', '/api/templates') });

export interface AgentClient {
  name: string;
  firstSeen: string;
  lastSeen: string;
  calls: number;
}
export const useAgents = () => useQuery({ queryKey: ['agents'], queryFn: () => api<AgentClient[]>('GET', '/api/agents') });

export interface DayPlanRow {
  date: string;
  taskId: string;
  ord: number;
  when: string | null;
}
export const useDayPlan = (date: string) =>
  useQuery({ queryKey: ['dayPlan', date], queryFn: () => api<DayPlanRow[]>('GET', `/api/day-plan/${date}`) });

export const useBackup = () =>
  useQuery({ queryKey: ['backup'], queryFn: () => api<{ last: { file: string; at: string } | null }>('GET', '/api/backup') });

// ---------- writes ----------
// onSettled invalidates nothing: live sync (SSE) refreshes queries. onError sets the shared error line.

export interface CreateProjectBody {
  name: string;
  slug?: string;
  color?: string | null;
  vaultNote?: string | null;
  repo?: string | null;
  github?: string | null;
  areas?: { name: string; color?: string | null }[];
  firstMilestone?: { name: string; due?: string | null };
  template?: string;
  startDate?: string;
}
export const useCreateProject = () => useMutation({ mutationFn: (b: CreateProjectBody) => api<Project>('POST', '/api/projects', b), ...mut });

export interface ConfigureProjectBody {
  name?: string;
  color?: string | null;
  status?: 'active' | 'paused' | 'done' | 'dropped';
  vaultNote?: string | null;
  repo?: string | null;
  github?: string | null;
  defaultPriority?: Priority;
  defaultExecutor?: Executor;
  areas?: { id?: string; name: string; color?: string | null }[];
  labels?: string[];
}
export const useConfigureProject = () =>
  useMutation({ mutationFn: (v: { slug: string; patch: ConfigureProjectBody }) => api<Project>('PATCH', `/api/projects/${encodeURIComponent(v.slug)}`, v.patch), ...mut });

export interface MilestoneBody {
  name: string;
  due?: string | null;
  status?: 'planned' | 'active' | 'done';
  description?: string | null;
}
export const useCreateMilestone = () =>
  useMutation({ mutationFn: (v: { slug: string; body: MilestoneBody }) => api<Milestone>('POST', `/api/projects/${encodeURIComponent(v.slug)}/milestones`, v.body), ...mut });
export const useUpdateMilestone = () =>
  useMutation({ mutationFn: (v: { id: string; patch: Partial<MilestoneBody> }) => api<Milestone>('PATCH', `/api/milestones/${encodeURIComponent(v.id)}`, v.patch), ...mut });

export interface TaskBody {
  title: string;
  description?: string | null;
  area?: string | null;
  start?: string | null;
  end?: string | null;
  priority?: Priority;
  executor?: Executor;
  important?: boolean;
  labels?: string[];
  status?: TaskStatus;
}
export interface CreateTaskBody extends TaskBody {
  todos?: { title: string; after?: number[] }[];
  after?: string[];
  links?: { url: string; title?: string; kind?: Attachment['kind'] }[];
}
export const useCreateTask = () =>
  useMutation({ mutationFn: (v: { milestoneId: string; body: CreateTaskBody }) => api<Task>('POST', `/api/milestones/${encodeURIComponent(v.milestoneId)}/tasks`, v.body), ...mut });
export const useUpdateTask = () =>
  useMutation({
    mutationFn: (v: { id: string; patch: Partial<TaskBody> & { milestoneId?: string } }) => api<Task>('PATCH', `/api/tasks/${encodeURIComponent(v.id)}`, v.patch),
    ...mut,
  });

/** Always sends cascade:false. */
export const useReschedule = () =>
  useMutation({
    mutationFn: (v: { id: string; start: string; end: string; reason?: string }) =>
      api<unknown>('POST', `/api/tasks/${encodeURIComponent(v.id)}/reschedule`, { start: v.start, end: v.end, reason: v.reason, cascade: false }),
    ...mut,
  });

export const useReview = () =>
  useMutation({
    mutationFn: (v: { id: string; decision: 'accept' | 'send_back'; note?: string | null }) =>
      api<Task>('POST', `/api/tasks/${encodeURIComponent(v.id)}/review`, { decision: v.decision, note: v.note }),
    ...mut,
  });

export const useSetResume = () =>
  useMutation({ mutationFn: (v: { id: string; note: string | null }) => api<Task>('PUT', `/api/tasks/${encodeURIComponent(v.id)}/resume`, { note: v.note }), ...mut });

export const usePlanDay = () =>
  useMutation({
    mutationFn: (v: { date: string; items: { taskId: string; when?: string | null }[] }) => api<DayPlanRow[]>('PUT', `/api/day-plan/${v.date}`, { items: v.items }),
    ...mut,
  });

export const useCapture = () => useMutation({ mutationFn: (text: string) => api<InboxItem>('POST', '/api/inbox', { text }), ...mut });

export type TriageTarget = { as: 'task'; milestoneId: string; task?: Partial<CreateTaskBody> } | { as: 'todo'; taskId: string } | { as: 'dismiss' };
export const useTriage = () =>
  useMutation({
    mutationFn: (v: { id: string; to: TriageTarget }) =>
      api<{ item: InboxItem; created?: { entity: 'task' | 'todo'; id: string } }>('POST', `/api/inbox/${encodeURIComponent(v.id)}/triage`, v.to),
    ...mut,
  });

export const useAddTodos = () =>
  useMutation({
    mutationFn: (v: { taskId: string; todos: { title: string; after?: number[] }[] }) => api<Todo[]>('POST', `/api/tasks/${encodeURIComponent(v.taskId)}/todos`, { todos: v.todos }),
    ...mut,
  });

export const usePatchTodo = () =>
  useMutation({
    mutationFn: (v: { id: string; patch: { done?: boolean; title?: string; after?: string[] } }) => api<Todo>('PATCH', `/api/todos/${encodeURIComponent(v.id)}`, v.patch),
    ...mut,
  });

export type ReorderEntity = 'milestone' | 'task' | 'todo' | 'area' | 'project';
export const useReorder = () =>
  useMutation({ mutationFn: (v: { entity: ReorderEntity; ids: string[] }) => api<{ ok: true }>('POST', '/api/reorder', v), ...mut });

export const useAttach = () =>
  useMutation({
    mutationFn: (v: { taskId: string; role: 'context' | 'deliverable'; url: string; title?: string | null; kind?: Attachment['kind']; state?: string | null }) => {
      const { taskId, ...body } = v;
      return api<Attachment>('POST', `/api/tasks/${encodeURIComponent(taskId)}/attachments`, body);
    },
    ...mut,
  });
export const useDetach = () => useMutation({ mutationFn: (id: string) => api<{ ok: true }>('DELETE', `/api/attachments/${encodeURIComponent(id)}`), ...mut });

export const useAddDependency = () =>
  useMutation({
    mutationFn: (v: { fromTaskId: string; taskId?: string; milestoneId?: string }) => api<unknown>('POST', '/api/dependencies', v),
    ...mut,
  });
export const useRemoveDependency = () => useMutation({ mutationFn: (id: string) => api<{ ok: true }>('DELETE', `/api/dependencies/${encodeURIComponent(id)}`), ...mut });

export type ArchivableEntity = 'project' | 'milestone' | 'task' | 'todo';
export const useArchive = () =>
  useMutation({ mutationFn: (v: { entity: ArchivableEntity; id: string }) => api<{ ok: true }>('POST', '/api/archive', v), ...mut });
export const useRestore = () =>
  useMutation({ mutationFn: (v: { entity: ArchivableEntity; id: string }) => api<{ ok: true }>('POST', '/api/restore', v), ...mut });

export const useRevert = (o?: InlineErrorOpt) =>
  useMutation({ mutationFn: (eventId: string) => api<unknown>('POST', `/api/events/${encodeURIComponent(eventId)}/revert`), ...mutFor(o) });

export const usePatchSettings = (o?: InlineErrorOpt) =>
  useMutation({ mutationFn: (patch: Partial<Omit<PublicSettings, 'mcp_token_set'>> & Record<string, unknown>) => api<PublicSettings>('PATCH', '/api/settings', patch), ...mutFor(o) });

export const useBackupNow = () =>
  useMutation({ mutationFn: () => api<{ last: { file: string; at: string } | null }>('POST', '/api/backup'), ...mut });
