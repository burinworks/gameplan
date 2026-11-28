import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useHighlight } from '../api/live';
import {
  BAR_H,
  EXTEND_DAYS,
  HEADER_H,
  HOME_GROUP_H,
  LABEL_GAP,
  PROJECT_BAR_H,
  PROJECT_GROUP_H,
  PROJECT_ROW_PITCH,
  ROW_PITCH,
  STRIP_H,
  addDays,
  assignLanes,
  barExtent,
  barGeom,
  dayIndex,
  dayWidth,
  labelFits,
  minorLines,
  monthYear,
  pctChars,
  pctFits,
  pctText,
  riskPath,
  ticksFor,
  todayX,
  weekendCols,
  type TimelineVariant,
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
  /** Fill colour (a task's milestone colour, a milestone's own colour); tinted with color-mix. */
  color: string;
  /** 0..100. Task bars show it as "40%" text inside the bar. */
  progress: number;
  risk: boolean;
  diamond?: boolean;
  draggable: boolean;
  /** Area colour, drawn as a strip at the bar's end. */
  area?: string;
  /** Id of a group mark (milestone diamond) this bar ends after; draws a dashed risk line to it. */
  pastMark?: string;
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
  /** Text at the right of the group row, e.g. a milestone's due date. */
  due?: string;
  /** A diamond drawn on the group row at this date (a milestone's due date), with the group's name beside it. */
  mark?: { id: string; date: string; color: string; risk: boolean };
  /** Colour chip left of the group label (a milestone's colour). */
  swatch?: string;
}

export interface TimelineProps {
  rows: TLRow[];
  links?: TLLink[];
  /** The window the timeline opens with; it grows in either direction as the view nears an edge. */
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
  /** Called when the window grows, so a caller that fetches by range can load the new days. */
  onRangeChange?: (from: string, to: string) => void;
  /** `home` (default) is the all-projects overview; `project` is the single-project layout. */
  variant?: TimelineVariant;
  /** Overrides the variant's label column width. */
  labelWidth?: number;
  /** Bar id whose row is highlighted and whose bar gets the selection ring. */
  selectedId?: string;
  /** Empty-state content laid over the grid (the grid still runs the full height). */
  empty?: ReactNode;
  /** Scroll Today to about 25% from the left on first render. */
  initialScrollToToday?: boolean;
}

export interface TimelineHandle {
  scrollToToday: () => void;
}

const LINK_GAP = LABEL_GAP;
const LABEL_W: Record<TimelineVariant, number> = { home: 170, project: 236 };
/** Half the group diamond's diagonal (an 11px square turned 45°). */
const MARK_R = 8;

/**
 * The milestone's name sits just left of its diamond (so a risk line leaving the diamond to the right never
 * crosses it); with too little room on the left it goes to the right instead.
 */
function nameStyle(mx: number, totalW: number): CSSProperties {
  const edge = mx - MARK_R - 6;
  if (edge >= NAME_MIN_W) return { right: `${totalW - edge}px`, maxWidth: `${edge - 4}px`, textAlign: 'right' };
  return { left: `${mx + MARK_R + 6}px`, maxWidth: `${Math.max(0, totalW - mx - MARK_R - 10)}px` };
}
const NAME_MIN_W = 96;

const minDate = (a: string, b: string): string => (a < b ? a : b);
const maxDate = (a: string, b: string): string => (a > b ? a : b);

type Item =
  | { kind: 'group'; group: TLGroup; y: number; h: number }
  | { kind: 'row'; row: TLRow; y: number; h: number; lanes: number };

interface Override extends Dates {
  base: Dates;
}

const pctOf = (bar: TLBar): number | undefined => (bar.kind === 'task' ? bar.progress : undefined);

