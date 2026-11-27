import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useHighlight } from '../api/live';
import {
  DAY_W,
  HEADER_H,
  ROW_PITCH,
  barGeom,
  dayIndex,
  labelFits,
  todayX,
  weekTicks,
  weekendCols,
  type Zoom,
} from '../lib/timeline';
import { Arrows, type ArrowPos } from './Arrows';
import { Icon } from '../ui/Icon';
import { edgeZone, useBarDrag, type Dates } from './useBarDrag';
import './timeline.css';

export interface TLBar {
  id: string;
  kind: 'task' | 'milestone' | 'draft';
  label: string;
  start: string;
  end: string;
  /** Project or area colour (any CSS colour); tinted with color-mix. */
  color: string;
  /** 0..100 */
  progress: number;
  risk: boolean;
  diamond?: boolean;
  draggable: boolean;
}

export interface TLRow {
  id: string;
  label: string;
  swatch?: string;
  /** End date text shown under the label. */
  meta?: string;
  dot?: 'risk';
  bars: TLBar[];
  group?: string;
}

export interface TLLink {
  fromId: string;
  toId: string;
  bad: boolean;
}

export interface TLGroup {
  id: string;
  label: string;
  collapsed: boolean;
}

export interface TimelineProps {
  rows: TLRow[];
  links?: TLLink[];
  from: string;
  to: string;
  today: string;
  zoom: Zoom;
  weekStart: 'mon' | 'sun';
  showWeekends?: boolean;
  groups?: TLGroup[];
  onToggleGroup?: (groupId: string) => void;
  onOpen?: (barId: string) => void;
  /** Reject to snap the bar back; the message comes from the shared error line, not the timeline. */
  onReschedule?: (barId: string, dates: Dates) => Promise<unknown> | void;
  onLink?: (fromId: string, toId: string) => void;
  labelWidth?: number;
  /** Scroll Today to about 25% from the left on first render. */
  initialScrollToToday?: boolean;
}

export interface TimelineHandle {
  scrollToToday: () => void;
}

const GROUP_H = 30;
const LINK_GAP = 18;

type Item =
  | { kind: 'group'; id: string; label: string; collapsed: boolean; y: number; h: number }
  | { kind: 'row'; row: TLRow; y: number; h: number };

interface Override extends Dates {
  base: Dates;
}

function BarView({
  bar,
  x,
  w,
  clippedStart,
  clippedEnd,
  trackW,
  inset,
  visW,
  nextX,
  order,
  dragging,
  linkTarget,
  canLink,
  onPointerDown,
  onKeyDown,
  onClick,
  onHandleDown,
}: {
  bar: TLBar;
  x: number;
  w: number;
  clippedStart: boolean;
  clippedEnd: boolean;
  trackW: number;
  /** Left offset of the visible part of the bar (an earlier bar in the row covers the rest). */
  inset: number;
  /** Width of the visible part of the bar for its inside label. */
  visW: number;
  /** Left edge of the next bar in the row, or null. */
  nextX: number | null;
  /** Paint order within the row: later bars sit on top. */
  order: number;
  dragging: boolean;
  linkTarget: boolean;
  canLink: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  onClick: () => void;
  onHandleDown: (e: React.PointerEvent<HTMLElement>) => void;
}) {
  const changed = useHighlight(bar.id);
  const fits = labelFits(bar.label, visW);
  const diamond = bar.diamond ?? bar.kind === 'milestone';
  const cls = [
    'tl-bar',
    `is-${bar.kind}`,
    bar.risk && 'is-risk',
    diamond && 'has-diamond',
    bar.draggable && 'is-draggable',
    dragging && 'is-dragging',
    changed && 'is-changed',
    linkTarget && 'is-link-target',
    clippedStart && 'is-clipped-start',
    clippedEnd && 'is-clipped-end',
  ]
    .filter(Boolean)
    .join(' ');
  const style = { left: `${x}px`, width: `${w}px`, zIndex: dragging ? 1000 : order + 1, '--bar-color': bar.color } as CSSProperties;
  const outsideMax = Math.min(trackW, nextX ?? trackW) - (x + w + LINK_GAP) - 4;
  return (
    <>
      <div
        className={cls}
        data-bar={bar.id}
        role="button"
        tabIndex={0}
        aria-label={bar.label}
        title={bar.label}
        style={style}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        onClick={onClick}
      >
        {bar.kind !== 'draft' && bar.progress > 0 && (
          <span className="tl-progress" style={{ width: `${Math.min(100, Math.max(0, bar.progress))}%` }} />
        )}
        {bar.draggable && <span className="tl-edge tl-edge-l" style={{ width: edgeZone(w) }} aria-hidden="true" />}
        {bar.draggable && <span className="tl-edge tl-edge-r" style={{ width: edgeZone(w) }} aria-hidden="true" />}
        {fits && (
          <span className="tl-bar-label" data-label dir="auto" title={bar.label} style={{ marginLeft: `${inset}px`, maxWidth: `${visW}px` }}>
            {bar.label}
          </span>
        )}
        {diamond && <span className="tl-diamond" aria-hidden="true" />}
      </div>
      {!fits && outsideMax > 24 && (
        <span
          className="tl-label-out"
          data-label-outside
          dir="auto"
          title={bar.label}
          style={{ left: `${x + w + LINK_GAP}px`, maxWidth: `${outsideMax}px` }}
        >
          {bar.label}
        </span>
      )}
      {canLink && (
        <span
          className="tl-handle"
          data-link-handle={bar.id}
          aria-hidden="true"
          style={{ left: `${x + w + 4}px` }}
          onPointerDown={onHandleDown}
        />
      )}
    </>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span className={open ? 'tl-chev is-open' : 'tl-chev'} aria-hidden="true">
      <Icon name="chevron" size={14} />
    </span>
  );
}

