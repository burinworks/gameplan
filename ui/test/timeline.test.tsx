import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/client';
import { barGeom, DAY_W, dayIndex, ROW_PITCH } from '../src/lib/timeline';
import { Timeline, type TLBar, type TLLink, type TLRow } from '../src/timeline/Timeline';

const FROM = '2026-11-16';
const TO = '2027-01-10';
const TODAY = '2026-11-27';

const bar = (over: Partial<TLBar> = {}): TLBar => ({
  id: 'b1',
  kind: 'task',
  label: 'Draft the spec',
  start: '2026-11-20',
  end: '2026-11-30',
  color: '#6E7CF5',
  progress: 40,
  risk: false,
  draggable: true,
  ...over,
});

const rowOf = (...bars: TLBar[]): TLRow[] => bars.map((b) => ({ id: `r-${b.id}`, label: b.label, bars: [b] }));

function setup(rows: TLRow[], props: Partial<React.ComponentProps<typeof Timeline>> = {}) {
  return render(
    <Timeline rows={rows} from={FROM} to={TO} today={TODAY} zoom="week" weekStart="mon" showWeekends {...props} />,
  );
}

const el = (id: string) => document.querySelector(`[data-bar="${id}"]`) as HTMLElement;

describe('Timeline', () => {
  it('renders one bar per bar with geometry from barGeom', () => {
    setup(rowOf(bar(), bar({ id: 'b2', start: '2026-12-01', end: '2026-12-05' })));
    expect(document.querySelectorAll('[data-bar]')).toHaveLength(2);
    const g = barGeom('2026-11-20', '2026-11-30', FROM, TO, DAY_W.week)!;
    expect(el('b1').style.left).toBe(`${g.x}px`);
    expect(el('b1').style.width).toBe(`${g.w}px`);
  });

  it('marks risk bars and draft bars', () => {
    setup(rowOf(bar({ risk: true }), bar({ id: 'd', kind: 'draft' })));
    expect(el('b1')).toHaveClass('is-risk');
    expect(el('d')).toHaveClass('is-draft');
  });

  it('draws a bad link with the risk stroke', () => {
    const links: TLLink[] = [
      { fromId: 'b1', toId: 'b2', bad: true },
      { fromId: 'b2', toId: 'b3', bad: false },
    ];
    const rows = rowOf(
      bar(),
      bar({ id: 'b2', start: '2026-11-18', end: '2026-11-22' }),
      bar({ id: 'b3', start: '2026-12-10', end: '2026-12-12' }),
    );
    setup(rows, { links });
    expect(document.querySelectorAll('path[stroke="var(--gp-risk)"]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('path[stroke="var(--gp-arrow)"]').length).toBeGreaterThan(0);
  });

  it('dragging a bar moves both dates', () => {
    const onReschedule = vi.fn().mockResolvedValue(undefined);
    setup(rowOf(bar()), { onReschedule });
    fireEvent.pointerDown(el('b1'), { clientX: 60, button: 0 });
    fireEvent.pointerMove(el('b1'), { clientX: 93 });
    fireEvent.pointerUp(el('b1'), { clientX: 93 });
    expect(onReschedule).toHaveBeenCalledWith('b1', { start: '2026-11-22', end: '2026-12-02' });
  });

  it('snaps back when the write rejects, without a local error line', async () => {
    const onReschedule = vi.fn().mockRejectedValue(new ApiError('conflict', 'x', 409));
    setup(rowOf(bar()), { onReschedule });
    const before = el('b1').style.left;
    fireEvent.pointerDown(el('b1'), { clientX: 60 });
    fireEvent.pointerMove(el('b1'), { clientX: 93 });
    expect(el('b1').style.left).not.toBe(before);
    fireEvent.pointerUp(el('b1'), { clientX: 93 });
    await waitFor(() => expect(el('b1').style.left).toBe(before));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('dragging the left edge resizes only the start', () => {
    const onReschedule = vi.fn().mockResolvedValue(undefined);
    setup(rowOf(bar()), { onReschedule });
    fireEvent.pointerDown(el('b1'), { clientX: 2 });
    fireEvent.pointerMove(el('b1'), { clientX: 2 + 33 });
    fireEvent.pointerUp(el('b1'), { clientX: 2 + 33 });
    expect(onReschedule).toHaveBeenCalledWith('b1', { start: '2026-11-22', end: '2026-11-30' });
  });

  it('dragging the right edge resizes only the end', () => {
    const onReschedule = vi.fn().mockResolvedValue(undefined);
    setup(rowOf(bar()), { onReschedule });
    const w = barGeom('2026-11-20', '2026-11-30', FROM, TO, DAY_W.week)!.w;
    fireEvent.pointerDown(el('b1'), { clientX: w - 2 });
    fireEvent.pointerMove(el('b1'), { clientX: w - 2 + 17 });
    fireEvent.pointerUp(el('b1'), { clientX: w - 2 + 17 });
    expect(onReschedule).toHaveBeenCalledWith('b1', { start: '2026-11-20', end: '2026-12-01' });
  });

  it.each([['week' as const, 1], ['month' as const, 1], ['month' as const, 2]])('a short bar stays movable by pointer (%s, %i day)', (zoom, days) => {
    const onReschedule = vi.fn().mockResolvedValue(undefined);
    const end = days === 1 ? '2026-11-20' : '2026-11-21';
    setup(rowOf(bar({ start: '2026-11-20', end })), { onReschedule, zoom });
    const w = barGeom('2026-11-20', end, FROM, TO, DAY_W[zoom])!.w;
    const mid = w / 2;
    const dx = DAY_W[zoom] * 3;
    fireEvent.pointerDown(el('b1'), { clientX: mid });
    fireEvent.pointerMove(el('b1'), { clientX: mid + dx });
    fireEvent.pointerUp(el('b1'), { clientX: mid + dx });
    expect(onReschedule).toHaveBeenCalledWith('b1', { start: '2026-11-23', end: days === 1 ? '2026-11-23' : '2026-11-24' });
  });

  it('ignores drag and keys on a non-draggable bar', () => {
    const onReschedule = vi.fn();
    setup(rowOf(bar({ draggable: false })), { onReschedule });
    fireEvent.pointerDown(el('b1'), { clientX: 60 });
    fireEvent.pointerMove(el('b1'), { clientX: 93 });
    fireEvent.pointerUp(el('b1'), { clientX: 93 });
    fireEvent.keyDown(el('b1'), { key: 'ArrowRight' });
    expect(onReschedule).not.toHaveBeenCalled();
  });

  it('Esc cancels a drag', () => {
    const onReschedule = vi.fn();
    setup(rowOf(bar()), { onReschedule });
    const before = el('b1').style.left;
    fireEvent.pointerDown(el('b1'), { clientX: 60 });
    fireEvent.pointerMove(el('b1'), { clientX: 93 });
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerUp(el('b1'), { clientX: 93 });
    expect(onReschedule).not.toHaveBeenCalled();
    expect(el('b1').style.left).toBe(before);
  });

  it('keyboard: arrows move a day, shift resizes the end, Enter opens', () => {
    const onReschedule = vi.fn().mockResolvedValue(undefined);
    const onOpen = vi.fn();
    setup(rowOf(bar()), { onReschedule, onOpen });
    fireEvent.keyDown(el('b1'), { key: 'ArrowRight' });
    expect(onReschedule).toHaveBeenLastCalledWith('b1', { start: '2026-11-21', end: '2026-12-01' });
    fireEvent.keyDown(el('b1'), { key: 'ArrowLeft', shiftKey: true });
    expect(onReschedule).toHaveBeenLastCalledWith('b1', { start: '2026-11-21', end: '2026-11-30' });
    fireEvent.keyDown(el('b1'), { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledWith('b1');
  });

  it('a click opens, a drag does not', () => {
    const onOpen = vi.fn();
    setup(rowOf(bar()), { onOpen, onReschedule: vi.fn().mockResolvedValue(undefined) });
    fireEvent.click(el('b1'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(el('b1'), { clientX: 60 });
    fireEvent.pointerMove(el('b1'), { clientX: 93 });
    fireEvent.pointerUp(el('b1'), { clientX: 93 });
    fireEvent.click(el('b1'));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('link handle dropped on another bar calls onLink', () => {
    const onLink = vi.fn();
    setup(rowOf(bar(), bar({ id: 'b2', start: '2026-12-10', end: '2026-12-12' })), { onLink });
    const handle = document.querySelector('[data-link-handle="b1"]') as HTMLElement;
    fireEvent.pointerDown(handle, { clientX: 300 });
    fireEvent.pointerMove(el('b2'), { clientX: 400 });
    fireEvent.pointerUp(el('b2'), { clientX: 400 });
    expect(onLink).toHaveBeenCalledWith('b1', 'b2');
  });

  it('puts a label that does not fit outside the bar', () => {
    const long = 'A very long task title that cannot fit';
    setup(rowOf(bar({ label: long, start: '2026-11-20', end: '2026-11-21' })));
    const out = document.querySelector('[data-label-outside]') as HTMLElement;
    expect(out).toHaveTextContent(long);
    expect(out).toHaveAttribute('title', long);
    expect(el('b1').textContent).not.toContain(long);
  });

  it('overlapping bars in one row stack on two lanes, row is 2x ROW_PITCH, labels are not clipped', () => {
    const a = bar({ id: 'a', kind: 'milestone', label: 'Outline', start: '2026-11-20', end: '2026-11-21' });
    const b = bar({ id: 'b', kind: 'milestone', label: 'Draft', start: '2026-11-23', end: '2026-11-24' });
    setup([{ id: 'r', label: 'R', bars: [b, a] }]);
    // a's outside label runs past b's start, so b goes on a second line
    const row = el('a').parentElement as HTMLElement;
    expect(row).toBe(el('b').parentElement);
    expect(row.style.height).toBe(`${2 * ROW_PITCH}px`);
    expect(el('a').style.getPropertyValue('--lane')).toBe('0');
    expect(el('b').style.getPropertyValue('--lane')).toBe('1');
    const outs = [...document.querySelectorAll('[data-label-outside]')] as HTMLElement[];
    expect(outs.map((o) => o.textContent).sort()).toEqual(['Draft', 'Outline']);
    for (const o of outs) expect(o.style.maxWidth).not.toBe('');
    expect((document.querySelector('[data-row-label]')?.parentElement?.parentElement as HTMLElement).style.height).toBe(
      `${2 * ROW_PITCH}px`,
    );
  });

  it('a row without overlaps stays on one lane', () => {
    setup([
      {
        id: 'r',
        label: 'R',
        bars: [bar({ id: 'a', start: '2026-11-20', end: '2026-11-22' }), bar({ id: 'b', start: '2026-12-20', end: '2026-12-22' })],
      },
    ]);
    expect((el('a').parentElement as HTMLElement).style.height).toBe(`${ROW_PITCH}px`);
    expect(el('b').style.getPropertyValue('--lane')).toBe('0');
  });

  it('bars never paint over the Today line and arrows', () => {
    setup(rowOf(bar()));
    expect(el('b1').style.zIndex).toBe('');
  });

  it('keeps short labels inside; labels carry dir=auto and a title', () => {
    setup(rowOf(bar({ label: 'שלום', start: '2026-11-20', end: '2026-12-20' })));
    const inner = el('b1').querySelector('[data-label]') as HTMLElement;
    expect(inner).toHaveAttribute('dir', 'auto');
    expect(inner).toHaveAttribute('title', 'שלום');
    expect(document.querySelector('[data-label-outside]')).toBeNull();
    const rowLabel = document.querySelector('[data-row-label]') as HTMLElement;
    expect(rowLabel).toHaveAttribute('dir', 'auto');
    expect(rowLabel).toHaveAttribute('title', 'שלום');
  });

  it('collapses groups', () => {
    const rows: TLRow[] = [{ id: 'r', label: 'R', group: 'g', bars: [bar()] }];
    const onToggleGroup = vi.fn();
    const { rerender } = setup(rows, { groups: [{ id: 'g', label: 'Milestone A', collapsed: false }], onToggleGroup });
    fireEvent.click(screen.getByRole('button', { name: /Milestone A/ }));
    expect(onToggleGroup).toHaveBeenCalledWith('g');
    rerender(
      <Timeline
        rows={rows}
        from={FROM}
        to={TO}
        today={TODAY}
        zoom="week"
        weekStart="mon"
        groups={[{ id: 'g', label: 'Milestone A', collapsed: true }]}
      />,
    );
    expect(document.querySelector('[data-bar]')).toBeNull();
  });

  it('scrolls Today into view when asked', () => {
    setup(rowOf(bar()), { initialScrollToToday: true });
    const sc = document.querySelector('[data-timeline-scroll]') as HTMLElement;
    expect(sc.scrollLeft).toBeGreaterThan(0);
  });

  it('project variant: wider label column, group row with due text and a diamond at the due date', () => {
    const rows: TLRow[] = [{ id: 'r', label: 'Task', meta: 'Nov 25', group: 'g', bars: [bar()] }];
    const { container } = setup(rows, {
      variant: 'project',
      groups: [{ id: 'g', label: 'M4 · Launch', collapsed: false, due: 'Dec 12', mark: { id: 'm', date: '2026-12-12', color: '#6E7CF5', risk: false } }],
    });
    expect((container.querySelector('.tl-labels') as HTMLElement).style.width).toBe('236px');
    expect(container.querySelector('.tl-group-due')?.textContent).toBe('Dec 12');
    const d = container.querySelector('[data-milestone="m"]') as HTMLElement;
    expect(d.style.left).toBe(`${26 * 13 + 6.5}px`);
    expect((container.querySelector('.tl') as HTMLElement).style.getPropertyValue('--tl-pitch')).toBe('40px');
  });

  it('a group with no rows still shows its header', () => {
    setup([], { variant: 'project', groups: [{ id: 'g', label: 'Empty one', collapsed: false }] });
    expect(screen.getByRole('button', { name: 'Empty one' })).toBeInTheDocument();
  });

  it('keeps the grid with no rows and lays the empty content over it', () => {
    const { container } = setup([], { empty: <p>nothing here</p> });
    expect(screen.getByText('nothing here')).toBeInTheDocument();
    expect(container.querySelectorAll('.tl-tick').length).toBeGreaterThan(3);
    expect(container.querySelector('.tl-weekend')).not.toBeNull();
  });

  it('day zoom draws a tick per day', () => {
    const { container } = setup(rowOf(bar()), { zoom: 'day', to: '2026-11-30' });
    expect(container.querySelectorAll('.tl-tick')).toHaveLength(15);
  });

  it('draws Today on the left edge of its column with a plain accent label', () => {
    const { container } = setup(rowOf(bar()));
    const line = container.querySelector('.tl-today-line') as HTMLElement;
    expect(line.style.left).toBe(`${dayIndex(FROM, TODAY) * DAY_W.week}px`);
    const label = container.querySelector('.tl-today-label') as HTMLElement;
    expect(label.textContent).toBe('Today');
    expect(label.style.left).toBe(line.style.left);
  });

  it('week zoom names the month only on its first week', () => {
    const { container } = setup(rowOf(bar()));
    const labels = [...container.querySelectorAll('.tl-tick-label')].map((e) => e.textContent);
    expect(labels.slice(0, 5)).toEqual(['Nov 16', '23', '30', 'Dec 7', '14']);
  });

  it('month zoom ticks once per month with faint week lines and no overlapping labels', () => {
    const { container } = setup(rowOf(bar()), { zoom: 'month', to: '2027-02-15' });
    expect([...container.querySelectorAll('.tl-tick-label')].map((e) => e.textContent)).toEqual(['Dec', 'Jan 2027', 'Feb 2027']);
    expect(container.querySelectorAll('.tl-minor').length).toBeGreaterThan(8);
  });

  it('shows the month and year of the view in the corner', () => {
    const { container } = setup(rowOf(bar()));
    expect(container.querySelector('[data-timeline-month]')?.textContent).toBe('November 2026');
  });

  it('a task bar shows its completion as text and its area as an end strip', () => {
    setup(rowOf(bar({ progress: 40, area: '#3FA796', start: '2026-11-20', end: '2026-12-20' })));
    expect(el('b1').querySelector('[data-pct]')?.textContent).toBe('40%');
    expect((el('b1').querySelector('[data-area]') as HTMLElement).style.background).toBe('rgb(63, 167, 150)');
    expect(el('b1')).toHaveAttribute('aria-label', 'Draft the spec · 40%');
  });

  it('milestone bars carry no percentage', () => {
    setup(rowOf(bar({ kind: 'milestone', start: '2026-11-20', end: '2026-12-20' })));
    expect(el('b1').querySelector('[data-pct]')).toBeNull();
  });

  it('names the milestone beside its diamond', () => {
    const { container } = setup([], {
      variant: 'project',
      groups: [{ id: 'g', label: 'M4 · Launch', collapsed: false, mark: { id: 'm', date: '2026-12-12', color: '#6E7CF5', risk: false } }],
    });
    const name = container.querySelector('[data-milestone-name="m"]') as HTMLElement;
    expect(name.textContent).toBe('M4 · Launch');
    const d = container.querySelector('[data-milestone="m"]') as HTMLElement;
    // left of the diamond, right-aligned against it
    expect(parseFloat(name.style.right)).toBeGreaterThan(0);
    const canvasW = parseFloat((container.querySelector('.tl-canvas') as HTMLElement).style.width);
    expect(canvasW - parseFloat(name.style.right)).toBeLessThan(parseFloat(d.style.left));
  });

  it('a bar ending after its milestone gets the risk ring and a dashed line to the diamond', () => {
    const rows: TLRow[] = [{ id: 'r', label: 'Late one', group: 'g', bars: [bar({ risk: true, pastMark: 'm', start: '2026-12-01', end: '2026-12-20' })] }];
    const { container } = setup(rows, {
      variant: 'project',
      groups: [{ id: 'g', label: 'M', collapsed: false, mark: { id: 'm', date: '2026-12-12', color: '#6E7CF5', risk: true } }],
    });
    expect(el('b1')).toHaveClass('is-risk');
    const line = container.querySelector('[data-risk-line="b1"]') as SVGPathElement;
    expect(line).not.toBeNull();
    expect(line.getAttribute('stroke')).toBe('var(--gp-risk)');
    expect(line.getAttribute('stroke-dasharray')).toBeTruthy();
  });

  it('grows the window when scrolled near either edge and reports the new range', () => {
    const onRangeChange = vi.fn();
    const { container } = setup(rowOf(bar()), { onRangeChange });
    const sc = container.querySelector('[data-timeline-scroll]') as HTMLElement;
    const canvas = container.querySelector('.tl-canvas') as HTMLElement;
    Object.defineProperty(sc, 'clientWidth', { configurable: true, value: 600 });
    sc.scrollLeft = 0;
    fireEvent.scroll(sc);
    expect(canvas.dataset.from! < FROM).toBe(true);
    expect(canvas.dataset.to! > TO).toBe(true);
    expect(onRangeChange).toHaveBeenCalledWith(canvas.dataset.from, canvas.dataset.to);
    // the view does not jump: the added days on the left are added to the scroll position
    expect(sc.scrollLeft).toBe(dayIndex(canvas.dataset.from!, FROM) * DAY_W.week);
  });
});
