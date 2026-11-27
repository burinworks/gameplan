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

  it('todayX centres on the day', () => {
    expect(todayX(FROM, '2026-11-27', 16)).toBe(184);
  });

  it('weekTicks gives one per week start', () => {
    const ticks = weekTicks(FROM, '2027-01-10', 16, 'mon', '2026-11-27');
    expect(ticks).toHaveLength(8);
    expect(ticks.slice(0, 3).map((t) => t.x)).toEqual([0, 112, 224]);
    expect(ticks[0]?.label).toBe('Nov 16');
    expect(ticks[7]?.label).toBe('Jan 4, 2027');
    expect(weekTicks(FROM, '2026-12-01', 16, 'sun', '2026-11-27')[0]).toEqual({ x: 96, label: 'Nov 22' });
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
});
