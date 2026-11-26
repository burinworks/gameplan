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
