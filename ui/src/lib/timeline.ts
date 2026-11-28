// Pure timeline geometry. All dates are YYYY-MM-DD; day math is UTC.

export type Zoom = 'day' | 'week' | 'month';
/** `home` is the all-projects overview; `project` is the single-project timeline with its wider label column. */
export type TimelineVariant = 'home' | 'project';

export const DAY_W: Record<Zoom, number> = { day: 40, week: 16, month: 6 };
/** The project timeline runs a little tighter than Home at week zoom. */
export const PROJECT_DAY_W: Record<Zoom, number> = { day: 40, week: 13, month: 6 };
export const ROW_PITCH = 46;
export const PROJECT_ROW_PITCH = 40;
export const BAR_H = 26;
export const PROJECT_BAR_H = 24;
export const PROJECT_GROUP_H = 38;
export const HOME_GROUP_H = 30;
export const BAR_GAP = 8;
/** Date strip at the top of the canvas. */
export const STRIP_H = 32;
/** Lane under the date strip that holds the "Today" label, so it never sits on a bar or a diamond. */
export const TODAY_LANE_H = 16;
export const HEADER_H = STRIP_H + TODAY_LANE_H;

const MS_DAY = 86_400_000;

function toMs(d: string): number {
  const [y = 0, m = 1, day = 1] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
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

/** Today's line sits on the left edge of today's column. */
export function todayX(from: string, today: string, dayW: number): number {
  return dayIndex(from, today) * dayW;
}

export function dayWidth(zoom: Zoom, variant: TimelineVariant = 'home'): number {
  return (variant === 'project' ? PROJECT_DAY_W : DAY_W)[zoom];
}

/** First day of the week that contains `d`. */
export function weekStartOf(d: string, weekStart: 'mon' | 'sun'): string {
  const startDow = weekStart === 'mon' ? 1 : 0;
  const back = (weekday(d) - startDow + 7) % 7;
  return addDays(d, -back);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parts(d: string): { y: number; m: number; day: number } {
  const [y = 0, m = 1, day = 1] = d.split('-').map(Number);
  return { y, m, day };
}

function weekday(d: string): number {
  return new Date(toMs(d)).getUTCDay(); // 0 = Sunday
}

/** "November 2026": the month and year at a date, shown in the corner above the label column. */
export function monthYear(d: string): string {
  const { y, m } = parts(d);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

export interface Tick {
  x: number;
  label: string;
  /** The label names a month ("Dec 1", "Dec 7"); drawn a step stronger than plain day numbers. */
  month?: true;
}

/** Week zoom: a tick per week start. The first week starting in a month reads "Dec 7"; the others just "14". */
export function weekTicks(from: string, to: string, dayW: number, weekStart: 'mon' | 'sun'): Tick[] {
  const startDow = weekStart === 'mon' ? 1 : 0;
  const last = dayIndex(from, to);
  const out: Tick[] = [];
  let prevMonth = -1;
  for (let i = 0; i <= last; i++) {
    const d = addDays(from, i);
    if (weekday(d) !== startDow) continue;
    const { m, day } = parts(d);
    out.push(m !== prevMonth ? { x: i * dayW, label: `${MONTHS[m - 1]} ${day}`, month: true } : { x: i * dayW, label: String(day) });
    prevMonth = m;
  }
  return out;
}

/** Day zoom: a tick every day. Only the 1st of a month carries the month ("Dec 1", then "2", "3"…). */
export function dayTicks(from: string, to: string, dayW: number): Tick[] {
  const last = dayIndex(from, to);
  const out: Tick[] = [];
  for (let i = 0; i <= last; i++) {
    const { m, day } = parts(addDays(from, i));
    out.push(day === 1 ? { x: i * dayW, label: `${MONTHS[m - 1]} ${day}`, month: true } : { x: i * dayW, label: String(day) });
  }
  return out;
}

/** Month zoom: a tick on the 1st of each month, "Dec", or "Jan 2027" when the year is not today's. */
export function monthTicks(from: string, to: string, dayW: number, today: string): Tick[] {
  const last = dayIndex(from, to);
  const thisYear = parts(today).y;
  const out: Tick[] = [];
  for (let i = 0; i <= last; i++) {
    const { y, m, day } = parts(addDays(from, i));
    if (day !== 1) continue;
    out.push({ x: i * dayW, label: y === thisYear ? MONTHS[m - 1]! : `${MONTHS[m - 1]} ${y}` });
  }
  return out;
}

/** Month zoom sub-lines: week starts, unlabelled; a week start on the 1st is already a month line. */
export function minorLines(from: string, to: string, dayW: number, weekStart: 'mon' | 'sun'): number[] {
  const startDow = weekStart === 'mon' ? 1 : 0;
  const last = dayIndex(from, to);
  const out: number[] = [];
  for (let i = 0; i <= last; i++) {
    const d = addDays(from, i);
    if (weekday(d) === startDow && parts(d).day !== 1) out.push(i * dayW);
  }
  return out;
}

export function ticksFor(zoom: Zoom, from: string, to: string, dayW: number, weekStart: 'mon' | 'sun', today: string): Tick[] {
  if (zoom === 'day') return dayTicks(from, to, dayW);
  if (zoom === 'month') return monthTicks(from, to, dayW, today);
  return weekTicks(from, to, dayW, weekStart);
}

/** How many days the window grows by when the view nears one of its edges. */
export const EXTEND_DAYS: Record<Zoom, number> = { day: 42, week: 91, month: 365 };

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

export function arrowPath(a: { x2: number; y: number }, b: { x1: number; y: number }, pitch: number = ROW_PITCH): string {
  if (b.x1 - a.x2 >= 16) {
    const mid = a.x2 + 8;
    return `M${a.x2} ${a.y} H${mid} V${b.y} H${b.x1 - 2}`;
  }
  const midY = a.y === b.y ? a.y + pitch / 2 : (a.y + b.y) / 2;
  return `M${a.x2} ${a.y} H${a.x2 + 8} V${midY} H${b.x1 - 10} V${b.y} H${b.x1 - 2}`;
}

/**
 * Dashed risk line from the end of a bar that runs past its milestone up to that milestone's diamond:
 * straight up from the bar's top-right corner to the diamond's row, then left to the diamond's edge.
 */
export function riskPath(bar: { x2: number; top: number }, diamond: { x: number; y: number; r: number }): string {
  return `M${bar.x2} ${bar.top} V${diamond.y} H${diamond.x + diamond.r}`;
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

/** 12px Inter 500 width estimate: 9px left padding, 6.6px per character, 8px right. `extra` adds characters (e.g. " 40%"). */
export function labelFits(label: string, w: number, extra = 0): boolean {
  return w >= 9 + (label.length + extra) * 6.6 + 8;
}

/** "40%" for a progress value. */
export function pctText(pct: number): string {
  return `${Math.round(Math.min(100, Math.max(0, pct)))}%`;
}

/** Characters the "40%" text takes inside a bar, its gap included (0 when there is none). */
export function pctChars(pct: number | undefined): number {
  return pct === undefined ? 0 : pctText(pct).length + 1;
}

/** Whether the "40%" text on its own fits inside a bar `w` wide. */
export function pctFits(pct: number, w: number): boolean {
  return w >= 16 + pctText(pct).length * 6.6;
}

/** Gap between a bar and its outside label, and the clear space kept between neighbours on one lane. */
export const LABEL_GAP = 18;
const LANE_GAP = 4;

/** Right edge of a bar including its outside label (when the label does not fit inside). */
export function barExtent(x: number, w: number, label: string, extra = 0): number {
  return labelFits(label, w, extra) ? x + w : x + w + LABEL_GAP + label.length * 6.6 + 4;
}

/**
 * Greedy lane assignment for one row: sorted by x, each span goes in the first lane whose last span
 * ends before it starts. `end` is the right edge including any outside label. Returns lanes in input order.
 */
export function assignLanes(spans: { x: number; end: number }[]): { lanes: number[]; count: number } {
  const order = spans.map((_, i) => i).sort((a, b) => spans[a]!.x - spans[b]!.x || a - b);
  const laneEnd: number[] = [];
  const lanes: number[] = new Array(spans.length).fill(0);
  for (const i of order) {
    const sp = spans[i]!;
    let lane = laneEnd.findIndex((e) => e + LANE_GAP <= sp.x);
    if (lane < 0) lane = laneEnd.length;
    laneEnd[lane] = sp.end;
    lanes[i] = lane;
  }
  return { lanes, count: Math.max(1, laneEnd.length) };
}
