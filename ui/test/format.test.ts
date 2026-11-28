import { describe, expect, it } from 'vitest';
import {
  errorLine, executorLabel, fmtActor, fmtActorAt, fmtAgo, fmtDate, fmtDue, fmtHeaderDate,
  fmtLate, fmtPct, fmtRange, fmtTodos, statusLabel,
} from '../src/lib/format';

const T = '2026-11-27';
const now = new Date('2026-11-27T12:00:00Z');

describe('format', () => {
  it('dates', () => {
    expect(fmtDate('2026-11-27', T)).toBe('Nov 27');
    expect(fmtDate('2027-01-04', T)).toBe('Jan 4, 2027');
    expect(fmtHeaderDate('2026-11-27')).toBe('Friday, 27 November');
    expect(fmtRange('2026-11-28', '2026-12-03', T)).toBe('Nov 28 → Dec 3');
    expect(fmtRange(null, '2026-12-03', T)).toBe('— → Dec 3');
    expect(fmtRange(null, null, T)).toBe('—');
  });
  it('relative time', () => {
    expect(fmtAgo('2026-11-27T11:59:30Z', now)).toBe('now');
    expect(fmtAgo('2026-11-27T11:55:00Z', now)).toBe('5m');
    expect(fmtAgo('2026-11-27T10:00:00Z', now)).toBe('2h');
    expect(fmtAgo('2026-11-26T09:00:00Z', now)).toBe('yesterday');
    expect(fmtAgo('2026-11-24T09:00:00Z', now)).toBe('3d');
    expect(fmtAgo('2026-11-10T09:00:00Z', now)).toBe('Nov 10');
  });
  it('actors', () => {
    expect(fmtActor('you')).toBe('You');
    expect(fmtActor('ai:Claude Code')).toBe('Claude Code');
    expect(fmtActor('ai:')).toBe('Agent');
    expect(fmtActorAt('ai:Codex', '2026-11-27T10:00:00Z', now)).toBe('Codex · 2h');
  });
  it('lateness, due, counts', () => {
    expect(fmtLate(1)).toBe('1 day late');
    expect(fmtLate(7)).toBe('7 days late');
    expect(fmtDue('2026-11-27', T)).toBe('due today');
    expect(fmtDue('2026-11-28', T)).toBe('due tomorrow');
    expect(fmtDue('2026-12-03', T)).toBe('Dec 3');
    expect(fmtTodos(3, 4)).toBe('3/4 to-dos');
    expect(fmtPct(37.6)).toBe('38%');
  });
  it('labels', () => {
    expect(executorLabel('manual')).toBe('Me');
    expect(executorLabel('ai')).toBe('AI');
    expect(executorLabel('together')).toBe('Together');
    expect(statusLabel('todo')).toBe('To do');
    expect(statusLabel('conflict')).toBe('Conflict');
  });
  it('errors', () => {
    expect(errorLine({ code: 'conflict', message: 'changed since' })).toBe('Changed since — reload to see the latest');
    expect(errorLine({ code: 'invalid', message: 'area "AI" is used by 2 task(s): "A", "B" — move them first' })).toBe('Area "AI" is used by 2 task(s): "A", "B" — move them first');
    expect(errorLine({ code: 'invalid', message: 'dependency cycle: A → B → A' })).toBe('Would create a loop');
    expect(errorLine({ code: 'invalid', message: 'would create a cycle: a → b → a' })).toBe('Would create a loop');
    expect(errorLine({ code: 'network', message: '' })).toBe("Gameplan engine isn't running");
    expect(errorLine({ code: 'forbidden', message: 'agents cannot do that.' })).toBe('Agents cannot do that.');
    expect(errorLine({ code: 'other', message: 'bad thing happened.' })).toBe('Bad thing happened');
  });
});
