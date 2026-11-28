import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { today as todayLocal } from '../app/today';
import { fmtDayDate } from '../lib/format';
import { Icon } from './Icon';

/**
 * Date input with a real calendar. Value is YYYY-MM-DD ('' only when not `required`).
 * Shows "Fri, Dec 4" (year added when it differs from today's), −/+ buttons step one day, and clicking the
 * value opens a month calendar (popover, or always visible with `inlineCalendar`). The popover lives in a fixed layer on
 * document.body: it is never clipped by a scrolling pane, stays inside the window (flips above the field when there is
 * no room below, slides left at the right edge) and follows the field when an ancestor scrolls.
 * Props:
 *  - value, onChange(value: string)
 *  - label: aria-label of the group (required), e.g. "Due"
 *  - required?: never produces ''; an empty value is shown as today until changed
 *  - min?: earliest selectable day (YYYY-MM-DD)
 *  - weekStart?: 'mon' (default) | 'sun', first weekday column
 *  - inlineCalendar?: render the calendar below the field instead of a popover
 *  - today?: override today's date (tests)
 * Usage: <DateField label="Due" value={due} onChange={setDue} required weekStart="mon" />
 */
export interface DateFieldProps {
  value: string;
  onChange: (v: string) => void;
  label: string;
  required?: boolean;
  min?: string;
  weekStart?: 'mon' | 'sun';
  inlineCalendar?: boolean;
  today?: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS_MON = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const WEEKDAYS_SUN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const ms = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y!, m! - 1, day!);
};
/** Add whole days to a YYYY-MM-DD date. */
export function addDays(d: string, n: number): string {
  return iso(ms(d) + n * DAY_MS);
}

function Calendar({ value, min, weekStart, today, onPick }: { value: string; min?: string; weekStart: 'mon' | 'sun'; today: string; onPick: (d: string) => void }) {
  const [view, setView] = useState(() => value.slice(0, 7));
  const [focusDay, setFocusDay] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => setView(value.slice(0, 7)), [value]);
  useEffect(() => {
    if (focusDay) grid.current?.querySelector<HTMLElement>(`[data-date="${focusDay}"]`)?.focus();
  }, [focusDay, view]);

  const [y, m] = view.split('-').map(Number) as [number, number];
  const first = Date.UTC(y, m - 1, 1);
  const lead = (new Date(first).getUTCDay() - (weekStart === 'mon' ? 1 : 0) + 7) % 7;
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const shift = (n: number) => setView(iso(Date.UTC(y, m - 1 + n, 1)).slice(0, 7));
  const disabled = (d: string) => !!min && d < min;

  const onKey = (e: KeyboardEvent, d: string) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const next = addDays(d, step);
    if (next.slice(0, 7) !== view) setView(next.slice(0, 7));
    setFocusDay(next);
  };

  const days = Array.from({ length: count }, (_, i) => `${view}-${pad(i + 1)}`);
  const tabbable = days.includes(value) ? value : days[0];

  return (
    <div className="gp-cal">
      <div className="gp-cal__head">
        <span className="gp-cal__month" aria-live="polite">
          {MONTHS[m - 1]} {y}
        </span>
        <button type="button" className="gp-cal__nav" aria-label="Previous month" onClick={() => shift(-1)}>
          <Icon name="chevronLeft" size={12} />
        </button>
        <button type="button" className="gp-cal__nav" aria-label="Next month" onClick={() => shift(1)}>
          <Icon name="chevron" size={12} />
        </button>
      </div>
      <div className="gp-cal__grid" ref={grid} role="grid" aria-label={`${MONTHS[m - 1]} ${y}`}>
        {(weekStart === 'mon' ? WEEKDAYS_MON : WEEKDAYS_SUN).map((w) => (
          <span key={w} className="gp-cal__wd" role="columnheader">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`b${i}`} className="gp-cal__cell" role="presentation" />
        ))}
        {days.map((d) => (
          <span key={d} className="gp-cal__cell" role="gridcell">
            <button
              type="button"
              className={`gp-cal__day num${d === value ? ' is-selected' : ''}${d === today ? ' is-today' : ''}`}
              data-date={d}
              aria-label={fmtDayDate(d, today)}
              aria-pressed={d === value}
              disabled={disabled(d)}
              tabIndex={d === tabbable ? 0 : -1}
              onClick={() => onPick(d)}
              onKeyDown={(e) => onKey(e, d)}
            >
              {Number(d.slice(8))}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}

export function DateField({ value, onChange, label, required, min, weekStart = 'mon', inlineCalendar, today: todayProp }: DateFieldProps) {
  const today = todayProp ?? todayLocal();
  const shown = value || (required ? (min && min > today ? min : today) : '');
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  // Place the popover under the field, inside the window: flip above when there is no room below, keep the right
  // edge on screen. Runs again when an ancestor (the pane) scrolls or the window resizes.
  const place = () => {
    const b = btn.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    const el = pop.current;
    const w = el?.offsetWidth ?? 0;
    const h = el?.offsetHeight ?? 0;
    const gap = 6;
    const edge = 8;
    const below = r.bottom + gap;
    const top = h && below + h > window.innerHeight - edge && r.top - gap - h >= edge ? r.top - gap - h : below;
    const right = r.left + Math.max(w, r.width);
    const left = Math.max(edge, right > window.innerWidth - edge ? window.innerWidth - edge - Math.max(w, r.width) : r.left);
    setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
  };
  useLayoutEffect(() => {
    if (open) place();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const again = () => place();
    window.addEventListener('scroll', again, true);
    window.addEventListener('resize', again);
    return () => {
      window.removeEventListener('scroll', again, true);
      window.removeEventListener('resize', again);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    pop.current?.querySelector<HTMLElement>('[tabindex="0"].gp-cal__day')?.focus();
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open]);

  const set = (d: string) => {
    if (min && d < min) return;
    onChange(d);
  };
  const base = shown || today;
  const canPrev = !min || addDays(base, -1) >= min;

  const toggle = () => {
    if (open) return setOpen(false);
    const r = btn.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });
    setOpen(true);
  };

  const cal = (
    <Calendar
      value={base}
      min={min}
      weekStart={weekStart}
      today={today}
      onPick={(d) => {
        set(d);
        if (!inlineCalendar) {
          setOpen(false);
          btn.current?.focus();
        }
      }}
    />
  );

  return (
    <div className="gp-date" role="group" aria-label={label}>
      <div className="gp-date__row">
        <button ref={btn} type="button" className="gp-date__value num" aria-haspopup={inlineCalendar ? undefined : 'dialog'} aria-expanded={inlineCalendar ? undefined : open} onClick={inlineCalendar ? undefined : toggle}>
          {shown ? fmtDayDate(shown, today) : 'No date'}
        </button>
        <button type="button" className="gp-date__step" aria-label="Previous day" disabled={!canPrev} onClick={() => set(addDays(base, -1))}>
          <Icon name="minus" size={10} />
        </button>
        <button type="button" className="gp-date__step" aria-label="Next day" onClick={() => set(addDays(base, 1))}>
          <Icon name="plus" size={10} />
        </button>
      </div>
      {inlineCalendar && cal}
      {!inlineCalendar &&
        open &&
        pos &&
        createPortal(
          <div
            ref={pop}
            className="gp-date__pop"
            role="dialog"
            aria-label={`${label} calendar`}
            style={{ top: pos.top, left: pos.left }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                e.preventDefault();
                setOpen(false);
                btn.current?.focus();
              }
            }}
          >
            {cal}
          </div>,
          document.body,
        )}
    </div>
  );
}
