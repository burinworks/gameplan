import { describe, expect, it } from 'vitest';
import { projectTree, taskDetail } from '../src/domain/queries.js';
import { revert } from '../src/domain/revert.js';
import { expectCode, setup, YOU } from './helpers.js';

function base() {
  const s = setup();
  s.store.createProject(YOU, { name: 'P', firstMilestone: { name: 'M' } });
  const ms = (s.db.prepare('SELECT id FROM milestones').get() as { id: string }).id;
  const t = s.store.createTask(YOU, ms, { title: 'T' });
  return { ...s, t };
}

describe('resume notes', () => {
  it('stores note, by and at; trims', () => {
    const { store, t } = base();
    const r = store.setResumeNote({ actor: 'ai:claude-code' }, t.id, '  Stopped at the parser; next: tests  ');
    expect(r).toMatchObject({ resumeNote: 'Stopped at the parser; next: tests', resumeBy: 'ai:claude-code', resumeAt: '2026-11-26T09:00:00.000Z' });
  });

  it('rejects multi-line and > 200 chars', () => {
    const { store, t } = base();
    expectCode(() => store.setResumeNote(YOU, t.id, 'one\ntwo'), 'invalid', 'one line');
    expectCode(() => store.setResumeNote(YOU, t.id, 'x'.repeat(201)), 'invalid', '200');
    store.setResumeNote(YOU, t.id, 'x'.repeat(200));
  });

  it("'' clears it", () => {
    const { store, t } = base();
    store.setResumeNote(YOU, t.id, 'something');
    expect(store.setResumeNote(YOU, t.id, '')).toMatchObject({ resumeNote: null, resumeAt: null, resumeBy: null });
  });

  it('revert restores the previous note', () => {
    const { store, t, db } = base();
    store.setResumeNote({ actor: 'ai:codex' }, t.id, 'first');
    store.setResumeNote(YOU, t.id, 'second');
    const ev = db.prepare("SELECT id FROM events WHERE kind = 'resume_noted' ORDER BY rowid DESC LIMIT 1").get() as { id: string };
    revert(store, YOU, ev.id);
    expect(store.task(t.id)).toMatchObject({ resumeNote: 'first', resumeBy: 'ai:codex' });
  });

  it('projectTree and taskDetail expose resume', () => {
    const { store, t, db } = base();
    expect(projectTree(db, 'p', '2026-11-26').milestones[0]!.tasks[0]!.resume).toBeNull();
    store.setResumeNote(YOU, t.id, 'left off here');
    expect(projectTree(db, 'p', '2026-11-26').milestones[0]!.tasks[0]!.resume).toEqual({ note: 'left off here', at: '2026-11-26T09:00:00.000Z', by: 'you' });
    expect(taskDetail(db, t.id, '2026-11-26').resume?.note).toBe('left off here');
  });
});
