import type { ReactNode } from 'react';

export interface PanelProps {
  title?: string;
  count?: number;
  countTone?: 'review' | 'risk' | 'ok' | 'neutral';
  children: ReactNode;
}

export function Panel({ title, count, countTone = 'neutral', children }: PanelProps) {
  return (
    <section className="gp-panel" aria-label={title}>
      {title && (
        <h2 className="gp-panel__title">
          {title}
          {count !== undefined && <span className={`gp-count gp-count--${countTone} num`}>{count}</span>}
        </h2>
      )}
      {children}
    </section>
  );
}