export const Timeline = forwardRef<TimelineHandle, TimelineProps>(function Timeline(
  {
    rows,
    links = [],
    from,
    to,
    today,
    zoom,
    weekStart,
    showWeekends = false,
    groups = [],
    onToggleGroup,
    onOpen,
    onReschedule,
    onLink,
    labelWidth = 170,
    initialScrollToToday = false,
  },
  ref,
) {
  const dayW = DAY_W[zoom];
  const last = dayIndex(from, to);
  const totalW = (last + 1) * dayW;
  const scroller = useRef<HTMLDivElement>(null);
  const plane = useRef<HTMLDivElement>(null);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});

  const barsById = useMemo(() => {
    const m = new Map<string, TLBar>();
    for (const r of rows) for (const b of r.bars) m.set(b.id, b);
    return m;
  }, [rows]);

  const effective = useCallback(
    (b: TLBar): Dates => {
      const ov = overrides[b.id];
      return ov && ov.base.start === b.start && ov.base.end === b.end ? { start: ov.start, end: ov.end } : { start: b.start, end: b.end };
    },
    [overrides],
  );

  /** Bars of one row sorted by x, with the part of each that its neighbours leave visible for labels. */
  const layoutRow = (bars: TLBar[]) => {
    const placed = bars.flatMap((b) => {
      const e = effective(b);
      const g = barGeom(e.start, e.end, from, to, dayW);
      return g ? [{ b, g }] : [];
    });
    placed.sort((a, c) => a.g.x - c.g.x);
    let prevRight = -Infinity;
    return placed.map((p, i) => {
      const nextX = placed[i + 1]?.g.x ?? null;
      const visL = Math.max(p.g.x, prevRight);
      const visR = Math.min(p.g.x + p.g.w, nextX ?? Infinity);
      prevRight = Math.max(prevRight, p.g.x + p.g.w);
      return { ...p, inset: visL - p.g.x, visW: visR - visL, nextX };
    });
  };

  // Drop an override once the bar's own dates move on (the write landed or someone else edited it).
  useEffect(() => {
    setOverrides((cur) => {
      let next = cur;
      for (const [id, ov] of Object.entries(cur)) {
        const b = barsById.get(id);
        if (!b || b.start !== ov.base.start || b.end !== ov.base.end) {
          if (next === cur) next = { ...cur };
          delete next[id];
        }
      }
      return next;
    });
  }, [barsById]);

  const drag = useBarDrag({
    dayW,
    find: (id) => {
      const b = barsById.get(id);
      if (!b) return undefined;
      return { ...effective(b), draggable: b.draggable && !!onReschedule };
    },
    onPreview: (id, dates) => {
      const b = barsById.get(id);
      if (!b) return;
      setOverrides((cur) => {
        if (!dates) {
          if (!(id in cur)) return cur;
          const { [id]: _drop, ...rest } = cur;
          return rest;
        }
        return { ...cur, [id]: { ...dates, base: { start: b.start, end: b.end } } };
      });
    },
    onCommit: (id, dates) => {
      let p: Promise<unknown>;
      try {
        p = Promise.resolve(onReschedule?.(id, dates));
      } catch (e) {
        p = Promise.reject(e);
      }
      p.catch(() => {
        // Snap back only; the message is shown by the shared error line (mutation onError).
        setOverrides((cur) => {
          const { [id]: _drop, ...rest } = cur;
          return rest;
        });
      });
    },
    onOpen,
    onLink,
    origin: () => {
      const r = plane.current?.getBoundingClientRect();
      return { left: r?.left ?? 0, top: (r?.top ?? 0) + HEADER_H };
    },
  });

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  const { items, bodyH } = useMemo(() => {
    const out: Item[] = [];
    let y = 0;
    let prev: string | undefined;
    for (const row of rows) {
      const g = row.group ? groupById.get(row.group) : undefined;
      if (g && row.group !== prev) {
        out.push({ kind: 'group', id: g.id, label: g.label, collapsed: g.collapsed, y, h: GROUP_H });
        y += GROUP_H;
      }
      prev = row.group;
      if (g?.collapsed) continue;
      out.push({ kind: 'row', row, y, h: ROW_PITCH });
      y += ROW_PITCH;
    }
    return { items: out, bodyH: y };
  }, [rows, groupById]);

  const pos = useMemo(() => {
    const m = new Map<string, ArrowPos>();
    for (const it of items) {
      if (it.kind !== 'row') continue;
      for (const b of it.row.bars) {
        const e = effective(b);
        const g = barGeom(e.start, e.end, from, to, dayW);
        if (g) m.set(b.id, { x: g.x, w: g.w, y: it.y + ROW_PITCH / 2 });
      }
    }
    return m;
  }, [items, effective, from, to, dayW]);

  const ticks = useMemo(() => weekTicks(from, to, dayW, weekStart, today), [from, to, dayW, weekStart, today]);
  const weekends = useMemo(() => (showWeekends ? weekendCols(from, to, dayW) : []), [showWeekends, from, to, dayW]);
  const tIdx = dayIndex(from, today);
  const showToday = tIdx >= 0 && tIdx <= last;
  const tx = todayX(from, today, dayW);

  const scrollToToday = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, tx - el.clientWidth * 0.25);
  }, [tx]);
  useImperativeHandle(ref, () => ({ scrollToToday }), [scrollToToday]);
  useLayoutEffect(() => {
    if (initialScrollToToday) scrollToToday();
    // first render only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canLinkAny = !!onLink;

  return (
    <div className="tl" style={{ '--tl-label-w': `${labelWidth}px` } as CSSProperties}>
      <div className="tl-main">
        <div className="tl-labels" style={{ width: labelWidth }}>
          <div className="tl-labels-head" style={{ height: HEADER_H }} />
          {items.map((it) =>
            it.kind === 'group' ? (
              <button
                key={`g:${it.id}`}
                type="button"
                className="tl-group"
                style={{ height: it.h }}
                aria-expanded={!it.collapsed}
                aria-label={it.label}
                onClick={() => onToggleGroup?.(it.id)}
              >
                <Chevron open={!it.collapsed} />
                <span className="tl-group-label" dir="auto" title={it.label}>
                  {it.label}
                </span>
              </button>
            ) : (
              <div key={it.row.id} className="tl-rowlabel" style={{ height: it.h }}>
                {it.row.swatch && <span className="tl-swatch" style={{ background: it.row.swatch }} aria-hidden="true" />}
                <span className="tl-rowtext">
                  <span className="tl-rowtitle" data-row-label dir="auto" title={it.row.label}>
                    {it.row.label}
                  </span>
                  {it.row.meta && <span className="tl-rowmeta">{it.row.meta}</span>}
                </span>
                {it.row.dot === 'risk' && <span className="tl-dot" role="img" aria-label="At risk" />}
              </div>
            ),
          )}
        </div>

        <div className="tl-scroll" ref={scroller} data-timeline-scroll>
          <div
            className={drag.link ? 'tl-canvas is-linking' : 'tl-canvas'}
            ref={plane}
            style={{ width: totalW, height: HEADER_H + bodyH }}
          >
            {weekends.map((c) => (
              <span key={c.x} className="tl-weekend" style={{ left: c.x, width: c.w }} />
            ))}
            {ticks.map((t) => (
              <span key={t.x} className="tl-tick" style={{ left: t.x }}>
                <span className="tl-tick-label">{t.label}</span>
              </span>
            ))}
            {showToday && (
              <>
                <span className="tl-today-line" style={{ left: tx }} aria-hidden="true" />
                <span className="tl-today-label" style={{ left: tx }}>
                  Today
                </span>
              </>
            )}
            {items.map((it) =>
              it.kind === 'group' ? (
                <div key={`g:${it.id}`} className="tl-trackrow is-group" style={{ top: HEADER_H + it.y, height: it.h }} />
              ) : (
                <div key={it.row.id} className="tl-trackrow" style={{ top: HEADER_H + it.y, height: it.h }}>
                  {layoutRow(it.row.bars).map(({ b, g, inset, visW, nextX }, order) => {
                    const draggable = b.draggable && !!onReschedule;
                    const shown: TLBar = { ...b, ...effective(b) };
                    return (
                      <BarView
                        key={b.id}
                        bar={{ ...shown, draggable }}
                        x={g.x}
                        w={g.w}
                        clippedStart={g.clippedStart}
                        clippedEnd={g.clippedEnd}
                        trackW={totalW}
                        inset={inset}
                        visW={visW}
                        nextX={nextX}
                        order={order}
                        dragging={drag.dragId === b.id}
                        linkTarget={drag.link?.target === b.id && drag.link.fromId !== b.id}
                        canLink={canLinkAny && b.kind !== 'draft'}
                        onPointerDown={(ev) => drag.barPointerDown(ev, b.id, g.w)}
                        onKeyDown={(ev) => drag.barKeyDown(ev, b.id)}
                        onClick={() => drag.barClick(b.id)}
                        onHandleDown={(ev) => drag.handlePointerDown(ev, b.id)}
                      />
                    );
                  })}
                </div>
              ),
            )}
            <div className="tl-overlay" style={{ top: HEADER_H, height: bodyH }}>
              <Arrows links={links} pos={pos} width={totalW} height={bodyH} pending={drag.link} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
