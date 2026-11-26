import { diffDays } from '../clock.js';
import type { TaskStatus } from './types.js';

export type Health = 'done' | 'unscheduled' | 'late' | 'conflict' | 'on_track';

export interface DepInfo {
  title: string;
  end: string | null;
  open: boolean;
}

export interface HealthTask {
  status: TaskStatus;
  start: string | null;
  end: string | null;
}

/** A finish-to-start link is bad when the prerequisite ends on/after the dependent starts. */
export function linkIsBad(fromEnd: string | null, toStart: string | null): boolean {
  return fromEnd !== null && toStart !== null && fromEnd >= toStart;
}

export function taskHealth(
  task: HealthTask,
  deps: DepInfo[],
  milestone: { name: string; due: string | null } | null,
  today: string,
): { health: Health; reasons: string[]; daysLate?: number } {
  if (task.status === 'done' || task.status === 'cancelled') return { health: 'done', reasons: [] };
  if (task.start === null || task.end === null) return { health: 'unscheduled', reasons: [] };
  if (task.end < today) {
    const n = diffDays(task.end, today);
    return { health: 'late', reasons: [`${n} day${n === 1 ? '' : 's'} late`], daysLate: n };
  }
  const reasons: string[] = [];
  for (const d of deps) if (d.open && linkIsBad(d.end, task.start)) reasons.push(`Starts before ${d.title} ends`);
  if (milestone?.due && task.end > milestone.due) reasons.push(`Ends after ${milestone.name} due`);
  return reasons.length ? { health: 'conflict', reasons } : { health: 'on_track', reasons: [] };
}

export interface Progress {
  pct: number;
  done: number;
  total: number;
}

const pctOf = (done: number, total: number): number => (total === 0 ? 0 : Math.round((done / total) * 100));

export function taskProgress(status: TaskStatus, todos: { done: boolean }[]): Progress {
  if (todos.length) {
    const done = todos.filter((t) => t.done).length;
    return { pct: pctOf(done, todos.length), done, total: todos.length };
  }
  const done = status === 'done' ? 1 : 0;
  return { pct: done * 100, done, total: 1 };
}

/** Units: each to-do = 1, a task without to-dos = 1. Cancelled tasks are excluded. */
export function rollup(tasks: { status: TaskStatus; todos: { done: boolean }[] }[]): Progress {
  let done = 0;
  let total = 0;
  for (const t of tasks) {
    if (t.status === 'cancelled') continue;
    const p = taskProgress(t.status, t.todos);
    done += p.done;
    total += p.total;
  }
  return { pct: pctOf(done, total), done, total };
}

export type TodoState = 'done' | 'next' | 'locked' | 'open';

export function todoStates(todos: { id: string; done: boolean; ord: number; after: string[] }[]): Record<string, TodoState> {
  const byId = new Map(todos.map((t) => [t.id, t]));
  const out: Record<string, TodoState> = {};
  let nextGiven = false;
  for (const t of [...todos].sort((a, b) => a.ord - b.ord)) {
    if (t.done) {
      out[t.id] = 'done';
      continue;
    }
    const locked = t.after.some((a) => byId.has(a) && !byId.get(a)!.done);
    if (locked) out[t.id] = 'locked';
    else if (!nextGiven) {
      out[t.id] = 'next';
      nextGiven = true;
    } else out[t.id] = 'open';
  }
  return out;
}

/** Earliest dated start → due (or latest end when due is null). */
export function milestoneSpan(tasks: { start: string | null; end: string | null }[], due: string | null): { start: string | null; end: string | null } {
  const dated = tasks.filter((t) => t.start !== null && t.end !== null);
  const start = dated.length ? dated.map((t) => t.start!).sort()[0]! : null;
  const latest = dated.length ? dated.map((t) => t.end!).sort().at(-1)! : null;
  const end = due ?? latest;
  if (start === null) return { start: end, end };
  return { start: end !== null && end < start ? end : start, end };
}

export function milestoneHealth(
  taskHealths: Health[],
  due: string | null,
  status: string,
  today: string,
): { health: 'done' | 'late' | 'conflict' | 'on_track'; missed: boolean; atRisk: boolean } {
  if (status === 'done') return { health: 'done', missed: false, atRisk: false };
  const missed = due !== null && due < today;
  const health = missed || taskHealths.includes('late') ? 'late' : taskHealths.includes('conflict') ? 'conflict' : 'on_track';
  return { health, missed, atRisk: health !== 'on_track' };
}
