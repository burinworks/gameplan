import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface SheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}

/**
 * Centered modal: focus trap, Esc closes, scrim click closes, × button (aria-label "Close") closes.
 * Props: title, onClose, children (body, padded 12/24/20, scrolls), footer (buttons; Cancel = secondary, action = primary).
 * Initial focus goes to the first input in the body, else the first control in the body, else the footer.
 */
export function Sheet({ title, onClose, children, footer }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const body = ref.current?.querySelector<HTMLElement>('.gp-sheet__body');
    const first =
      body?.querySelector<HTMLElement>('input,textarea') ??
      body?.querySelector<HTMLElement>(FOCUSABLE) ??
      ref.current?.querySelector<HTMLElement>('.gp-sheet__footer')?.querySelector<HTMLElement>(FOCUSABLE) ??
      ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? ref.current)?.focus();
    return () => prev?.focus?.();
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    } else if (!ref.current.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="gp-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="gp-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <header className="gp-sheet__head">
          <h2 id={titleId} className="gp-sheet__title" dir="auto">
            {title}
          </h2>
          <button type="button" className="gp-sheet__close" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </header>
        <div className="gp-sheet__body">{children}</div>
        <div className="gp-sheet__footer">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}