function BarView({
  bar,
  x,
  w,
  clippedStart,
  clippedEnd,
  trackW,
  lane,
  dragging,
  linkTarget,
  selected,
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
  /** Line within the row (0 = first). */
  lane: number;
  dragging: boolean;
  linkTarget: boolean;
  selected: boolean;
  canLink: boolean;
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  onClick: () => void;
  onHandleDown: (e: React.PointerEvent<HTMLElement>) => void;
}) {
  const changed = useHighlight(bar.id);
  const pct = pctOf(bar);
  const fits = labelFits(bar.label, w, pctChars(pct));
  const showPct = pct !== undefined && pctFits(pct, w);
  const diamond = bar.diamond ?? bar.kind === 'milestone';
  const cls = [
    'tl-bar',
    `is-${bar.kind}`,
    bar.risk && 'is-risk',
    diamond && 'has-diamond',
    bar.area && 'has-area',
    bar.draggable && 'is-draggable',
    dragging && 'is-dragging',
    changed && 'is-changed',
    linkTarget && 'is-link-target',
    selected && 'is-selected',
    clippedStart && 'is-clipped-start',
    clippedEnd && 'is-clipped-end',
  ]
    .filter(Boolean)
    .join(' ');
  const style = { left: `${x}px`, width: `${w}px`, '--lane': lane, '--bar-color': bar.color } as CSSProperties;
  const outsideMax = trackW - (x + w + LINK_GAP) - 4;
  const laneVar = { '--lane': lane } as CSSProperties;
  const title = pct === undefined ? bar.label : `${bar.label} · ${pctText(pct)}`;
  return (
    <>
      <div
        className={cls}
        data-bar={bar.id}
        role="button"
        tabIndex={0}
        aria-label={title}
        title={title}
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
          <span className="tl-bar-label" data-label dir="auto" title={bar.label}>
            {bar.label}
          </span>
        )}
        {showPct && (
          <span className="tl-pct num" data-pct>
            {pctText(pct)}
          </span>
        )}
        {bar.area && <span className="tl-area" data-area style={{ background: bar.area }} aria-hidden="true" />}
        {diamond && <span className="tl-diamond" aria-hidden="true" />}
      </div>
      {!fits && outsideMax > 24 && (
        <span
          className="tl-label-out"
          data-label-outside
          dir="auto"
          title={bar.label}
          style={{ ...laneVar, left: `${x + w + LINK_GAP}px`, maxWidth: `${outsideMax}px` }}
        >
          {bar.label}
        </span>
      )}
      {canLink && (
        <span
          className="tl-handle"
          data-link-handle={bar.id}
          aria-hidden="true"
          style={{ ...laneVar, left: `${x + w + 4}px` }}
          onPointerDown={onHandleDown}
        />
      )}
    </>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span className={open ? 'tl-chev is-open' : 'tl-chev'} aria-hidden="true">
      <Icon name="chevron" size={12} />
    </span>
  );
}

