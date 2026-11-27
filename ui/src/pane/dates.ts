const RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;

export function isDate(s: string): boolean {
  if (!RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(s: string, n: number): string {
  return new Date(Date.parse(`${s}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}

/** Inclusive number of calendar days. */
export function lengthDays(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY) + 1;
}
