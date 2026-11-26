import type { Store } from './store.js';
import { GameplanError, type Ctx, type TaskInput } from './types.js';

export type PlanTask = TaskInput & {
  key: string;
  todos?: { title: string; after?: number[] }[];
  /** Keys of tasks in this plan, or ids of existing tasks (any project). */
  dependsOn?: string[];
  links?: { url: string; title?: string }[];
};

export interface PlanInput {
  tasks: PlanTask[];
  /** Milestone or task ids the whole milestone waits for: linked from every plan task without in-plan prerequisites. */
  milestoneDependsOn?: string[];
}

export interface PlanResult {
  tasks: Record<string, string>;
  todos: number;
  dependencies: number;
}

/** Plans a whole milestone in one transaction and one batch. Any error → nothing written. */
export function planMilestone(store: Store, ctx: Ctx, milestoneId: string, plan: PlanInput): PlanResult {
  if (!plan || !Array.isArray(plan.tasks) || plan.tasks.length === 0) throw new GameplanError('invalid', 'a plan needs at least one task');
  const keys = new Set<string>();
  for (const t of plan.tasks) {
    if (typeof t.key !== 'string' || !t.key.trim()) throw new GameplanError('invalid', `task "${t.title ?? '?'}" needs a key`);
    if (keys.has(t.key)) throw new GameplanError('invalid', `duplicate task key "${t.key}"`);
    keys.add(t.key);
  }

  return store.write(ctx, (c) => {
    const m = store.milestone(milestoneId);
    const ids: Record<string, string> = {};
    let todos = 0;
    let dependencies = 0;

    for (const t of plan.tasks) {
      const { key: _key, dependsOn: _deps, todos: tds, links, ...input } = t;
      const created = store.createTask(c, m.id, { ...input, todos: tds, links });
      ids[t.key] = created.id;
      todos += tds?.length ?? 0;
    }

    const resolve = (ref: string, owner: string): { taskId: string } | { milestoneId: string } => {
      if (ids[ref]) return { taskId: ids[ref] };
      const task = store.q('SELECT id FROM tasks WHERE id = ? AND archived_at IS NULL').get(ref);
      if (task) return { taskId: ref };
      const ms = store.q('SELECT id FROM milestones WHERE id = ? AND archived_at IS NULL').get(ref);
      if (ms) return { milestoneId: ref };
      throw new GameplanError('invalid', `"${owner}" depends on "${ref}", which is neither a key in this plan nor an existing task or milestone id`);
    };

    for (const t of plan.tasks)
      for (const ref of t.dependsOn ?? []) {
        store.addDependency(c, ids[t.key]!, resolve(ref, t.title));
        dependencies++;
      }

    if (plan.milestoneDependsOn?.length) {
      const roots = plan.tasks.filter((t) => !(t.dependsOn ?? []).some((d) => d in ids));
      for (const ref of plan.milestoneDependsOn) {
        const target = resolve(ref, m.name);
        for (const r of roots) {
          store.addDependency(c, ids[r.key]!, target);
          dependencies++;
        }
      }
    }

    store.record(c, {
      entity: 'milestone',
      entityId: m.id,
      projectId: m.projectId,
      label: m.name,
      kind: 'planned',
      after: { tasks: plan.tasks.length, todos, dependencies, taskIds: Object.values(ids) },
    });
    return { tasks: ids, todos, dependencies };
  });
}
