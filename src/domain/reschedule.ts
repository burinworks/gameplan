import { addDays, diffDays, isDate } from '../clock.js';
import { taskHealth } from './derive.js';
import { depsOf } from './queries.js';
import { assertAgentAllowed } from './settings.js';
import { checkSpan, type Store, type WCtx } from './store.js';
import { GameplanError, type Ctx } from './types.js';

export interface RescheduleInput {
  start: string;
  end: string;
  reason?: string;
  cascade?: boolean;
}

export interface Move {
  id: string;
  title: string;
  from: { start: string | null; end: string | null };
  to: { start: string; end: string };
}

/** Conflict reasons of one task, prefixed with its title unless it is `self`. */
function conflictsOf(store: Store, taskId: string, today: string): string[] {
  const t = store.task(taskId, { archived: true });
  if (t.archivedAt) return [];
  const m = store.milestone(t.milestoneId, { archived: true });
  const h = taskHealth(t, depsOf(store.db, taskId), m, today);
  return h.health === 'conflict' ? h.reasons : [];
}

function dependentsOf(store: Store, taskId: string): string[] {
  return (store.q('SELECT from_task_id FROM dependencies WHERE to_task_id = ? ORDER BY rowid').all(taskId) as { from_task_id: string }[]).map((r) => r.from_task_id);
}

/**
 * Moves a task. With `cascade` and a later end, open dated dependents shift by the same delta
 * (BFS; done/cancelled/undated/archived ones stay put but are traversed). One batch.
 */
export function rescheduleTask(store: Store, ctx: Ctx, taskId: string, input: RescheduleInput): { moved: Move[]; conflicts: string[] } {
  const reason = input.reason ?? ctx.reason;
  assertAgentAllowed(store.settings(), ctx.actor, 'move_dates', reason);
  if (!isDate(input.start) || !isDate(input.end)) throw new GameplanError('invalid', 'start and end must be valid YYYY-MM-DD dates');
  checkSpan(input.start, input.end);

  return store.write({ ...ctx, reason }, (c: WCtx) => {
    const root = store.task(taskId);
    const today = store.today();
    const delta = root.end ? diffDays(root.end, input.end) : 0;

    // Tasks whose health can change: the root, everything we might move, and their direct dependents.
    const plan: { id: string; to: { start: string; end: string } }[] = [{ id: root.id, to: { start: input.start, end: input.end } }];
    if (input.cascade && delta > 0) {
      const seen = new Set([root.id]);
      const queue = [root.id];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const dep of dependentsOf(store, cur)) {
          if (seen.has(dep)) continue;
          seen.add(dep);
          queue.push(dep);
          const t = store.task(dep, { archived: true });
          const movable = !t.archivedAt && t.status !== 'done' && t.status !== 'cancelled' && t.start !== null && t.end !== null;
          if (movable) plan.push({ id: t.id, to: { start: addDays(t.start!, delta), end: addDays(t.end!, delta) } });
        }
      }
    }
    const watch = new Set<string>();
    for (const p of plan) {
      watch.add(p.id);
      for (const d of dependentsOf(store, p.id)) watch.add(d);
    }
    const beforeConflicts = new Map([...watch].map((id) => [id, new Set(conflictsOf(store, id, today))]));

    const moved: Move[] = [];
    let rootEvent: ReturnType<Store['patchTask']>[number] | undefined;
    for (const p of plan) {
      const t = store.task(p.id);
      if (t.start === p.to.start && t.end === p.to.end) continue;
      const evs = store.patchTask(c, p.id, { start: p.to.start, end: p.to.end }, { datesReason: p.id === root.id ? (reason ?? null) : `cascade from "${root.title}"` });
      if (p.id === root.id) rootEvent = evs[0];
      moved.push({ id: t.id, title: t.title, from: { start: t.start, end: t.end }, to: p.to });
    }

    const conflicts: string[] = [];
    for (const id of watch) {
      const was = beforeConflicts.get(id) ?? new Set<string>();
      const title = store.task(id, { archived: true }).title;
      for (const r of conflictsOf(store, id, today)) if (!was.has(r)) conflicts.push(id === root.id ? r : `${title}: ${r}`);
    }
    if (rootEvent && conflicts.length) store.amendEventAfter(rootEvent, { conflicts });
    return { moved, conflicts };
  });
}
