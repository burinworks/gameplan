import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api/client';
import { barGeom, DAY_W } from '../src/lib/timeline';
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

  it('overlapping bars in one row: labels stay in the visible part and later bars paint on top', () => {
    const a = bar({ id: 'a', label: 'Outline', start: '2026-11-20', end: '2026-12-10' });
    const b = bar({ id: 'b', label: 'Draft', start: '2026-11-23', end: '2026-12-20' });
    setup([{ id: 'r', label: 'R', bars: [b, a] }]);
    const px = (n: HTMLElement, k: 'left' | 'width') => parseFloat(n.style[k]);
    const aRight = px(el('a'), 'left') + px(el('a'), 'width');
    const bRight = px(el('b'), 'left') + px(el('b'), 'width');
    // a keeps only 3 days before b starts: no room for its label, inside or outside
    expect(el('a').querySelector('[data-label]')).toBeNull();
    expect([...document.querySelectorAll('[data-label-outside]')].some((o) => o.textContent === 'Outline')).toBe(false);
    // b's label starts where a ends and fills the rest of b
    const label = el('b').querySelector('[data-label]') as HTMLElement;
    expect(parseFloat(label.style.marginLeft)).toBe(aRight - px(el('b'), 'left'));
    expect(parseFloat(label.style.maxWidth)).toBe(bRight - aRight);
    expect(Number(el('b').style.zIndex)).toBeGreaterThan(Number(el('a').style.zIndex));
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
});
