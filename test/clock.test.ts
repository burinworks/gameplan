import { describe, expect, it } from 'vitest';
import { addDays, diffDays, fixedClock, isDate, weekday } from '../src/clock.js';
import { slugify, newId } from '../src/ids.js';

describe('date math', () => {
  it('adds days across months', () => expect(addDays('2026-11-30', 1)).toBe('2026-12-01'));
  it('adds negative days', () => expect(addDays('2026-01-01', -1)).toBe('2025-12-31'));
  it('diffs days (b - a)', () => expect(diffDays('2026-11-12', '2026-11-24')).toBe(12));
  it('validates dates', () => {
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate('2026-02-28')).toBe(true);
    expect(isDate('2026-2-28')).toBe(false);
    expect(isDate('nope')).toBe(false);
  });
  it('weekday is Mon = 0', () => expect(weekday('2026-11-26')).toBe(3));
});

describe('clock', () => {
  it('today is zone-aware (Review Focus 5)', () => {
    const c = fixedClock('2026-11-25T23:30:00Z');
    expect(c.today('Asia/Jerusalem')).toBe('2026-11-26');
    expect(c.today('UTC')).toBe('2026-11-25');
    expect(c.now()).toBe('2026-11-25T23:30:00.000Z');
  });
});

describe('ids', () => {
  it('slugifies', () => {
    expect(slugify('Learn Studio!')).toBe('learn-studio');
    expect(slugify('  Ça va — déjà  ')).toBe('ca-va-deja');
  });
  it('prefixes ids', () => expect(newId('tk')).toMatch(/^tk_[a-z0-9]+$/));
});
