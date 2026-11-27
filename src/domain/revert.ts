import type { Store, WCtx } from './store.js';
import { GameplanError, toEvent, type ArchivableEntity, type Ctx, type EventRow, type ReorderEntity, type TaskStatus } from './types.js';

const NOT_REVERTIBLE = new Set(['settings_changed', 'reverted']);

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function stale(ev: EventRow, what: string): never {
  throw new GameplanError('conflict', `cannot revert: ${ev.entity} "${ev.label ?? ev.entityId}" ${what} changed since — nothing was reverted`);
}

/** Current comparable snapshot of an entity (or null when it no longer exists). */
function snapshot(store: Store, ev: EventRow): Record<string, unknown> | null {
  try {
    switch (ev.entity) {
      case 'task':
        return { ...store.task(ev.entityId, { archived: true }) };
      case 'milestone':
        return { ...store.milestone(ev.entityId, { archived: true }) };
      case 'project': {
        const { areas: _a, ...p } = store.projectById(ev.entityId, { archived: true });
        return p;
      }
      case 'todo':
        return { ...store.todo(ev.entityId, { archived: true }) };
      case 'attachment':
        return { ...store.attachment(ev.entityId, { archived: true }) };
      default:
        return null;
    }
  } catch {
    return null;
  }
}

/** Every key of `after` that the snapshot knows must still hold. */
function expectAfter(store: Store, ev: EventRow, keys?: string[]): Record<string, unknown> {
  const snap = snapshot(store, ev);
  if (!snap) stale(ev, 'was deleted or');
  const after = ev.after ?? {};
  for (const k of keys ?? Object.keys(after)) if (k in snap && !same(snap[k], after[k])) stale(ev, `(${k})`);
  return snap;
}

function undo(store: Store, c: WCtx, ev: EventRow): void {
  const before = ev.before ?? {};
  const after = ev.after ?? {};
  switch (ev.kind) {
    case 'dates_changed':
      expectAfter(store, ev, ['start', 'end']);
      store.patchTask(c, ev.entityId, { start: before.start as string | null, end: before.end as string | null });
      return;
    case 'status_changed':
    case 'updated': {
      if ('areas' in after) throw new GameplanError('invalid', 'area changes cannot be reverted — edit the areas in project settings');
      expectAfter(store, ev, Object.keys(after));
      if (ev.entity === 'task') {
        const back = { ...before };
        if (back.status !== undefined) back.status = store.routeStatus(c, back.status as TaskStatus);
        store.patchTask(c, ev.entityId, back);
      }
      else if (ev.entity === 'milestone') store.patchMilestone(c, ev.entityId, before);
      else if (ev.entity === 'project') store.patchProject(c, ev.entityId, before);
      else if (ev.entity === 'todo') {
        if ('title' in before) store.q('UPDATE todos SET title = ? WHERE id = ?').run(before.title as string, ev.entityId);
        if ('after' in before) store.q('UPDATE todos SET after_json = ? WHERE id = ?').run(JSON.stringify(before.after), ev.entityId);
      } else throw new GameplanError('invalid', `cannot revert ${ev.kind} on ${ev.entity}`);
      return;
    }
    case 'review_accepted':
    case 'review_sent_back':
      expectAfter(store, ev, ['status']);
      store.patchTask(c, ev.entityId, { status: 'review' });
      return;
    case 'resume_noted': {
      const snap = expectAfter(store, ev, []);
      if (!same(snap.resumeNote, after.note)) stale(ev, '(resume note)');
      store.applyResumeNote(c, ev.entityId, (before.note as string | null) ?? null, { at: (before.at as string | null) ?? null, by: (before.by as string | null) ?? null });
      return;
    }
    case 'day_planned': {
      const cur = store.dayPlan(ev.entityId).map((x) => ({ taskId: x.taskId, when: x.when }));
      if (!same(cur, after.items)) stale(ev, '(plan)');
      store.applyDayPlan(ev.entityId, before.items as { taskId: string; when: string | null }[]);
      return;
    }
    case 'todo_done':
    case 'todo_undone':
      expectAfter(store, ev, ['done']);
      store.applyTodoDone(c, ev.entityId, ev.kind === 'todo_undone');
      return;
    case 'dependency_added': {
      const exists = store.q('SELECT 1 FROM dependencies WHERE id = ?').get(ev.entityId);
      if (!exists) stale(ev, 'was removed or');
      store.removeDependency(c, ev.entityId);
      return;
    }
    case 'dependency_removed': {
      const target = before.toTaskId ? { taskId: String(before.toTaskId) } : { milestoneId: String(before.toMilestoneId) };
      store.addDependency(c, String(before.fromTaskId), target);
      return;
    }
    case 'attached': {
      const snap = expectAfter(store, ev, ['role', 'kind', 'title', 'state', 'archivedAt']);
      if (ev.before === null) {
        store.q('UPDATE attachments SET archived_at = ? WHERE id = ?').run(store.clock.now(), ev.entityId);
      } else {
        store
          .q('UPDATE attachments SET role = ?, kind = ?, title = ?, state = ?, archived_at = ? WHERE id = ?')
          .run(String(before.role ?? snap.role), String(before.kind ?? snap.kind), (before.title as string | null) ?? null, (before.state as string | null) ?? null, (before.archivedAt as string | null) ?? null, ev.entityId);
      }
      return;
    }
    case 'detached':
      expectAfter(store, ev, ['archivedAt']);
      store.q('UPDATE attachments SET archived_at = NULL WHERE id = ?').run(ev.entityId);
      return;
    case 'archived':
      expectAfter(store, ev, ['archivedAt']);
      store.applyRestore(c, ev.entity as ArchivableEntity, ev.entityId);
      return;
    case 'restored':
      expectAfter(store, ev, ['archivedAt']);
      store.applyArchive(c, ev.entity as ArchivableEntity, ev.entityId);
      return;
    case 'created': {
      if (!['project', 'milestone', 'task', 'todo'].includes(ev.entity)) throw new GameplanError('invalid', `cannot revert creating a ${ev.entity}`);
      const snap = expectAfter(store, ev, Object.keys(after).filter((k) => k !== 'areas'));
      if (snap.archivedAt) stale(ev, 'was archived or');
      store.applyArchive(c, ev.entity as ArchivableEntity, ev.entityId);
      return;
    }
    case 'planned':
      return; // its children are in the same batch
    case 'reordered': {
      const entity = ev.entity as ReorderEntity;
      const ids = after.ids as string[];
      const table = { project: 'projects', milestone: 'milestones', task: 'tasks', todo: 'todos', area: 'areas' }[entity];
      const current = ids.map((id) => store.q(`SELECT ord FROM ${table} WHERE id = ?`).get(id) as { ord: number } | undefined);
      const order = ids
        .map((id, i) => ({ id, ord: current[i]?.ord }))
        .filter((x) => x.ord !== undefined)
        .sort((a, b) => a.ord! - b.ord!)
        .map((x) => x.id);
      if (!same(order, ids.filter((_, i) => current[i] !== undefined))) stale(ev, 'order');
      store.applyOrder(entity, before.ids as string[]);
      return;
    }
    default:
      throw new GameplanError('invalid', `events of kind ${ev.kind} cannot be reverted`);
  }
}

