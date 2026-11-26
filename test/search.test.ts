import { describe, expect, it } from 'vitest';
import { search } from '../src/domain/search.js';
import { setup, YOU } from './helpers.js';

describe('search', () => {
  it('finds tasks, attachments, projects case-insensitively; active first', () => {
    const { store, db } = setup();
    store.createProject(YOU, { name: 'mcp-pipe', firstMilestone: { name: 'M4 · Launch' } });
    const ms = (db.prepare('SELECT id FROM milestones').get() as { id: string }).id;
    const t = store.createTask(YOU, ms, { title: 'README', todos: [{ title: 'Proofread intro' }] });
    store.attach(YOU, t.id, { role: 'context', url: '~/repos/mcp-pipe/README.md' });
    store.createProject(YOU, { name: 'Ready set', firstMilestone: { name: 'x' } });
    store.configureProject(YOU, 'ready-set', { status: 'paused' });
    const r = search(db, 'read');
    expect(r.map((x) => [x.type, x.title])).toEqual([
      ['task', 'README'],
      ['todo', 'Proofread intro'],
      ['attachment', 'README.md'],
      ['project', 'Ready set'],
    ]);
    expect(r[0]!.path).toBe('mcp-pipe › M4 · Launch › README');
    expect(search(db, '  ')).toEqual([]);
    expect(search(db, '%')).toEqual([]);
  });

  it('skips archived things', () => {
    const { store, db } = setup();
    store.createProject(YOU, { name: 'P', firstMilestone: { name: 'M' } });
    const ms = (db.prepare('SELECT id FROM milestones').get() as { id: string }).id;
    const t = store.createTask(YOU, ms, { title: 'Hidden thing' });
    store.archive(YOU, 'task', t.id);
    expect(search(db, 'hidden')).toEqual([]);
  });
});
