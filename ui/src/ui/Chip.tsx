import type { ReactNode } from 'react';

export function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'risk' | 'review' | 'accent' }) {
  return <span className={`gp-chip gp-chip--${tone}`}>{children}</span>;
}
