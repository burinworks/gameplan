import { describe, expect, it } from 'vitest';
import { exportJson, exportMarkdown } from '../src/export.js';
import { setup, YOU } from './helpers.js';

describe('export', () => {
  it('markdown per project with milestones, tasks and to-dos', () => {
    const { store, db } = setup();
    store.createProject(YOU, { name: 'mcp-pipe', firstMilestone: { name: 'M4 · Launch', due: '2026-12-12' } });
    const ms = (db.prepare('SELECT id FROM milestones').get() as { id: string }).id;
    const t = store.createTask(YOU, ms, { title: 'README', start: '2026-11-20', end: '2026-11-30', todos: [{ title: 'Draft' }, { title: 'Review' }] });
    store.setTodoDone(YOU, store.todosOf(t.id)[0]!.id, true);
    store.createTask(YOU, ms, { title: 'Undated' });
    store.createMilestone(YOU, 'mcp-pipe', { name: 'Backlog' });
    store.createProject(YOU, { name: 'Other' });
    const md = exportMarkdown(db, 'mcp-pipe');
    expect(md).toContain('# mcp-pipe');
    expect(md).toContain('## M4 · Launch (2026-12-12)');
    expect(md).toContain('- [ ] README (2026-11-20 → 2026-11-30)');
    expect(md).toContain('  - [x] Draft');
    expect(md).toContain('  - [ ] Review');
    expect(md).toContain('- [ ] Undated\n');
    expect(md).toContain('## Backlog\n');
    expect(md).not.toContain('# Other');
    expect(exportMarkdown(db)).toContain('# Other');
  });

  it('json has every table', () => {
    const { store, db } = setup();
    store.createProject(YOU, { name: 'P' });
    const j = exportJson(db) as { schemaVersion: number; tables: Record<string, unknown[]> };
    expect(j.schemaVersion).toBe(1);
    expect(Object.keys(j.tables).sort()).toEqual(['agent_clients', 'areas', 'attachments', 'dependencies', 'events', 'milestones', 'projects', 'settings', 'tasks', 'todos']);
    expect(j.tables.projects!.length).toBe(1);
  });
});
