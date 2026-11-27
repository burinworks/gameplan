import type { DatabaseSync } from 'node:sqlite';

export interface SearchHit {
  type: 'project' | 'milestone' | 'task' | 'todo' | 'attachment' | 'inbox';
  id: string;
  title: string;
  project: string;
  path: string;
}

const TYPE_RANK: Record<SearchHit['type'], number> = { project: 0, milestone: 1, task: 2, todo: 3, attachment: 4, inbox: 5 };

/** Case-insensitive substring search over names, titles and urls; active projects first. */
export function search(db: DatabaseSync, q: string, limit = 20): SearchHit[] {
  const term = (q ?? '').trim();
  if (!term) return [];
  const like = `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const rows = db
    .prepare(
      `SELECT 'project' AS type, p.id, p.name AS title, p.slug, p.status, p.name AS path, p.ord AS o
         FROM projects p WHERE p.archived_at IS NULL AND (p.name LIKE :q ESCAPE '\\' OR p.slug LIKE :q ESCAPE '\\')
       UNION ALL
       SELECT 'milestone', m.id, m.name, p.slug, p.status, p.name || ' › ' || m.name, m.ord
         FROM milestones m JOIN projects p ON p.id = m.project_id
         WHERE m.archived_at IS NULL AND p.archived_at IS NULL AND m.name LIKE :q ESCAPE '\\'
       UNION ALL
       SELECT 'task', t.id, t.title, p.slug, p.status, p.name || ' › ' || m.name || ' › ' || t.title, t.ord
         FROM tasks t JOIN milestones m ON m.id = t.milestone_id JOIN projects p ON p.id = m.project_id
         WHERE t.archived_at IS NULL AND m.archived_at IS NULL AND p.archived_at IS NULL AND t.title LIKE :q ESCAPE '\\'
       UNION ALL
       SELECT 'todo', d.id, d.title, p.slug, p.status, p.name || ' › ' || m.name || ' › ' || t.title || ' › ' || d.title, d.ord
         FROM todos d JOIN tasks t ON t.id = d.task_id JOIN milestones m ON m.id = t.milestone_id JOIN projects p ON p.id = m.project_id
         WHERE d.archived_at IS NULL AND t.archived_at IS NULL AND m.archived_at IS NULL AND p.archived_at IS NULL AND d.title LIKE :q ESCAPE '\\'
       UNION ALL
       SELECT 'attachment', a.id, COALESCE(a.title, a.url), p.slug, p.status, p.name || ' › ' || t.title || ' › ' || COALESCE(a.title, a.url), 0
         FROM attachments a JOIN tasks t ON t.id = a.task_id JOIN milestones m ON m.id = t.milestone_id JOIN projects p ON p.id = m.project_id
         WHERE a.archived_at IS NULL AND t.archived_at IS NULL AND m.archived_at IS NULL AND p.archived_at IS NULL
           AND (a.title LIKE :q ESCAPE '\\' OR a.url LIKE :q ESCAPE '\\')
       UNION ALL
       SELECT 'inbox', i.id, i.text, '', 'active', 'Inbox › ' || i.text, 0
         FROM inbox_items i WHERE i.triaged_at IS NULL AND i.archived_at IS NULL AND i.text LIKE :q ESCAPE '\\'`,
    )
    .all({ q: like }) as { type: SearchHit['type']; id: string; title: string; slug: string; status: string; path: string; o: number }[];
  rows.sort(
    (a, b) =>
      Number(a.status !== 'active') - Number(b.status !== 'active') ||
      TYPE_RANK[a.type] - TYPE_RANK[b.type] ||
      a.o - b.o ||
      a.title.localeCompare(b.title),
  );
  return rows.slice(0, Math.max(1, limit)).map((r) => ({ type: r.type, id: r.id, title: r.title, project: r.slug, path: r.path }));
}
