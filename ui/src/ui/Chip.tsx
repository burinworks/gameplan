import type { ReactNode } from 'react';

export interface ChipProps {
  children: ReactNode;
  tone?: 'neutral' | 'ok' | 'risk' | 'review' | 'accent';
  /** Status pill: a 6px dot in the tone colour before the label; the label keeps the text colour. */
  dot?: boolean;
}

export function Chip({ children, tone = 'neutral', dot }: ChipProps) {
  return (
    <span className={`gp-chip gp-chip--${tone}${dot ? ' gp-chip--dot' : ''}`}>
      {dot && <span className="gp-chip__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
