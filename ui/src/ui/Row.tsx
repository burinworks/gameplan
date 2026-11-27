import type { KeyboardEvent, ReactNode } from 'react';
import { useHighlight } from '../api/live';
import { Swatch } from './Swatch';

export interface RowProps {
  title: string;
  meta?: string;
  /** Project colour; renders the swatch left of the title. */
  swatch?: string | null;
  trailing?: ReactNode;
  onClick?: () => void;
  /** Entity id: the row fades `.is-changed` when an agent changes it. */
  highlightId?: string;
}

/** Two-line row: title 13/500 + meta 12 text2, both ellipsised, full text in `title`. */
export function Row({ title, meta, swatch, trailing, onClick, highlightId }: RowProps) {
  const changed = useHighlight(highlightId ?? '');
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };
  return (
    <div
      className={`gp-rowitem${onClick ? ' is-clickable' : ''}${changed && highlightId ? ' is-changed' : ''}`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? key : undefined}
    >
      {swatch !== undefined && <Swatch color={swatch} />}
      <span className="gp-rowitem__text">
        <span className="gp-rowitem__title" dir="auto" title={title}>
          {title}
        </span>
        {meta && (
          <span className="gp-rowitem__meta" dir="auto" title={meta}>
            {meta}
          </span>
        )}
      </span>
      {trailing && <span className="gp-rowitem__trail">{trailing}</span>}
    </div>
  );
}
