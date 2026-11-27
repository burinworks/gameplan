import type { DatabaseSync } from 'node:sqlite';

export const TABLES = ['projects', 'areas', 'milestones', 'tasks', 'todos', 'dependencies', 'attachments', 'events', 'settings', 'agent_clients', 'day_plan_items', 'inbox_items'] as const;

/** Every table, raw rows. */
export function exportJson(db: DatabaseSync): { schemaVersion: number; tables: Record<string, unknown[]> } {
  const schemaVersion = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) tables[t] = db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all();
  return { schemaVersion, tables };
}

type Row = Record<string, string | number | null> & { id: string };

/** Human-readable plan: `# project`, `## milestone (due)`, `- [ ] task (start → end)`, to-dos indented. */
export function exportMarkdown(db: DatabaseSync, slug?: string): string {
  const projects = (
    slug
      ? db.prepare('SELECT * FROM projects WHERE slug = ? AND archived_at IS NULL').all(slug)
      : db.prepare('SELECT * FROM projects WHERE archived_at IS NULL ORDER BY ord, rowid').all()
  ) as Row[];
  const out: string[] = [];
  for (const p of projects) {
    out.push(`# ${p.name}`, '');
    if (p.status !== 'active') out.push(`Status: ${p.status}`, '');
    const milestones = db.prepare('SELECT * FROM milestones WHERE project_id = ? AND archived_at IS NULL ORDER BY ord, rowid').all(p.id) as Row[];
    for (const m of milestones) {
      out.push(`## ${m.name}${m.due ? ` (${m.due})` : ''}`);
      if (m.description) out.push('', String(m.description));
      out.push('');
      const tasks = db.prepare('SELECT * FROM tasks WHERE milestone_id = ? AND archived_at IS NULL ORDER BY ord, rowid').all(m.id) as Row[];
      for (const t of tasks) {
        const box = t.status === 'done' ? 'x' : t.status === 'cancelled' ? '-' : ' ';
        out.push(`- [${box}] ${t.title}${t.start ? ` (${t.start} → ${t.end})` : ''}`);
        const todos = db.prepare('SELECT * FROM todos WHERE task_id = ? AND archived_at IS NULL ORDER BY ord, rowid').all(t.id) as Row[];
        for (const d of todos) out.push(`  - [${d.done ? 'x' : ' '}] ${d.title}`);
      }
      if (tasks.length) out.push('');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
