import { describe, expect, it } from 'vitest';
import { projectTree } from '../src/domain/queries.js';
import { listTemplates, TEMPLATES } from '../src/domain/templates.js';
import { expectCode, setup, YOU } from './helpers.js';

describe('templates', () => {
  it('lists the three built-ins with counts', () => {
    expect(listTemplates().map(({ id, name, milestones, tasks }) => ({ id, name, milestones, tasks }))).toEqual([
      { id: 'report', name: 'Report', milestones: 3, tasks: 9 },
      { id: 'launch', name: 'Launch', milestones: 4, tasks: 14 },
      { id: 'research', name: 'Research', milestones: 3, tasks: 8 },
    ]);
  });

  it('lists each template areas and milestone offsets for previews', () => {
    const report = listTemplates()[0]!;
    expect(report.areas).toEqual(['Research', 'Data', 'Writing', 'Design']);
    expect(report.milestoneOffsets).toEqual([
      { name: 'Outline', offsetDays: 4 },
      { name: 'Draft', offsetDays: 11 },
      { name: 'Final', offsetDays: 32 },
    ]);
  });

  it('creates a Report project from a start date in one batch', () => {
    const { store, db } = setup();
    const p = store.createProject(YOU, { name: 'Q1 board report', template: 'report', startDate: '2026-12-07', firstMilestone: { name: 'ignored' } });
    expect(p.areas.map((a) => a.name)).toEqual(['Research', 'Data', 'Writing', 'Design']);
    const tree = projectTree(db, p.slug, '2026-12-07');
    expect(tree.milestones.map((m) => [m.name, m.due])).toEqual([
      ['Outline', '2026-12-11'],
      ['Draft', '2026-12-18'],
      ['Final', '2027-01-08'],
    ]);
    const tasks = tree.milestones.flatMap((m) => m.tasks);
    expect(tasks).toHaveLength(9);
    expect(tasks.every((t) => t.start && t.end && t.todos.length > 0)).toBe(true);
    expect(tasks.filter((t) => t.health === 'conflict')).toEqual([]);
    expect(db.prepare('SELECT count(DISTINCT batch_id) AS n FROM events').get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT count(*) AS n FROM events WHERE kind = 'planned'").get()).toEqual({ n: 3 });
  });

  it('every built-in plans without conflicts and keeps given areas', () => {
    for (const t of TEMPLATES) {
      const { store, db } = setup();
      const p = store.createProject(YOU, { name: t.name, template: t.id, startDate: '2026-12-07', areas: [{ name: 'Legal' }] });
      expect(p.areas.map((a) => a.name)).toEqual([...t.areas.map((a) => a.name), 'Legal']);
      const tasks = projectTree(db, p.slug, '2026-12-07').milestones.flatMap((m) => m.tasks);
      expect(tasks).toHaveLength(t.tasks.length);
      expect(tasks.filter((x) => x.health === 'conflict').map((x) => x.title)).toEqual([]);
    }
  });

  it('rejects an unknown template', () => {
    const { store } = setup();
    expectCode(() => store.createProject(YOU, { name: 'X', template: 'nope' as never }), 'invalid');
  });
});
