export interface Clock {
  /** ISO instant (UTC). */
  now(): string;
  /** Local calendar date YYYY-MM-DD in the given IANA time zone. */
  today(tz: string): string;
}

function localDate(instant: Date, tz: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

export const systemClock: Clock = {
  now: () => new Date().toISOString(),
  today: (tz) => localDate(new Date(), tz),
};

export function fixedClock(now: string): Clock {
  const d = new Date(now);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid instant: ${now}`);
  return { now: () => d.toISOString(), today: (tz) => localDate(d, tz) };
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function toUtc(d: string): number {
  const m = DATE_RE.exec(d);
  if (!m) throw new Error(`invalid date: ${d}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  return fromUtc(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) === s;
}

export function addDays(d: string, n: number): string {
  return fromUtc(toUtc(d) + n * DAY_MS);
}

/** b − a in whole days. */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** Monday = 0 … Sunday = 6. */
export function weekday(d: string): number {
  return (new Date(toUtc(d)).getUTCDay() + 6) % 7;
}

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
