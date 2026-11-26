import type { DatabaseSync } from 'node:sqlite';
import type { DepInfo } from './derive.js';

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
