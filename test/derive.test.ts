import { describe, expect, it } from 'vitest';
import { linkIsBad, milestoneHealth, milestoneSpan, rollup, taskHealth, taskProgress, todoStates } from '../src/domain/derive.js';

const td = (id: string, done: boolean, ord: number, after: string[] = []) => ({ id, done, ord, after });

describe('progress', () => {
  it('task progress from to-dos', () => {
    expect(taskProgress('doing', [{ done: true }, { done: false }, { done: false }, { done: false }])).toEqual({ pct: 25, done: 1, total: 4 });
  });
  it('task without to-dos counts by status', () => {
    expect(taskProgress('todo', [])).toEqual({ pct: 0, done: 0, total: 1 });
    expect(taskProgress('done', [])).toEqual({ pct: 100, done: 1, total: 1 });
  });
  it('rolls up units, excluding cancelled', () => {
    const r = rollup([
      { status: 'doing', todos: [{ done: true }, { done: true }, { done: true }, { done: false }] },
      { status: 'done', todos: [] },
      { status: 'cancelled', todos: [{ done: false }] },
    ]);
    expect(r).toEqual({ pct: 80, done: 4, total: 5 });
    expect(rollup([])).toEqual({ pct: 0, done: 0, total: 0 });
  });
});

describe('todoStates', () => {
  it('done, next, locked, open', () => {
    expect(todoStates([td('a', true, 0), td('b', false, 1), td('c', false, 2, ['b'])])).toEqual({ a: 'done', b: 'next', c: 'locked' });
    expect(todoStates([td('a', false, 0), td('b', false, 1, [])])).toEqual({ a: 'next', b: 'open' });
    expect(todoStates([td('b', false, 1), td('a', false, 0, ['b'])])).toEqual({ a: 'locked', b: 'next' });
  });
});

describe('taskHealth', () => {
  const open = { status: 'doing' as const };
  it('late with days', () => {
    expect(taskHealth({ ...open, start: '2026-11-10', end: '2026-11-19' }, [], null, '2026-11-26')).toEqual({ health: 'late', reasons: ['7 days late'], daysLate: 7 });
  });
  it('conflict when starting before a dependency ends', () => {
    const h = taskHealth({ ...open, start: '2026-11-27', end: '2026-12-02' }, [{ title: 'README', end: '2026-11-30', open: true }], null, '2026-11-26');
    expect(h).toEqual({ health: 'conflict', reasons: ['Starts before README ends'] });
  });
  it('conflict when ending after milestone due; none for Backlog (due null)', () => {
    const t = { ...open, start: '2026-11-27', end: '2026-12-20' };
    expect(taskHealth(t, [], { name: 'M4', due: '2026-12-12' }, '2026-11-26').reasons).toEqual(['Ends after M4 due']);
    expect(taskHealth(t, [], { name: 'Backlog', due: null }, '2026-11-26').health).toBe('on_track');
  });
  it('undated → unscheduled, never late', () => {
    expect(taskHealth({ ...open, start: null, end: null }, [{ title: 'X', end: '2030-01-01', open: true }], null, '2026-11-26').health).toBe('unscheduled');
  });
  it('done wins', () => {
    expect(taskHealth({ status: 'done', start: '2026-01-01', end: '2026-01-02' }, [], null, '2026-11-26').health).toBe('done');
  });
  it('linkIsBad', () => {
    expect(linkIsBad('2026-11-30', '2026-11-30')).toBe(true);
    expect(linkIsBad('2026-11-29', '2026-11-30')).toBe(false);
    expect(linkIsBad(null, '2026-11-30')).toBe(false);
  });
});

describe('milestone', () => {
  it('span = earliest start → due (or latest end)', () => {
    const tasks = [{ start: '2026-11-20', end: '2026-11-25' }, { start: '2026-11-18', end: '2026-12-01' }, { start: null, end: null }];
    expect(milestoneSpan(tasks, '2026-12-12')).toEqual({ start: '2026-11-18', end: '2026-12-12' });
    expect(milestoneSpan(tasks, null)).toEqual({ start: '2026-11-18', end: '2026-12-01' });
    expect(milestoneSpan([], null)).toEqual({ start: null, end: null });
    expect(milestoneSpan([], '2026-12-12')).toEqual({ start: '2026-12-12', end: '2026-12-12' });
  });
  it('missed when due passed and not done', () => {
    expect(milestoneHealth(['on_track'], '2026-11-20', 'active', '2026-11-26')).toEqual({ health: 'late', missed: true, atRisk: true });
    expect(milestoneHealth(['on_track', 'conflict'], '2026-12-20', 'active', '2026-11-26')).toEqual({ health: 'conflict', missed: false, atRisk: true });
    expect(milestoneHealth(['late'], '2026-11-20', 'done', '2026-11-26')).toEqual({ health: 'done', missed: false, atRisk: false });
    expect(milestoneHealth([], null, 'planned', '2026-11-26')).toEqual({ health: 'on_track', missed: false, atRisk: false });
  });
});
