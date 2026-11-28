import { describe, expect, it } from 'vitest';
import {
  arrowPath,
  assignLanes,
  barExtent,
  barGeom,
  dayIndex,
  dragDates,
  labelFits,
  todayX,
  weekendCols,
  weekTicks,
  weekStartOf,
  dayTicks,
  dayWidth,
  monthTicks,
  minorLines,
  monthYear,
  pctFits,
  riskPath,
  ticksFor,
} from '../src/lib/timeline';

const FROM = '2026-11-16';
const TO = '2027-01-10';

describe('timeline geometry', () => {
  it('dayIndex counts whole days', () => {
    expect(dayIndex(FROM, '2026-11-27')).toBe(11);
    expect(dayIndex(FROM, '2026-11-15')).toBe(-1);
  });

  it('barGeom places inclusive bars', () => {
    expect(barGeom('2026-11-20', '2026-11-27', FROM, TO, 16)).toMatchObject({ x: 64, w: 120 });
  });

  it('barGeom returns null when outside, clips when partly outside', () => {
    expect(barGeom('2026-11-01', '2026-11-10', FROM, TO, 16)).toBeNull();
    expect(barGeom('2027-02-01', '2027-02-05', FROM, TO, 16)).toBeNull();
    expect(barGeom('2026-11-10', '2026-11-18', FROM, TO, 16)).toMatchObject({
      x: 0,
      clippedStart: true,
      clippedEnd: false,
    });
    expect(barGeom('2027-01-08', '2027-01-20', FROM, TO, 16)).toMatchObject({
      clippedEnd: true,
      clippedStart: false,
    });
  });

  it('barGeom keeps a minimum width', () => {
    expect(barGeom('2026-11-16', '2026-11-16', FROM, TO, 6)?.w).toBe(4);
  });

  it('todayX is the left edge of the day', () => {
    expect(todayX(FROM, '2026-11-27', 16)).toBe(176);
  });

  it('weekTicks gives one per week start, naming the month only on its first week', () => {
    const ticks = weekTicks(FROM, '2027-01-10', 16, 'mon');
    expect(ticks).toHaveLength(8);
    expect(ticks.slice(0, 3).map((t) => t.x)).toEqual([0, 112, 224]);
    expect(ticks.map((t) => t.label)).toEqual(['Nov 16', '23', '30', 'Dec 7', '14', '21', '28', 'Jan 4']);
    expect(weekTicks(FROM, '2026-12-01', 16, 'sun')[0]).toEqual({ x: 96, label: 'Nov 22', month: true });
    expect(ticks[1]?.month).toBeUndefined();
  });

  it('month zoom ticks once per month, with the year only when it is not this year', () => {
    const t = monthTicks('2026-11-16', '2027-02-10', 6, '2026-11-27');
    expect(t.map((x) => x.label)).toEqual(['Dec', 'Jan 2027', 'Feb 2027']);
    expect(t[0]?.x).toBe(15 * 6);
    // labels are at least a month apart: never closer than 28 days
    for (let i = 1; i < t.length; i++) expect(t[i]!.x - t[i - 1]!.x).toBeGreaterThanOrEqual(28 * 6);
    expect(ticksFor('month', '2026-11-16', '2027-02-10', 6, 'mon', '2026-11-27')).toEqual(t);
  });

  it('month zoom draws week sub-lines that skip month starts', () => {
    const m = minorLines('2026-11-30', '2027-03-08', 6, 'mon');
    expect(m[0]).toBe(0);
    expect(m).not.toContain(dayIndex('2026-11-30', '2027-02-01') * 6); // Feb 1 2027 is a Monday and a month line
  });

  it('labels never overlap at any zoom', () => {
    const today = '2026-11-27';
    for (const zoom of ['day', 'week', 'month'] as const) {
      for (const variant of ['home', 'project'] as const) {
        const dw = dayWidth(zoom, variant);
        const t = ticksFor(zoom, '2026-11-02', '2027-03-01', dw, 'mon', today);
        for (let i = 1; i < t.length; i++) {
          // 11px Inter label (about 5.9px per character), 6px inset, 4px clear space
          const w = 6 + t[i - 1]!.label.length * 5.9 + 4;
          expect(t[i]!.x - t[i - 1]!.x, `${zoom}/${variant} ${t[i - 1]!.label} → ${t[i]!.label}`).toBeGreaterThanOrEqual(w);
        }
      }
    }
  });

  it('monthYear names the month in full', () => {
    expect(monthYear('2027-01-04')).toBe('January 2027');
  });

  it('pctFits needs room for the number', () => {
    expect(pctFits(40, 20)).toBe(false);
    expect(pctFits(40, 60)).toBe(true);
  });

  it('riskPath goes up from the bar end to the diamond row, then left to the diamond', () => {
    expect(riskPath({ x2: 300, top: 60 }, { x: 200, y: 19, r: 8 })).toBe('M300 60 V19 H208');
  });

  it('weekendCols spans Sat+Sun', () => {
    const cols = weekendCols(FROM, TO, 16);
    expect(cols[0]).toEqual({ x: 80, w: 32 });
    expect(cols[1]).toEqual({ x: 192, w: 32 });
    expect(cols).toHaveLength(8);
  });

  it('arrowPath draws straight and dogleg routes', () => {
    expect(arrowPath({ x2: 100, y: 63 }, { x1: 140, y: 109 })).toBe('M100 63 H108 V109 H138');
    expect(arrowPath({ x2: 100, y: 63 }, { x1: 104, y: 109 })).toBe('M100 63 H108 V86 H94 V109 H102');
    expect(arrowPath({ x2: 100, y: 63 }, { x1: 104, y: 63 })).toBe('M100 63 H108 V86 H94 V63 H102');
  });

  it('dragDates moves and resizes on whole days', () => {
    const orig = { start: '2026-11-20', end: '2026-11-27' };
    expect(dragDates('move', orig, 33, 16)).toEqual({ start: '2026-11-22', end: '2026-11-29' });
    expect(dragDates('end', orig, -16, 16)).toEqual({ start: '2026-11-20', end: '2026-11-26' });
    expect(dragDates('start', orig, 200, 16)).toEqual({ start: '2026-11-27', end: '2026-11-27' });
    expect(dragDates('end', orig, -400, 16)).toEqual({ start: '2026-11-20', end: '2026-11-20' });
  });

  it('labelFits estimates label width', () => {
    expect(labelFits('OOP 01', 120)).toBe(true);
    expect(labelFits('A very long milestone name here', 40)).toBe(false);
  });

  it('assignLanes puts each span on the first lane it fits, new lane when overlapping', () => {
    expect(assignLanes([])).toEqual({ lanes: [], count: 1 });
    expect(assignLanes([{ x: 0, end: 50 }, { x: 100, end: 150 }])).toEqual({ lanes: [0, 0], count: 1 });
    expect(assignLanes([{ x: 40, end: 90 }, { x: 0, end: 50 }, { x: 60, end: 100 }])).toEqual({ lanes: [1, 0, 0], count: 2 });
    expect(assignLanes([{ x: 0, end: 50 }, { x: 10, end: 60 }, { x: 20, end: 70 }]).count).toBe(3);
  });

  it('barExtent counts an outside label as occupied width', () => {
    expect(barExtent(0, 200, 'Hi')).toBe(200);
    expect(barExtent(0, 10, 'Outline')).toBeGreaterThan(10 + 18);
  });

  it('weekStartOf finds the first day of the week', () => {
    expect(weekStartOf('2026-11-27', 'mon')).toBe('2026-11-23');
    expect(weekStartOf('2026-11-27', 'sun')).toBe('2026-11-22');
    expect(weekStartOf('2026-11-23', 'mon')).toBe('2026-11-23');
    expect(weekStartOf('2026-11-22', 'mon')).toBe('2026-11-16');
  });

  it('day zoom ticks every day; only the 1st carries the month', () => {
    const t = dayTicks('2026-11-29', '2026-12-02', 40);
    expect(t.map((x) => x.x)).toEqual([0, 40, 80, 120]);
    expect(t.map((x) => x.label)).toEqual(['29', '30', 'Dec 1', '2']);
    expect(dayWidth('day')).toBe(40);
    expect(dayWidth('week', 'project')).toBe(13);
  });
});
