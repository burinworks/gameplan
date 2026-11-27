// Pure timeline geometry. All dates are YYYY-MM-DD; day math is UTC.

export type Zoom = 'week' | 'month';

export const DAY_W: Record<Zoom, number> = { week: 16, month: 6 };
export const ROW_PITCH = 46;
export const BAR_H = 26;
export const BAR_GAP = 8;
export const HEADER_H = 40;

const MS_DAY = 86_400_000;

function toMs(d: string): number {
  const [y = 0, m = 1, day = 1] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDays(d: string, n: number): string {
  return fromMs(toMs(d) + n * MS_DAY);
}

/** Whole days from `from` to `d` (negative when `d` is earlier). */
export function dayIndex(from: string, d: string): number {
  return Math.round((toMs(d) - toMs(from)) / MS_DAY);
}

export function barGeom(
  start: string,
  end: string,
  from: string,
  to: string,
  dayW: number,
): { x: number; w: number; clippedStart: boolean; clippedEnd: boolean } | null {
  const s = dayIndex(from, start);
  const e = dayIndex(from, end);
  const last = dayIndex(from, to);
  if (e < 0 || s > last) return null;
  const clippedStart = s < 0;
  const clippedEnd = e > last;
  const cs = Math.max(s, 0);
  const ce = Math.min(e, last);
  const days = ce - cs + 1;
  return {
    x: cs * dayW,
    w: Math.max(days * dayW - BAR_GAP, dayW - 2),
    clippedStart,
    clippedEnd,
  };
}

export function todayX(from: string, today: string, dayW: number): number {
  return dayIndex(from, today) * dayW + dayW / 2;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Matches fmtDate: "Nov 16", with ", 2027" appended when the year differs from today's.
function monthDay(d: string, today: string): string {
  const [y = 0, m = 1, day = 1] = d.split('-').map(Number);
  const base = `${MONTHS[m - 1]} ${day}`;
  return y === Number(today.slice(0, 4)) ? base : `${base}, ${y}`;
}

function weekday(d: string): number {
  return new Date(toMs(d)).getUTCDay(); // 0 = Sunday
}

export function weekTicks(
  from: string,
  to: string,
  dayW: number,
  weekStart: 'mon' | 'sun',
  today: string,
): { x: number; label: string }[] {
  const startDow = weekStart === 'mon' ? 1 : 0;
  const last = dayIndex(from, to);
  const out: { x: number; label: string }[] = [];
  for (let i = 0; i <= last; i++) {
    const d = addDays(from, i);
    if (weekday(d) === startDow) out.push({ x: i * dayW, label: monthDay(d, today) });
  }
  return out;
}

export function weekendCols(from: string, to: string, dayW: number): { x: number; w: number }[] {
  const last = dayIndex(from, to);
  const out: { x: number; w: number }[] = [];
  for (let i = 0; i <= last; i++) {
    const dow = weekday(addDays(from, i));
    if (dow === 6) {
      const days = i + 1 <= last ? 2 : 1;
      out.push({ x: i * dayW, w: days * dayW });
    } else if (dow === 0 && i === 0) {
      out.push({ x: 0, w: dayW }); // range opens on a Sunday
    }
  }
  return out;
}

export function arrowPath(a: { x2: number; y: number }, b: { x1: number; y: number }): string {
  if (b.x1 - a.x2 >= 16) {
    const mid = a.x2 + 8;
    return `M${a.x2} ${a.y} H${mid} V${b.y} H${b.x1 - 2}`;
  }
  const midY = a.y === b.y ? a.y + ROW_PITCH / 2 : (a.y + b.y) / 2;
  return `M${a.x2} ${a.y} H${a.x2 + 8} V${midY} H${b.x1 - 10} V${b.y} H${b.x1 - 2}`;
}

export function dragDates(
  kind: 'move' | 'start' | 'end',
  orig: { start: string; end: string },
  dxPx: number,
  dayW: number,
): { start: string; end: string } {
  const delta = Math.round(dxPx / dayW);
  if (kind === 'move') return { start: addDays(orig.start, delta), end: addDays(orig.end, delta) };
  if (kind === 'start') {
    const s = addDays(orig.start, delta);
    return { start: s > orig.end ? orig.end : s, end: orig.end };
  }
  const e = addDays(orig.end, delta);
  return { start: orig.start, end: e < orig.start ? orig.start : e };
}

/** 12px Inter 500 width estimate: 9px left padding, 6.6px per character, 8px right. */
export function labelFits(label: string, w: number): boolean {
  return w >= 9 + label.length * 6.6 + 8;
}