/**
 * Reverts the event's whole batch, newest first, by applying inverse changes. Each entity must
 * still look like the event left it, else `conflict` and nothing is written. Writes one `reverted`
 * event per reverted event, in a new batch.
 */
export function revert(store: Store, ctx: Ctx, eventId: string): { reverted: number; batchId: string } {
  const row = store.q('SELECT * FROM events WHERE id = ?').get(eventId) as Record<string, unknown> | undefined;
  if (!row) throw new GameplanError('not_found', `event ${eventId} not found`);
  const target = toEvent(row);
  if (NOT_REVERTIBLE.has(target.kind)) throw new GameplanError('invalid', `${target.kind} events cannot be reverted`);

  return store.write({ actor: ctx.actor, reason: ctx.reason }, (c) => {
    const batch = (store.q('SELECT * FROM events WHERE batch_id = ? ORDER BY rowid DESC').all(target.batchId) as Record<string, unknown>[])
      .map(toEvent)
      .filter((e) => !NOT_REVERTIBLE.has(e.kind));
    const done = store.q("SELECT 1 FROM events WHERE kind = 'reverted' AND json_extract(after_json, '$.revertOf') IN (SELECT id FROM events WHERE batch_id = ?) LIMIT 1").get(target.batchId);
    if (done) throw new GameplanError('conflict', 'this change was already reverted');
    for (const ev of batch) {
      store.quietly(() => undo(store, c, ev));
      store.record(c, {
        entity: ev.entity,
        entityId: ev.entityId,
        projectId: ev.projectId,
        label: ev.label,
        kind: 'reverted',
        before: ev.after,
        after: { ...(ev.before ?? {}), revertOf: ev.id, revertedKind: ev.kind },
        reason: ctx.reason ?? `undo ${ev.kind.replace('_', ' ')}`,
      });
    }
    return { reverted: batch.length, batchId: c.batchId };
  });
}