export const Timeline = forwardRef<TimelineHandle, TimelineProps>(function Timeline(
  {
    rows,
    links = [],
    from: initialFrom,
    to: initialTo,
    today,
    zoom,
    weekStart,
    showWeekends = false,
    groups = [],
    onToggleGroup,
    onOpen,
    onReschedule,
    onLink,
    onRangeChange,
    variant = 'home',
    labelWidth = LABEL_W[variant],
    selectedId,
    empty,
    initialScrollToToday = false,
  },
  ref,
) {
  const dayW = dayWidth(zoom, variant);
  const pitch = variant === 'project' ? PROJECT_ROW_PITCH : ROW_PITCH;
  const barH = variant === 'project' ? PROJECT_BAR_H : BAR_H;
  const groupH = variant === 'project' ? PROJECT_GROUP_H : HOME_GROUP_H;

  // The window only ever grows: it is the union of what the caller asks for and what scrolling added.
  const [grown, setGrown] = useState({ from: initialFrom, to: initialTo });
  const from = minDate(grown.from, initialFrom);
  const to = maxDate(grown.to, initialTo);
  const last = dayIndex(from, to);
  const totalW = (last + 1) * dayW;

  const scroller = useRef<HTMLDivElement>(null);
  const plane = useRef<HTMLDivElement>(null);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [leftIdx, setLeftIdx] = useState(0);

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

  const { items, bodyH, laneOf } = useMemo(() => {
    const out: Item[] = [];
    const laneOf = new Map<string, number>();
    let y = 0;
    const emitRow = (row: TLRow) => {
      // Lanes come from the saved dates so a bar being dragged does not change lines mid-drag.
      const placed = row.bars.flatMap((b) => {
        const g = barGeom(b.start, b.end, from, to, dayW);
        return g ? [{ id: b.id, x: g.x, end: barExtent(g.x, g.w, b.label, pctChars(pctOf(b))) }] : [];
      });
      const { lanes, count } = assignLanes(placed);
      placed.forEach((p, i) => laneOf.set(p.id, lanes[i] ?? 0));
      out.push({ kind: 'row', row, y, h: count * pitch, lanes: count });
      y += count * pitch;
    };
    // Rows without a (known) group come first, then each group's header followed by its rows.
    for (const row of rows) if (!row.group || !groupById.has(row.group)) emitRow(row);
    for (const g of groups) {
      out.push({ kind: 'group', group: g, y, h: groupH });
      y += groupH;
      if (g.collapsed) continue;
      for (const row of rows) if (row.group === g.id) emitRow(row);
    }
    return { items: out, bodyH: y, laneOf };
  }, [rows, groups, groupById, from, to, dayW, pitch, groupH]);

  const pos = useMemo(() => {
    const m = new Map<string, ArrowPos>();
    for (const it of items) {
      if (it.kind === 'group') {
        const mk = it.group.mark;
        const i = mk ? dayIndex(from, mk.date) : -1;
        if (mk && i >= 0 && i <= dayIndex(from, to)) m.set(mk.id, { x: i * dayW + dayW / 2, w: 0, y: it.y + it.h / 2 });
        continue;
      }
      for (const b of it.row.bars) {
        const e = effective(b);
        const g = barGeom(e.start, e.end, from, to, dayW);
        if (g) m.set(b.id, { x: g.x, w: g.w, y: it.y + (laneOf.get(b.id) ?? 0) * pitch + pitch / 2 });
      }
    }
    return m;
  }, [items, laneOf, effective, from, to, dayW, pitch]);

  // Dashed risk lines: from the end of each visible bar that runs past its milestone, up to that diamond.
  const riskLines = useMemo(() => {
    const out: { id: string; d: string }[] = [];
    for (const it of items) {
      if (it.kind !== 'row') continue;
      for (const b of it.row.bars) {
        if (!b.pastMark) continue;
        const a = pos.get(b.id);
        const mk = pos.get(b.pastMark);
        if (!a || !mk || a.x + a.w <= mk.x) continue;
        out.push({ id: b.id, d: riskPath({ x2: a.x + a.w, top: a.y - barH / 2 }, { x: mk.x, y: mk.y, r: MARK_R }) });
      }
    }
    return out;
  }, [items, pos, barH]);

  const ticks = useMemo(() => ticksFor(zoom, from, to, dayW, weekStart, today), [zoom, from, to, dayW, weekStart, today]);
  const minors = useMemo(() => (zoom === 'month' ? minorLines(from, to, dayW, weekStart) : []), [zoom, from, to, dayW, weekStart]);
  const selectedRow = useMemo(() => {
    if (!selectedId) return undefined;
    return rows.find((r) => r.bars.some((b) => b.id === selectedId))?.id;
  }, [rows, selectedId]);
  // Month zoom days are too narrow for weekend bands to read as anything but noise.
  const weekends = useMemo(() => (showWeekends && zoom !== 'month' ? weekendCols(from, to, dayW) : []), [showWeekends, zoom, from, to, dayW]);
  const tIdx = dayIndex(from, today);
  const showToday = tIdx >= 0 && tIdx <= last;
  const tx = todayX(from, today, dayW);
  const todayTickX = zoom === 'day' ? tx : -1;

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

  // When days are added on the left, move the scroll position by the same width so the view stays put.
  const prevFrom = useRef(from);
  useLayoutEffect(() => {
    const prev = prevFrom.current;
    prevFrom.current = from;
    const el = scroller.current;
    if (el && from < prev) el.scrollLeft += dayIndex(from, prev) * dayW;
  }, [from, dayW]);

  // Grow the window whenever the view comes within one screen of either edge (or the canvas is narrower than the view).
  const growIfNeeded = useCallback(() => {
    const el = scroller.current;
    if (!el || el.clientWidth <= 0) return;
    const step = EXTEND_DAYS[zoom];
    const nearLeft = el.scrollLeft < el.clientWidth;
    const nearRight = el.scrollLeft + el.clientWidth * 2 > totalW;
    if (!nearLeft && !nearRight) return;
    setGrown({ from: nearLeft ? addDays(from, -step) : from, to: nearRight ? addDays(to, step) : to });
  }, [zoom, totalW, from, to]);

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setLeftIdx(Math.max(0, Math.floor(el.scrollLeft / dayW)));
    growIfNeeded();
  }, [dayW, growIfNeeded]);

  useLayoutEffect(() => {
    growIfNeeded();
  }, [growIfNeeded]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => growIfNeeded());
    ro.observe(el);
    return () => ro.disconnect();
  }, [growIfNeeded]);

  useEffect(() => {
    if (from !== initialFrom || to !== initialTo) onRangeChange?.(from, to);
    // report only real growth
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const canLinkAny = !!onLink;
  const style = {
    '--tl-label-w': `${labelWidth}px`,
    '--tl-head': `${HEADER_H}px`,
    '--tl-strip': `${STRIP_H}px`,
    '--tl-day': `${dayW}px`,
    '--tl-pitch': `${pitch}px`,
    '--tl-bar-h': `${barH}px`,
  } as CSSProperties;

  return (
    <div className={`tl tl--${variant} tl--${zoom}`} style={style}>
      <div className="tl-main">
        <div className="tl-body">
          <div className="tl-labels" style={{ width: labelWidth }}>
            <div className="tl-labels-head" style={{ height: HEADER_H }}>
              <span className="tl-corner" data-timeline-month>
                {monthYear(addDays(from, leftIdx))}
              </span>
            </div>
            {items.map((it) =>
              it.kind === 'group' ? (
                <button
                  key={`g:${it.group.id}`}
                  type="button"
                  className="tl-group"
                  style={{ height: it.h }}
                  aria-expanded={!it.group.collapsed}
                  aria-label={it.group.label}
                  onClick={() => onToggleGroup?.(it.group.id)}
                >
                  <Chevron open={!it.group.collapsed} />
                  {it.group.swatch && <span className="tl-gswatch" style={{ background: it.group.swatch }} aria-hidden="true" />}
                  <span className="tl-group-label" dir="auto" title={it.group.label}>
                    {it.group.label}
                  </span>
                  {it.group.due && <span className="tl-rowmeta tl-group-due">{it.group.due}</span>}
                </button>
              ) : (
                <div key={it.row.id} className={it.row.id === selectedRow ? 'tl-rowlabel is-selected' : 'tl-rowlabel'} style={{ height: it.h }}>
                  {it.row.swatch && <span className="tl-swatch" style={{ background: it.row.swatch }} aria-hidden="true" />}
                  {variant === 'project' ? (
                    <>
                      <span className="tl-rowtitle" data-row-label dir="auto" title={it.row.label}>
                        {it.row.label}
                      </span>
                      {it.row.dot === 'risk' && <span className="tl-dot" role="img" aria-label="At risk" />}
                      {it.row.meta && <span className="tl-rowmeta">{it.row.meta}</span>}
                    </>
                  ) : (
                    <>
                      <span className="tl-rowtext">
                        <span className="tl-rowtitle" data-row-label dir="auto" title={it.row.label}>
                          {it.row.label}
                        </span>
                        {it.row.meta && <span className="tl-rowmeta">{it.row.meta}</span>}
                      </span>
                      {it.row.dot === 'risk' && <span className="tl-dot" role="img" aria-label="At risk" />}
                    </>
                  )}
                </div>
              ),
            )}
          </div>

          <div className="tl-scroll" ref={scroller} data-timeline-scroll onScroll={onScroll}>
            <div
              className={drag.link ? 'tl-canvas is-linking' : 'tl-canvas'}
              ref={plane}
              data-from={from}
              data-to={to}
              style={{ width: totalW, minHeight: HEADER_H + bodyH }}
            >
              {weekends.map((c) => (
                <span key={c.x} className="tl-weekend" style={{ left: c.x, width: c.w }} />
              ))}
              {minors.map((x) => (
                <span key={`m${x}`} className="tl-minor" style={{ left: x }} />
              ))}
              <span className="tl-strip" aria-hidden="true" />
              {riskLines.length > 0 && (
                <div className="tl-underlay" style={{ top: HEADER_H, height: bodyH }}>
                  <Arrows links={[]} pos={pos} width={totalW} height={bodyH} pitch={pitch} risks={riskLines} />
                </div>
              )}
              {ticks.map((t) => (
                <span key={t.x} className={['tl-tick', t.month && 'is-month', t.x === todayTickX && 'is-today'].filter(Boolean).join(' ')} style={{ left: t.x }}>
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
              {items.map((it) => {
                if (it.kind === 'group') {
                  const mk = it.group.mark;
                  const i = mk ? dayIndex(from, mk.date) : -1;
                  const mx = i * dayW + dayW / 2;
                  return (
                    <div key={`g:${it.group.id}`} className="tl-trackrow is-group" style={{ top: HEADER_H + it.y, height: it.h }}>
                      {mk && i >= 0 && i <= last && (
                        <>
                          <span
                            className={mk.risk ? 'tl-gdiamond is-risk' : 'tl-gdiamond'}
                            data-milestone={mk.id}
                            role="img"
                            aria-label={`${it.group.label} due`}
                            style={{ left: mx, '--bar-color': mk.color } as CSSProperties}
                          />
                          <span
                            className="tl-gname"
                            data-milestone-name={mk.id}
                            dir="auto"
                            title={it.group.label}
                            style={nameStyle(mx, totalW)}
                          >
                            {it.group.label}
                          </span>
                        </>
                      )}
                    </div>
                  );
                }
                return (
                  <div key={it.row.id} className="tl-trackrow" style={{ top: HEADER_H + it.y, height: it.h }}>
                    {it.row.bars.flatMap((b) => {
                      const e = effective(b);
                      const g = barGeom(e.start, e.end, from, to, dayW);
                      return g ? [{ b, g }] : [];
                    }).map(({ b, g }) => {
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
                          lane={laneOf.get(b.id) ?? 0}
                          dragging={drag.dragId === b.id}
                          linkTarget={drag.link?.target === b.id && drag.link.fromId !== b.id}
                          selected={selectedId === b.id}
                          canLink={canLinkAny && b.kind !== 'draft'}
                          onPointerDown={(ev) => drag.barPointerDown(ev, b.id, g.w)}
                          onKeyDown={(ev) => drag.barKeyDown(ev, b.id)}
                          onClick={() => drag.barClick(b.id)}
                          onHandleDown={(ev) => drag.handlePointerDown(ev, b.id)}
                        />
                      );
                    })}
                  </div>
                );
              })}
              <div className="tl-overlay" style={{ top: HEADER_H, height: bodyH }}>
                <Arrows links={links} pos={pos} width={totalW} height={bodyH} pitch={pitch} pending={drag.link} />
              </div>
            </div>
          </div>
        </div>
      </div>
      {empty}
    </div>
  );
});
