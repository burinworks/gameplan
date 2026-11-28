import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export interface MenuItem {
  label: string;
  onSelect?: () => void;
  /** Renders a plain link opening in a new tab instead of calling onSelect. */
  href?: string;
  danger?: boolean;
  /** When defined the item is a radio (menuitemradio) and shows a check when true. */
  checked?: boolean;
  /** Marker before the label (swatch, diamond). */
  leading?: ReactNode;
}

export interface MenuProps {
  /** Content of the trigger button (usually an <Icon/>). */
  trigger: ReactNode;
  /** aria-label of the trigger button. */
  label: string;
  items: MenuItem[];
  /** `end` (default): menu's right edge meets the trigger's right edge. `start`: left edges meet. */
  align?: 'start' | 'end';
  /** Replaces the default icon-button classes of the trigger (used by Select). */
  triggerClassName?: string;
  /** The menu is at least as wide as the trigger. */
  matchWidth?: boolean;
}

export function Menu({ trigger, label, items, align = 'end', triggerClassName, matchWidth }: MenuProps) {
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number; minWidth?: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  const close = (refocus = true) => {
    setPos(null);
    if (refocus) btn.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const items = list.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]');
    (list.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? items?.[0])?.focus();
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !btn.current?.contains(t)) setPos(null);
    };
    document.addEventListener('mousedown', down);
    return () => document.removeEventListener('mousedown', down);
  }, [open]);

  const toggle = () => {
    if (open) return close();
    const r = btn.current!.getBoundingClientRect();
    const minWidth = matchWidth ? r.width : undefined;
    setPos(align === 'start' ? { top: r.bottom + 4, left: r.left, minWidth } : { top: r.bottom + 4, right: window.innerWidth - r.right, minWidth });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const els = [...(list.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const d = e.key === 'ArrowDown' ? 1 : -1;
      els[(i + d + els.length) % els.length]?.focus();
    } else if (e.key === 'Tab') close(false);
  };

  return (
    <>
      <button ref={btn} type="button" className={triggerClassName ?? 'gp-btn gp-btn--icon'} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        {trigger}
      </button>
      {open &&
        createPortal(
          <div ref={list} className="gp-menu" role="menu" aria-label={label} style={{ top: pos.top, left: pos.left, right: pos.right, minWidth: pos.minWidth }} data-align={align} onKeyDown={onKeyDown}>
            {items.map((it) =>
              it.href ? (
                <a key={it.label} role="menuitem" className="gp-menu__item" href={it.href} target="_blank" rel="noopener noreferrer" tabIndex={-1} onClick={() => close(false)}>
                  {it.label}
                </a>
              ) : (
                <button
                  key={it.label}
                  type="button"
                  role={it.checked === undefined ? 'menuitem' : 'menuitemradio'}
                  aria-checked={it.checked}
                  tabIndex={-1}
                  className={`gp-menu__item${it.danger ? ' is-danger' : ''}`}
                  onClick={() => {
                    close(false);
                    it.onSelect?.();
                  }}
                >
                  {it.leading}
                  <span className="gp-menu__label">{it.label}</span>
                  {it.checked && <Icon name="check" size={14} />}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
