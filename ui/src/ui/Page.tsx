import type { ReactNode } from 'react';

/**
 * Page frame for every non-Home screen: a header (title, count, optional toolbar and actions) and a body
 * under a 1px divider that fills the rest of the height and scrolls on its own.
 * Props:
 *  - title: ReactNode (string or a title menu button), rendered in the 17px heading
 *  - count?: number, shown after the title in text3
 *  - breadcrumb?: ReactNode above the title (small text2)
 *  - toolbar?: ReactNode right after the title (e.g. tabs), grows to fill
 *  - actions?: ReactNode at the right edge
 *  - roomy?: header padding 22/24/16 (Inbox, Settings) instead of 18/20/14/24
 *  - padded?: body gets 24px padding (for plain content pages)
 *  - label: aria-label of the section (defaults to title when it is a string)
 *  - bodyClassName?, className?
 * Usage: <Page title="Inbox" count={3} roomy padded>…</Page>
 */
export interface PageProps {
  title: ReactNode;
  count?: number;
  breadcrumb?: ReactNode;
  toolbar?: ReactNode;
  actions?: ReactNode;
  roomy?: boolean;
  padded?: boolean;
  label?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export function Page({ title, count, breadcrumb, toolbar, actions, roomy, padded, label, className, bodyClassName, children }: PageProps) {
  return (
    <section className={`gp-page${className ? ` ${className}` : ''}`} aria-label={label ?? (typeof title === 'string' ? title : undefined)}>
      <header className={`gp-page__head${roomy ? ' gp-page__head--roomy' : ''}`}>
        <div className="gp-page__titles">
          {breadcrumb && <div className="gp-page__crumb">{breadcrumb}</div>}
          <h1 className="gp-page__title" dir="auto">
            {title}
            {count !== undefined && <span className="gp-page__count num">{count}</span>}
          </h1>
        </div>
        {toolbar && <div className="gp-page__toolbar">{toolbar}</div>}
        {actions && <div className="gp-page__actions">{actions}</div>}
      </header>
      <div className={`gp-page__body${padded ? ' gp-page__body--padded' : ''}${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</div>
    </section>
  );
}
