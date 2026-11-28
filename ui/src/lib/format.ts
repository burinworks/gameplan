// Content rules as pure functions. Dates use UTC math and hard-coded English names.

type Status = 'todo' | 'doing' | 'review' | 'done' | 'cancelled' | 'conflict';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_MS = 86_400_000;

function parse(d: string): { y: number; m: number; d: number } {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  return { y: y!, m: m! - 1, d: day! };
}

function dayNumber(d: string): number {
  const p = parse(d);
  return Math.round(Date.UTC(p.y, p.m, p.d) / DAY_MS);
}

export function fmtDate(d: string, today: string): string {
  const p = parse(d);
  const base = `${MONTHS[p.m]} ${p.d}`;
  return p.y === parse(today).y ? base : `${base}, ${p.y}`;
}

/** "Fri, Dec 4"; adds the year when it differs from today's ("Fri, Jan 15, 2027"). */
export function fmtDayDate(d: string, today: string): string {
  const p = parse(d);
  const wd = new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay();
  const base = `${WEEKDAYS[wd]!.slice(0, 3)}, ${MONTHS[p.m]} ${p.d}`;
  return p.y === parse(today).y ? base : `${base}, ${p.y}`;
}

export function fmtHeaderDate(d: string): string {
  const p = parse(d);
  const wd = new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay();
  return `${WEEKDAYS[wd]}, ${p.d} ${MONTHS_LONG[p.m]}`;
}

export function fmtRange(a: string | null, b: string | null, today: string): string {
  if (!a && !b) return '—';
  return `${a ? fmtDate(a, today) : '—'} → ${b ? fmtDate(b, today) : '—'}`;
}

export function fmtAgo(iso: string, now: Date): string {
  const t = new Date(iso);
  const diff = now.getTime() - t.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  const days = dayNumber(now.toISOString()) - dayNumber(t.toISOString());
  if (days <= 1) return 'yesterday';
  if (days < 7) return `${days}d`;
  return fmtDate(t.toISOString().slice(0, 10), now.toISOString().slice(0, 10));
}

export function fmtActor(actor: string): string {
  if (actor === 'you') return 'You';
  if (actor.startsWith('ai:')) return actor.slice(3).trim() || 'Agent';
  return actor || 'Agent';
}

export function fmtActorAt(actor: string, iso: string, now: Date): string {
  return `${fmtActor(actor)} · ${fmtAgo(iso, now)}`;
}

export function fmtLate(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'} late`;
}

export function fmtDue(d: string, today: string): string {
  const diff = dayNumber(d) - dayNumber(today);
  if (diff === 0) return 'due today';
  if (diff === 1) return 'due tomorrow';
  return fmtDate(d, today);
}

export function fmtTodos(done: number, total: number): string {
  return `${done}/${total} to-dos`;
}

export function fmtPct(p: number): string {
  return `${Math.round(p)}%`;
}

export function executorLabel(e: 'manual' | 'ai' | 'together'): 'Me' | 'AI' | 'Together' {
  return e === 'manual' ? 'Me' : e === 'ai' ? 'AI' : 'Together';
}

const STATUS_LABELS: Record<Status, string> = {
  todo: 'To do',
  doing: 'Doing',
  review: 'Review',
  done: 'Done',
  cancelled: 'Cancelled',
  conflict: 'Conflict',
};

export function statusLabel(s: Status): string {
  return STATUS_LABELS[s] ?? s;
}

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function errorLine(e: { code: string; message: string }): string {
  // `conflict` is only for stale state (undo after a change, an inbox item already handled); every other refusal is `invalid` and says why.
  if (e.code === 'conflict') return 'Changed since — reload to see the latest';
  if (e.message.includes('cycle')) return 'Would create a loop';
  if (e.code === 'network') return "Gameplan engine isn't running";
  if (e.code === 'forbidden') return cap(e.message);
  return cap(e.message.replace(/\.+$/, ''));
}
